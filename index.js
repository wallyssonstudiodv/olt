const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const P = require('pino');

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

// Configuração de arquivos de dados
const LOG_FILE = 'mensagens.json';
const USUARIOS_FILE = 'usuarios.json';
const VIDEOS_FILE = 'videos.json';
const SESSOES_FILE = 'sessoes.json';
const GROUPS_FILE = 'grupos_selecionados.json';
const OLTS_DIR = path.join(__dirname, 'olts');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Função para conectar ao WhatsApp
async function connectToWhatsApp() {
    try {
        console.log('🔄 Iniciando conexão com WhatsApp...');
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        const logger = P({ level: 'silent' });
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            browser: ['Bot WhatsApp', 'Chrome', '3.0'],
            generateHighQualityLinkPreview: true,
            markOnlineOnConnect: false,
            logger: logger
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log('📱 Update de conexão:', { connection, qr: !!qr });

            if (qr) {
                try {
                    console.log('📱 Gerando QR Code...');
                    qrCodeData = await QRCode.toDataURL(qr, {
                        margin: 2,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        },
                        width: 256
                    });
                    console.log('✅ QR Code gerado com sucesso');
                    io.emit('qr', qrCodeData);
                } catch (qrError) {
                    console.error('❌ Erro ao gerar QR Code:', qrError);
                    io.emit('error', { message: 'Erro ao gerar QR Code' });
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('🔌 Conexão fechada:', lastDisconnect?.error, ', reconectando:', shouldReconnect);
                
                isConnected = false;
                qrCodeData = null;
                io.emit('connection', { status: 'disconnected' });
                
                if (shouldReconnect) {
                    console.log('🔄 Reconectando em 3 segundos...');
                    setTimeout(() => {
                        connectToWhatsApp();
                    }, 3000);
                }
            } else if (connection === 'open') {
                console.log('✅ WhatsApp conectado com sucesso!');
                isConnected = true;
                qrCodeData = null;
                io.emit('connection', { status: 'connected' });
                
                // Buscar grupos disponíveis
                setTimeout(async () => {
                    await loadAvailableGroups();
                }, 2000);
            } else if (connection === 'connecting') {
                console.log('🔄 Conectando...');
                io.emit('connection', { status: 'connecting' });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // Handler para mensagens recebidas
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.key.fromMe && msg.message) {
                    await handleMessage(msg);
                }
            } catch (msgError) {
                console.error('❌ Erro ao processar mensagem:', msgError);
            }
        });

        // Handler para erros
        sock.ev.on('error', (error) => {
            console.error('❌ Erro no socket:', error);
        });

    } catch (error) {
        console.error('❌ Erro ao conectar WhatsApp:', error);
        io.emit('error', { message: 'Erro ao conectar com WhatsApp' });
        
        // Tentar reconectar após erro
        setTimeout(() => {
            connectToWhatsApp();
        }, 5000);
    }
}

// Função para buscar grupos disponíveis
async function loadAvailableGroups() {
    try {
        console.log('📋 Carregando grupos disponíveis...');
        const groups = await sock.groupFetchAllParticipating();
        const groupList = Object.values(groups).map(group => ({
            id: group.id,
            name: group.subject,
            participants: group.participants.length
        }));
        
        console.log(`✅ ${groupList.length} grupos encontrados`);
        io.emit('groups', groupList);
    } catch (error) {
        console.error('❌ Erro ao buscar grupos:', error);
        // Se falhar, tentar novamente em 5 segundos
        setTimeout(loadAvailableGroups, 5000);
    }
}

// Função principal para lidar com mensagens
async function handleMessage(msg) {
    const chatId = msg.key.remoteJid;
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const sender = msg.key.participant || msg.key.remoteJid;
    
    // Verificar se o grupo está na lista de grupos selecionados
    if (!isGroupSelected(chatId)) {
        return; // Ignora mensagens de grupos não selecionados
    }

    // Registrar usuário
    await registerUser(sender, msg.pushName || 'Usuário');
    
    // Processar comando
    await handleCommand(chatId, text.trim(), msg.pushName || 'Usuário', sender);
}

// Verificar se o grupo está selecionado
function isGroupSelected(chatId) {
    if (chatId.includes('@g.us')) {
        return selectedGroups.includes(chatId);
    }
    return true; // Permite mensagens privadas
}

