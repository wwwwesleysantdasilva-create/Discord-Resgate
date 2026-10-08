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
                .setDescription('Cole o código JSON do Discord Builders ou Discohook')
                .setRequired(false) // Deixamos como false para permitir enviar o ficheiro em vez do texto
        )
        .addAttachmentOption(option =>
            option
                .setName('arquivo')
                .setDescription('Anexe o ficheiro .json gerado (Opcional caso cole o texto)')
                .setRequired(false)
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
        const arquivo = interaction.options.getAttachment('arquivo');

        // Resposta temporária oculta (ephemeral) para o bot não dar 'timeout'
        await interaction.deferReply({ ephemeral: true });

        // Validação: o utilizador tem de enviar ou o texto ou o ficheiro
        if (!jsonRaw && !arquivo) {
            return interaction.editReply({
                content: '❌ **Erro:** Tens de fornecer o código JSON colando-o na opção `json` OU enviando um `arquivo`.'
            });
        }

        try {
            let jsonText = jsonRaw;

            // Se foi enviado um ficheiro, o bot faz o download do conteúdo
            if (arquivo) {
                if (!arquivo.name.endsWith('.json')) {
                    return interaction.editReply({ content: '❌ **Erro:** O ficheiro tem de ter a extensão `.json`.' });
                }
                const response = await fetch(arquivo.url);
                jsonText = await response.text();
            }

            // 1. Converte a string obtida num objeto JSON manipulável
            let payload = JSON.parse(jsonText);
            const messageData = {};

            // 2. Lógica para processar o JSON específico do Discord.Builders (com type: 17)
            if (Array.isArray(payload) && payload[0]?.type === 17) {
                const builderData = payload[0];
                
                // Mapear o conteúdo de texto (type: 10)
                const textComponent = builderData.components?.find(c => c.type === 10);
                if (textComponent && textComponent.content) {
                    messageData.content = textComponent.content;
                }

                // Mapear a Action Row dos botões (type: 1)
                const actionRows = builderData.components?.filter(c => c.type === 1);
                if (actionRows && actionRows.length > 0) {
                    messageData.components = actionRows;
                }
            } 
            // 3. Lógica para o JSON padrão ou gerado pelo Discohook
            else {
                if (payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0) {
                    payload = payload.messages[0].data || payload.messages[0];
                } else if (Array.isArray(payload)) {
                    payload = payload[0]; // Capturar a primeira mensagem caso venha numa array limpa
                }

                // Sanitização padrão
                if (payload.content) messageData.content = payload.content;
                if (payload.embeds) messageData.embeds = payload.embeds;
                
                // Agora o bot também puxa a aba de botões (components) do JSON padrão
                if (payload.components) messageData.components = payload.components;
            }

            // Garante que o payload contenha ao menos texto, embeds ou botões/componentes
            if (!messageData.content && (!messageData.embeds || messageData.embeds.length === 0) && (!messageData.components || messageData.components.length === 0)) {
                return interaction.editReply({
                    content: '❌ **JSON Inválido:** O código precisa de ter ao menos um texto (`content`), uma `embed` ou `components` (botões) configurados.'
                });
            }

            // 4. Dispara a mensagem com a estrutura formatada para o canal indicado
            await canal.send(messageData);

            // 5. Confirma o envio com uma mensagem oculta
            await interaction.editReply({ 
                content: `✅ **Anúncio publicado com sucesso no canal** ${canal}!` 
            });

        } catch (error) {
            console.error('Erro ao processar a publicação do anúncio:', error);

            if (error instanceof SyntaxError) {
                return interaction.editReply({ 
                    content: '❌ **Sintaxe JSON Inválida:** O código inserido contém erros de sintaxe ou o ficheiro está corrompido.' 
                });
            }

            return interaction.editReply({ 
                content: `❌ **Falha ao enviar:** ${error.message || 'Verifica se o bot tem permissão para enviar mensagens e links no canal escolhido.'}` 
            });
        }
    }
});

// Autenticação do bot no Discord
client.login(process.env.DISCORD_TOKEN);
