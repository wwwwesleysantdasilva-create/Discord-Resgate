require('dotenv').config();
const { Client, GatewayIntentBits, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createClient } = require('@libsql/client');
const axios = require('axios');

// Configuração segura do Banco de Dados Turso (Cloud SQLite)
const db = createClient({
    url: process.env.TURSO_DATABASE_URL || "libsql://dummy-url",
    authToken: process.env.TURSO_AUTH_TOKEN || "dummy-token",
});

// Inicialização e criação das tabelas no Turso
async function inicializarBanco() {
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            product TEXT,
            group_id TEXT,
            used INTEGER DEFAULT 0,
            created_at TEXT
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS products (
            id TEXT UNIQUE,
            name TEXT,
            group_id TEXT
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT,
            user TEXT,
            timestamp TEXT
        )`);
        console.log('✅ Conectado e tabelas verificadas no Turso com sucesso!');
    } catch (err) {
        console.error('Erro ao inicializar o banco de dados no Turso:', err.message);
    }
}

inicializarBanco();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

async function registrarLog(acao, usuario) {
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    try {
        await db.execute({
            sql: `INSERT INTO logs (action, user, timestamp) VALUES (?, ?, ?)`,
            args: [acao, usuario, dataHora]
        });
    } catch (err) {
        console.error('Erro ao registrar log:', err.message);
    }
}

client.once('clientReady', async () => {
    console.log(`Bot online como ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('painel')
            .setDescription('Abre o painel de administração da loja')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder()
            .setName('setarpainel')
            .setDescription('Envia o painel de resgate para os clientes no canal atual')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(command => command.toJSON());

    try {
        for (const guild of client.guilds.cache.values()) {
            await guild.commands.set(commands);
        }
        console.log('✅ Comandos /painel e /setarpainel atualizados!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'painel') {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('### <:mundo_StorM:1530945775679307786> | Dashboard \n\n——————')
                );

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_gerar_keys')
                    .setLabel('Gerar keys')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1543439616328204408'),
                new ButtonBuilder()
                    .setCustomId('btn_registros')
                    .setLabel('Registros')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1543438969641898124')
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_add_produto')
                    .setLabel('Add produto')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1532944991423565844'),
                new ButtonBuilder()
                    .setCustomId('btn_remover_produto')
                    .setLabel('Remover produto')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('1543438189136715857')
            );

            await interaction.reply({ 
                components: [container, row1, row2], 
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral 
            });
        }

        if (interaction.commandName === 'setarpainel') {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## <:theboxez:1543426459165532292> Resgatar Pack\n\nClique no botão abaixo para validar sua key e obter acesso ao seu pack instantaneamente.')
                );

            const botaoResgate = new ButtonBuilder()
                .setCustomId('btn_resgate_cliente')
                .setLabel('Resgatar')
                .setStyle(ButtonStyle.Success)
                .setEmoji('1543426459165532292');

            const linha = new ActionRowBuilder().addComponents(botaoResgate);

            await interaction.channel.send({
                components: [container, linha],
                flags: MessageFlags.IsComponentsV2
            });

            await interaction.reply({ content: '✅ Painel de resgate enviado com sucesso neste canal!', flags: MessageFlags.Ephemeral });
        }
    } 
    else if (interaction.isButton()) {
        const id = interaction.customId;

        if (id === 'btn_resgate_cliente') {
            const modal = new ModalBuilder()
                .setCustomId('modal_resgate')
                .setTitle('Validação de Compra');

            const inputKey = new TextInputBuilder()
                .setCustomId('input_key')
                .setLabel('Cole a sua Key aqui:')
                .setPlaceholder('Ex: SENSI-1234ABCD')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputKey));
            return await interaction.showModal(modal);
        }

        if (id === 'btn_add_produto') {
            const modal = new ModalBuilder().setCustomId('modal_add_produto').setTitle('📦 Adicionar Novo Produto');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('Código Curto/Prefixo (Ex: SENSI)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_name').setLabel('Nome do Produto (Ex: Pack Sensi VIP)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_group').setLabel('ID do Grupo Telegram (Ex: -100...)').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);

        } else if (id === 'btn_remover_produto') {
            const modal = new ModalBuilder().setCustomId('modal_del_produto').setTitle('🗑️ Remover Produto');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('Código/ID do Produto a remover').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);

        } else if (id === 'btn_gerar_keys') {
            const modal = new ModalBuilder().setCustomId('modal_gerar_keys').setTitle('🔑 Gerar Keys');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('Código do Produto (Ex: SENSI)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de Keys (Ex: 5)').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);

        } else if (id === 'btn_registros') {
            try {
                const rs = await db.execute(`SELECT * FROM logs ORDER BY id DESC LIMIT 10`);
                const rows = rs.rows;

                if (!rows.length) {
                    return interaction.reply({ content: '📜 Nenhum registro encontrado até o momento.', flags: MessageFlags.Ephemeral });
                }

                const listaLogs = rows.map(r => `• **[${r.timestamp}]** ${r.user}: ${r.action}`).join('\n');
                await interaction.reply({ content: `📜 **Últimos Registros da Loja:**\n\n${listaLogs}`, flags: MessageFlags.Ephemeral });
            } catch (err) {
                await interaction.reply({ content: '❌ Erro ao buscar registros.', flags: MessageFlags.Ephemeral });
            }
        }
    } 
    else if (interaction.isModalSubmit()) {
        const modalId = interaction.customId;
        const usuario = interaction.user.tag;

        if (modalId === 'modal_resgate') {
            const keyDigitada = interaction.fields.getTextInputValue('input_key').trim();
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const rsKey = await db.execute({
                    sql: `SELECT * FROM keys WHERE key = ?`,
                    args: [keyDigitada]
                });
                const row = rsKey.rows[0];

                if (!row || row.used === 1) {
                    return interaction.editReply('❌ **Key inválida ou já utilizada.** Verifique se copiou corretamente.');
                }

                const rsProd = await db.execute({
                    sql: `SELECT name FROM products WHERE id = ?`,
                    args: [row.product]
                });
                const produto = rsProd.rows[0];
                const nomeProduto = produto ? produto.name : row.product;

                const respostaTelegram = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/createChatInviteLink`, {
                    chat_id: row.group_id,
                    member_limit: 1,
                    expire_date: Math.floor(Date.now() / 1000) + (60 * 15)
                });

                const linkExclusivo = respostaTelegram.data.result.invite_link;

                await db.execute({
                    sql: `UPDATE keys SET used = 1 WHERE key = ?`,
                    args: [keyDigitada]
                });

                try {
                    await interaction.user.send(
                        `✅ **Acesso Liberado com Sucesso!**\n\n` +
                        `📦 **Produto:** ${nomeProduto}\n` +
                        `🔑 **Key utilizada:** \`${keyDigitada}\`\n\n` +
                        `Aqui está o seu link exclusivo para entrar no grupo do Telegram:\n` +
                        `⚠️ *Este link serve apenas para 1 pessoa e expira em 15 minutos.*\n\n` +
                        `🔗 ${linkExclusivo}`
                    );
                } catch (dmError) {
                    return interaction.editReply('⚠️ Sua Key foi validada, mas **suas DMs estão fechadas**! Abra suas DMs para receber o link ou tente novamente.');
                }

                const botaoIrParaDM = new ButtonBuilder()
                    .setLabel('Abrir DM do Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/users/${client.user.id}`);

                const linhaBotao = new ActionRowBuilder().addComponents(botaoIrParaDM);

                await interaction.editReply({
                    content: '<:emoji_79:1543457009461100625> **Key Validada com Sucesso!**\n\nVerifique sua **DM (Mensagem privada)**\nPara acessar seu pack no app telegram',
                    components: [linhaBotao]
                });

            } catch (error) {
                console.error('Erro ao processar resgate:', error.response ? error.response.data : error.message);
                await interaction.editReply('❌ Falha ao processar a key ou comunicar com o Telegram. Verifique se o ID do grupo está correto e se o bot é administrador lá.');
            }
        }

        if (modalId === 'modal_add_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const prodName = interaction.fields.getTextInputValue('prod_name').trim();
            const groupID = interaction.fields.getTextInputValue('prod_group').trim();

            try {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO products (id, name, group_id) VALUES (?, ?, ?)`,
                    args: [prodId, prodName, groupID]
                });

                registrarLog(`Adicionou/Atualizou o produto: ${prodName} (${prodId})`, usuario);
                interaction.reply({ content: `✅ Produto **${prodName}** (\`${prodId}\`) cadastrado com sucesso para o grupo \`${groupID}\`!`, flags: MessageFlags.Ephemeral });
            } catch (err) {
                interaction.reply({ content: '❌ Erro ao salvar produto no banco de dados.', flags: MessageFlags.Ephemeral });
            }

        } else if (modalId === 'modal_del_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();

            try {
                const rsCheck = await db.execute({ sql: `SELECT * FROM products WHERE id = ?`, args: [prodId] });
                if (!rsCheck.rows.length) {
                    return interaction.reply({ content: `❌ Produto com código \`${prodId}\` não foi encontrado.`, flags: MessageFlags.Ephemeral });
                }

                await db.execute({ sql: `DELETE FROM products WHERE id = ?`, args: [prodId] });
                registrarLog(`Removeu o produto ID: ${prodId}`, usuario);
                interaction.reply({ content: `🗑️ Produto \`${prodId}\` removido com sucesso!`, flags: MessageFlags.Ephemeral });
            } catch (err) {
                interaction.reply({ content: '❌ Erro ao remover o produto.', flags: MessageFlags.Ephemeral });
            }

        } else if (modalId === 'modal_gerar_keys') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const qtd = parseInt(interaction.fields.getTextInputValue('quantidade')) || 1;

            if (qtd < 1 || qtd > 100) {
                return interaction.reply({ content: '❌ A quantidade deve ser um número entre 1 e 100.', flags: MessageFlags.Ephemeral });
            }

            try {
                const rsProd = await db.execute({ sql: `SELECT * FROM products WHERE id = ?`, args: [prodId] });
                const produto = rsProd.rows[0];

                if (!produto) {
                    return interaction.reply({ content: `❌ Produto com código \`${prodId}\` não encontrado! Cadastre-o primeiro usando "Add produto".`, flags: MessageFlags.Ephemeral });
                }

                const keysGeradas = [];
                const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                for (let i = 0; i < qtd; i++) {
                    const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
                    const keyFinal = `${prodId}-${randomString}`;
                    
                    await db.execute({
                        sql: `INSERT INTO keys (key, product, group_id, used, created_at) VALUES (?, ?, ?, 0, ?)`,
                        args: [keyFinal, prodId, produto.group_id, dataHora]
                    });
                    keysGeradas.push(`\`${keyFinal}\``);
                }

                registrarLog(`Gerou ${qtd} key(s) para o produto: ${produto.name}`, usuario);

                await interaction.reply({ 
                    content: `✅ **${qtd} Key(s) gerada(s) para [${produto.name}]!**\n\n${keysGeradas.join('\n')}`, 
                    flags: MessageFlags.Ephemeral 
                });
            } catch (err) {
                console.error(err);
                interaction.reply({ content: '❌ Erro ao gerar as keys.', flags: MessageFlags.Ephemeral });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
