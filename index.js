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
    ApplicationCommandOptionType,
    PermissionFlagsBits
} = require('discord.js');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto'); // Utilizado para gerar keys aleatórias seguras

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

// Comando de Texto (Apenas para o Painel)
client.on('messageCreate', async (message) => {
    // Transformei em toLowerCase() para aceitar tanto !painel quanto !Painel
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
    
    // --- COMANDOS DE BARRA (SLASH COMMANDS) ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'gerarkey') {
            const grupoId = interaction.options.getString('grupo');
            const quantidade = interaction.options.getInteger('quantidade') || 1;
            
            await interaction.deferReply({ ephemeral: true }); // Responde de forma privada para você

            const keysGeradas = [];
            
            for(let i = 0; i < quantidade; i++) {
                // Gera uma chave no formato SENSI-XXXXXXXX (letras maiúsculas e números)
                const randomString = crypto.randomBytes(4).toString('hex').toUpperCase(); 
                const keyFinal = `SENSI-${randomString}`;
                
                db.run(`INSERT INTO keys (codigo, telegram_group_id, usada) VALUES (?, ?, 0)`, [keyFinal, grupoId]);
                // Colocando crases (`) em volta da key para você conseguir copiar com apenas um toque no Discord
                keysGeradas.push(`\`${keyFinal}\``); 
            }

            await interaction.editReply(`✅ **${quantidade} Key(s) gerada(s) com sucesso!**\n\n**ID do Grupo Telegram:** \`${grupoId}\`\n\n**Suas keys:**\n${keysGeradas.join('\n')}`);
        }
    }

    // --- CLIQUE NO BOTÃO DE RESGATE ---
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

    // --- ENVIO DO MODAL COM A KEY ---
    if (interaction.isModalSubmit() && interaction.customId === 'modal_resgate') {
        const keyDigitada = interaction.fields.getTextInputValue('input_key').trim();
        
        await interaction.deferReply({ ephemeral: true });

        db.get(`SELECT * FROM keys WHERE codigo = ?`, [keyDigitada], async (err, row) => {
            if (err) {
                console.error(err);
                return interaction.editReply('❌ Ocorreu um erro interno no banco de dados.');
            }

            if (!row || row.usada === 1) {
                return interaction.editReply('❌ **Key inválida ou já utilizada.** Verifique se copiou corretamente.');
            }

            try {
                // Pede o link para o Telegram
                const respostaTelegram = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/createChatInviteLink`, {
                    chat_id: row.telegram_group_id,
                    member_limit: 1,
                    expire_date: Math.floor(Date.now() / 1000) + (60 * 15)
                });

                const linkExclusivo = respostaTelegram.data.result.invite_link;

                // Marca a key como usada
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
    
    // Registra os comandos de barra (Slash Commands) no seu servidor
    try {
        await client.application.commands.set([
            {
                name: 'gerarkey',
                description: 'Gera chaves de acesso para o pack (Apenas Admins)',
                defaultMemberPermissions: PermissionFlagsBits.Administrator.toString(),
                options: [
                    {
                        name: 'grupo',
                        description: 'ID do grupo do Telegram (ex: -100123456789)',
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: 'quantidade',
                        description: 'Quantidade de keys para gerar (padrão: 1)',
                        type: ApplicationCommandOptionType.Integer,
                        required: false
                    }
                ]
            }
        ]);
        console.log('✅ Comando /gerarkey registrado com sucesso!');
    } catch (error) {
        console.error('Erro ao registrar slash commands:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
