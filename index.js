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
    EmbedBuilder
} = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

client.on('messageCreate', async (message) => {
    if (message.content === '!painel' && message.member.permissions.has('Administrator')) {
        const embed = new EmbedBuilder()
            .setTitle('📦 Resgatar Acesso')
            .setDescription('Clique no botão abaixo para validar sua Key e receber o link do grupo.')
            .setColor('#2B2D31'); 

        const botao = new ButtonBuilder()
            .setCustomId('btn_resgate')
            .setLabel('Resgatar Key')
            .setEmoji('🔑')
            .setStyle(ButtonStyle.Success);

        const linha = new ActionRowBuilder().addComponents(botao);

        await message.channel.send({ embeds: [embed], components: [linha] });
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

        setTimeout(async () => {
            await interaction.editReply({
                content: `✅ **Modo Teste:** Você enviou a key **${keyDigitada}**.\n\n*Aqui entrará a validação real do banco de dados e a entrega do link.*`
            });
        }, 1000);
    }
});

client.once('ready', () => {
    console.log(`🤖 Interface online como: ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
