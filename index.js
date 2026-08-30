async function enviarWebhookDiscord(payload) {
    if (!DISCORD_WEBHOOK_URL) {
        console.log('⚠️ DISCORD_WEBHOOK_URL não está configurada!');
        return;
    }
    try { 
        const urlLimpa = DISCORD_WEBHOOK_URL.trim();
        await axios.post(urlLimpa, payload, {
            headers: { 'Content-Type': 'application/json' }
        }); 
        console.log('✅ Webhook do Discord enviado com sucesso!');
    } catch (error) { 
        console.error('❌ Erro detalhado ao enviar webhook para o Discord:', error.response ? JSON.stringify(error.response.data) : error.message); 
    }
}

// ROTA WEBHOOK TELEGRAM
app.post('/telegram-webhook', async (req, res) => {
    try {
        const update = req.body;
        const chatMemberEvent = update.chat_member;

        if (chatMemberEvent) {
            const user = chatMemberEvent.new_chat_member.user;
            if (user.is_bot) return res.status(200).send('OK');

            const telegramId = user.id.toString();
            const telegramUsername = user.username ? `@${user.username}` : (user.first_name || 'Desconhecido');
            const chatId = chatMemberEvent.chat.id.toString();
            
            const newStatus = chatMemberEvent.new_chat_member.status;
            
            const agora = new Date();
            const dataHoraAtual = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const dataBr = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            const horaBr = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            // REGRA ATUALIZADA: Permite duplicatas (não checa mais o status antigo, foca apenas no status atual)
            const entrouNoGrupo = ['member', 'administrator', 'creator'].includes(newStatus);
            const saiuDoGrupo = ['left', 'kicked'].includes(newStatus);

            if (entrouNoGrupo) {
                const resExistente = await pool.query(`SELECT * FROM rastro_eterno WHERE telegram_id = $1 ORDER BY id DESC LIMIT 1`, [telegramId]);
                
                if (resExistente.rows.length > 0) {
                    const registroExistente = resExistente.rows[0];
                    await pool.query(`UPDATE rastro_eterno SET telegram_user = $1, data_entrada_telegram = $2, status_atual = 'No Grupo' WHERE id = $3`, [telegramUsername, dataHoraAtual, registroExistente.id]);
                    
                    const conteudoLog = `## LOG DE RESGATE\n\n` +
                        `<:theboxez:1543426459165532292> **| PRODUTO:** ${registroExistente.produto}\n` +
                        `<:emoji_49:1543470661744201868> **| KEY UTILIZADA:** \`${registroExistente.key_usada}\`\n\n` +
                        `<:info:1543491941314863239> **| INFORMAÇÕES**\n\n` +
                        `> **DC USER:** <@${registroExistente.discord_id}>\n` +
                        `> **DC ID:** \`${registroExistente.discord_id}\`\n` +
                        `> **TG USER:** ${telegramUsername}\n` +
                        `> **TG ID:** \`${telegramId}\`\n\n` +
                        `<:calendar:1543440066209120387> **| DATA:** \`${dataBr}\`\n` +
                        `<:relogio_StorM:1531049138291216414> **| HORA:** \`${horaBr}\``;

                    const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(conteudoLog));
                    
                    enviarWebhookDiscord({
                        components: [container.toJSON()],
                        flags: MessageFlags.IsComponentsV2
                    });
                } else {
                    const resUltimo = await pool.query(`SELECT * FROM rastro_eterno WHERE (telegram_id IS NULL OR telegram_id = '') AND status_atual = 'Aguardando Entrada no Telegram' AND group_id = $1 ORDER BY id DESC LIMIT 1`, [chatId]);
                    if (resUltimo.rows.length > 0) {
                        const ultimoGerado = resUltimo.rows[0];
                        await pool.query(`UPDATE rastro_eterno SET telegram_id = $1, telegram_user = $2, data_entrada_telegram = $3, status_atual = 'No Grupo' WHERE id = $4`, [telegramId, telegramUsername, dataHoraAtual, ultimoGerado.id]);
                        
                        const conteudoLog = `## LOG DE RESGATE\n\n` +
                            `<:theboxez:1543426459165532292> **| PRODUTO:** ${ultimoGerado.produto}\n` +
                            `<:emoji_49:1543470661744201868> **| KEY UTILIZADA:** \`${ultimoGerado.key_usada}\`\n\n` +
                            `<:info:1543491941314863239> **| INFORMAÇÕES**\n\n` +
                            `> **DC USER:** <@${ultimoGerado.discord_id}>\n` +
                            `> **DC ID:** \`${ultimoGerado.discord_id}\`\n` +
                            `> **TG USER:** ${telegramUsername}\n` +
                            `> **TG ID:** \`${telegramId}\`\n\n` +
                            `<:calendar:1543440066209120387> **| DATA:** \`${dataBr}\`\n` +
                            `<:relogio_StorM:1531049138291216414> **| HORA:** \`${horaBr}\``;

                        const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(conteudoLog));

                        enviarWebhookDiscord({
                            components: [container.toJSON()],
                            flags: MessageFlags.IsComponentsV2
                        });
                    }
                }
            } 
            else if (saiuDoGrupo) {
                const resSaida = await pool.query(`SELECT * FROM rastro_eterno WHERE telegram_id = $1 ORDER BY id DESC LIMIT 1`, [telegramId]);
                if (resSaida.rows.length > 0) {
                    const row = resSaida.rows[0];
                    await pool.query(`UPDATE rastro_eterno SET data_saida_telegram = $1, status_atual = 'Saiu do Grupo' WHERE id = $2`, [dataHoraAtual, row.id]);
                    
                    const conteudoLog = `## LOG DE SAÍDA\n\n` +
                        `<:theboxez:1543426459165532292> **| PRODUTO:** ${row.produto}\n` +
                        `<:emoji_49:1543470661744201868> **| KEY UTILIZADA:** \`${row.key_usada}\`\n\n` +
                        `<:info:1543491941314863239> **| INFORMAÇÕES**\n\n` +
                        `> **DC USER:** <@${row.discord_id}>\n` +
                        `> **DC ID:** \`${row.discord_id}\`\n` +
                        `> **TG USER:** ${telegramUsername}\n` +
                        `> **TG ID:** \`${telegramId}\`\n\n` +
                        `<:calendar:1543440066209120387> **| DATA DA SAÍDA:** \`${dataBr}\`\n` +
                        `<:relogio_StorM:1531049138291216414> **| HORA DA SAÍDA:** \`${horaBr}\``;

                    const container = new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(conteudoLog));

                    enviarWebhookDiscord({
                        components: [container.toJSON()],
                        flags: MessageFlags.IsComponentsV2
                    });
                }
            }
        }
        res.status(200).send('OK');
    } catch (err) { 
        console.error('Erro na rota telegram-webhook:', err.message);
        res.status(500).send('Error'); 
    }
});
