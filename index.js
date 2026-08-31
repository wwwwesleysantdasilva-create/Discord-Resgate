require('dotenv').config();
const dns = require('dns');

if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags, AttachmentBuilder } = require('discord.js');
const { Pool } = require('pg');
const axios = require('axios');
const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;
const CANAL_LOGS_ID = '1543481715601969162';

app.get('/', (req, res) => res.send('🤖 Bot online com Sistema de Arquivos de Log!'));

// CONEXÃO COM O SUPABASE (POSTGRESQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
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
                status_atual TEXT,
                invite_link TEXT
            );
        `);
        
        try { await pool.query(`ALTER TABLE rastro_eterno ADD COLUMN invite_link TEXT;`); } catch (e) { }
        console.log('✅ Tabelas no Supabase prontas!');
    } catch (dbError) {
        console.error('❌ Erro ao conectar no Supabase:', dbError.message);
    }
}
inicializarBanco();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

async function registrarLog(acao, usuario) {
    try {
        const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        await pool.query(`INSERT INTO logs (action, "user", timestamp) VALUES ($1, $2, $3)`, [acao, usuario, dataHora]);
    } catch (e) { console.error('Erro ao registrar log interno:', e.message); }
}

// FUNÇÃO PARA ENVIAR O LOG COM ARQUIVO .TXT IDÊNTICO ÀS SUAS IMAGENS PARA O CANAL DO DISCORD
async function enviarLogComArquivoDiscord(dados) {
    try {
        const canal = await client.channels.fetch(CANAL_LOGS_ID);
        if (!canal) {
            console.error('❌ Canal de logs do Discord não encontrado!');
            return;
        }

        // Monta o conteúdo exato do arquivo .txt baseado na sua imagem
        const conteudoTxt = 
`===== LOG DE ATENDIMENTO =====

Usuário:
Nome: ${dados.telegramNome}
Username: ${dados.telegramUsername}
ID: ${dados.telegramId}

Produto:
⚙️ ${dados.produto}

Key:
${dados.keyUsada} (VÁLIDA)

Grupo Liberado:
${dados.groupId}

