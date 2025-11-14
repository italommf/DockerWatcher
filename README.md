# Docker Watcher - Aplicativo Desktop

Aplicativo desktop Windows para gerenciar remotamente robôs RPA, jobs Kubernetes, cronjobs e deployments em um servidor Linux via SSH.

## Arquitetura

- **Frontend**: React + Electron (interface moderna)
- **Backend**: Django + Django REST Framework (API REST)
- **Comunicação Remota**: SSH/SFTP para executar kubectl e gerenciar arquivos
- **Banco de Dados**: MySQL remoto
- **Empacotamento**: Electron Builder (executável único .exe)

## Estrutura do Projeto

```
Docker Watcher/
├── backend/                 # Backend Django
│   ├── docker_watcher/      # Configurações Django
│   ├── api/                 # API REST
│   ├── services/            # Serviços (SSH, K8s, DB, Watcher)
│   └── config/              # Configurações
├── Frontend/                # Frontend React + Electron
│   ├── src/                 # Código React
│   ├── electron/            # Electron main process
│   └── public/              # Arquivos estáticos
├── shared/                  # Arquivos compartilhados
│   └── config.ini           # Configurações (SSH, MySQL, paths)
├── requirements.txt         # Dependências Python
└── README.md
```

## Instalação

### Desenvolvimento

1. **Backend:**
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
```

2. **Frontend:**
```bash
cd Frontend
npm install
```

3. **Configurar `shared/config.ini`:**
```ini
[SSH]
host = 192.168.1.36
port = 22
username = rpa_user
use_key = true
key_path = path/to/key
password = 

[MySQL]
host = 192.168.1.36
port = 3306
user = rpa
password = sua_senha
database = bwav4

[PATHS]
rpa_config_path = /caminho/absoluto/rpa_config
cronjobs_path = /caminho/absoluto/cronjobs
deployments_path = /caminho/absoluto/deployments

[API]
port = 8000
host = 127.0.0.1
```

4. **Rodar:**

Backend:
```bash
cd backend
python run_server.py
```

Frontend (em outro terminal):
```bash
cd Frontend
npm run dev
```

## Funcionalidades

### Backend Django

- **Jobs**: Listar, criar, deletar jobs Kubernetes
- **RPAs**: Gerenciar RPAs (criar, editar, deletar, standby/ativar)
- **Cronjobs**: Gerenciar cronjobs (criar, deletar, executar manualmente, suspender/reativar)
- **Deployments**: Gerenciar deployments Kubernetes
- **Pods**: Listar pods, obter logs, deletar pods
- **Executions**: Listar execuções pendentes do banco de dados
- **Watcher**: Loop automático em background que verifica execuções e cria jobs

### Frontend React

- **Dashboard**: Estatísticas gerais (jobs rodando, execuções pendentes, erros)
- **Jobs**: Lista de jobs com status detalhado
- **RPAs**: Gerenciar RPAs (criar, editar, standby/ativar)
- **Cronjobs**: Gerenciar cronjobs (criar, executar manualmente, suspender/reativar)
- **Deployments**: Gerenciar deployments

## Build

### Gerar Executável

```bash
cd Frontend
npm run package
```

O executável será gerado em `Frontend/out/` ou `Frontend/dist/`.

## Tecnologias

### Frontend
- React 18
- Vite
- Material-UI
- Axios
- Electron
- electron-builder

### Backend
- Django 4.2
- Django REST Framework
- Paramiko (SSH)
- mysql-connector-python
- PyYAML

## Requisitos

- Python 3.8+
- Node.js 18+
- Acesso SSH ao servidor Linux com kubectl instalado
- MySQL remoto acessível
- Credenciais SSH (chave ou senha)

## Desenvolvimento

### API Endpoints

- `GET /api/jobs/` - Lista jobs
- `POST /api/jobs/` - Cria job manualmente
- `DELETE /api/jobs/{name}/` - Deleta job
- `GET /api/jobs/status/` - Resumo de status por RPA
- `GET /api/rpas/` - Lista RPAs
- `POST /api/rpas/` - Cria RPA
- `PUT /api/rpas/{name}/` - Atualiza RPA
- `DELETE /api/rpas/{name}/` - Deleta RPA
- `POST /api/rpas/{name}/standby/` - Move para standby
- `POST /api/rpas/{name}/activate/` - Ativa de standby
- `GET /api/cronjobs/` - Lista cronjobs
- `POST /api/cronjobs/` - Cria cronjob
- `POST /api/cronjobs/{name}/run_now/` - Executa cronjob manualmente
- `POST /api/cronjobs/{name}/standby/` - Suspende cronjob
- `POST /api/cronjobs/{name}/activate/` - Reativa cronjob
- `GET /api/executions/` - Lista execuções pendentes
- `GET /api/pods/` - Lista pods
- `GET /api/pods/{name}/logs/` - Obtém logs de pod
- `GET /api/connection/status/` - Status de conexão SSH/MySQL

## Notas

- O watcher roda automaticamente em background quando o backend é iniciado
- Todas as operações são executadas remotamente via SSH
- Os arquivos de configuração (JSON/YAML) são gerenciados via SFTP no servidor Linux
- O Electron inicia o backend Django automaticamente quando o app é executado
