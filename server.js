// index.js (modificado para funcionar APENAS nos grupos selecionados)
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const P = require('pino');
const crypto = require('crypto');

global.crypto = crypto;
moment.tz.setDefault("America/Sao_Paulo");

// Configurações
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let sock;
let qrCodeData = null;
let isConnected = false;
let selectedGroups = [];
let isConnecting = false; // Flag para evitar conexões duplas
let reconnectTimeout = null;
let activatedChats = new Set(); // Chats que ativaram o bot

// Configuração de arquivos de dados
const LOG_FILE = 'mensagens.json';
const USUARIOS_FILE = 'usuarios.json';
const VIDEOS_FILE = 'videos.json';
const SESSOES_FILE = 'sessoes.json';
const GROUPS_FILE = 'grupos_selecionados.json';
const ACTIVATED_CHATS_FILE = 'chats_ativados.json';
const OLTS_DIR = path.join(__dirname, 'olts');
const PROJETOS_DIR = path.join(__dirname, 'projetos');

// Garantir diretórios essenciais existem
if (!fs.existsSync(OLTS_DIR)) {
    fs.mkdirSync(OLTS_DIR, { recursive: true });
    console.log('📂 Pasta "olts" criada');
}
if (!fs.existsSync(PROJETOS_DIR)) {
    fs.mkdirSync(PROJETOS_DIR, { recursive: true });
    console.log('📂 Pasta "projetos" criada');
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Função para conectar ao WhatsApp com versão mais compatível
async function connectToWhatsApp() {
    // Evitar conexões duplas
    if (isConnecting) {
        console.log('🔄 Já conectando, aguardando...');
        return;
    }
    
    try {
        isConnecting = true;
        console.log('🔄 Iniciando conexão com WhatsApp...');
        
        // Cancelar timeout anterior se existir
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        
        // Fechar conexão anterior se existir
        if (sock) {
            try {
                sock.end();
                sock = null;
            } catch (error) {
                console.log('Fechando conexão anterior:', error.message);
            }
        }
        
        const authDir = 'auth_info_baileys';
        const { state, saveCreds } = await useMultiFileAuthState(authDir);
        
        // Buscar versão mais recente compatível
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📱 Usando versão WhatsApp: ${version.join('.')}, latest: ${isLatest}`);
        
        const logger = P({ level: 'silent' });
        
        sock = makeWASocket({
            auth: state,
            version,
            logger,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            markOnlineOnConnect: false, // Não marcar como online automaticamente
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
            msgRetryCounterMap: {},
            shouldIgnoreJid: jid => isJidBroadcast(jid),
            shouldSyncHistoryMessage: msg => false,
            getMessage: async (key) => {
                return { conversation: "Hello" };
            }
        });

        // Função auxiliar para verificar se é broadcast
        function isJidBroadcast(jid) {
            return jid?.endsWith('@broadcast') || false;
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log('📱 Update de conexão:', { 
                connection, 
                qr: !!qr, 
                lastDisconnect: lastDisconnect?.error?.message || 'none'
            });

            if (qr) {
                try {
                    console.log('📱 Gerando QR Code...');
                    qrCodeData = await QRCode.toDataURL(qr, {
                        margin: 2,
                        color: { dark: '#000000', light: '#FFFFFF' },
                        width: 256,
                        errorCorrectionLevel: 'M'
                    });
                    console.log('✅ QR Code gerado com sucesso');
                    io.emit('qr', qrCodeData);
                } catch (qrError) {
                    console.error('❌ Erro ao gerar QR Code:', qrError);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log('🔌 Conexão fechada:', {
                    error: lastDisconnect?.error?.message,
                    statusCode,
                    shouldReconnect
                });
                
                isConnected = false;
                isConnecting = false;
                qrCodeData = null;
                io.emit('connection', { status: 'disconnected' });
                
                if (shouldReconnect) {
                    const delay = statusCode === 405 ? 30000 : statusCode === 440 ? 10000 : 5000;
                    console.log(`🔄 Reconectando em ${delay/1000} segundos...`);
                    
                    reconnectTimeout = setTimeout(() => {
                        connectToWhatsApp();
                    }, delay);
                } else {
                    console.log('❌ Logout detectado. Não reconectando automaticamente.');
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                isConnected = true;
                isConnecting = false;
                qrCodeData = null;
                io.emit('connection', { status: 'connected' });
                
                // Aguardar 5 segundos antes de buscar grupos para estabilizar
                setTimeout(async () => {
                    if (isConnected && sock) { // Verificar se ainda está conectado
                        await loadAvailableGroups();
                    }
                }, 5000);
            } else if (connection === 'connecting') {
                console.log('🔄 Conectando ao WhatsApp...');
                io.emit('connection', { status: 'connecting' });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Handler para mensagens recebidas
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.key.fromMe && msg.message && isConnected) {
                    await handleMessage(msg);
                }
            } catch (msgError) {
                console.error('❌ Erro ao processar mensagem:', msgError);
            }
        });

        // Handler para grupos (evitar múltiplas chamadas)
        sock.ev.on('groups.upsert', (groups) => {
            console.log('📋 Novos grupos detectados:', groups.length);
            // Não recarregar automaticamente para evitar spam
        });

    } catch (error) {
        console.error('❌ Erro crítico na conexão:', error);
        isConnecting = false;
        
        if (error.message?.includes('405')) {
            console.log('🗑️ Erro 405 detectado. Limpando sessão...');
            clearAuthSession();
        }
        
        reconnectTimeout = setTimeout(() => {
            connectToWhatsApp();
        }, 10000);
    }
}

// Função para limpar sessão de autenticação
function clearAuthSession() {
    try {
        const authDir = 'auth_info_baileys';
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
            console.log('✅ Sessão de autenticação removida');
        }
    } catch (error) {
        console.error('❌ Erro ao limpar sessão:', error);
    }
}

// Função sendMessage
async function sendMessage(chatId, text) {
    try {
        if (!sock || !isConnected) {
            console.error('❌ Bot não está conectado, não é possível enviar mensagem.');
            return;
        }
        const content = typeof text === 'string' ? text : String(text ?? '');
        await sock.sendMessage(chatId, { text: content });
        console.log(`📤 Mensagem enviada para ${chatId}: ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}`);
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
    }
}

// Função para buscar grupos disponíveis - versão mais segura
async function loadAvailableGroups() {
    if (!sock || !isConnected) {
        console.log('❌ Não é possível carregar grupos: bot não conectado');
        return;
    }
    
    try {
        console.log('📋 Carregando grupos disponíveis...');
        
        // Timeout de 10 segundos para a operação
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 10000)
        );
        
        const groupsPromise = sock.groupFetchAllParticipating();
        const groups = await Promise.race([groupsPromise, timeoutPromise]);
        
        const groupList = Object.values(groups).map(group => ({
            id: group.id,
            name: group.subject || 'Sem nome',
            participants: group.participants?.length || 0
        }));
        
        console.log(`✅ ${groupList.length} grupos encontrados`);
        io.emit('groups', groupList);
        
    } catch (error) {
        console.error('❌ Erro ao buscar grupos:', error.message);
        
        // Se for erro de conexão fechada, não tentar novamente
        if (error.message.includes('Connection Closed') || error.message.includes('Timeout')) {
            console.log('⚠️ Conexão instável, não tentando recarregar grupos');
            return;
        }
        
        // Tentar novamente apenas se ainda estiver conectado
        if (isConnected) {
            console.log('🔄 Tentando carregar grupos novamente em 15 segundos...');
            setTimeout(() => {
                if (isConnected) { // Verificar novamente antes de tentar
                    loadAvailableGroups();
                }
            }, 15000);
        }
    }
}

// Função principal para lidar com mensagens - MODIFICADA PARA FILTRAR APENAS GRUPOS SELECIONADOS
async function handleMessage(msg) {
    try {
        const chatId = msg.key.remoteJid;
        // obter texto de várias estruturas de mensagem
        const text = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            ''
        ).toString().trim();
        const sender = msg.key.participant || msg.key.remoteJid;
        const isGroup = chatId?.includes('@g.us');

        // FILTRO PRINCIPAL: Verificar se é um grupo selecionado
        if (!isGroupSelected(chatId)) {
            console.log(`🚫 Mensagem ignorada - Chat não está na lista de grupos selecionados: ${chatId}`);
            return; // IGNORA completamente mensagens de grupos não selecionados E mensagens privadas
        }

        // Se chegou aqui, é um grupo selecionado - verificar se está ativado
        if (isGroup && !activatedChats.has(chatId)) {
            // Comandos de ativação ainda funcionam mesmo em grupos não ativados
            if (text.toLowerCase() === '🟢' || text.toLowerCase() === 'ativar') {
                activatedChats.add(chatId);
                saveActivatedChats();
                await sendMessage(chatId, '✅ *Bot Ativado!*\n\n🤖 Digite Menu para ver as opções');
                return;
            }
            // Grupo selecionado mas não ativado - ignora outras mensagens
            return;
        }

        // Comando de desativação
        if (text.toLowerCase() === '🔴' || text.toLowerCase() === 'desativar') {
            if (isGroup) {
                activatedChats.delete(chatId);
                saveActivatedChats();
                await sendMessage(chatId, '❌ *Bot Desativado!*\n\n🔒 Parei de responder aos comandos neste grupo.\n\nPara reativar, digite: *🟢* ou *ativar*');
            }
            return;
        }

        // Se chegou aqui, é um grupo selecionado E ativado - processar comando normalmente
        
        // Registrar usuário
        await registerUser(sender, msg.pushName || 'Usuário');

        // Processar comando (texto pode ser 'A', 'B', 'B1', '123', etc.)
        await handleCommand(chatId, text.trim(), msg.pushName || 'Usuário', sender);
    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
    }
}

// FUNÇÃO MODIFICADA: Verificar se o grupo está selecionado (BLOQUEIA MENSAGENS PRIVADAS)
function isGroupSelected(chatId) {
    // Se não for um grupo (@g.us), REJEITAR (bloqueia mensagens privadas)
    if (!chatId?.includes('@g.us')) {
        console.log(`🚫 Mensagem privada bloqueada: ${chatId}`);
        return false;
    }
    
    // Se for um grupo, verificar se está na lista de grupos selecionados
    if (selectedGroups.length === 0) {
        // Se nenhum grupo foi selecionado ainda, permitir todos os grupos
        console.log(`⚠️ Nenhum grupo selecionado ainda - permitindo grupo: ${chatId}`);
        return true;
    }
    
    // Verificar se o grupo está na lista de selecionados
    const isSelected = selectedGroups.includes(chatId);
    if (!isSelected) {
        console.log(`🚫 Grupo não selecionado: ${chatId}`);
    }
    return isSelected;
}

// Registrar usuário
async function registerUser(userId, name) {
    try {
        let usuarios = {};
        if (fs.existsSync(USUARIOS_FILE)) {
            usuarios = JSON.parse(fs.readFileSync(USUARIOS_FILE, 'utf8'));
        }
        
        usuarios[userId] = {
            nome: name,
            ultima_interacao: moment().format('YYYY-MM-DD HH:mm:ss')
        };
        
        fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2));
    } catch (error) {
        console.error('❌ Erro ao registrar usuário:', error);
    }
}

// HandleCommand: aceita letras e subcomandos (A-G, B1.., C1..)
async function handleCommand(chatId, text, firstName, userId) {
    try {
        const command = (text || '').trim().toUpperCase();

        // letras principais
        if (command === 'A') {
            // Busca fixa em Arapiraca
            salvarSessao(userId, 'Arapiraca');
            await sendMessage(chatId, '🔍 *Busca CTO em Arapiraca*\n\nDigite o *número da CTO* que deseja consultar. Exemplo: *123*');
            return;
        }

        if (command === 'B') {
            // Mostrar menu de vídeos no formato B1, B2...
            await showVideoMenuLetters(chatId);
            return;
        }

        if (command === 'C') {
            // Mostrar menu de mapas no formato C1, C2...
            await showProjectMapsLetters(chatId);
            return;
        }

        if (command === 'D') {
            await showRouterIPs(chatId);
            return;
        }

        if (command === 'E') {
            await sendMessage(chatId, '🧾 *Área do Cliente*\n\nAcesse sua conta:\n👉 https://central.provedorsuperconnect.com.br/central_assinante_web/login');
            return;
        }

        if (command === 'F') {
            await showBotStatus(chatId, firstName);
            return;
        }

        // NOVO COMANDO G - DOAÇÃO
        if (command === 'G') {
            await showDonationInfo(chatId);
            return;
        }

        // Se for número puro -> tratar como CTO (busca em Arapiraca, pois salvamos a sessão em 'A')
        if (/^\d+$/.test(command)) {
            await buscarOLT(chatId, command, userId);
            return;
        }

        // Vídeos: B1, B2, ...
        if (/^B\d+$/i.test(command)) {
            await sendVideoByIndex(chatId, command);
            return;
        }

        // Mapas: C1, C2, ...
        if (/^C\d+$/i.test(command)) {
            await sendMapByIndex(chatId, command);
            return;
        }

        // Alias: aceitar também /menu ou menu
        if (['/MENU','MENU','/START','START'].includes(command)) {
            await showMainMenu(chatId, firstName);
            return;
        }

        // Fallback: se usuário enviou o nome exato de vídeo (compatibilidade com original)
        if (videoExists(text)) {
            await sendVideoByKey(chatId, text);
            return;
        }

        // Fallback original - mapas por nome (compatibilidade)
        const mapaFiles = {
            'arapiraca': 'arapiraca.kml',
            'campo alegre': 'campoalegre.kml',
            'canaa capim agreste': 'canaacapimagreste.kml',
            'coruripe': 'coruripe.kml',
            'craíbas': 'craibas.kml',
            'girau do ponciano': 'giraudoponciano.kml',
            'jequiá da praia': 'jequiadapraia.kml',
            'lagoa da canoa': 'lagoadacanoa.kml',
            'luzia poliz': 'luziapoliz.kml',
            'palmeiras dos índios': 'palmeirasdosindios.kml',
            'penedo': 'penedo.kml',
            'são miguel': 'saomiguel.kml'
        };

        const cidadeLower = (text || '').toLowerCase();
        if (mapaFiles[cidadeLower]) {
            await sendFile(chatId, path.join(__dirname, 'projetos', mapaFiles[cidadeLower]));
            return;
        }

        // Se nenhum comando reconhecido
        await sendMessage(chatId, '❓ *Comando não reconhecido*\n\n📋 Digite *menu* para ver todas as opções disponíveis.');
    } catch (error) {
        console.error('❌ Erro ao processar comando:', error);
        await sendMessage(chatId, '❌ Ocorreu um erro ao processar seu comando. Tente novamente.');
    }
}

// NOVA FUNÇÃO: Mostrar informações de doação
async function showDonationInfo(chatId) {
    const donationMessage = `💰 *APOIE NOSSO PROJETO* 🎯

Olá! Se você está gostando do projeto e gostaria de contribuir para sua manutenção e desenvolvimento, considere fazer uma doação!

💳 *Como doar:*
📱 *PIX:* wallyssonsd1@gmail.com
💵 *Valor:* Qualquer quantia é bem-vinda!

🙏 *Por que sua doação é importante:*
• Ajuda a manter o projeto ativo
• Permite melhorias e novas funcionalidades  
• Garante suporte contínuo aos usuários
• Motiva o desenvolvimento de novos recursos

✨ *Sua contribuição faz a diferença!*

Muito obrigado por considerar apoiar nosso trabalho. Cada doação, independente do valor, é muito importante para nós!

🎉 *Agradecemos sua generosidade!* 

---
__`;

    await sendMessage(chatId, donationMessage);
}

// Menu principal
async function showMainMenu(chatId, firstName) {
    const greeting = getGreeting();
    let usuarios = {};
    if (fs.existsSync(USUARIOS_FILE)) {
        usuarios = JSON.parse(fs.readFileSync(USUARIOS_FILE, 'utf8'));
    }

    const now = moment();
    const ativos = Object.values(usuarios).filter(u => {
        const diff = now.diff(moment(u.ultima_interacao), 'hours');
        return diff <= 24;
    }).length;

    const menuMessage = `${greeting}, *${firstName}*! 🤖

Olá 👋  Aqui está o Menu !
Digite a letra correspondente.

A - Busca
B - Vídeos
C - Mapas
D - Ips
E - Link da Área do Cliente
F - Status
G - Doação ❤️

📊 *Estatísticas do Bot*
📅 Data: *${moment().format('DD/MM/YYYY')}*
👥 Total de usuários: *${Object.keys(usuarios).length}*
🟢 Ativos nas últimas 24h: *${ativos}*

⚠️ *IMPORTANTE:* Este bot funciona apenas nos grupos autorizados.`;

    await sendMessage(chatId, menuMessage);
}

// Vídeos: listar com B1, B2...
async function showVideoMenuLetters(chatId) {
    try {
        if (!fs.existsSync(VIDEOS_FILE)) {
            await sendMessage(chatId, "❌ *Vídeos não disponíveis*\n\nNenhum tutorial foi cadastrado ainda.");
            return;
        }
        const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
        const videoKeys = Object.keys(videos).sort();

        if (videoKeys.length === 0) {
            await sendMessage(chatId, "❌ *Nenhum vídeo cadastrado*");
            return;
        }

        let message = '📹 *VÍDEOS DISPONÍVEIS*\n\n';
        videoKeys.forEach((key, index) => {
            message += `B${index + 1} - ${key}\n`;
        });

        message += '\n💡 Para assistir: digite o código (ex.: B1)';

        await sendMessage(chatId, message);
    } catch (error) {
        console.error('❌ Erro no menu de vídeos:', error);
        await sendMessage(chatId, "❌ Erro ao carregar vídeos.");
    }
}

// Enviar vídeo por índice (B#)
async function sendVideoByIndex(chatId, code) {
    try {
        if (!fs.existsSync(VIDEOS_FILE)) {
            await sendMessage(chatId, "❌ Arquivo de vídeos não encontrado.");
            return;
        }
        const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
        const videoKeys = Object.keys(videos).sort();
        const idx = parseInt(code.replace(/^B/i, ''), 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= videoKeys.length) {
            await sendMessage(chatId, "❌ Código de vídeo inválido.");
            return;
        }
        const key = videoKeys[idx];
        const url = videos[key];
        await sendMessage(chatId, `📺 *${key}*\n\n🔗 ${url}`);
    } catch (error) {
        console.error('❌ Erro ao enviar vídeo por índice:', error);
        await sendMessage(chatId, "❌ Erro ao enviar vídeo.");
    }
}

// Mapas: listar com C1, C2...
async function showProjectMapsLetters(chatId) {
    try {
        if (!fs.existsSync(PROJETOS_DIR)) {
            await sendMessage(chatId, "❌ Nenhum mapa disponível.");
            return;
        }
        const files = fs.readdirSync(PROJETOS_DIR).filter(f => f.toLowerCase().endsWith('.kml'));
        if (files.length === 0) {
            await sendMessage(chatId, "❌ Nenhum mapa (KML) disponível.");
            return;
        }
        let message = '🗺️ *MAPAS DISPONÍVEIS*\n\n';
        files.forEach((file, index) => {
            const name = file.replace('.kml', '');
            message += `C${index + 1} - ${name}\n`;
        });
        message += '\n💡 Para baixar: digite o código (ex.: C1)';
        await sendMessage(chatId, message);
    } catch (error) {
        console.error('❌ Erro no menu de mapas:', error);
        await sendMessage(chatId, "❌ Erro ao carregar mapas.");
    }
}

// Enviar mapa por índice (C#)
async function sendMapByIndex(chatId, code) {
    try {
        if (!fs.existsSync(PROJETOS_DIR)) {
            await sendMessage(chatId, "❌ Pasta de mapas não encontrada.");
            return;
        }
        const files = fs.readdirSync(PROJETOS_DIR).filter(f => f.toLowerCase().endsWith('.kml'));
        const idx = parseInt(code.replace(/^C/i, ''), 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= files.length) {
            await sendMessage(chatId, "❌ Código de mapa inválido.");
            return;
        }
        const filePath = path.join(PROJETOS_DIR, files[idx]);
        await sendFile(chatId, filePath);
    } catch (error) {
        console.error('❌ Erro ao enviar mapa por índice:', error);
        await sendMessage(chatId, "❌ Erro ao enviar mapa.");
    }
}

// fallback: enviar vídeo por chave exata (compatibilidade com original)
async function sendVideoByKey(chatId, key) {
    try {
        if (!fs.existsSync(VIDEOS_FILE)) {
            await sendMessage(chatId, "❌ Arquivo de vídeos não encontrado.");
            return;
        }
        const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
        const url = videos[key];
        if (url) {
            await sendMessage(chatId, `📺 *${key}*\n\n🔗 ${url}`);
        } else {
            await sendMessage(chatId, "❌ Vídeo não encontrado.");
        }
    } catch (error) {
        console.error('❌ Erro ao enviar vídeo por chave:', error);
        await sendMessage(chatId, "❌ Erro ao buscar vídeo.");
    }
}

// Função para mostrar ajuda
async function showHelp(chatId) {
    const helpMessage = `🆘 *CENTRAL DE AJUDA*

🔧 *Como usar o bot:*

1️⃣ *Ativar o bot no grupo:* Digite "🟢" ou "ativar"
2️⃣ *Ver menu:* Digite "menu" ou "MENU"
3️⃣ *Buscar CTO (Arapiraca):* Digite "A" e depois informe o número da CTO
4️⃣ *Vídeos:* Digite "B" e depois "B1", "B2", ...
5️⃣ *Mapas:* Digite "C" e depois "C1", "C2", ...
6️⃣ *Apoiar projeto:* Digite "G" para informações de doação
7️⃣ *Desativar no grupo:* Digite "🔴" ou "desativar"

⚠️ *IMPORTANTE:* Este bot só funciona nos grupos autorizados pelo administrador.`;

    await sendMessage(chatId, helpMessage);
}

// Função para mostrar IPs dos roteadores
async function showRouterIPs(chatId) {
    const message = `🌐 *IPs DOS ROTEADORES*

🔧 *Principais Roteadores:*

📡 *Intelbras:* 192.168.1.1
📡 *ZTE:* 192.168.1.1  
📡 *Keo:* 10.0.0.1
📡 *Huawei:* 192.168.3.1

👤 *Usuários padrão:*
• Admin: admin

🔒 *Senhas comuns:*
• Intelbras10#
`;

    await sendMessage(chatId, message);
}

// Função para mostrar status do bot
async function showBotStatus(chatId, firstName) {
    let usuarios = {};
    if (fs.existsSync(USUARIOS_FILE)) {
        usuarios = JSON.parse(fs.readFileSync(USUARIOS_FILE, 'utf8'));
    }

    const now = moment();
    const ativos = Object.values(usuarios).filter(u => {
        const diff = now.diff(moment(u.ultima_interacao), 'hours');
        return diff <= 24;
    }).length;

    const chatsAtivados = activatedChats.size;

    const statusMessage = `📊 *STATUS DO BOT*

👋 Olá, *${firstName}*!

🤖 *Informações do Sistema:*
📅 Data: ${moment().format('DD/MM/YYYY')}
🕐 Hora: ${moment().format('HH:mm:ss')}
🔗 Status: ${isConnected ? '✅ Online' : '❌ Offline'}
🌐 Conexão: ${isConnected ? '✅ WhatsApp conectado' : '❌ Desconectado'}

📈 *Estatísticas:*
👥 Total de usuários: *${Object.keys(usuarios).length}*
🟢 Ativos (24h): *${ativos}*
💬 Grupos ativados: *${chatsAtivados}*
📱 Grupos autorizados: *${selectedGroups.length}*

🚫 *Modo Restrito:* Apenas grupos selecionados
🔒 *Mensagens privadas:* Bloqueadas`;

    await sendMessage(chatId, statusMessage);
}

// Funções auxiliares

// Salvar chats ativados
function saveActivatedChats() {
    try {
        const chatsArray = Array.from(activatedChats);
        fs.writeFileSync(ACTIVATED_CHATS_FILE, JSON.stringify(chatsArray, null, 2));
    } catch (error) {
        console.error('❌ Erro ao salvar chats ativados:', error);
    }
}

// Carregar chats ativados
function loadActivatedChats() {
    try {
        if (fs.existsSync(ACTIVATED_CHATS_FILE)) {
            const chatsArray = JSON.parse(fs.readFileSync(ACTIVATED_CHATS_FILE, 'utf8'));
            activatedChats = new Set(chatsArray);
            console.log(`📱 ${activatedChats.size} chats ativados carregados`);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar chats ativados:', error);
        activatedChats = new Set();
    }
}

// Buscar OLT - função completa
async function buscarOLT(chatId, numero, userId) {
    try {
        let sessoes = {};
        if (fs.existsSync(SESSOES_FILE)) {
            sessoes = JSON.parse(fs.readFileSync(SESSOES_FILE, 'utf8'));
        }
        
        const cidade = sessoes[userId];
        if (!cidade) {
            await sendMessage(chatId, "❗ *Erro: Cidade não selecionada*\n\n🔍 Use o comando *A* para buscar em Arapiraca.");
            return;
        }

        const arquivo = path.join(OLTS_DIR, gerarNomeArquivo(cidade));
        if (!fs.existsSync(arquivo)) {
            await sendMessage(chatId, `❌ *Arquivo não encontrado*\n\nDados da cidade *${cidade}* não estão disponíveis.\n\n📞 Entre em contato com o suporte.`);
            return;
        }

        const numeroInt = parseInt(numero);
        const olts = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        const resultados = [];

        for (const [olt, info] of Object.entries(olts)) {
            if (info.numeros && info.numeros.includes(numeroInt)) {
                resultados.push(`🏢 *OLT:* ${olt}\n📊 *Perfil:* ${info.perfil}`);
            }
        }

        if (resultados.length > 0) {
            const message = `🔍 *RESULTADO DA BUSCA*\n\n🏙️ *Cidade:* ${cidade}\n🔢 *CTO:* ${numero}\n\n${resultados.join('\n\n')}\n\n✅ *Busca concluída!*`;
            await sendMessage(chatId, message);
        } else {
            await sendMessage(chatId, `❌ *Nenhum resultado encontrado*\n\n🏙️ *Cidade:* ${cidade}\n🔢 *CTO:* ${numero}\n\n💡 Verifique se o número está correto ou tente novamente.`);
        }
    } catch (error) {
        console.error('❌ Erro na busca OLT:', error);
        await sendMessage(chatId, `❌ *Erro na busca*\n\nOcorreu um erro ao buscar a CTO ${numero}.\n\n🔄 Tente novamente em alguns segundos.`);
    }
}

// Função para gerar nome do arquivo
function gerarNomeArquivo(cidade) {
    const nome = cidade.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/\s+/g, ''); // Remove espaços
    return nome + '.json';
}

// Verificar se vídeo existe (compatibilidade)
function videoExists(text) {
    if (!fs.existsSync(VIDEOS_FILE)) return false;
    try {
        const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
        return videos.hasOwnProperty(text);
    } catch (error) {
        return false;
    }
}

// Enviar arquivo (KML)
async function sendFile(chatId, filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            await sendMessage(chatId, "❌ *Arquivo não encontrado*\n\n📁 O mapa solicitado não está disponível.");
            return;
        }
        
        console.log('📤 Enviando arquivo:', path.basename(filePath));
        await sock.sendMessage(chatId, { 
            document: { url: filePath },
            fileName: path.basename(filePath),
            mimetype: 'application/vnd.google-earth.kml+xml'
        });
        
        await sendMessage(chatId, `✅ *Arquivo enviado!*\n\n📁 **${path.basename(filePath)}**\n\n💡 Abra com Google Earth ou Maps.`);
    } catch (error) {
        console.error('❌ Erro ao enviar arquivo:', error);
        await sendMessage(chatId, "❌ Erro ao enviar arquivo. Tente novamente.");
    }
}

// Salvar sessão
function salvarSessao(userId, cidade) {
    try {
        let sessoes = {};
        if (fs.existsSync(SESSOES_FILE)) {
            sessoes = JSON.parse(fs.readFileSync(SESSOES_FILE, 'utf8'));
        }
        sessoes[userId] = cidade;
        fs.writeFileSync(SESSOES_FILE, JSON.stringify(sessoes, null, 2));
    } catch (error) {
        console.error('❌ Erro ao salvar sessão:', error);
    }
}

// Função para saudação
function getGreeting() {
    const h = moment().hour();
    if (h < 12) return "☀️ Bom dia";
    if (h < 18) return "🌤️ Boa tarde";
    return "🌙 Boa noite";
}

// APIs e rotas

// Salvar grupos selecionados via API
app.post('/api/groups/select', (req, res) => {
    try {
        const { groupIds } = req.body;
        selectedGroups = groupIds || [];
        fs.writeFileSync(GROUPS_FILE, JSON.stringify(selectedGroups, null, 2));
        console.log(`💾 ${selectedGroups.length} grupos selecionados salvos`);
        io.emit('groupsSelected', selectedGroups);
        res.json({ success: true, count: selectedGroups.length });
    } catch (error) {
        console.error('❌ Erro ao salvar grupos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/groups/selected', (req, res) => {
    res.json(selectedGroups);
});

// API status
app.get('/api/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        qr: qrCodeData,
        selectedGroups: selectedGroups.length,
        activatedChats: activatedChats.size,
        restrictedMode: true, // Indica que está em modo restrito
        timestamp: new Date().toISOString()
    });
});

// Endpoint para forçar reconexão
app.post('/api/reconnect', (req, res) => {
    console.log('🔄 Forçando reconexão via API...');
    
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    if (sock) {
        try { sock.end(); } catch (e) { console.log('Erro ao fechar conexão:', e.message); }
        sock = null;
    }
    
    isConnected = false;
    isConnecting = false;
    qrCodeData = null;
    
    setTimeout(() => connectToWhatsApp(), 2000);
    res.json({ success: true, message: 'Reconexão iniciada' });
});

// Endpoint para limpar sessão
app.post('/api/clear-session', (req, res) => {
    try {
        console.log('🗑️ Limpando sessão via API...');
        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        if (sock) { try { sock.end(); } catch (e) { } sock = null; }
        clearAuthSession();
        isConnected = false; isConnecting = false; qrCodeData = null;
        setTimeout(() => connectToWhatsApp(), 3000);
        res.json({ success: true, message: 'Sessão limpa, reconectando...' });
    } catch (error) {
        console.error('❌ Erro ao limpar sessão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para recarregar grupos manualmente
app.post('/api/reload-groups', (req, res) => {
    if (!isConnected) return res.status(400).json({ success: false, message: 'Bot não conectado' });
    console.log('📋 Recarregando grupos via API...');
    loadAvailableGroups();
    res.json({ success: true, message: 'Recarregamento iniciado' });
});

// NOVO ENDPOINT: Listar grupos com informações detalhadas
app.get('/api/groups/info', (req, res) => {
    try {
        const groupsInfo = {
            total: selectedGroups.length,
            selected: selectedGroups,
            activated: Array.from(activatedChats),
            restrictedMode: true
        };
        res.json(groupsInfo);
    } catch (error) {
        console.error('❌ Erro ao buscar informações dos grupos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Socket.IO connections
io.on('connection', (socket) => {
    console.log('🌐 Cliente conectado ao painel');
    socket.emit('connection', { status: isConnected ? 'connected' : 'disconnected' });
    if (qrCodeData) socket.emit('qr', qrCodeData);
    
    // Enviar informações sobre modo restrito
    socket.emit('restrictedMode', {
        enabled: true,
        selectedGroups: selectedGroups.length,
        activatedChats: activatedChats.size
    });
    
    socket.on('disconnect', () => console.log('🌐 Cliente desconectado do painel'));
});

// Carregar configurações salvas

// Carregar grupos selecionados salvos
if (fs.existsSync(GROUPS_FILE)) {
    try {
        selectedGroups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
        console.log(`📋 ${selectedGroups.length} grupos carregados da configuração`);
    } catch (error) {
        console.error('❌ Erro ao carregar grupos salvos:', error);
        selectedGroups = [];
    }
}

// Carregar chats ativados salvos
loadActivatedChats();

// Tratamento de sinais para encerramento limpo
process.on('SIGINT', () => {
    console.log('🛑 Encerrando bot...');
    if (sock) sock.end();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Log de inicialização com informações sobre modo restrito
console.log('🚀 Iniciando Bot WhatsApp...');
console.log('🚫 MODO RESTRITO ATIVADO - Apenas grupos selecionados');
console.log('🔒 Mensagens privadas serão bloqueadas');
console.log(`📋 Grupos selecionados: ${selectedGroups.length}`);

// Inicializar conexão
connectToWhatsApp();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
    console.log(`📱 Painel disponível em: http://localhost:${PORT}`);
    console.log(`🚫 Bot funcionará APENAS nos grupos selecionados via painel`);
});