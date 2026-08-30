require('dotenv').config();
const { Client, GatewayIntentBits, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { Pool } = require('pg');
const axios = require('axios');
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;

app.get('/', (req, res) => res.send('🤖 Bot online!'));

// CONEXÃO COM O SUPABASE (POSTGRESQL) COM CONFIGURAÇÃO DE REDE ROBUSTA
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function inicializarBanco() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS keys (
                id SERIAL PRIMARY KEY,
                key TEXT UNIQUE,
                product TEXT,
                group_id TEXT,
                used INTEGER DEFAULT 0,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS products (
                id TEXT UNIQUE PRIMARY KEY,
                name TEXT,
                group_id TEXT
            );
            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY,
                action TEXT,
                "user" TEXT,
                timestamp TEXT
            );
            CREATE TABLE IF NOT EXISTS rastro_eterno (
                id SERIAL PRIMARY KEY,
                discord_id TEXT,
                discord_tag TEXT,
                telegram_id TEXT,
                telegram_user TEXT,
                produto TEXT,
                group_id TEXT,
                key_usada TEXT,
                data_resgate TEXT,
                data_entrada_telegram TEXT,
                data_saida_telegram TEXT,
                status_atual TEXT
            );
        `);
        console.log('✅ Tabelas no Supabase prontas!');
    } catch (dbError) {
        console.error('❌ Erro ao conectar/inicializar o banco no Supabase:', dbError.message);
    }
}
inicializarBanco();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

async function registrarLog(acao, usuario) {
    try {
        const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        await pool.query(`INSERT INTO logs (action, "user", timestamp) VALUES ($1, $2, $3)`, [acao, usuario, dataHora]);
    } catch (e) {
        console.error('Erro ao registrar log:', e.message);
    }
}

async function enviarWebhookDiscord(mensagem) {
    if (!DISCORD_WEBHOOK_URL) {
        console.log('⚠️ DISCORD_WEBHOOK_URL não está configurada!');
        return;
    }
    try { 
        const urlLimpa = DISCORD_WEBHOOK_URL.trim();
        await axios.post(urlLimpa, { 
            content: mensagem 
        }, {
            headers: { 'Content-Type': 'application/json' }
        }); 
        console.log('✅ Webhook do Discord enviado com sucesso!');
    } catch (error) { 
        console.error('❌ Erro detalhado ao enviar webhook para o Discord:', error.response ? error.response.data : error.message); 
    }
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
            const chatId = chatMemberEvent.chat.id.toString();
            const newStatus = chatMemberEvent.new_chat_member.status;
            const oldStatus = chatMemberEvent.old_chat_member.status;
            
            const agora = new Date();
            const dataHoraAtual = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const dataBr = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const horaBr = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            if (['member', 'administrator', 'creator'].includes(newStatus) && ['left', 'kicked', 'restricted'].includes(oldStatus)) {
                const resExistente = await pool.query(`SELECT * FROM rastro_eterno WHERE telegram_id = $1 ORDER BY id DESC LIMIT 1`, [telegramId]);
                
                if (resExistente.rows.length > 0) {
                    const registroExistente = resExistente.rows[0];
                    await pool.query(`UPDATE rastro_eterno SET telegram_user = $1, data_entrada_telegram = $2, status_atual = 'No Grupo' WHERE id = $3`, [telegramUsername, dataHoraAtual, registroExistente.id]);
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
                    const resUltimo = await pool.query(`SELECT * FROM rastro_eterno WHERE (telegram_id IS NULL OR telegram_id = '') AND status_atual = 'Aguardando Entrada no Telegram' AND group_id = $1 ORDER BY id DESC LIMIT 1`, [chatId]);
                    if (resUltimo.rows.length > 0) {
                        const ultimoGerado = resUltimo.rows[0];
                        await pool.query(`UPDATE rastro_eterno SET telegram_id = $1, telegram_user = $2, data_entrada_telegram = $3, status_atual = 'No Grupo' WHERE id = $4`, [telegramId, telegramUsername, dataHoraAtual, ultimoGerado.id]);
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
                }
            } 
            else if (['left', 'kicked'].includes(newStatus) && ['member', 'administrator', 'creator'].includes(oldStatus)) {
                const resSaida = await pool.query(`SELECT * FROM rastro_eterno WHERE telegram_id = $1 ORDER BY id DESC LIMIT 1`, [telegramId]);
                if (resSaida.rows.length > 0) {
                    const row = resSaida.rows[0];
                    await pool.query(`UPDATE rastro_eterno SET data_saida_telegram = $1, status_atual = 'Saiu do Grupo' WHERE id = $2`, [dataHoraAtual, row.id]);
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
            }
        }
        res.status(200).send('OK');
    } catch (err) { 
        console.error('Erro na rota telegram-webhook:', err.message);
        res.status(500).send('Error'); 
    }
});

client.once('clientReady', async () => {
    console.log(`Bot online como ${client.user.tag}`);
    
    if (TELEGRAM_TOKEN && RAILWAY_PUBLIC_DOMAIN) {
        const domain = RAILWAY_PUBLIC_DOMAIN.startsWith('http') ? RAILWAY_PUBLIC_DOMAIN : `https://${RAILWAY_PUBLIC_DOMAIN}`;
        const webhookUrl = `${domain}/telegram-webhook`;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
                url: webhookUrl,
                allowed_updates: ["chat_member", "my_chat_member"]
            });
            console.log(`✅ Webhook Telegram atrelado com sucesso a: ${webhookUrl}`);
        } catch (webhookErr) {
            console.error('❌ Erro ao registrar Webhook no Telegram:', webhookErr.message);
        }
    }

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
            const resLogs = await pool.query(`SELECT * FROM logs ORDER BY id DESC LIMIT 10`);
            if (!resLogs.rows.length) return interaction.reply({ content: '📜 Nenhum registro.', flags: MessageFlags.Ephemeral });
            await interaction.reply({ content: `📜 **Registros:**\n\n${resLogs.rows.map(r => `• **[${r.timestamp}]** ${r.user}: ${r.action}`).join('\n')}`, flags: MessageFlags.Ephemeral });
        }
    } 
    else if (interaction.isModalSubmit()) {
        const modalId = interaction.customId;
        const usuario = interaction.user.tag;
        const userId = interaction.user.id;

        if (modalId === 'modal_resgate') {
            const keyDigitada = interaction.fields.getTextInputValue('input_key').trim();
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const resKey = await pool.query(`SELECT * FROM keys WHERE key = $1`, [keyDigitada]);
            const row = resKey.rows[0];

            if (!row || row.used === 1) return interaction.editReply('<:cloner_warning:1543647603059859506>  **Key inválida ou já utilizada.**');

            const resProd = await pool.query(`SELECT name FROM products WHERE id = $1`, [row.product]);
            const produto = resProd.rows[0];
            const nomeProduto = produto ? produto.name : row.product;

            try {
                const respostaTelegram = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/createChatInviteLink`, {
                    chat_id: row.group_id, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + (60 * 15)
                });

                const linkExclusivo = respostaTelegram.data.result.invite_link;
                const agora = new Date();
                const dataHoraResgate = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                await pool.query(`UPDATE keys SET used = 1 WHERE key = $1`, [keyDigitada]);
                await pool.query(`INSERT INTO rastro_eterno (discord_id, discord_tag, produto, group_id, key_usada, data_resgate, status_atual) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [userId, usuario, nomeProduto, row.group_id.toString(), keyDigitada, dataHoraResgate, 'Aguardando Entrada no Telegram']
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

            } catch (error) { 
                console.error(error);
                interaction.editReply('❌ Falha ao comunicar com o Telegram.'); 
            }
        }
        
        if (modalId === 'modal_add_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const prodName = interaction.fields.getTextInputValue('prod_name').trim();
            const groupID = interaction.fields.getTextInputValue('prod_group').trim();
            
            await pool.query(`INSERT INTO products (id, name, group_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, group_id = $3`, [prodId, prodName, groupID]);
            interaction.reply({ content: `✅ Produto \`${prodId}\` cadastrado!`, flags: MessageFlags.Ephemeral });
        } else if (modalId === 'modal_del_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            await pool.query(`DELETE FROM products WHERE id = $1`, [prodId]);
            interaction.reply({ content: `🗑️ Produto \`${prodId}\` removido!`, flags: MessageFlags.Ephemeral });
        } else if (modalId === 'modal_gerar_keys') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            const qtd = parseInt(interaction.fields.getTextInputValue('quantidade')) || 1;
            
            const resProd = await pool.query(`SELECT * FROM products WHERE id = $1`, [prodId]);
            const produto = resProd.rows[0];

            if (!produto) return interaction.reply({ content: `❌ Produto não encontrado.`, flags: MessageFlags.Ephemeral });
            
            const keysGeradas = [];
            const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            for (let i = 0; i < qtd; i++) {
                const keyFinal = `${prodId}-${Math.random().toString(36).substring(2, 10).toUpperCase()}` ;
                await pool.query(`INSERT INTO keys (key, product, group_id, used, created_at) VALUES ($1, $2, $3, 0, $4)`, [keyFinal, prodId, produto.group_id, dataHora]);
                keysGeradas.push(`\`${keyFinal}\``);
            }

            interaction.reply({ content: `✅ **${qtd} Key(s) gerada(s)!**\n\n${keysGeradas.join('\n')}`, flags: MessageFlags.Ephemeral });
        }
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    client.login(process.env.DISCORD_TOKEN);
});

