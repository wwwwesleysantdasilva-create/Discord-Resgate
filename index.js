require('dotenv').config();
const { Client, GatewayIntentBits, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const fs = require('fs');
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

app.get('/', (req, res) => res.send('🤖 Bot online!'));

if (!fs.existsSync('./data')) {
    try { fs.mkdirSync('./data'); } catch (e) {}
}

const dbPath = fs.existsSync('/data') ? '/data/database.sqlite' : './database.sqlite';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Erro ao conectar ao SQLite:', err.message);
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS keys (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, product TEXT, group_id TEXT, used INTEGER DEFAULT 0, created_at TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id TEXT UNIQUE, name TEXT, group_id TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, user TEXT, timestamp TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS rastro_eterno (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT, discord_tag TEXT, telegram_id TEXT, telegram_user TEXT, produto TEXT, key_usada TEXT, data_resgate TEXT, data_entrada_telegram TEXT, data_saida_telegram TEXT, status_atual TEXT)`);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

function registrarLog(acao, usuario) {
    const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    db.run(`INSERT INTO logs (action, user, timestamp) VALUES (?, ?, ?)`, [acao, usuario, dataHora]);
}

async function enviarWebhookDiscord(mensagem) {
    if (!DISCORD_WEBHOOK_URL) return;
    try { await axios.post(DISCORD_WEBHOOK_URL, { content: mensagem }); } 
    catch (error) { console.error('Erro ao enviar webhook:', error.message); }
}

// ROTA WEBHOOK TELEGRAM
app.post('/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        const chatMemberEvent = update.chat_member || update.my_chat_member;

        if (chatMemberEvent) {
            const user = chatMemberEvent.new_chat_member.user;
            if (user.is_bot) return res.status(200).send('OK');

            const telegramId = user.id.toString();
            const telegramUsername = user.username ? `@${user.username}` : (user.first_name || 'Desconhecido');
            const newStatus = chatMemberEvent.new_chat_member.status;
            const oldStatus = chatMemberEvent.old_chat_member.status;
            
            const agora = new Date();
            const dataHoraAtual = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const dataBr = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const horaBr = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            // ENTRADA
            if (['member', 'administrator', 'creator'].includes(newStatus) && ['left', 'kicked', 'restricted'].includes(oldStatus)) {
                db.get(`SELECT * FROM rastro_eterno WHERE telegram_id = ? ORDER BY id DESC LIMIT 1`, [telegramId], (err, registroExistente) => {
                    if (registroExistente) {
                        db.run(`UPDATE rastro_eterno SET data_entrada_telegram = ?, status_atual = 'No Grupo' WHERE id = ?`, [dataHoraAtual, registroExistente.id]);
                        enviarWebhookDiscord(
                            `## LOGS  DE RESGATE\n\n` +
                            `<:theboxez:1543426459165532292> **| PRODUTO:** ${registroExistente.produto}\n` +
                            `<:emoji_49:1543470661744201868> **| KEY ULTILIZADA: ** \`${registroExistente.key_usada}\`\n\n` +
                            `<:info:1543491941314863239> **| INFORMAÇÕES **\n\n` +
                            `> **DC USER: ** <@${registroExistente.discord_id}>\n` +
                            `> **DC ID: ** \`${registroExistente.discord_id}\`\n` +
                            `> **TG USER:** ${telegramUsername}\n` +
                            `> **TG ID:** \`${telegramId}\`\n\n` +
                            `<:calendar:1543440066209120387> **| DATA:** \`${dataBr}\`\n` +
                            `<:relogio_StorM:1531049138291216414> **| HORA: ** \`${horaBr}\``
                        );
                    } else {
                        db.get(`SELECT * FROM rastro_eterno WHERE telegram_id IS NULL ORDER BY id DESC LIMIT 1`, [], (err2, ultimoGerado) => {
                            if (ultimoGerado) {
                                db.run(`UPDATE rastro_eterno SET telegram_id = ?, telegram_user = ?, data_entrada_telegram = ?, status_atual = 'No Grupo' WHERE id = ?`, [telegramId, telegramUsername, dataHoraAtual, ultimoGerado.id]);
                                enviarWebhookDiscord(
                                    `## LOGS  DE RESGATE\n\n` +
                                    `<:theboxez:1543426459165532292> **| PRODUTO:** ${ultimoGerado.produto}\n` +
                                    `<:emoji_49:1543470661744201868> **| KEY ULTILIZADA: ** \`${ultimoGerado.key_usada}\`\n\n` +
                                    `<:info:1543491941314863239> **| INFORMAÇÕES **\n\n` +
                                    `> **DC USER: ** <@${ultimoGerado.discord_id}>\n` +
                                    `> **DC ID: ** \`${ultimoGerado.discord_id}\`\n` +
                                    `> **TG USER:** ${telegramUsername}\n` +
                                    `> **TG ID:** \`${telegramId}\`\n\n` +
                                    `<:calendar:1543440066209120387> **| DATA:** \`${dataBr}\`\n` +
                                    `<:relogio_StorM:1531049138291216414> **| HORA: ** \`${horaBr}\``
                                );
                            }
                        });
                    }
                });
            } 
            // SAÍDA
            else if (['left', 'kicked'].includes(newStatus) && ['member', 'administrator', 'creator'].includes(oldStatus)) {
                db.get(`SELECT * FROM rastro_eterno WHERE telegram_id = ? ORDER BY id DESC LIMIT 1`, [telegramId], (err, row) => {
                    db.run(`UPDATE rastro_eterno SET data_saida_telegram = ?, status_atual = 'Saiu do Grupo' WHERE telegram_id = ?`, [dataHoraAtual, telegramId]);
                    if (row) {
                        enviarWebhookDiscord(
                            `## LOG DE SAIDA\n\n` +
                            `<:theboxez:1543426459165532292> **| SAIDA DE:** ${row.produto}\n` +
                            `<:info:1543491941314863239> **| INFORMAÇÕES **\n\n` +
                            `> **DC USER: ** <@${row.discord_id}>\n` +
                            `> **DC ID: ** \`${row.discord_id}\`\n` +
                            `> **TG USER:** ${telegramUsername}\n` +
                            `> **TG ID:** \`${telegramId}\`\n\n` +
                            `<:calendar:1543440066209120387> **| DATA:** \`${dataBr}\`\n` +
                            `<:relogio_StorM:1531049138291216414> **| HORA: ** \`${horaBr}\``
                        );
                    }
                });
            }
        }
        res.status(200).send('OK');
    } catch (err) { res.status(500).send('Error'); }
});

