# Docker Watcher - Frontend React + Electron

Frontend do Docker Watcher construído com React e Electron.

## Tecnologias

- **React 18** - Biblioteca UI
- **Vite** - Build tool (rápido)
- **Material-UI** - Componentes UI modernos
- **Axios** - Cliente HTTP
- **Electron** - Desktop app
- **electron-builder** - Packaging
- **notistack** - Notificações toast

## Instalação

```bash
cd Frontend
npm install
```

## Desenvolvimento

### Opção 1: Rodar tudo junto (recomendado)

```bash
npm run dev
```

Isso irá:
- Iniciar o Vite (React) na porta 5173
- Aguardar o React iniciar
- Abrir o Electron automaticamente
- O Electron tentará iniciar o backend Django automaticamente

### Opção 2: Rodar separadamente

**Terminal 1 - Backend Django:**
```bash
cd ../backend
python run_server.py
```

**Terminal 2 - React:**
```bash
cd Frontend
npm run dev:react
```

**Terminal 3 - Electron:**
```bash
cd Frontend
npm run dev:electron
```

## Build

```bash
# Build do React
npm run build

# Build do Electron (gerar .exe)
npm run build:electron

# Build completo
npm run package
```

O executável será gerado em `Frontend/out/` ou `Frontend/dist/`.

## Estrutura

```
Frontend/
├── src/
│   ├── components/
│   │   └── Layout/          # Layout, Sidebar, ConnectionStatus
│   ├── pages/               # Dashboard, Jobs, RPAs, Cronjobs, Deployments
│   ├── services/
│   │   └── api.js          # Cliente HTTP para Django API
│   ├── App.jsx             # App principal com tema Material-UI
│   └── main.jsx            # Entry point React
├── electron/
│   ├── main.js             # Processo principal Electron
│   └── preload.js          # Preload script
├── public/                 # Arquivos estáticos
├── package.json            # Dependências e scripts
└── vite.config.js          # Configuração Vite
```

## Funcionalidades

- ✅ Interface moderna com Material-UI
- ✅ Sidebar lateral com navegação
- ✅ Dashboard com estatísticas
- ✅ Jobs: Lista e controle de jobs
- ✅ RPAs: Gerenciar RPAs (standby/ativar, editar, deletar)
- ✅ Cronjobs: Gerenciar cronjobs (executar agora, suspender/ativar)
- ✅ Deployments: Gerenciar deployments
- ✅ Notificações toast para feedback
- ✅ Status de conexão SSH/MySQL em tempo real
- ✅ Requisições assíncronas (não travam a interface)
- ✅ Tratamento de erros robusto

## Configuração

O frontend se conecta ao backend Django em `http://127.0.0.1:8000` por padrão.

Para alterar, edite `src/services/api.js`:

```javascript
const API_BASE_URL = 'http://127.0.0.1:8000'
```

## Notas

- O Electron inicia o backend Django automaticamente quando o app é executado
- Todos os erros são exibidos como notificações toast (não travam a interface)
- O status de conexão é verificado automaticamente a cada 5 segundos
- Requisições têm timeout de 5 segundos para evitar travamentos
