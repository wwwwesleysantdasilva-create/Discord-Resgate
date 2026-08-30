const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// Configuração do Banco de Dados SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Erro ao abrir o banco de dados', err.message);
    else console.log('Conectado ao banco de dados SQLite.');
});

// Criação das tabelas necessárias
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE,
        product TEXT,
        created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        price TEXT
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

client.once('ready', async () => {
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
            const embed = new EmbedBuilder()
                .setDescription('### <:mundo_StorM:1530945775679307786> | Dashboard \n\n——————')
                .setColor('#2b2d31');

            // Linha 1 de Botões (Cinza / Secondary)
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_gerar_keys')
                    .setLabel('Gerar keys')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:edit:1543439616328204408>'),
                new ButtonBuilder()
                    .setCustomId('btn_registros')
                    .setLabel('Registros')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:34563:1543438969641898124>')
            );

            // Linha 2 de Botões (Cinza / Secondary)
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_add_produto')
                    .setLabel('Add produto')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:mais:1532944991423565844>'),
                new ButtonBuilder()
                    .setCustomId('btn_remover_produto')
                    .setLabel('Remover produto')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:menos:1543438189136715857>')
            );

            await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'btn_add_produto') {
            const modal = new ModalBuilder()
                .setCustomId('modal_add_produto')
                .setTitle('Adicionar Produto');

            const produtoInput = new TextInputBuilder()
                .setCustomId('input_nome_produto')
                .setLabel('Nome do Produto')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(produtoInput));
            await interaction.showModal(modal);
        } else if (interaction.customId === 'btn_remover_produto') {
            await interaction.reply({ content: 'Função de remover produto em desenvolvimento.', ephemeral: true });
        } else if (interaction.customId === 'btn_gerar_keys') {
            await interaction.reply({ content: 'Função de gerar keys em desenvolvimento.', ephemeral: true });
        } else if (interaction.customId === 'btn_registros') {
            await interaction.reply({ content: 'Exibindo registros recentes...', ephemeral: true });
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_add_produto') {
            const nomeProduto = interaction.fields.getTextInputValue('input_nome_produto');
            
            db.run(`INSERT OR IGNORE INTO products (name) VALUES (?)`, [nomeProduto], function(err) {
                if (err) {
                    return interaction.reply({ content: 'Erro ao adicionar produto.', ephemeral: true });
                }
                interaction.reply({ content: `Produto **${nomeProduto}** adicionado com sucesso!`, ephemeral: true });
            });
        }
    }
});

// Substitua pelo token do seu bot
client.login('SEU_TOKEN_AQUI');
