require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlags,
    PermissionFlagsBits
} = require('discord.js');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

// Inicializa o banco de dados SQLite local
const db = new sqlite3.Database("./loja.sqlite", (err) => {
    if (err) console.error("Erro ao abrir o banco de dados:", err.message);
    else console.log("📦 Banco de dados conectado com sucesso!");
});

// Criação das tabelas necessárias (Keys, Produtos e Admins)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        codigo TEXT UNIQUE, 
        telegram_group_id TEXT, 
        usada INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        nome TEXT UNIQUE, 
        telegram_group_id TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        user_id TEXT UNIQUE
    )`);
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// Função auxiliar para verificar se é admin (Donos do servidor ou cadastrados no banco)
async function checarAdmin(interaction) {
    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    
    return new Promise((resolve) => {
        db.get(`SELECT * FROM admins WHERE user_id = ?`, [interaction.user.id], (err, row) => {
            resolve(!!row);
        });
    });
}

// Comando de Texto (Painel de Resgate para Clientes)
client.on('messageCreate', async (message) => {
    if (message.content.toLowerCase() === '!painel' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        
        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## <:theboxez:1543426459165532292> Resgatar Pack\n\nClique no botão abaixo para validar sua key e obter acesso ao seu pack \ninstantaneamente.')
            );

        const botao = new ButtonBuilder()
            .setCustomId('btn_resgate')
            .setLabel(' Resgatar')
            .setEmoji('1543426459165532292')
            .setStyle(ButtonStyle.Success);

        const linha = new ActionRowBuilder().addComponents(botao);

        await message.channel.send({
            components: [container, linha],
            flags: MessageFlags.IsComponentsV2
        });
        
        await message.delete().catch(() => {});
    }
});

client.on('interactionCreate', async (interaction) => {
    
    // --- SLASH COMMAND: /painel (Painel de Administração) ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
        if (!(await checarAdmin(interaction))) {
            return interaction.reply({ content: '❌ Você não tem permissão para usar este painel.', ephemeral: true });
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## ⚙️ Painel de Configuração da Loja\nGerencie produtos, keys e administradores por aqui.')
            );

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cfg_gerar_keys').setLabel('Gerar Keys').setStyle(ButtonStyle.Secondary).setEmoji('🔑'),
            new ButtonBuilder().setCustomId('cfg_add_produto').setLabel('Add Produto').setStyle(ButtonStyle.Success).setEmoji('📦'),
            new ButtonBuilder().setCustomId('cfg_del_produto').setLabel('Remover Produto').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cfg_add_admin').setLabel('Add Admin').setStyle(ButtonStyle.Primary).setEmoji('➕'),
            new ButtonBuilder().setCustomId('cfg_del_admin').setLabel('Remover Admin').setStyle(ButtonStyle.Danger).setEmoji('➖')
        );

        await interaction.reply({
            components: [container, row1, row2],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    }

    // --- CLIQUES DOS BOTÕES DO PAINEL DE ADMIN ---
    if (interaction.isButton() && interaction.customId.startsWith('cfg_')) {
        if (!(await checarAdmin(interaction))) {
            return interaction.reply({ content: '❌ Acesso negado.', ephemeral: true });
        }

        const action = interaction.customId;

        if (action === 'cfg_gerar_keys') {
            const modal = new ModalBuilder().setCustomId('modal_gerar_keys').setTitle('🔑 Gerar Keys');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('produto_nome').setLabel('Nome exato do Produto:').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quantidade').setLabel('Quantidade (Ex: 1, 5, 10):').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return await interaction.showModal(modal);
        }

        if (action === 'cfg_add_produto') {
            const modal = new ModalBuilder().setCustomId('modal_add_produto').setTitle('📦 Adicionar Produto');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome do Produto (Ex: Pack Sensi):').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('group_id').setLabel('ID do Grupo Telegram (Ex: -100...):').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return await interaction.showModal(modal);
        }

        if (action === 'cfg_del_produto') {
            const modal = new ModalBuilder().setCustomId('modal_del_produto').setTitle('🗑️ Remover Produto');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome exato do Produto a remover:').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return await interaction.showModal(modal);
        }

        if (action === 'cfg_add_admin') {
            const modal = new ModalBuilder().setCustomId('modal_add_admin').setTitle('➕ Adicionar Administrador');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do Usuário Discord (do novo admin):').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return await interaction.showModal(modal);
        }

        if (action === 'cfg_del_admin') {
            const modal = new ModalBuilder().setCustomId('modal_del_admin').setTitle('➖ Remover Administrador');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do Usuário Discord para remover:').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return await interaction.showModal(modal);
        }
    }

    // --- TRATAMENTO DOS MODAIS DE ADMIN ---
    if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'modal_add_produto') {
            const nome = interaction.fields.getTextInputValue('nome').trim();
            const groupId = interaction.fields.getTextInputValue('group_id').trim();
            
            db.run(`INSERT OR REPLACE INTO produtos (nome, telegram_group_id) VALUES (?, ?)`, [nome, groupId], (err) => {
                if (err) return interaction.reply({ content: '❌ Erro ao salvar produto.', ephemeral: true });
                interaction.reply({ content: `✅ Produto **${nome}** cadastrado com sucesso para o grupo \`${groupId}\`!`, ephemeral: true });
            });
        }

        if (id === 'modal_del_produto') {
            const nome = interaction.fields.getTextInputValue('nome').trim();
            db.run(`DELETE FROM produtos WHERE nome = ?`, [nome], function(err) {
                if (this.changes === 0) return interaction.reply({ content: `❌ Produto **${nome}** não encontrado.`, ephemeral: true });
                interaction.reply({ content: `🗑️ Produto **${nome}** removido com sucesso!`, ephemeral: true });
            });
        }

        if (id === 'modal_gerar_keys') {
            const nomeProduto = interaction.fields.getTextInputValue('produto_nome').trim();
            const qtd = parseInt(interaction.fields.getTextInputValue('quantidade')) || 1;

            db.get(`SELECT telegram_group_id FROM produtos WHERE nome = ?`, [nomeProduto], async (err, produto) => {
                if (!produto) {
                    return interaction.reply({ content: `❌ Produto **${nomeProduto}** não cadastrado! Use "Add Produto" primeiro.`, ephemeral: true });
                }

                const keysGeradas = [];
                db.serialize(() => {
                    const stmt = db.prepare(`INSERT INTO keys (codigo, telegram_group_id, usada) VALUES (?, ?, 0)`);
                    for (let i = 0; i < qtd; i++) {
                        const randomString = crypto.randomBytes(4).toString('hex').toUpperCase();
                        const keyFinal = `SENSI-${randomString}`;
                        stmt.run(keyFinal, produto.telegram_group_id);
                        keysGeradas.push(`\`${keyFinal}\``);
                    }
                    stmt.finalize();
                });

                await interaction.reply({ 
                    content: `✅ **${qtd} Key(s) gerada(s) para [${nomeProduto}]!**\n\n${keysGeradas.join('\n')}`, 
                    ephemeral: true 
                });
            });
        }

        if (id === 'modal_add_admin') {
            const userId = interaction.fields.getTextInputValue('user_id').trim();
            db.run(`INSERT OR IGNORE INTO admins (user_id) VALUES (?)`, [userId], (err) => {
                interaction.reply({ content: `✅ Usuário \`${userId}`} adicionado como administrador com sucesso!`, ephemeral: true });
            });
        }

        if (id === 'modal_del_admin') {
            const userId = interaction.fields.getTextInputValue('user_id').trim();
            db.run(`DELETE FROM admins WHERE user_id = ?`, [userId], function(err) {
                interaction.reply({ content: `➖ Administrador \`${userId}\` removido com sucesso!`, ephemeral: true });
            });
        }
    }

    // --- CLIENTE: CLIQUE NO BOTÃO DE RESGATE DO PACK ---
    if (interaction.isButton() && interaction.customId === 'btn_resgate') {
        const modal = new ModalBuilder()
            .setCustomId('modal_resgate')
            .setTitle('Validação de Compra');

        const inputKey = new TextInputBuilder()
            .setCustomId('input_key')
            .setLabel('Cole a sua Key aqui:')
            .setPlaceholder('Ex: SENSI-1234ABCD')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const linha = new ActionRowBuilder().addComponents(inputKey);
        modal.addComponents(linha);

        await interaction.showModal(modal);
    }

    // --- CLIENTE: ENVIO DA KEY NO MODAL ---
    if (interaction.isModalSubmit() && interaction.customId === 'modal_resgate') {
        const keyDigitada = interaction.fields.getTextInputValue('input_key').trim();
        
        await interaction.deferReply({ ephemeral: true });

        db.get(`SELECT * FROM keys WHERE codigo = ?`, [keyDigitada], async (err, row) => {
            if (err || !row || row.usada === 1) {
                return interaction.editReply('❌ **Key inválida ou já utilizada.** Verifique se copiou corretamente.');
            }

            try {
                const respostaTelegram = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/createChatInviteLink`, {
                    chat_id: row.telegram_group_id,
                    member_limit: 1,
                    expire_date: Math.floor(Date.now() / 1000) + (60 * 15)
                });

                const linkExclusivo = respostaTelegram.data.result.invite_link;

                db.run(`UPDATE keys SET usada = 1 WHERE codigo = ?`, [keyDigitada]);

                await interaction.editReply(`✅ **Acesso Liberado com Sucesso!**\n\nAqui está o seu link exclusivo para entrar no pack do Telegram. \n⚠️ *Este link serve apenas para 1 pessoa e expira em 15 minutos.*\n\n🔗 ${linkExclusivo}`);

            } catch (error) {
                console.error('Erro ao gerar link:', error.response ? error.response.data : error.message);
                await interaction.editReply('❌ Falha ao comunicar com o Telegram. Verifique se o ID do grupo está correto e se o bot é administrador lá.');
            }
        });
    }
});

client.once('ready', async () => {
    console.log(`🤖 Bot online como: ${client.user.tag}`);
    
    try {
        await client.application.commands.set([
            {
                name: 'painel',
                description: 'Abre o painel de configuração administrativo (Apenas Admins)',
                defaultMemberPermissions: PermissionFlagsBits.Administrator.toString()
            }
        ]);
        console.log('✅ Comando /painel registrado com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar slash commands:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