// Registrar usuário
async function registerUser(userId, name) {
    let usuarios = {};
    if (fs.existsSync(USUARIOS_FILE)) {
        usuarios = JSON.parse(fs.readFileSync(USUARIOS_FILE, 'utf8'));
    }
    
    usuarios[userId] = {
        nome: name,
        ultima_interacao: moment().format('YYYY-MM-DD HH:mm:ss')
    };
    
    fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2));
}

// Função principal de comandos
async function handleCommand(chatId, text, firstName, userId) {
    switch (text) {
        case '/start':
        case '🔙 Voltar ao Menu':
            await showMenu(chatId, firstName);
            break;

        case '🔍 Buscar OLT/CTO':
            const cidades = ['Arapiraca', 'Campo Alegre', 'Canaa Capim Agreste', 'Coruripe', 'Craíbas', 'Girau do Ponciano', 'Jequiá da Praia', 'Lagoa da Canoa', 'Luzia Poliz', 'Palmeiras dos Índios', 'Penedo', 'São Miguel'];
            const buttons = cidades.map(cidade => ({ buttonId: `cidade_${cidade}`, buttonText: { displayText: `🌆 ${cidade}` }, type: 1 }));
            buttons.push({ buttonId: 'voltar', buttonText: { displayText: '🔙 Voltar ao Menu' }, type: 1 });
            
            await sendButtonMessage(chatId, "Selecione a cidade para buscar o número da CTO:", buttons);
            break;

        case '📹 Vídeos Tutoriais':
            await showVideoMenu(chatId);
            break;

        case '🗺️ Mapa dos Projetos':
            await showMapaProjetosMenu(chatId);
            break;

        case '🌐 IPs dos Roteadores':
            await sendList(chatId, [
                "Intelbras: 192.168.1.1",
                "ZTE: 192.168.1.1",
                "Keo: 10.0.0.1",
                "Huawei: 192.168.3.1"
            ]);
            break;

        case '🧾 Área do Cliente':
            await sendMessage(chatId, "Acesse a área do cliente:\nhttps://central.provedorsuperconnect.com.br/central_assinante_web/login");
            break;

        case '🧹 Limpar Resultados':
            await sendMessage(chatId, "Resultados limpos com sucesso!");
            break;

        default:
            if (text.startsWith('cidade_')) {
                const cidade = text.replace('cidade_', '');
                salvarSessao(userId, cidade);
                await sendMessage(chatId, `Cidade *${cidade}* selecionada.\nAgora envie o número da CTO para buscar.`);
                return;
            }

            if (/^\d+$/.test(text)) {
                await buscarOLT(chatId, text, userId);
            } else if (videoExists(text)) {
                await sendVideoByKey(chatId, text);
            } else {
                const mapaFiles = {
                    '📍 Arapiraca': 'arapiraca.kml',
                    '📍 Campo Alegre': 'campoalegre.kml',
                    '📍 Canaa Capim Agreste': 'canaacapimagreste.kml',
                    '📍 Coruripe': 'coruripe.kml',
                    '📍 Craíbas': 'craibas.kml',
                    '📍 Girau do Ponciano': 'giraudoponciano.kml',
                    '📍 Jequiá da Praia': 'jequiadapraia.kml',
                    '📍 Lagoa da Canoa': 'lagoadacanoa.kml',
                    '📍 Luzia Poliz': 'luziapoliz.kml',
                    '📍 Palmeiras dos Índios': 'palmeirasdosindios.kml',
                    '📍 Penedo': 'penedo.kml',
                    '📍 São Miguel': 'saomiguel.kml'
                };
                
                if (mapaFiles[text]) {
                    await sendFile(chatId, path.join(__dirname, 'projetos', mapaFiles[text]));
                } else {
                    await sendMessage(chatId, "Comando não reconhecido. Digite /start para ver o menu.");
                    await showMenu(chatId, firstName);
                }
            }
            break;
    }
}

