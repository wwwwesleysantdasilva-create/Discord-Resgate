require('dotenv').config();
const { Client, GatewayIntentBits, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const fs = require('fs');
const express = require('express');

// Configuração do Servidor Express para escutar o Telegram Webhook no Railway
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

app.get('/', (req, res) => {
    res.send('🤖 Bot e Sistema de Logs do Telegram estão online!');
});

// Garante que a pasta /data existe (caso esteja usando o Volume do Railway)
if (!fs.existsSync('./data')) {
    try { fs.mkdirSync('./data'); } catch (e) {}
}

// Configuração do SQLite Local
const dbPath = fs.existsSync('/data') ? '/data/database.sqlite' : './database.sqlite';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao SQLite:', err.message);
    } else {
        console.log('✅ Conectado ao banco SQLite local com sucesso!');
    }
});

// Inicialização e criação das tabelas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        product TEXT,
        group_id TEXT,
        used INTEGER DEFAULT 0,
        created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id TEXT UNIQUE,
        name TEXT,
        group_id TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        user TEXT,
        timestamp TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS rastro_eterno (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT,
        discord_tag TEXT,
        telegram_id TEXT,
        telegram_user TEXT,
        produto TEXT,
        key_usada TEXT,
        data_resgate TEXT,
        data_entrada_telegram TEXT,
        data_saida_telegram TEXT,
        status_atual TEXT
    )`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

function registrarLog(acao, usuario) {
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    db.run(`INSERT INTO logs (action, user, timestamp) VALUES (?, ?, ?)`, [acao, usuario, dataHora], (err) => {
        if (err) console.error('Erro ao registrar log:', err.message);
    });
}

// Função para disparar Webhook para o canal do Discord
async function enviarWebhookDiscord(mensagem) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
        await axios.post(DISCORD_WEBHOOK_URL, { content: mensagem });
    } catch (error) {
        console.error('Erro ao enviar webhook para o Discord:', error.message);
    }
}

// Rota que o Telegram vai chamar quando houver eventos de entrada/saída no grupo (chat_member)
app.post('/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        
        // Verifica se o evento é de alteração de membro no chat
        if (update.chat_member) {
            const chatMember = update.chat_member;
            const user = chatMember.new_chat_member.user;
            const telegramId = user.id.toString();
            const telegramUsername = user.username ? `@${user.username}` : (user.first_name || 'Desconhecido');
            const newStatus = chatMember.new_chat_member.status;
            const oldStatus = chatMember.old_chat_member.status;
            const dataHoraAtual = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            // Usuário ENTROU no grupo (member, creator, administrator vindo de left, kicked)
            if (['member', 'administrator', 'creator'].includes(newStatus) && ['left', 'kicked', 'restricted'].includes(oldStatus)) {
                
                db.run(`UPDATE rastro_eterno SET telegram_id = ?, telegram_user = ?, data_entrada_telegram = ?, status_atual = 'No Grupo' WHERE telegram_id = ? OR telegram_id IS NULL ORDER BY id DESC LIMIT 1`,
                    [telegramId, telegramUsername, dataHoraAtual, telegramId]
                );

                await enviarWebhookDiscord(
                    `📥 **[LOG TELEGRAM - ENTRADA]**\n\n` +
                    `👤 **Membro:** ${telegramUsername} (\`ID: ${telegramId}\`)\n` +
                    `⏰ **Horário de Entrada:** \`${dataHoraAtual}\`\n` +
                    `🟢 **Status:** Entrou no grupo do Telegram com sucesso!`
                );
            } 
            // Usuário SAIU ou foi removido do grupo
            else if (['left', 'kicked'].includes(newStatus) && ['member', 'administrator', 'creator'].includes(oldStatus)) {
                
                db.run(`UPDATE rastro_eterno SET data_saida_telegram = ?, status_atual = 'Saiu do Grupo' WHERE telegram_id = ? ORDER BY id DESC LIMIT 1`,
                    [dataHoraAtual, telegramId]
                );

                await enviarWebhookDiscord(
                    `📤 **[LOG TELEGRAM - SAÍDA]**\n\n` +
                    `👤 **Membro:** ${telegramUsername} (\`ID: ${telegramId}\`)\n` +
                    `⏰ **Horário de Saída:** \`${dataHoraAtual}\`\n` +
                    `🔴 **Status:** Deixou o grupo do Telegram.`
                );
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error('Erro no webhook do telegram:', err.message);
        res.status(500).send('Error');
    }
});

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
            db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 10`, [], async (err, rows) => {
                if (err) {
                    return interaction.reply({ content: '❌ Erro ao buscar registros.', flags: MessageFlags.Ephemeral });
                }
                if (!rows.length) {
                    return interaction.reply({ content: '📜 Nenhum registro encontrado até o momento.', flags: MessageFlags.Ephemeral });
                }

                const listaLogs = rows.map(r => `• **[${r.timestamp}]** ${r.user}: ${r.action}`).join('\n');
                await interaction.reply({ content: `📜 **Últimos Registros da Loja:**\n\n${listaLogs}`, flags: MessageFlags.Ephemeral });
            });
        }
    } 
    else if (interaction.isModalSubmit()) {
        const modalId = interaction.customId;
        const usuario = interaction.user.tag;
        const userId = interaction.user.id;

        if (modalId === 'modal_resgate') {
            const keyDigitada = interaction.fields.getTextInputValue('input_key').trim();
            
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            db.get(`SELECT * FROM keys WHERE key = ?`, [keyDigitada], async (err, row) => {
                if (err || !row || row.used === 1) {
                    return interaction.editReply('❌ **Key inválida ou já utilizada.** Verifique se copiou corretamente.');
                }

                db.get(`SELECT name FROM products WHERE id = ?`, [row.product], async (errProd, produto) => {
                    const nomeProduto = produto ? produto.name : row.product;

                    try {
                        const respostaTelegram = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/createChatInviteLink`, {
                            chat_id: row.group_id,
                            member_limit: 1,
                            expire_date: Math.floor(Date.now() / 1000) + (60 * 15)
                        });

                        const linkExclusivo = respostaTelegram.data.result.invite_link;
                        const dataHoraResgate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                        db.run(`UPDATE keys SET used = 1 WHERE key = ?`, [keyDigitada]);

                        // Salva no banco de dados para o rastro eterno
                        db.run(`INSERT INTO rastro_eterno (discord_id, discord_tag, produto, key_usada, data_resgate, status_atual) VALUES (?, ?, ?, ?, ?, ?)`,
                            [userId, usuario, nomeProduto, keyDigitada, dataHoraResgate, 'Aguardando Entrada no Telegram']
                        );

                        registrarLog(`Resgatou a key ${keyDigitada} (${nomeProduto})`, usuario);

                        // Envia Log detalhado via Webhook para o Discord
                        await enviarWebhookDiscord(
                            `🔑 **[LOG RASTRO ETERNO - KEY APROVADA]**\n\n` +
                            `👤 **Discord:** ${usuario} (\`ID: ${userId}\`)\n` +
                            `📦 **Produto:** ${nomeProduto}\n` +
                            `🔑 **Key:** \`${keyDigitada}\`\n` +
                            `⏰ **Horário Aprovação:** \`${dataHoraResgate}\`\n` +
                            `🔗 **Link de Convite gerado para Telegram**`
                        );

                        // Envio da DM com o container V2
                        const containerDM = new ContainerBuilder()
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `<:v_:1543470056304807938> **Acesso Liberado com Sucesso!**\n\n` +
                                    `<:theboxez:1543426459165532292> **| Produto:** ${nomeProduto}\n` +
                                    `<:emoji_49:1543470661744201868> **| Key utilizada:** \`${keyDigitada}\`\n\n` +
                                    `Aqui está o seu link exclusivo para entrar no grupo do Telegram:\n\n` +
                                    `<:warn:1539069654922952774> **Este link serve apenas para 1 pessoa e expira em 15 minutos.**`
                                )
                            );

                        const botaoAcessar = new ButtonBuilder()
                            .setLabel('Acessar o pack')
                            .setStyle(ButtonStyle.Link)
                            .setURL(linkExclusivo);

                        const linhaBotaoDM = new ActionRowBuilder().addComponents(botaoAcessar);

                        let mensagemDMUrl = '';
                        try {
                            const msgDM = await interaction.user.send({
                                components: [containerDM, linhaBotaoDM],
                                flags: MessageFlags.IsComponentsV2
                            });
                            mensagemDMUrl = msgDM.url;
                        } catch (dmError) {
                            return interaction.editReply('⚠️ Sua Key foi validada, mas **suas DMs estão fechadas**! Abra suas DMs para receber o link ou tente novamente.');
                        }

                        const botaoVerDm = new ButtonBuilder()
                            .setLabel('Ver dm')
                            .setStyle(ButtonStyle.Link)
                            .setURL(mensagemDMUrl || `https://discord.com/users/${client.user.id}`);

                        const linhaBotaoEphemeral = new ActionRowBuilder().addComponents(botaoVerDm);

                        await interaction.editReply({
                            content: '<:v_:1543470056304807938>  **Key Validada com Sucesso!**\n\nVerifique sua **DM (Mensagem privada)**\nPara acessar seu pack',
                            components: [linhaBotaoEphemeral]
                        });

                    } catch (error) {
                        console.error('Erro ao processar resgate:', error.response ? error.response.data : error.message);
                        await interaction.editReply('❌ Falha ao processar a key ou comunicar com o Telegram. Verifique se o ID do grupo está correto e se o bot é administrador lá.');
                    }
                });
            });
        }

        if (modalId === 'modal_add_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const prodName = interaction.fields.getTextInputValue('prod_name').trim();
            const groupID = interaction.fields.getTextInputValue('prod_group').trim();

            db.run(`INSERT OR REPLACE INTO products (id, name, group_id) VALUES (?, ?, ?)`, [prodId, prodName, groupID], (err) => {
                if (err) {
                    return interaction.reply({ content: '❌ Erro ao salvar produto no banco de dados.', flags: MessageFlags.Ephemeral });
                }
                registrarLog(`Adicionou/Atualizou o produto: ${prodName} (${prodId})`, usuario);
                interaction.reply({ content: `✅ Produto **${prodName}** (\`${prodId}\`) cadastrado com sucesso para o grupo \`${groupID}\`!`, flags: MessageFlags.Ephemeral });
            });

        } else if (modalId === 'modal_del_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();

            db.get(`SELECT * FROM products WHERE id = ?`, [prodId], (err, produto) => {
                if (!produto) {
                    return interaction.reply({ content: `❌ Produto com código \`${prodId}\` não foi encontrado.`, flags: MessageFlags.Ephemeral });
                }

                db.run(`DELETE FROM products WHERE id = ?`, [prodId], () => {
                    registrarLog(`Removeu o produto ID: ${prodId}`, usuario);
                    interaction.reply({ content: `🗑️ Produto \`${prodId}\` removido com sucesso!`, flags: MessageFlags.Ephemeral });
                });
            });

        } else if (modalId === 'modal_gerar_keys') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const qtd = parseInt(interaction.fields.getTextInputValue('quantidade')) || 1;

            if (qtd < 1 || qtd > 100) {
                return interaction.reply({ content: '❌ A quantidade deve ser um número entre 1 e 100.', flags: MessageFlags.Ephemeral });
            }

            db.get(`SELECT * FROM products WHERE id = ?`, [prodId], (err, produto) => {
                if (!produto) {
                    return interaction.reply({ content: `❌ Produto com código \`${prodId}\` não encontrado! Cadastre-o primeiro.`, flags: MessageFlags.Ephemeral });
                }

                const keysGeradas = [];
                const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                db.serialize(() => {
                    const stmt = db.prepare(`INSERT INTO keys (key, product, group_id, used, created_at) VALUES (?, ?, ?, 0, ?)`);
                    for (let i = 0; i < qtd; i++) {
                        const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
                        const keyFinal = `${prodId}-${randomString}`;
                        stmt.run(keyFinal, prodId, produto.group_id, dataHora);
                        keysGeradas.push(`\`${keyFinal}\``);
                    }
                    stmt.finalize();
                });

                registrarLog(`Gerou ${qtd} key(s) para o produto: ${produto.name}`, usuario);

                interaction.reply({ 
                    content: `✅ **${qtd} Key(s) gerada(s) para [${produto.name}]!**\n\n${keysGeradas.join('\n')}`, 
                    flags: MessageFlags.Ephemeral 
                });
            });
        }
    }
});

// Inicia o Servidor HTTP e o Bot do Discord juntos
app.listen(PORT, () => {
    console.log(`🚀 Servidor Webhook rodando na porta ${PORT}`);
    client.login(process.env.DISCORD_TOKEN);
});
