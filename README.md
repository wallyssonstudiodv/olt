
# WhatsApp Bot Super Pro v4.0 com Painel Web

Bot WhatsApp desenvolvido com Baileys 6.6.0 para busca de CTOs, vídeos tutoriais e suporte técnico. Inclui painel web moderno para gerenciamento completo.

## 🌟 Principais Recursos

- ✅ **Painel Web Moderno** - Interface gráfica para gerenciar o bot
- ✅ **QR Code Visual** - Conexão WhatsApp diretamente no navegador
- ✅ **Seleção de Grupos** - Escolha visualmente qual grupo o bot funcionará
- ✅ **Estatísticas em Tempo Real** - Monitore usuários, mensagens e uptime
- ✅ **Sistema de Logs** - Visualize todas as interações em tempo real
- ✅ **Busca Inteligente de CTOs** - Sistema completo de busca por números
- ✅ **Biblioteca de Vídeos** - Tutoriais organizados por categorias
- ✅ **Sistema de Favoritos** - Usuários podem salvar CTOs e vídeos preferidos
- ✅ **Rate Limiting** - Proteção contra spam (30 msg/min)
- ✅ **Backups Automáticos** - Sistema de backup integrado

## 📋 Pré-requisitos

- Node.js 18.0.0 ou superior
- NPM 8.0.0 ou superior
- Conta WhatsApp (número que será usado como bot)
- Navegador web moderno

## 🚀 Instalação Rápida

### 1. Clone e configure
```bash
git clone https://github.com/seu-usuario/whatsapp-bot-super-pro.git
cd whatsapp-bot-super-pro
```

### 2. Execute o setup automático
```bash
npm install
npm run setup
```

### 3. Inicie o servidor
```bash
npm start
```

### 4. Acesse o painel web
Abra seu navegador e vá para: **http://localhost:3000**

## 🖥️ Usando o Painel Web

### Conectar ao WhatsApp
1. Acesse http://localhost:3000
2. Clique em "Conectar WhatsApp"
3. Escaneie o QR Code que aparece na tela
4. Aguarde a conexão ser estabelecida

### Selecionar Grupo
1. Após conectar, os grupos aparecerão automaticamente
2. Clique no grupo desejado para ativar o bot
3. O bot enviará uma mensagem de boas-vindas

### Monitorar Atividade
- **Aba Estatísticas**: Veja usuários, mensagens e tempo online
- **Aba Usuários**: Lista de todos os usuários registrados
- **Aba Logs**: Todas as mensagens em tempo real
- **Controles**: Reiniciar bot, criar backups

## 📁 Estrutura do Projeto

```
whatsapp-bot-super-pro/
├── server.js                 # Servidor principal
├── package.json              # Dependências
├── setup.js                  # Script de configuração
├── data/
│   ├── olts/
│   │   └── arapiraca.json    # Dados das CTOs
│   ├── videos.json           # Biblioteca de vídeos
│   ├── usuarios_whatsapp.json # Dados dos usuários
│   ├── mensagens_whatsapp.json # Logs de mensagens
│   ├── config.json           # Configurações
│   └── backups/              # Backups automáticos
├── auth_info_baileys/        # Autenticação WhatsApp
└── public/
    └── index.html            # Painel web
```

## ⚙️ Configuração

### Dados das CTOs
Edite `data/olts/arapiraca.json`:
```json
{
  "OLT-EXEMPLO": {
    "numeros": [123, 456, 789],
    "perfil": "GPON-1G-RESIDENCIAL",
    "status": "Ativo",
    "capacidade": "1024 clientes",
    "localizacao": "Centro",
    "ip": "10.1.1.100"
  }
}
```

### Biblioteca de Vídeos
Edite `data/videos.json`:
```json
{
  "Instalação Básica": "https://youtu.be/exemplo1",
  "Configuração Wi-Fi": "https://youtu.be/exemplo2",
  "Troubleshooting": "https://youtu.be/exemplo3"
}
```

### Configurações do Servidor
No arquivo `server.js`, modifique:
```javascript
const CONFIG = {
    ADMIN_WHATSAPP: '5582981718851@s.whatsapp.net', // Seu WhatsApp
    BOT_NAME: 'Super Bot Pro',
    BOT_VERSION: '4.0'
};
```

## 🎯 Comandos do Bot

### Comandos Principais
- **0** ou **menu** - Menu principal
- **A** - Buscar CTO/OLT
- **B** - Vídeos tutoriais
- **C** - Meus favoritos
- **D** - IPs dos roteadores
- **E** - Área do cliente

### Comandos Utilitários
- **ajuda** - Central de ajuda completa
- **status** - Status do usuário
- **config** - Configurações pessoais
- **historico** - Histórico de atividades
- **sobre** - Informações do bot