// Buscar OLT
async function buscarOLT(chatId, numero, userId) {
    let sessoes = {};
    if (fs.existsSync(SESSOES_FILE)) {
        sessoes = JSON.parse(fs.readFileSync(SESSOES_FILE, 'utf8'));
    }
    
    const cidade = sessoes[userId];
    if (!cidade) {
        await sendMessage(chatId, "❗ Primeiro selecione uma cidade em '🔍 Buscar OLT/CTO'.");
        return;
    }

    const arquivo = path.join(OLTS_DIR, gerarNomeArquivo(cidade));
    if (!fs.existsSync(arquivo)) {
        await sendMessage(chatId, `Arquivo da cidade *${cidade}* não encontrado.`);
        return;
    }

    const numeroInt = parseInt(numero);
    const olts = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const resultados = [];

    for (const [olt, info] of Object.entries(olts)) {
        if (info.numeros.includes(numeroInt)) {
            resultados.push(`*OLT:* ${olt}\n*Perfil:* ${info.perfil}`);
        }
    }

    if (resultados.length > 0) {
        await sendMessage(chatId, `Resultado para CTO *${numero}* em *${cidade}*:\n\n${resultados.join('\n\n')}`);
    } else {
        await sendMessage(chatId, `Nenhum resultado encontrado para CTO *${numero}* em *${cidade}*.`);
    }
}

// Funções auxiliares
function gerarNomeArquivo(cidade) {
    const nome = cidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return nome.replace(/ /g, '') + '.json';
}

function videoExists(text) {
    if (!fs.existsSync(VIDEOS_FILE)) return false;
    const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
    return videos.hasOwnProperty(text);
}

async function sendVideoByKey(chatId, key) {
    const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
    const url = videos[key];
    if (url) {
        await sendMessage(chatId, `📺 Aqui está o vídeo:\n${url}`);
    } else {
        await sendMessage(chatId, "❌ Vídeo não encontrado.");
    }
}

async function showVideoMenu(chatId) {
    if (!fs.existsSync(VIDEOS_FILE)) {
        await sendMessage(chatId, "Nenhum vídeo cadastrado.");
        return;
    }
    
    const videos = JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
    const buttons = Object.keys(videos).map(key => ({ 
        buttonId: key, 
        buttonText: { displayText: key }, 
        type: 1 
    }));
    buttons.push({ buttonId: 'voltar', buttonText: { displayText: '🔙 Voltar ao Menu' }, type: 1 });
    
    await sendButtonMessage(chatId, "Escolha o vídeo desejado:", buttons);
}

async function showMapaProjetosMenu(chatId) {
    const mapas = ['📍 Arapiraca','📍 Campo Alegre','📍 Canaa Capim Agreste','📍 Coruripe','📍 Craíbas','📍 Girau do Ponciano','📍 Jequiá da Praia','📍 Lagoa da Canoa','📍 Luzia Poliz','📍 Palmeiras dos Índios','📍 Penedo','📍 São Miguel'];
    const buttons = mapas.map(mapa => ({ 
        buttonId: mapa, 
        buttonText: { displayText: mapa }, 
        type: 1 
    }));
    buttons.push({ buttonId: 'voltar', buttonText: { displayText: '🔙 Voltar ao Menu' }, type: 1 });
    
    await sendButtonMessage(chatId, "Escolha um projeto para baixar o mapa:", buttons);
}

async function showMenu(chatId, firstName) {
    let usuarios = {};
    if (fs.existsSync(USUARIOS_FILE)) {
        usuarios = JSON.parse(fs.readFileSync(USUARIOS_FILE, 'utf8'));
    }

    const now = moment();
    const ativos = Object.values(usuarios).filter(u => {
        const diff = now.diff(moment(u.ultima_interacao), 'hours');
        return diff <= 24;
    }).length;

    const greeting = getGreeting();
    const mensagem = `${greeting}, *${firstName}*!\n` +
        `🤖 *Bot versão 2.9*\n📅 Data: *${moment().format('DD/MM/YYYY')}*\n` +
        `👥 Total de usuários: *${Object.keys(usuarios).length}*\n` +
        `🟢 Ativos nas últimas 24h: *${ativos}*\n\n` +
        `Escolha uma opção abaixo:`;

    const buttons = [
        { buttonId: '🔍 Buscar OLT/CTO', buttonText: { displayText: '🔍 Buscar OLT/CTO' }, type: 1 },
        { buttonId: '📹 Vídeos Tutoriais', buttonText: { displayText: '📹 Vídeos Tutoriais' }, type: 1 },
        { buttonId: '🗺️ Mapa dos Projetos', buttonText: { displayText: '🗺️ Mapa dos Projetos' }, type: 1 },
        { buttonId: '🌐 IPs dos Roteadores', buttonText: { displayText: '🌐 IPs dos Roteadores' }, type: 1 },
        { buttonId: '🧾 Área do Cliente', buttonText: { displayText: '🧾 Área do Cliente' }, type: 1 },
        { buttonId: '🧹 Limpar Resultados', buttonText: { displayText: '🧹 Limpar Resultados' }, type: 1 }
    ];

    await sendButtonMessage(chatId, mensagem, buttons);
}

