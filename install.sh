#!/bin/bash

echo "🤖 Instalando Bot WhatsApp com Baileys 6.6.0..."

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado. Instalando..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não está instalado. Instalando..."
    sudo apt-get install -y npm
fi

echo "✅ Node.js versão: $(node --version)"
echo "✅ npm versão: $(npm --version)"

# Criar diretórios necessários
mkdir -p olts
mkdir -p projetos
mkdir -p public

echo "📦 Instalando dependências..."
npm install

# Criar arquivos de exemplo se não existirem
if [ ! -f "videos.json" ]; then
    echo "📹 Criando arquivo videos.json de exemplo..."
    cat > videos.json << 'EOF'
{
  "📱 Configurar Roteador": "https://www.youtube.com/watch?v=exemplo1",
  "🌐 Resetar Modem": "https://www.youtube.com/watch?v=exemplo2", 
  "🔧 Trocar Senha WiFi": "https://www.youtube.com/watch?v=exemplo3",
  "📡 Configurar DNS": "https://www.youtube.com/watch?v=exemplo4",
  "🔒 Segurança da Rede": "https://www.youtube.com/watch?v=exemplo5",
  "⚡ Melhorar Sinal": "https://www.youtube.com/watch?v=exemplo6"
}
EOF
fi

# Criar arquivo OLT de exemplo
if [ ! -f "olts/arapiraca.json" ]; then
    echo "🏢 Criando arquivo OLT de exemplo..."
    cat > olts/arapiraca.json << 'EOF'
{
  "OLT-ARAP-01": {
    "perfil": "200M",
    "numeros": [1, 2, 3, 4, 5, 15, 16, 17, 18, 19, 25, 26, 27, 28, 29]
  },
  "OLT-ARAP-02": {
    "perfil": "300M", 
    "numeros": [6, 7, 8, 9, 10, 20, 21, 22, 23, 24, 30, 31, 32, 33, 34]
  },
  "OLT-ARAP-03": {
    "perfil": "500M",
    "numeros": [11, 12, 13, 14, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]
  }
}
EOF
fi

# Criar script systemd
echo "⚙️ Criando serviço systemd..."
sudo tee /etc/systemd/system/whatsapp-bot.service > /dev/null << EOF
[Unit]
Description=WhatsApp Bot Baileys
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Recarregar systemd
sudo systemctl daemon-reload

echo "🎉 Instalação concluída!"
echo ""
echo "📋 Comandos disponíveis:"
echo "  npm start              - Iniciar o bot"
echo "  npm run dev            - Iniciar em modo desenvolvimento"
echo "  sudo systemctl start whatsapp-bot    - Iniciar como serviço"
echo "  sudo systemctl enable whatsapp-bot   - Ativar inicialização automática"
echo "  sudo systemctl status whatsapp-bot   - Ver status do serviço"
echo ""
echo "🌐 Após iniciar, acesse: http://localhost:3000"
echo ""
echo "⚠️  Lembre-se de:"
echo "  1. Configurar seus arquivos OLT em ./olts/"
echo "  2. Adicionar seus vídeos em videos.json"
echo "  3. Adicionar mapas KML em ./projetos/"