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

            // Sanitização do payload: limpa propriedades exclusivas de Webhook/Discohook que a API de Bot não aceita
            const messageData = {};

            if (payload.content) messageData.content = payload.content;
            if (payload.embeds) messageData.embeds = payload.embeds;

            // Garante que o payload contenha ao menos texto ou embeds
            if (!messageData.content && (!messageData.embeds || messageData.embeds.length === 0)) {
                return interaction.editReply({
                    content: '❌ **JSON Inválido:** O código precisa ter ao menos um texto (`content`) ou uma `embed` configurada.'
                });
            }

            // 2. Dispara a mensagem com a estrutura formatada para o canal indicado
            await canal.send(messageData);

            // 3. Confirma o envio com uma mensagem oculta
            await interaction.editReply({ 
                content: `✅ **Anúncio publicado com sucesso no canal** ${canal}!` 
            });

        } catch (error) {
            console.error('Erro ao processar a publicação do anúncio:', error);

            // Resposta específica para erros de digitação/sintaxe no JSON
            if (error instanceof SyntaxError) {
                return interaction.editReply({ 
                    content: '❌ **Sintaxe JSON Inválida:** O código inserido contém erros de sintaxe. Certifique-se de que copiou o JSON completo.' 
                });
            }

            // Resposta para falta de permissões ou parâmetros não aceitos pela API do Discord
            return interaction.editReply({ 
                content: `❌ **Falha ao enviar:** ${error.message || 'Verifique se o bot tem permissão para enviar mensagens e links no canal escolhido.'}` 
            });
        }
    }
});

// Autenticação do bot no Discord
client.login(process.env.DISCORD_TOKEN);
