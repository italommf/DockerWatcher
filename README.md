# Docker Watcher

Aplicativo desktop para gerenciar remotamente robôs RPA, jobs Kubernetes, cronjobs e deployments em um servidor Linux via SSH.

## 📋 Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Tutorial de Uso](#tutorial-de-uso)
- [Desenvolvimento](#desenvolvimento)
- [Build](#build)
- [Tecnologias](#tecnologias)

## 🎯 Sobre o Projeto

O Docker Watcher é uma aplicação desktop desenvolvida para facilitar o gerenciamento de automações RPA (Robotic Process Automation) executadas em um cluster Kubernetes. A aplicação permite monitorar e controlar remotamente:

- **Robôs RPA**: Gerenciar configurações, ativar/desativar e monitorar execuções
- **Jobs Kubernetes**: Visualizar e gerenciar jobs em execução
- **Cronjobs**: Criar e gerenciar tarefas agendadas
- **Deployments**: Gerenciar deployments Kubernetes
- **Recursos da VM**: Monitorar CPU, memória e armazenamento em tempo real

## 🏗️ Arquitetura

```
Docker Watcher/
├── backend/                 # Backend Django
│   ├── docker_watcher/      # Configurações Django
│   ├── api/                 # API REST
│   │   ├── views/           # ViewSets e endpoints
│   │   ├── models.py        # Modelos do banco de dados
│   │   └── serializers/     # Serializers da API
│   ├── services/            # Serviços de negócio
│   │   ├── kubernetes_service.py    # Operações Kubernetes
│   │   ├── ssh_service.py           # Conexão SSH
│   │   ├── database_service.py      # Conexão MySQL
│   │   ├── cache_service.py         # Sistema de cache
│   │   ├── polling_service.py       # Polling de dados
│   │   └── vm_resource_service.py   # Métricas da VM
│   └── config/              # Configurações
├── Frontend/                # Frontend React + Electron
│   ├── src/
│   │   ├── pages/           # Páginas da aplicação
│   │   ├── components/      # Componentes reutilizáveis
│   │   ├── context/         # Context API (cache)
│   │   └── services/        # Serviços de API
│   ├── electron/            # Electron main process
│   └── public/              # Arquivos estáticos
├── shared/                  # Arquivos compartilhados
│   └── config.ini           # Configurações (SSH, MySQL, paths)
├── requirements.txt         # Dependências Python
└── README.md
```

### Fluxo de Dados

1. **Frontend (React)**: Interface do usuário que consome a API REST
2. **Backend (Django)**: API REST que processa requisições
3. **Serviços**: Executam operações remotas via SSH
4. **Kubernetes**: Cluster onde os recursos são gerenciados
5. **MySQL**: Banco de dados remoto para execuções pendentes
6. **Cache**: Sistema de cache para otimizar performance

## ✨ Funcionalidades

### Dashboard
- **Estatísticas em tempo real**: Jobs ativos, execuções pendentes, falhas
- **Gráficos de recursos**: Monitoramento de CPU, memória e armazenamento
- **Tabela de robôs em execução**: Lista todos os containers rodando
- **Atualização automática**: Dados atualizados a cada 5 segundos

### Containers Rodando (Jobs)
- Visualização em cards compactos
- Barra de pesquisa para filtrar por nome
- Visualizar logs em tempo real
- Parar instâncias individuais

### RPAs (Robôs)
- Gerenciar configurações de robôs
- Ativar/desativar (standby)
- Monitorar execuções pendentes
- Visualizar instâncias ativas
- Cards com barra de pesquisa

### Cronjobs
- Criar cronjobs agendados
- Executar manualmente
- Suspender/reativar
- Visualizar histórico de execuções
- Cards com barra de pesquisa

### Deployments
- Gerenciar deployments Kubernetes
- Monitorar réplicas
- Cards com barra de pesquisa

## 🚀 Instalação

### Pré-requisitos

- **Python 3.8+**
- **Node.js 18+**
- **Acesso SSH** ao servidor Linux com kubectl instalado
- **MySQL remoto** acessível
- **Credenciais SSH** (chave privada ou senha)

### Instalação do Backend

```bash
# Navegar para o diretório do backend
cd backend

# Instalar dependências Python
pip install -r requirements.txt

# Executar migrações do banco de dados
python manage.py migrate

# (Opcional) Criar superusuário para admin Django
python manage.py createsuperuser
```

### Instalação do Frontend

```bash
# Navegar para o diretório do frontend
cd Frontend

# Instalar dependências Node.js
npm install
```

## ⚙️ Configuração

### Arquivo `shared/config.ini`

Crie ou edite o arquivo `shared/config.ini` com suas configurações:

```ini
[SSH]
# Endereço IP ou hostname do servidor Linux
host = seu_servidor.com
# Porta SSH (padrão: 22)
port = 22
# Usuário SSH
username = seu_usuario
# Usar chave privada (true) ou senha (false)
use_key = true
# Caminho para a chave privada SSH (se use_key = true)
key_path = C:/caminho/para/sua/chave/id_rsa
# Senha SSH (se use_key = false)
password = 

[MySQL]
# Endereço do servidor MySQL
host = seu_servidor.com
# Porta MySQL (padrão: 3306)
port = 3306
# Usuário MySQL
user = seu_usuario_mysql
# Senha MySQL
password = sua_senha_mysql
# Nome do banco de dados
database = nome_do_banco

[PATHS]
# Caminho absoluto no servidor onde ficam os arquivos de configuração dos RPAs
rpa_config_path = /caminho/absoluto/rpa_config
# Caminho absoluto no servidor onde ficam os arquivos YAML dos cronjobs
cronjobs_path = /caminho/absoluto/cronjobs
# Caminho absoluto no servidor onde ficam os arquivos YAML dos deployments
deployments_path = /caminho/absoluto/deployments

[API]
# Porta onde a API Django será executada
port = 8000
# Host da API (127.0.0.1 para localhost)
host = 127.0.0.1
```

### Configuração SSH

#### Opção 1: Usando Chave Privada (Recomendado)

1. Gere um par de chaves SSH (se ainda não tiver):
```bash
ssh-keygen -t rsa -b 4096
```

2. Copie a chave pública para o servidor:
```bash
ssh-copy-id usuario@servidor.com
```

3. Configure no `config.ini`:
```ini
[SSH]
use_key = true
key_path = C:/caminho/para/sua/chave/id_rsa
```

#### Opção 2: Usando Senha

```ini
[SSH]
use_key = false
password = sua_senha_ssh
```

## 📖 Tutorial de Uso

### 1. Iniciando a Aplicação

#### Modo Desenvolvimento

**Terminal 1 - Backend:**
```bash
cd backend
python manage.py runserver 127.0.0.1:8000
```

**Terminal 2 - Frontend:**
```bash
cd Frontend
npm run dev
```

A aplicação estará disponível em `http://localhost:5173` (ou a porta que o Vite indicar).

#### Modo Produção (Executável)

```bash
cd Frontend
npm run package
```

O executável será gerado em `Frontend/out/` ou `Frontend/dist/`.

### 2. Primeira Conexão

1. Abra a aplicação
2. A aplicação tentará conectar automaticamente ao servidor
3. Verifique o status da conexão no canto superior direito
4. Se houver erro, verifique:
   - Credenciais SSH no `config.ini`
   - Acessibilidade do servidor
   - Permissões da chave SSH

### 3. Navegando pelo Dashboard

O **Dashboard** é a página inicial e mostra:

- **Cards de Estatísticas**: 
  - Instâncias Ativas
  - Execuções Pendentes
  - Falhas de Containers
  - RPAs Ativos
  - Cronjobs Ativos

- **Gráficos de Recursos da VM**:
  - Memória RAM (GB)
  - Armazenamento (GB)
  - CPU (%)
  - Histórico dos últimos 10 pontos

- **Tabela de Robôs em Execução**: Lista todos os containers ativos

### 4. Gerenciando Containers Rodando

1. Acesse **"Containers Rodando"** no menu lateral
2. Use a **barra de pesquisa** para filtrar por nome
3. Para cada container você pode:
   - **Ver Logs**: Visualizar logs em tempo real
   - **Parar Instância**: Parar o container atual
   - **Parar e Inativar**: Parar e desativar o recurso (RPA/Cronjob/Deployment)

### 5. Gerenciando RPAs

1. Acesse **"RPAs"** no menu lateral
2. Use a **barra de pesquisa** para encontrar um RPA específico
3. **Criar RPA**:
   - Clique em "Adicionar RPA"
   - Preencha os dados (nome, docker tag, limites, etc.)
   - Salve

4. **Gerenciar RPA existente**:
   - **Standby/Ativar**: Use o switch para pausar ou ativar
   - **Editar**: Modificar configurações
   - **Deletar**: Remover o RPA

### 6. Gerenciando Cronjobs

1. Acesse **"Cronjobs"** no menu lateral
2. Use a **barra de pesquisa** para filtrar
3. **Criar Cronjob**:
   - Clique em "Adicionar Cronjob"
   - Preencha:
     - **Nome**: Nome único do cronjob
     - **Schedule**: Expressão Cron (ex: `0 18 1 * *` = dia 1 de cada mês às 18:00)
     - **Timezone**: Fuso horário (padrão: America/Sao_Paulo)
     - **Nome do Robô**: Nome do robô que será executado
     - **Docker Image**: Imagem Docker completa
     - **Limite de Memória**: Ex: 256Mi, 512Mi, 1Gi
   - Salve

4. **Gerenciar Cronjob existente**:
   - **Executar Agora**: Executa manualmente
   - **Suspender/Reativar**: Use o switch
   - **Editar**: Modificar configurações
   - **Deletar**: Remover o cronjob

> **Nota**: Os cronjobs são criados diretamente no Kubernetes e continuam funcionando mesmo com a aplicação fechada.

### 7. Gerenciando Deployments

1. Acesse **"Deployments"** no menu lateral
2. Use a **barra de pesquisa** para filtrar
3. Visualize réplicas e status
4. Edite ou delete deployments conforme necessário

### 8. Visualizando Logs

1. Em **"Containers Rodando"**, clique em **"Ver Logs"**
2. Ajuste o número de linhas (padrão: 100)
3. Clique em **"Atualizar Logs"** para recarregar
4. Os logs são exibidos em tempo real

### 9. Monitoramento de Recursos

No **Dashboard**, os gráficos de recursos são atualizados automaticamente:

- **Linhas coloridas**: 
  - 🟢 Verde: Uso < 80%
  - 🟡 Amarelo: Uso entre 80-90%
  - 🔴 Vermelho: Uso > 90%

- **Histórico**: Últimos 10 pontos de coleta
- **Hover**: Passe o mouse sobre o gráfico para ver valores detalhados

## 🔧 Desenvolvimento

### Estrutura da API

#### Endpoints Principais

**Jobs:**
- `GET /api/jobs/` - Lista jobs ativos
- `POST /api/jobs/` - Cria job manualmente
- `DELETE /api/jobs/{name}/` - Deleta job
- `GET /api/jobs/status/` - Status por RPA

**RPAs:**
- `GET /api/rpas/` - Lista RPAs
- `POST /api/rpas/` - Cria RPA
- `PUT /api/rpas/{name}/` - Atualiza RPA
- `DELETE /api/rpas/{name}/` - Deleta RPA
- `POST /api/rpas/{name}/standby/` - Move para standby
- `POST /api/rpas/{name}/activate/` - Ativa de standby

**Cronjobs:**
- `GET /api/cronjobs/` - Lista cronjobs
- `POST /api/cronjobs/` - Cria cronjob no Kubernetes
- `DELETE /api/cronjobs/{name}/` - Deleta cronjob
- `POST /api/cronjobs/{name}/run_now/` - Executa manualmente
- `POST /api/cronjobs/{name}/standby/` - Suspende cronjob
- `POST /api/cronjobs/{name}/activate/` - Reativa cronjob

**Deployments:**
- `GET /api/deployments/` - Lista deployments
- `POST /api/deployments/` - Cria deployment
- `DELETE /api/deployments/{name}/` - Deleta deployment

**Pods:**
- `GET /api/pods/` - Lista pods
- `GET /api/pods/{name}/logs/` - Obtém logs de pod

**Recursos:**
- `GET /api/resources/vm/` - Recursos da VM (CPU, RAM, Storage)

**Conexão:**
- `GET /api/connection/status/` - Status de conexão SSH/MySQL
- `GET /api/connection/ssh/` - Testa conexão SSH
- `GET /api/connection/mysql/` - Testa conexão MySQL
- `POST /api/connection/reload/` - Recarrega serviços

### Sistema de Cache

A aplicação utiliza um sistema de cache em múltiplas camadas:

1. **Cache do Backend**: Armazena dados do Kubernetes e MySQL
2. **Cache do Frontend**: Context API para dados do dashboard
3. **Polling Service**: Atualiza cache automaticamente a cada 5 segundos

### Serviços em Background

- **PollingService**: Atualiza dados do Kubernetes e MySQL periodicamente
- **WatcherService**: Monitora execuções pendentes e cria jobs automaticamente

## 📦 Build Standalone (100% Autônomo)

### 🎯 Build Completo Standalone

O Docker Watcher pode ser empacotado como um executável **100% standalone** que **não requer Python instalado** no sistema de destino.

#### Pré-requisitos para Build

1. **Python 3.8+** instalado na máquina de build
2. **Node.js 18+** instalado
3. **PyInstaller** (será instalado automaticamente se necessário)

#### Processo de Build

**Opção 1: Script Automatizado (Recomendado)**

**Windows:**
```bash
build_standalone.bat
```

**Linux/Mac:**
```bash
chmod +x build_standalone.sh
./build_standalone.sh
```

**Opção 2: Manual (Passo a Passo)**

1. **Build do Backend Standalone:**
```bash
cd backend
python build_standalone.py
```

Este comando irá:
- Instalar PyInstaller (se necessário)
- Criar um executável standalone do backend Django
- Copiar o executável para `Frontend/build/backend/`

2. **Build do Frontend React:**
```bash
cd Frontend
npm run build
```

3. **Empacotar Electron:**
```bash
cd Frontend
npm run build:electron
```

### 📦 Resultado do Build

O executável será gerado em:
- **Windows**: `Frontend/dist/Docker Watcher X.X.X.exe` (executável único portátil)
- **Pasta de recursos**: Ao lado do .exe será criada uma pasta `resources/` (necessária para o Electron)
- **Backend**: Pasta `backend/` ao lado do .exe com o executável do backend Django

**Nota**: O formato "portable" cria um único `.exe` que pode ser executado diretamente sem instalação. A pasta `resources/` é criada automaticamente e é necessária para o funcionamento do Electron. O backend é iniciado automaticamente quando você executa o `.exe`.

### ✅ Executável 100% Standalone

O executável gerado é **completamente autônomo**:

- ✅ **Não requer Python** instalado no sistema
- ✅ **Não requer dependências** Python instaladas
- ✅ **Inclui tudo** necessário para funcionar
- ✅ **Backend Django** empacotado como executável standalone
- ✅ **Frontend React** empacotado como aplicação Electron
- ✅ **Configurações** (`shared/config.ini`) incluídas

### 🚀 Como Funciona

Quando você executa o `.exe`:

1. ✅ O Electron inicia automaticamente
2. ✅ O backend Django standalone é iniciado automaticamente em background
3. ✅ A interface React é carregada
4. ✅ Tudo funciona sem necessidade de Python ou dependências externas

**Nota**: O backend é iniciado como um processo separado. Quando você fecha a aplicação, o backend é encerrado automaticamente.

### 📝 Configuração do Executável

O arquivo `shared/config.ini` é incluído no executável. Você pode:

1. **Configurar antes do build**: Edite `shared/config.ini` antes de executar o build
2. **Configurar após instalação**: O arquivo estará em `resources/app.asar.unpacked/shared/config.ini`

### 🔧 Troubleshooting

**Erro: "Executável do backend não encontrado"**
- Certifique-se de executar `build_standalone.py` antes de empacotar o Electron
- Verifique se o executável está em `Frontend/build/backend/docker-watcher-backend.exe`

**Backend não inicia ou inicia em outro endereço**
1. **Verifique os logs**: O DevTools será aberto automaticamente. Veja o console para logs detalhados
2. **Verifique se o backend foi encontrado**: Os logs mostrarão todos os caminhos testados
3. **Verifique a porta 8000**: Os logs mostrarão se a porta está disponível
4. **Verifique os logs do backend**: Todos os logs do backend aparecerão no console com prefixo `[Backend]`
5. **Teste o backend standalone manualmente**:
   - Vá para `Frontend/dist/win-unpacked/backend/`
   - Execute `docker-watcher-backend.exe` manualmente
   - Veja se há erros
6. **Verifique o config.ini**: Certifique-se de que `shared/config.ini` está configurado corretamente
7. **Verifique se há outras instâncias rodando**: Feche todas as instâncias do Docker Watcher

**Erro: "PyInstaller não encontrado"**
- O script tentará instalar automaticamente
- Ou instale manualmente: `pip install pyinstaller`

**Executável muito grande**
- Isso é normal! O executável inclui Python e todas as dependências
- Tamanho esperado: ~100-200MB (dependendo das dependências)

**Como ver os logs em produção**
- O DevTools será aberto automaticamente quando você executar o .exe
- Todos os logs aparecerão no console do DevTools
- Procure por mensagens com prefixo `[Backend]` para ver os logs do backend Django

## 🛠️ Tecnologias

### Frontend
- **React 18**: Biblioteca UI
- **Vite**: Build tool e dev server
- **Material-UI (MUI)**: Componentes de interface
- **Axios**: Cliente HTTP
- **Electron**: Framework desktop
- **electron-builder**: Empacotamento

### Backend
- **Django 4.2**: Framework web
- **Django REST Framework**: API REST
- **Paramiko**: Cliente SSH
- **mysql-connector-python**: Conexão MySQL
- **PyYAML**: Processamento YAML

## 📝 Notas Importantes

- ⚠️ **Cronjobs**: São criados diretamente no Kubernetes e continuam funcionando mesmo com a aplicação fechada
- 🔄 **Atualização Automática**: Dados são atualizados a cada 5 segundos em background
- 🔐 **Segurança**: Mantenha o arquivo `config.ini` seguro e não o commite no git
- 📊 **Cache**: O sistema usa cache para otimizar performance e reduzir chamadas ao servidor
- 🚀 **Performance**: A aplicação foi otimizada para trabalhar com grandes volumes de dados

## 🤝 Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto é privado e de uso interno.

## 👥 Autores

- **Equipe de Desenvolvimento**

---

**Última atualização**: 2025-01-18
