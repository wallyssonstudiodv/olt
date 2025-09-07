#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🤖 WhatsApp Bot Super Pro v4.0 - Setup');
console.log('📋 Configurando ambiente...\n');

// Verificar Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 18) {
    console.error('❌ Node.js 18.0.0 ou superior é necessário');
    console.error(`   Versão atual: ${nodeVersion}`);
    console.error('   Atualize em: https://nodejs.org/');
    process.exit(1);
}

console.log(`✅ Node.js ${nodeVersion} - OK`);

// Verificar e criar estrutura de pastas
const requiredDirs = [
    './data',
    './data/olts', 
    './data/backups',
    './auth_info_baileys',
    './public'
];

console.log('📁 Criando estrutura de diretórios...');
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`   ✅ ${dir}`);
    } else {
        console.log(`   📂 ${dir} (já existe)`);
    }
});

// Criar arquivo de dados de CTO se não existir
const ctoFile = './data/olts/arapiraca.json';
if (!fs.existsSync(ctoFile)) {
    console.log('\n📄 Criando arquivo de dados de CTOs...');
    
    const exemploOLTs = {
        "OLT-ARAPIRACA-01": {
            "numeros": [1, 2, 3, 15, 25, 35, 123],
            "perfil": "GPON-1G-RESIDENCIAL",
            "status": "Ativo",
            "capacidade": "1024 clientes",
            "localizacao": "Centro",
            "ip": "10.1.1.100"
        },
        "OLT-ARAPIRACA-02": {
            "numeros": [4, 5, 6, 16, 26, 36, 456],
            "perfil": "GPON-2G-EMPRESARIAL", 
            "status": "Ativo",
            "capacidade": "512 clientes",
            "localizacao": "Brasília",
            "ip": "10.1.1.101"
        },
        "OLT-ARAPIRACA-03": {
            "numeros": [7, 8, 9, 17, 27, 37, 789],
            "perfil": "GPON-1G-RESIDENCIAL",
            "status": "Manutenção",
            "capacidade": "1024 clientes", 
            "localizacao": "Cacimbinhas",
            "ip": "10.1.1.102"
        }
    };
    
    fs.writeFileSync(ctoFile, JSON.stringify(exemploOLTs, null, 2));
    console.log('   ✅ data/olts/arapiraca.json criado');
    console.log('   📝 Edite este arquivo com seus dados reais');
}

// Criar arquivo de vídeos se não existir
const videosFile = './data/videos.json';
if (!fs.existsSync(videosFile)) {
    console.log('\n📹 Criando arquivo de vídeos...');
    
    const exemploVideos = {
        "Instalação Básica de Roteador": "https://youtu.be/exemplo1",
        "Configuração de Wi-Fi": "https://youtu.be/exemplo2", 
        "Resolução de Problemas de Conexão": "https://youtu.be/exemplo3",
        "Configuração de Portas": "https://youtu.be/exemplo4",
        "Reset de Equipamentos": "https://youtu.be/exemplo5"
    };
    
    fs.writeFileSync(videosFile, JSON.stringify(exemploVideos, null, 2));
    console.log('   ✅ data/videos.json criado');
    console.log('   📝 Edite este arquivo com links reais dos vídeos');
}

// Verificar se o arquivo HTML do painel existe
const htmlFile = './public/index.html';
if (!fs.existsSync(htmlFile)) {
    console.log('\n⚠️  Arquivo do painel web não encontrado!');
    console.log('   📝 Certifique-se de que o arquivo public/index.html existe');
}

// Verificar dependências básicas
console.log('\n📦 Verificando dependências...');
const requiredPackages = [
    '@whiskeysockets/baileys',
    'express', 
    'socket.io',
    'qrcode',
    'pino'
];

let missingPackages = [];

requiredPackages.forEach(pkg => {
    try {
        require.resolve(pkg);
        console.log(`   ✅ ${pkg}`);
    } catch (error) {
        console.log(`   ❌ ${pkg} - NÃO ENCONTRADO`);
        missingPackages.push(pkg);
    }
});

