require('dotenv').config();
const dns = require('dns');

if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const { Client, GatewayIntentBits, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { Pool } = require('pg');
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('🤖 Bot online e limpo!'));

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
        `);
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

client.once('clientReady', async () => {
    console.log(`Bot online como ${client.user.tag}`);

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
                await pool.query(`UPDATE keys SET used = 1 WHERE key = $1`, [keyDigitada]);
                await registrarLog(`Resgatou a key ${keyDigitada} do produto ${nomeProduto}`, usuario);

                const containerDM = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`<:v_:1543470056304807938> **Acesso Liberado com Sucesso!**\n\n<:theboxez:1543426459165532292> **| Produto:** ${nomeProduto}\n<:emoji_49:1543470661744201868> **| Key:** \`${keyDigitada}\``)
                );

                const msgDM = await interaction.user.send({ components: [containerDM], flags: MessageFlags.IsComponentsV2 });
                const mensagemDMUrl = msgDM.url;

                await interaction.editReply({
                    content: '<:v_:1543470056304807938>  **Key Validada!**\nVerifique sua **DM (Mensagem privada)**',
                    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Acessar').setStyle(ButtonStyle.Link).setURL(mensagemDMUrl))]
                });

            } catch (error) { 
                console.error(error);
                interaction.editReply('❌ Falha ao processar a validação.'); 
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
