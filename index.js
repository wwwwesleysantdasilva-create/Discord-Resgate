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
    MessageFlags
} = require('discord.js');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

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

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        codigo TEXT UNIQUE, 
        telegram_group_id TEXT, 
        usada INTEGER DEFAULT 0
    )`);
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// Comando para enviar o painel usando Components V2
client.on('messageCreate', async (message) => {
    if (message.content === '!painel' && message.member.permissions.has('Administrator')) {
        
        // Criando o layout estruturado com Components V2 (Container + TextDisplay)
        const container = new ContainerBuilder()
            .setAccentColor(0x2B2D31) // Cor lateral do container
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('### 📦 Resgatar Acesso\nClique no botão abaixo para validar sua Key e receber instantaneamente o link exclusivo do grupo.')
            );

        const botao = new ButtonBuilder()
            .setCustomId('btn_resgate')
            .setLabel('Resgatar Key')
            .setEmoji('🔑')
            .setStyle(ButtonStyle.Success);

        const linha = new ActionRowBuilder().addComponents(botao);

        await message.channel.send({
            components: [container, linha],
            flags: MessageFlags.IsComponentsV2 // Flag obrigatória para habilitar o layout V2
        });
        
        await message.delete();
    }
});

client.on('interactionCreate', async (interaction) => {
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

    if (interaction.isModalSubmit() && interaction.customId === 'modal_resgate') {
        const keyDigitada = interaction.fields.getTextInputValue('input_key').trim();
        
        await interaction.deferReply({ ephemeral: true });

        // Consulta a Key no banco de dados SQLite
        db.get(`SELECT * FROM keys WHERE codigo = ?`, [keyDigitada], async (err, row) => {
            if (err) {
                console.error(err);
                return interaction.editReply('❌ Ocorreu um erro interno no banco de dados.');
            }

            if (!row || row.usada === 1) {
                return interaction.editReply('❌ **Key inválida ou já utilizada.** Verifique se copiou corretamente.');
            }

            try {
                // Solicita o link de uso único para o Telegram
                const respostaTelegram = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/createChatInviteLink`, {
                    chat_id: row.telegram_group_id,
                    member_limit: 1,
                    expire_date: Math.floor(Date.now() / 1000) + (60 * 15)
                });

                const linkExclusivo = respostaTelegram.data.result.invite_link;

                // Marca a key como usada
                db.run(`UPDATE keys SET usada = 1 WHERE codigo = ?`, [keyDigitada]);

                await interaction.editReply(`✅ **Acesso Liberado com Sucesso!**\n\nAqui está o seu link exclusivo para entrar no grupo VIP do Telegram. \n⚠️ *Este link serve apenas para 1 pessoa e expira em 15 minutos.*\n\n🔗 ${linkExclusivo}`);

            } catch (error) {
                console.error('Erro ao gerar link do Telegram:', error.response ? error.response.data : error.message);
                await interaction.editReply('❌ Falha ao comunicar com o Telegram. Verifique se o bot está como Administrador no grupo correspondente.');
            }
        });
    }
});

client.once('ready', () => {
    console.log(`🤖 Bot com Components V2 online como: ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