function getGreeting() {
    const h = moment().hour();
    return (h < 12) ? "☀️ Bom dia" : ((h < 18) ? "🌤️ Boa tarde" : "🌙 Boa noite");
}

// Funções de envio de mensagens
async function sendMessage(chatId, text) {
    try {
        await sock.sendMessage(chatId, { text });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
    }
}

async function sendButtonMessage(chatId, text, buttons) {
    try {
        const buttonMessage = {
            text,
            buttons,
            headerType: 1
        };
        await sock.sendMessage(chatId, buttonMessage);
    } catch (error) {
        console.error('Erro ao enviar mensagem com botões:', error);
        // Fallback para mensagem simples
        await sendMessage(chatId, text);
    }
}

async function sendFile(chatId, filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            await sendMessage(chatId, "❗ Arquivo não encontrado.");
            return;
        }
        await sock.sendMessage(chatId, { 
            document: { url: filePath },
            fileName: path.basename(filePath),
            mimetype: 'application/octet-stream'
        });
    } catch (error) {
        console.error('Erro ao enviar arquivo:', error);
    }
}

async function sendList(chatId, lista) {
    for (const item of lista) {
        await sendMessage(chatId, item);
    }
}

function salvarSessao(userId, cidade) {
    let sessoes = {};
    if (fs.existsSync(SESSOES_FILE)) {
        sessoes = JSON.parse(fs.readFileSync(SESSOES_FILE, 'utf8'));
    }
    sessoes[userId] = cidade;
    fs.writeFileSync(SESSOES_FILE, JSON.stringify(sessoes, null, 2));
}

// API Routes
app.get('/api/status', (req, res) => {
    res.json({ 
        connected: isConnected,
        qr: qrCodeData,
        selectedGroups: selectedGroups.length,
        timestamp: new Date().toISOString()
    });
});

app.post('/api/groups/select', (req, res) => {
    try {
        const { groupIds } = req.body;
        selectedGroups = groupIds || [];
        
        // Salvar grupos selecionados em arquivo
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

// Endpoint para forçar reconexão
app.post('/api/reconnect', (req, res) => {
    console.log('🔄 Forçando reconexão...');
    
    if (sock) {
        try {
            sock.end();
        } catch (error) {
            console.log('Erro ao fechar conexão existente:', error);
        }
    }
    
    isConnected = false;
    qrCodeData = null;
    
    setTimeout(() => {
        connectToWhatsApp();
    }, 1000);
    
    res.json({ success: true, message: 'Reconexão iniciada' });
});

// Endpoint para limpar sessão
app.post('/api/clear-session', (req, res) => {
    try {
        console.log('🗑️ Limpando sessão...');
        
        if (sock) {
            sock.end();
        }
        
        // Remover pasta de autenticação
        if (fs.existsSync('auth_info_baileys')) {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
            console.log('✅ Sessão limpa com sucesso');
        }
        
        isConnected = false;
        qrCodeData = null;
        
        setTimeout(() => {
            connectToWhatsApp();
        }, 2000);
        
        res.json({ success: true, message: 'Sessão limpa, reconectando...' });
    } catch (error) {
        console.error('❌ Erro ao limpar sessão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Socket.IO connections
io.on('connection', (socket) => {
    console.log('Cliente conectado ao painel');
    
    socket.emit('connection', { status: isConnected ? 'connected' : 'disconnected' });
    if (qrCodeData) {
        socket.emit('qr', qrCodeData);
    }
    
    socket.on('disconnect', () => {
        console.log('Cliente desconectado do painel');
    });
});

// Carregar grupos selecionados salvos
if (fs.existsSync(GROUPS_FILE)) {
    selectedGroups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8'));
}

// Inicializar
connectToWhatsApp();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Painel disponível em: http://localhost:${PORT}`);
});