if (missingPackages.length > 0) {
    console.log('\n⚠️  Dependências em falta. Execute:');
    console.log('   npm install');
    console.log('\n📋 Pacotes em falta:');
    missingPackages.forEach(pkg => console.log(`   - ${pkg}`));
} else {
    console.log('\n✅ Todas as dependências estão instaladas!');
}

// Criar arquivo .env de exemplo
const envFile = './.env.example';
if (!fs.existsSync(envFile)) {
    console.log('\n📄 Criando arquivo .env.example...');
    
    const envContent = `# Configurações do Bot WhatsApp
PORT=3000
ADMIN_WHATSAPP=5582981718851@s.whatsapp.net
BOT_NAME=Super Bot Pro
BOT_VERSION=4.0

# Rate Limiting
RATE_LIMIT_MAX=30
RATE_LIMIT_TEMPO=60

# Sessões
MAX_SESSAO_TEMPO=3600
`;
    
    fs.writeFileSync(envFile, envContent);
    console.log('   ✅ .env.example criado');
    console.log('   📝 Copie para .env e configure suas variáveis');
}

// Verificar/criar arquivo de configuração
const configFile = './data/config.json';
if (!fs.existsSync(configFile)) {
    console.log('\n⚙️  Criando arquivo de configuração...');
    
    const configData = {
        GRUPO_PERMITIDO: null,
        timestamp: new Date().toISOString(),
        version: '4.0.0'
    };
    
    fs.writeFileSync(configFile, JSON.stringify(configData, null, 2));
    console.log('   ✅ data/config.json criado');
}

// Verificar permissões de escrita
console.log('\n🔐 Verificando permissões...');
const testFile = './data/test_write.tmp';
try {
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('   ✅ Permissões de escrita - OK');
} catch (error) {
    console.log('   ❌ Erro de permissões de escrita');
    console.log('   💡 Execute: chmod -R 755 ./data/');
}

// Mostrar resumo final
console.log('\n' + '='.repeat(50));
console.log('🎉 CONFIGURAÇÃO CONCLUÍDA!');
console.log('='.repeat(50));

console.log('\n📋 ESTRUTURA CRIADA:');
console.log('├── data/');
console.log('│   ├── olts/arapiraca.json (dados das CTOs)');
console.log('│   ├── videos.json (biblioteca de vídeos)');
console.log('│   ├── config.json (configurações)');
console.log('│   └── backups/ (backups automáticos)');
console.log('├── auth_info_baileys/ (dados de autenticação)');
console.log('├── public/index.html (painel web)');
console.log('└── server.js (servidor principal)');

console.log('\n🚀 PRÓXIMOS PASSOS:');
console.log('1. npm install (se ainda não executou)');
console.log('2. Edite data/olts/arapiraca.json com dados reais');
console.log('3. Edite data/videos.json com links dos vídeos'); 
console.log('4. npm start (iniciar o servidor)');
console.log('5. Acesse http://localhost:3000 no navegador');
console.log('6. Use o painel para conectar o WhatsApp');
console.log('7. Selecione o grupo onde o bot funcionará');

console.log('\n🌐 PAINEL WEB:');
console.log('• URL: http://localhost:3000');
console.log('• QR Code para conectar WhatsApp');
console.log('• Seleção visual de grupos');
console.log('• Estatísticas em tempo real');
console.log('• Logs do sistema');
console.log('• Gerenciamento de usuários');
console.log('• Controles de backup e reinicialização');

console.log('\n📞 SUPORTE:');
console.log('• Desenvolvedor: Wallysson Studio Dv');
console.log('• WhatsApp: (82) 98171-8851');

if (missingPackages.length > 0) {
    console.log('\n⚠️  ATENÇÃO: Execute "npm install" antes de continuar!');
    process.exit(1);
} else {
    console.log('\n✅ Setup completo! Execute "npm start" para iniciar.');
}