### Sistema de Favoritos
- **fav 123** - Favoritar CTO número 123
- **fav F** - Favoritar vídeo da letra F

## 📊 Recursos do Painel

### Dashboard Principal
- Status da conexão em tempo real
- QR Code para conectar WhatsApp
- Lista de grupos disponíveis
- Controles de bot (reiniciar, backup, desconectar)

### Estatísticas
- Total de usuários registrados
- Usuários ativos nas últimas 24h
- Mensagens enviadas hoje
- Tempo de atividade do bot

### Gerenciamento de Usuários
- Lista completa de usuários
- Número de mensagens por usuário
- Data da última interação
- Histórico de atividades

### Sistema de Logs
- Todas as mensagens em tempo real
- Filtros por tipo (recebidas/enviadas)
- Timestamps precisos
- Auto-scroll para novas mensagens

## 🔒 Segurança

### Dados Protegidos
- Autenticação WhatsApp em `auth_info_baileys/`
- Logs de usuários criptografados
- Rate limiting por usuário
- Backup automático dos dados

### Acesso ao Painel
- Painel funciona apenas em localhost por padrão
- Para acesso remoto, configure proxy reverso (nginx)
- Considere autenticação adicional para produção

## 🛠️ Comandos NPM

```bash
# Iniciar servidor
npm start

# Modo desenvolvimento (reinicia automaticamente)
npm run dev

# Executar configuração inicial
npm run setup

# Ver logs em tempo real
npm run logs

# Limpar dependências
npm run clean
```

## 📱 Usando o Bot

### 1. Primeira Configuração
- Execute o setup inicial
- Configure dados de CTOs e vídeos
- Inicie o servidor

### 2. Conectar WhatsApp
- Acesse o painel web
- Clique em "Conectar WhatsApp"
- Escaneie o QR Code

### 3. Selecionar Grupo
- Escolha o grupo na lista
- Bot enviará mensagem de boas-vindas
- Usuários podem começar a usar comandos

### 4. Monitoramento
- Use o painel para monitorar atividade
- Veja estatísticas em tempo real
- Acompanhe logs de mensagens

## 🚨 Solução de Problemas

### Bot não conecta
1. Verifique Node.js 18+
2. Limpe `auth_info_baileys/` e reconecte
3. Teste conexão com internet
4. Verifique se a porta 3000 está livre

### QR Code não aparece
1. Aguarde alguns segundos
2. Recarregue a página do painel
3. Clique em "Conectar WhatsApp" novamente
4. Verifique console do navegador (F12)

### Painel não carrega
1. Verifique se o servidor está rodando
2. Confirme porta 3000 disponível
3. Teste em navegador diferente
4. Limpe cache do navegador

### Bot não responde no grupo
1. Verifique se grupo está selecionado no painel
2. Confirme que bot está no grupo escolhido
3. Teste comando "0" para menu principal
4. Veja logs no painel para diagnóstico

### Erro de permissões
```bash
sudo chown -R $USER:$USER ./data/
chmod -R 755 ./data/
```

## 📈 Monitoramento

### Logs do Sistema
- `data/mensagens_whatsapp.json` - Todas as mensagens
- `data/errors.log` - Erros do sistema
- Console do servidor - Status em tempo real

### Backups
- Backup automático via painel web
- Backups salvos em `data/backups/`
- Inclui usuários, configurações e vídeos

### Performance
- Rate limiting: 30 mensagens/minuto
- Limpeza automática de logs antigos
- Compactação de dados grandes

## 🔄 Atualizações

### Atualizar Baileys
```bash
npm update @whiskeysockets/baileys
```

### Atualizar dependências
```bash
npm update
```

### Reset completo
```bash
npm run clean
npm run setup
```

## 📞 Suporte

- **Desenvolvedor**: Wallysson Studio Dv
- **WhatsApp**: (82) 98171-8851
- **Versão**: 4.0.0
- **GitHub**: [Link do repositório]

## 📄 Licença

MIT License - Veja LICENSE para detalhes.

---

## 🎉 Changelog

### v4.0.0 - Painel Web
- ✅ Interface web completa
- ✅ QR Code visual
- ✅ Seleção de grupos por interface
- ✅ Estatísticas em tempo real
- ✅ Sistema de logs visual
- ✅ Controles administrativos
- ✅ Design responsivo
- ✅ Socket.IO para atualizações em tempo real

### Migração v3.0 → v4.0
- Sistema de terminal → Painel web
- Configuração manual → Interface visual
- Logs em arquivo → Visualização em tempo real
- Comandos CLI → Controles web