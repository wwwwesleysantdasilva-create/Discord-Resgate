require('dotenv').config();
const { Client, GatewayIntentBits, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

// Configuração do Banco de Dados SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Erro ao abrir o banco de dados', err.message);
    else console.log('Conectado ao banco de dados SQLite.');
});

// Criação das tabelas necessárias baseadas na estrutura do seu Telegram
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        product TEXT,
        used INTEGER DEFAULT 0,
        created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id TEXT UNIQUE,
        name TEXT,
        group_id INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        user TEXT,
        timestamp TEXT
    )`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Função auxiliar para registrar logs de auditoria
function registrarLog(acao, usuario) {
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    db.run(`INSERT INTO logs (action, user, timestamp) VALUES (?, ?, ?)`, [acao, usuario, dataHora]);
}

client.once('clientReady', async () => {
    console.log(`Bot online como ${client.user.tag}`);

    // Registro do comando slash /painel
    const painelCommand = new SlashCommandBuilder()
        .setName('painel')
        .setDescription('Abre o painel de administração')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

    await client.application.commands.create(painelCommand);
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'painel') {
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('### <:mundo_StorM:1530945775679307786> | Dashboard \n\n——————')
                );

            // Linha 1 de Botões (Cinza / Secondary) com os emojis solicitados
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

            // Linha 2 de Botões (Cinza / Secondary) com os emojis solicitados
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
    } else if (interaction.isButton()) {
        const id = interaction.customId;

        // --- BOTÃO: ADD PRODUTO (Abre Modal Completo) ---
        if (id === 'btn_add_produto') {
            const modal = new ModalBuilder().setCustomId('modal_add_produto').setTitle('📦 Adicionar Novo Produto');
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('prod_id').setLabel('Código Curto/Prefixo (Ex: SENSI)').setStyle(TextInputStyle.Short).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('prod_name').setLabel('Nome do Produto (Ex: Pack Sensi VIP)').setStyle(TextInputStyle.Short).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('prod_group').setLabel('ID do Grupo Telegram (Ex: -100...)').setStyle(TextInputStyle.Short).setRequired(true)
                )
            );
            await interaction.showModal(modal);

        // --- BOTÃO: REMOVER PRODUTO ---
        } else if (id === 'btn_remover_produto') {
            const modal = new ModalBuilder().setCustomId('modal_del_produto').setTitle('🗑️ Remover Produto');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('prod_id').setLabel('Código/ID do Produto a remover').setStyle(TextInputStyle.Short).setRequired(true)
                )
            );
            await interaction.showModal(modal);

        // --- BOTÃO: GERAR KEYS ---
        } else if (id === 'btn_gerar_keys') {
            const modal = new ModalBuilder().setCustomId('modal_gerar_keys').setTitle('🔑 Gerar Keys');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('prod_id').setLabel('Código do Produto (Ex: SENSI)').setStyle(TextInputStyle.Short).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade de Keys (Ex: 5)').setStyle(TextInputStyle.Short).setRequired(true)
                )
            );
            await interaction.showModal(modal);

        // --- BOTÃO: REGISTROS ---
        } else if (id === 'btn_registros') {
            db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 10`, async (err, rows) => {
                if (err || !rows.length) {
                    return interaction.reply({ content: '📜 Nenhum registro encontrado até o momento.', ephemeral: true });
                }

                const listaLogs = rows.map(r => `• **[${r.timestamp}]** ${r.user}: ${r.action}`).join('\n');
                await interaction.reply({ content: `📜 **Últimos Registros da Loja:**\n\n${listaLogs}`, ephemeral: true });
            });
        }
    } else if (interaction.isModalSubmit()) {
        const modalId = interaction.customId;
        const usuario = interaction.user.tag;

        // --- SUBMIT: ADD PRODUTO ---
        if (modalId === 'modal_add_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const prodName = interaction.fields.getTextInputValue('prod_name').trim();
            const groupID = Number(interaction.fields.getTextInputValue('prod_group').trim());

            if (isNaN(groupID)) {
                return interaction.reply({ content: '❌ O ID do grupo do Telegram deve conter apenas números (com o sinal de menos se houver).', ephemeral: true });
            }

            db.run(`INSERT OR REPLACE INTO products (id, name, group_id) VALUES (?, ?, ?)`, [prodId, prodName, groupID], (err) => {
                if (err) return interaction.reply({ content: '❌ Erro ao salvar produto no banco de dados.', ephemeral: true });
                
                registrarLog(`Adicionou/Atualizou o produto: ${prodName} (${prodId})`, usuario);
                interaction.reply({ content: `✅ Produto **${prodName}** (\`${prodId}\`) cadastrado com sucesso para o grupo \`${groupID}\`!`, ephemeral: true });
            });

        // --- SUBMIT: REMOVER PRODUTO ---
        } else if (modalId === 'modal_del_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();

            db.run(`DELETE FROM products WHERE id = ?`, [prodId], function(err) {
                if (this.changes === 0) {
                    return interaction.reply({ content: `❌ Produto com código \`${prodId}\` não foi encontrado.`, ephemeral: true });
                }
                registrarLog(`Removeu o produto ID: ${prodId}`, usuario);
                interaction.reply({ content: `🗑️ Produto \`${prodId}\` removido com sucesso!`, ephemeral: true });
            });

        // --- SUBMIT: GERAR KEYS ---
        } else if (modalId === 'modal_gerar_keys') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const qtd = parseInt(interaction.fields.getTextInputValue('quantidade')) || 1;

            if (qtd < 1 || qtd > 100) {
                return interaction.reply({ content: '❌ A quantidade deve ser um número entre 1 e 100.', ephemeral: true });
            }

            db.get(`SELECT * FROM products WHERE id = ?`, [prodId], async (err, produto) => {
                if (!produto) {
                    return interaction.reply({ content: `❌ Produto com código \`${prodId}\` não encontrado! Cadastre-o primeiro usando "Add produto".`, ephemeral: true });
                }

                const keysGeradas = [];
                const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                db.serialize(() => {
                    const stmt = db.prepare(`INSERT INTO keys (key, product, used, created_at) VALUES (?, ?, 0, ?)`);
                    for (let i = 0; i < qtd; i++) {
                        const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
                        const keyFinal = `${prodId}-${randomString}`;
                        stmt.run(keyFinal, prodId, dataHora);
                        keysGeradas.push(`\`${keyFinal}\``);
                    }
                    stmt.finalize();
                });

                registrarLog(`Gerou ${qtd} key(s) para o produto: ${produto.name}`, usuario);

                await interaction.reply({ 
                    content: `✅ **${qtd} Key(s) gerada(s) para [${produto.name}]!**\n\n${keysGeradas.join('\n')}`, 
                    ephemeral: true 
                });
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
