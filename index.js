const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

// Configurações Básicas
const DISCORD_TOKEN = 'SEU_TOKEN_DO_DISCORD_AQUI';
const WEBHOOK_CHANNEL_ID = 'ID_DO_CANAL_DE_LOGS_AQUI'; // Canal onde o bot enviará as logs

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const app = express();
app.use(bodyParser.json());

// Banco de Dados SQLite (Mantendo a estrutura do rastro_eterno)
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Erro ao abrir o banco de dados:', err.message);
    else {
        db.run(`CREATE TABLE IF NOT EXISTS rastro_eterno (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT,
            discord_tag TEXT,
            key_usada TEXT,
            produto TEXT,
            telegram_id TEXT,
            telegram_username TEXT,
            data_entrada_telegram TEXT,
            data_saida_telegram TEXT,
            status_atual TEXT
        )`);
    }
});

// Função para pegar Data e Hora do Brasil
function obterDataHoraAtual() {
    const agora = new Date();
    const data = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const hora = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return { data, hora };
}

// Função para enviar logs no Discord
async function enviarWebhookDiscord(mensagem) {
    try {
        const canal = await client.channels.fetch(WEBHOOK_CHANNEL_ID);
        if (canal) {
            await canal.send(mensagem);
        }
    } catch (error) {
        console.error('Erro ao enviar log para o Discord:', error);
    }
}

// ==========================================
// ROTA DO WEBHOOK DO TELEGRAM (ATUALIZADA)
// ==========================================
app.post('/telegram-webhook', (req, res) => {
    const update = req.body;

    if (update.chat_member) {
        const chatMember = update.chat_member;
        const telegramId = chatMember.new_chat_member.user.id.toString();
        const telegramUsername = chatMember.new_chat_member.user.username ? `@${chatMember.new_chat_member.user.username}` : chatMember.new_chat_member.user.first_name;
        
        const oldStatus = chatMember.old_chat_member.status;
        const newStatus = chatMember.new_chat_member.status;
        const { data, hora } = obterDataHoraAtual();
        const dataHoraCompleta = `${data} às ${hora}`;

        // USUÁRIO ENTROU NO GRUPO
        if (['member', 'administrator', 'creator'].includes(newStatus) && ['left', 'kicked'].includes(oldStatus)) {
            
            // Busca o último registro pendente (onde o telegram_id está vazio) ou o registro exato
            db.get(`SELECT * FROM rastro_eterno WHERE telegram_id = ? OR telegram_id IS NULL ORDER BY id DESC LIMIT 1`, [telegramId], (err, row) => {
                if (err) return console.error(err);

                if (row) {
                    // Atualiza o banco confirmando a entrada
                    db.run(`UPDATE rastro_eterno SET telegram_id = ?, telegram_username = ?, data_entrada_telegram = ?, status_atual = 'No Grupo' WHERE id = ?`, 
                    [telegramId, telegramUsername, dataHoraCompleta, row.id]);

                    // LOG DE ENTRADA FORMATADA
                    enviarWebhookDiscord(
                        `## LOGS  DE RESGATE\n\n` +
                        `<:theboxez:1543426459165532292> **| PRODUTO:** ${row.produto}\n` +
                        `<:emoji_49:1543470661744201868> **| KEY ULTILIZADA: ** \`${row.key_usada}\`\n\n` +
                        `<:info:1543491941314863239> **| INFORMAÇÕES **\n\n` +
                        `> **DC USER: ** <@${row.discord_id}>\n` +
                        `> **DC ID: ** \`${row.discord_id}\`\n` +
                        `> **TG USER:** ${telegramUsername}\n` +
                        `> **TG ID:** \`${telegramId}\`\n\n` +
                        `<:calendar:1543440066209120387> **| DATA:** \`${data}\`\n` +
                        `<:relogio_StorM:1531049138291216414> **| HORA: ** \`${hora}\``
                    );
                } else {
                    // Caso alguém entre sem ter resgatado key (Opcional, formato simples)
                    enviarWebhookDiscord(`⚠️ **Entrada sem registro:** ${telegramUsername} (\`ID: ${telegramId}\`) entrou no grupo, mas nenhuma key foi encontrada.`);
                }
            });
        } 
        
        // USUÁRIO SAIU DO GRUPO
        else if (['left', 'kicked'].includes(newStatus) && ['member', 'administrator', 'creator'].includes(oldStatus)) {
            
            db.get(`SELECT * FROM rastro_eterno WHERE telegram_id = ? ORDER BY id DESC LIMIT 1`, [telegramId], (err, row) => {
                if (err) return console.error(err);

                if (row) {
                    // Atualiza o banco confirmando a saída
                    db.run(`UPDATE rastro_eterno SET data_saida_telegram = ?, status_atual = 'Saiu do Grupo' WHERE telegram_id = ?`, [dataHoraCompleta, telegramId]);

                    // LOG DE SAÍDA FORMATADA
                    enviarWebhookDiscord(
                        `## LOG DE SAIDA\n\n` +
                        `<:theboxez:1543426459165532292> **| SAIDA DE:** ${row.produto}\n` +
                        `<:info:1543491941314863239> **| INFORMAÇÕES **\n\n` +
                        `> **DC USER: ** <@${row.discord_id}>\n` +
                        `> **DC ID: ** \`${row.discord_id}\`\n` +
                        `> **TG USER:** ${telegramUsername}\n` +
                        `> **TG ID:** \`${telegramId}\`\n\n` +
                        `<:calendar:1543440066209120387> **| DATA:** \`${data}\`\n` +
                        `<:relogio_StorM:1531049138291216414> **| HORA: ** \`${hora}\``
                    );
                } else {
                    // Saída de alguém sem registro
                    enviarWebhookDiscord(`📤 **Saída sem registro:** ${telegramUsername} (\`ID: ${telegramId}\`) saiu do grupo.`);
                }
            });
        }
    }

    res.sendStatus(200);
});

// Inicialização do Bot e do Servidor Web
client.once('ready', () => {
    console.log(`🤖 Bot online como ${client.user.tag}`);
    
    // Inicia o Express na porta 3000 (Padrão do Railway)
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🌐 Servidor Webhook rodando na porta ${PORT}`);
    });
});

client.login(DISCORD_TOKEN);
