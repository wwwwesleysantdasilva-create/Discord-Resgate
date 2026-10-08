const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ChannelType 
} = require('discord.js');
require('dotenv').config();

// Inicialização do Bot com os privilégios necessários
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// Definição do comando Slash /anunciar
const commands = [
    new SlashCommandBuilder()
        .setName('anunciar')
        .setDescription('Envia um anúncio formatado via JSON para um canal selecionado.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Restrito a Administradores
        .addChannelOption(option =>
            option
                .setName('canal')
                .setDescription('O canal de destino onde o anúncio será publicado')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('json')
                .setDescription('O código JSON copiado do criador de mensagens (ex: Discohook)')
                .setRequired(true)
        )
].map(command => command.toJSON());

// Evento acionado quando o bot fica online
client.once('ready', async () => {
    console.log(`🤖 Bot online e autenticado como ${client.user.tag}!`);

    // Registro automático dos comandos Slash na API do Discord
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('🔄 Sincronizando comandos Slash com o Discord...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Comando /anunciar registrado globalmente com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos Slash:', error);
    }
});

// Evento acionado ao executar um comando no servidor
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'anunciar') {
        const canal = interaction.options.getChannel('canal');
        const jsonRaw = interaction.options.getString('json');

        // Resposta temporária oculta (ephemeral) para o bot não dar 'timeout'
        await interaction.deferReply({ ephemeral: true });

        try {
            // 1. Converte a string inserida num objeto JSON manipulável
            let payload = JSON.parse(jsonRaw);

            // Tratamento caso o JSON venha envelopado na estrutura exportada do Discohook
            if (payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0) {
                payload = payload.messages[0].data || payload.messages[0];
            }

            // Remove propriedades incompatíveis com o método de envio se existirem
            delete payload.attachments;

            // 2. Dispara a mensagem com a estrutura formatada para o canal indicado
            await canal.send(payload);

            // 3. Confirma o envio com uma mensagem oculta visível