Horário Entrada (CONFIRMADO):
${dados.dataHora}`;

        const nomeArquivo = `log_${dados.telegramId}_${Date.now()}.txt`;
        fs.writeFileSync(nomeArquivo, conteudoTxt);

        const arquivoAnexo = new AttachmentBuilder(nomeArquivo);

        // Mensagem rica idêntica à imagem 12
        const mensagemTexto = 
`✅ **NOVO RESGATE CONFIRMADO**
📦 Produto: ⚙️ ${dados.produto}
👤 Cliente: ${dados.telegramNome}
🕒 Hora: ${dados.dataHora}`;

        await canal.send({
            content: mensagemTexto,
            files: [arquivoAnexo]
        });

        // Limpa o arquivo temporário local
        fs.unlinkSync(nomeArquivo);
        console.log('✅ Log com arquivo .txt enviado com sucesso para o canal do Discord!');
    } catch (err) {
        console.error('❌ Erro ao enviar arquivo de log para o Discord:', err.message);
    }
}

// ---------------------------------------------------------
// ROTA /telegram-webhook: RECEBE DO SEU OUTRO BOT / TELEGRAM
// ---------------------------------------------------------
app.post('/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        const chatMemberEvent = update.chat_member || update.my_chat_member;

        if (chatMemberEvent) {
            const user = chatMemberEvent.new_chat_member?.user || update.chat_member?.from;
            if (user && user.is_bot) return res.status(200).send('OK');

            if (user) {
                const telegramId = user.id.toString();
                const telegramUsername = user.username ? `@${user.username}` : '@N/A';
                const telegramNome = user.first_name || 'Desconhecido';
                const newStatus = chatMemberEvent.new_chat_member?.status;
                const oldStatus = chatMemberEvent.old_chat_member?.status;
                
                const entrou = ['member', 'administrator', 'creator'].includes(newStatus) && !['member', 'administrator', 'creator'].includes(oldStatus);

                if (entrou) {
                    const agora = new Date();
                    const dataHoraAtual = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                    // Busca o último resgate pendente na fila
                    const resAguardando = await pool.query(`SELECT * FROM rastro_eterno WHERE (telegram_id IS NULL OR telegram_id = '') AND status_atual = 'Aguardando Entrada no Telegram' ORDER BY id ASC LIMIT 1`);
                    
                    if (resAguardando.rows.length > 0) {
                        const rastro = resAguardando.rows[0];
                        
                        await pool.query(`UPDATE rastro_eterno SET telegram_id = $1, telegram_user = $2, data_entrada_telegram = $3, status_atual = 'No Grupo' WHERE id = $4`, 
                            [telegramId, telegramUsername, dataHoraAtual, rastro.id]
                        );

                        // Dispara a função que cria o .txt e manda pro Discord no canal 1543481715601969162
                        await enviarLogComArquivoDiscord({
                            telegramNome: telegramNome,
                            telegramUsername: telegramUsername,
                            telegramId: telegramId,
                            produto: rastro.produto,
                            keyUsada: rastro.key_usada,
                            groupId: rastro.group_id,
                            dataHora: dataHoraAtual
                        });
                    }
                }
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error('❌ Erro no webhook do telegram:', err.message);
        res.status(500).send('Error');
    }
});

client.once('clientReady', async () => {
    console.log(`Bot online como ${client.user.tag}`);
    
    if (TELEGRAM_TOKEN && RAILWAY_PUBLIC_DOMAIN) {
        const domain = RAILWAY_PUBLIC_DOMAIN.startsWith('http') ? RAILWAY_PUBLIC_DOMAIN : `https://${RAILWAY_PUBLIC_DOMAIN}`;
        const webhookUrl = `${domain}/telegram-webhook`;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteWebhook`, { drop_pending_updates: false });
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
                url: webhookUrl,
                allowed_updates: ["message", "chat_member", "my_chat_member"]
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
            const container = new ActionRowBuilder(); // Mantém compatibilidade
            // ... painel admin padrão ...
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_gerar_keys').setLabel('Gerar keys').setStyle(ButtonStyle.Secondary).setEmoji('1543439616328204408'),
                new ButtonBuilder().setCustomId('btn_registros').setLabel('Registros').setStyle(ButtonStyle.Secondary).setEmoji('1543438969641898124')
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_add_produto').setLabel('Add produto').setStyle(ButtonStyle.Secondary).setEmoji('1532944991423565844'),
                new ButtonBuilder().setCustomId('btn_remover_produto').setLabel('Remover produto').setStyle(ButtonStyle.Secondary).setEmoji('1543438189136715857')
            );
            await interaction.reply({ content: '### <:mundo_StorM:1530945775679307786> | Dashboard \n\n——————', components: [row1, row2], flags: MessageFlags.Ephemeral });
        }
        if (interaction.commandName === 'setarpainel') {
            const linha = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_resgate_cliente').setLabel('Resgatar').setStyle(ButtonStyle.Success).setEmoji('1543426459165532292'));
            await interaction.channel.send({ content: '## <:theboxez:1543426459165532292> Resgatar Pack\n\nClique no botão abaixo para validar sua key e obter acesso ao seu pack instantaneamente.', components: [linha] });
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

            if (!row || row.used === 1) return interaction.editReply('❌ **Key inválida ou já utilizada.**');

            const resProd = await pool.query(`SELECT name FROM products WHERE id = $1`, [row.product]);
            const produto = resProd.rows[0];
            const nomeProduto = produto ? produto.name : row.product;

            try {
                const respostaTelegram = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/createChatInviteLink`, {
                    chat_id: row.group_id, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + (60 * 15)
                });

                const linkExclusivo = respostaTelegram.data.result.invite_link;
                const dataHoraResgate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

                await pool.query(`UPDATE keys SET used = 1 WHERE key = $1`, [keyDigitada]);
                
                await pool.query(`INSERT INTO rastro_eterno (discord_id, discord_tag, produto, group_id, key_usada, data_resgate, status_atual, invite_link) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [userId, usuario, nomeProduto, row.group_id.toString(), keyDigitada, dataHoraResgate, 'Aguardando Entrada no Telegram', linkExclusivo]
                );

                await registrarLog(`Resgatou a key ${keyDigitada} do produto ${nomeProduto}`, usuario);

                let mensagemDMUrl = '';
                try {
                    const msgDM = await interaction.user.send({ 
                        content: `✅ **Acesso Liberado com Sucesso!**\n\n📦 **Produto:** ${nomeProduto}\n🔑 **Key:** \`${keyDigitada}\`\n\nAqui está o seu link exclusivo:\n🔗 ${linkExclusivo}\n\n⚠️ *Este link serve apenas para 1 pessoa e expira em 15 minutos.*` 
                    });
                    mensagemDMUrl = msgDM.url;
                } catch (dmError) {
                    return interaction.editReply('⚠️ Key validada, mas **suas DMs estão fechadas**!');
                }

                await interaction.editReply({
                    content: '✅ **Key Validada com Sucesso!** Verifique sua **DM (Mensagem privada)** para acessar o link.'
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
            await registrarLog(`Cadastrou/Atualizou o produto ${prodId}`, usuario);
            interaction.reply({ content: `✅ Produto \`${prodId}\` cadastrado!`, flags: MessageFlags.Ephemeral });
        } else if (modalId === 'modal_del_produto') {
            const prodId = interaction.fields.getTextInputValue('prod_id').toUpperCase().trim();
            await pool.query(`DELETE FROM products WHERE id = $1`, [prodId]);
            await registrarLog(`Removeu o produto ${prodId}`, usuario);
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

            await registrarLog(`Gerou ${qtd} key(s) para o produto ${prodId}`, usuario);
            interaction.reply({ content: `✅ **${qtd} Key(s) gerada(s)!**\n\n${keysGeradas.join('\n')}`, flags: MessageFlags.Ephemeral });
        }
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor na porta ${PORT}`);
    client.login(process.env.DISCORD_TOKEN);
});