client.once('clientReady', async () => {
    console.log(`Bot online como ${client.user.tag}`);
    const commands = [
        new SlashCommandBuilder().setName('painel').setDescription('Painel adm').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('setarpainel').setDescription('Painel clientes').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(command => command.toJSON());

    try {
        for (const guild of client.guilds.cache.values()) await guild.commands.set(commands);
    } catch (error) { console.error(error); }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'painel') {
            const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('### <:mundo_StorM:1530945775679307786> | Dashboard \n\n——————'));
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_gerar_keys').setLabel('Gerar keys').setStyle(ButtonStyle.Secondary).setEmoji('1543439616328204408'),
                new ButtonBuilder().setCustomId('btn_registros').setLabel('Registros').setStyle(ButtonStyle.Secondary).setEmoji('1543438969641898124')
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_add_produto').setLabel('Add produto').setStyle(ButtonStyle.Secondary).setEmoji('1532944991423565844'),
                new ButtonBuilder().setCustomId('btn_remover_produto').setLabel('Remover produto').setStyle(ButtonStyle.Secondary).setEmoji('1543438189136715857')
            );
            await interaction.reply({ components: [container, row1, row2], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }
        if (interaction.commandName === 'setarpainel') {
            const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('## <:theboxez:1543426459165532292> Resgatar Pack\n\nClique no botão abaixo para validar sua key e obter acesso ao seu pack instantaneamente.'));
            const linha = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_resgate_cliente').setLabel('Resgatar').setStyle(ButtonStyle.Success).setEmoji('1543426459165532292'));
            await interaction.channel.send({ components: [container, linha], flags: MessageFlags.IsComponentsV2 });
            await interaction.reply({ content: '✅ Painel enviado!', flags: MessageFlags.Ephemeral });
        }
    } 
    else if (interaction.isButton()) {
        const id = interaction.customId;
        if (id === 'btn_resgate_cliente') {
            const modal = new ModalBuilder().setCustomId('modal_resgate').setTitle('Validação de Compra');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_key').setLabel('Cole a sua Key aqui:').setPlaceholder('Ex: SENSI-1234ABCD').setStyle(TextInputStyle.Short).setRequired(true)));
            return await interaction.showModal(modal);
        }
        // ... (Outros modais mantidos iguais)
        if (id === 'btn_add_produto') {
            const modal = new ModalBuilder().setCustomId('modal_add_produto').setTitle('📦 Adicionar Novo Produto');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('Código (Ex: SENSI)').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_name').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_group').setLabel('ID Telegram').setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal);
        } else if (id === 'btn_remover_produto') {
            const modal = new ModalBuilder().setCustomId('modal_del_produto').setTitle('🗑️ Remover Produto');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('Código do Produto').setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal);
        } else if (id === 'btn_gerar_keys') {
            const modal = new ModalBuilder().setCustomId('modal_gerar_keys').setTitle('🔑 Gerar Keys');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prod_id').setLabel('Código do Produto').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quantidade').setLabel('Qtd Keys').setStyle(TextInputStyle.Short).setRequired(true)));
            await interaction.showModal(modal);
        } else if (id === 'btn_registros') {
            db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 10`, [], async (err, rows) => {
                if (!rows.length) return interaction.reply({ content: '📜 Nenhum registro.', flags: MessageFlags.Ephemeral });
                await interaction.reply({ content: `📜 **Registros:**\n\n${rows.map(r => `• **[${r.timestamp}]** ${r.user}: ${r.action}`).join('\n')}`, flags: MessageFlags.Ephemeral });
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
                if (err || !row || row.used === 1) return interaction.editReply('❌ **Key inválida ou já utilizada.**');

                db.get(`SELECT name FROM products WHERE id = ?`, [row.product], async (errProd, produto) => {
                    const nomeProduto = produto ? produto.name : row.product;
                    try {
                        const respostaTelegram = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/createChatInviteLink`, {
                            chat_id: row.group_id, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + (60 * 15)
                        });

                        const linkExclusivo = respostaTelegram.data.result.invite_link;
                        const agora = new Date();
                        const dataHoraResgate = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                        const dataBr = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                        const horaBr = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                        db.run(`UPDATE keys SET used = 1 WHERE key = ?`, [keyDigitada]);
                        db.run(`INSERT INTO rastro_eterno (discord_id, discord_tag, produto, key_usada, data_resgate, status_atual) VALUES (?, ?, ?, ?, ?, ?)`,
                            [userId, usuario, nomeProduto, keyDigitada, dataHoraResgate, 'Aguardando Entrada no Telegram']
                        );

                        // NOVO LOG DE APROVAÇÃO (FORMATADO IGUAL O SEU PEDIDO)
                        await enviarWebhookDiscord(
                            `## LOGS  DE RESGATE\n\n` +
                            `<:theboxez:1543426459165532292> **| PRODUTO:** ${nomeProduto}\n` +
                            `<:emoji_49:1543470661744201868> **| KEY ULTILIZADA: ** \`${keyDigitada}\`\n\n` +
                            `<:info:1543491941314863239> **| INFORMAÇÕES **\n\n` +
                            `> **DC USER: ** <@${userId}>\n` +
                            `> **DC ID: ** \`${userId}\`\n` +
                            `> **TG USER:** Aguardando Entrada...\n` +
                            `> **TG ID:** Aguardando Entrada...\n\n` +
                            `<:calendar:1543440066209120387> **| DATA:** \`${dataBr}\`\n` +
                            `<:relogio_StorM:1531049138291216414> **| HORA: ** \`${horaBr}\``
                        );

                        const containerDM = new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`<:v_:1543470056304807938> **Acesso Liberado com Sucesso!**\n\n<:theboxez:1543426459165532292> **| Produto:** ${nomeProduto}\n<:emoji_49:1543470661744201868> **| Key:** \`${keyDigitada}\`\n\nAqui está o seu link:\n\n<:warn:1539069654922952774> **Serve apenas para 1 pessoa e expira em 15 minutos.**`)
                        );
                        
                        let mensagemDMUrl = '';
                        try {
                            const msgDM = await interaction.user.send({ components: [containerDM, new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Acessar o pack').setStyle(ButtonStyle.Link).setURL(linkExclusivo))], flags: MessageFlags.IsComponentsV2 });
                            mensagemDMUrl = msgDM.url;
                        } catch (dmError) {
                            return interaction.editReply('⚠️ Key validada, mas **suas DMs estão fechadas**!');
                        }

                        await interaction.editReply({
                            content: '<:v_:1543470056304807938>  **Key Validada!**\nVerifique sua **DM (Mensagem privada)**',
                            components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ver dm').setStyle(ButtonStyle.Link).setURL(mensagemDMUrl || `https://discord.com/users/${client.user.id}`))]
                        });

                    } catch (error) { interaction.editReply('❌ Falha ao comunicar com o Telegram.'); }
                });
            });
        }
        
        // Modal de Adicionar, Remover e Gerar mantidos...
        if (modalId === 'modal_add_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const prodName = interaction.fields.getTextInputValue('prod_name').trim();
            const groupID = interaction.fields.getTextInputValue('prod_group').trim();
            db.run(`INSERT OR REPLACE INTO products (id, name, group_id) VALUES (?, ?, ?)`, [prodId, prodName, groupID], () => {
                interaction.reply({ content: `✅ Produto \`${prodId}\` cadastrado!`, flags: MessageFlags.Ephemeral });
            });
        } else if (modalId === 'modal_del_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            db.run(`DELETE FROM products WHERE id = ?`, [prodId], () => {
                interaction.reply({ content: `🗑️ Produto \`${prodId}\` removido!`, flags: MessageFlags.Ephemeral });
            });
        } else if (modalId === 'modal_gerar_keys') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const qtd = parseInt(interaction.fields.getTextInputValue('quantidade')) || 1;
            db.get(`SELECT * FROM products WHERE id = ?`, [prodId], (err, produto) => {
                if (!produto) return interaction.reply({ content: `❌ Produto não encontrado.`, flags: MessageFlags.Ephemeral });
                const keysGeradas = [];
                const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                db.serialize(() => {
                    const stmt = db.prepare(`INSERT INTO keys (key, product, group_id, used, created_at) VALUES (?, ?, ?, 0, ?)`);
                    for (let i = 0; i < qtd; i++) {
                        const keyFinal = `${prodId}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
                        stmt.run(keyFinal, prodId, produto.group_id, dataHora);
                        keysGeradas.push(`\`${keyFinal}\``);
                    }
                    stmt.finalize();
                });
                interaction.reply({ content: `✅ **${qtd} Key(s) gerada(s)!**\n\n${keysGeradas.join('\n')}`, flags: MessageFlags.Ephemeral });
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    client.login(process.env.DISCORD_TOKEN);
});
