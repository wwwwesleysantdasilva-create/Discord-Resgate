const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

// Configuração do cliente do bot com as intenções necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Evento disparado quando o bot fica online
client.once('ready', () => {
  console.log(`Bot online como ${client.user.tag}!`);
});

// Evento para escutar mensagens e enviar o Embed com Botões
client.on('messageCreate', async (message) => {
  // Ignora mensagens enviadas por outros bots
  if (message.author.bot) return;

  // Comando para acionar o envio da mensagem (exemplo: !painel ou !teste)
  if (message.content === '!teste') {
    
    // 1. Criar o Contêiner / Embed
    const embed = new EmbedBuilder()
      .setColor('#5865F2') // Cor da barra lateral (Blurple)
      .setDescription('True wisdom comes from dance with socks on your hands during lazy times.');

    // 2. Criar os botões
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_teste1')
        .setLabel('TESTE')
        .setStyle(ButtonStyle.Success), // Verde

      new ButtonBuilder()
        .setCustomId('btn_teste2')
        .setLabel('TESTE2')
        .setStyle(ButtonStyle.Primary)  // Azul
    );

    // 3. Enviar no canal como Embed
    await message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }
});

// Evento para escutar o clique nos botões e EVITAR o erro "não respondeu a tempo"
client.on('interactionCreate', async (interaction) => {
  // Verifica se a interação foi em um botão
  if (!interaction.isButton()) return;

  // 1. Avisa o Discord IMEDIATAMENTE que a interação foi recebida (evita o timeout de 3 segundos)
  await interaction.deferUpdate();

  // 2. Trata cada botão pelo customId
  if (interaction.customId === 'btn_teste1') {
    // Exemplo: envia uma mensagem privada ou atualiza algo
    await interaction.followUp({ 
      content: 'Você clicou no botão **TESTE**!', 
      ephemeral: true 
    });
  } 
  
  if (interaction.customId === 'btn_teste2') {
    await interaction.followUp({ 
      content: 'Você clicou no botão **TESTE2**!', 
      ephemeral: true 
    });
  }
});

// Inicia o bot com o Token de acesso
client.login('SEU_TOKEN_AQUI');
