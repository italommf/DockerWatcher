# Pasta Shared - Configurações Compartilhadas

Esta pasta contém arquivos de configuração compartilhados entre backend e frontend.

## 📁 Arquivos

### `config.ini`, `config.dev.ini`, `config.prod.ini` (NÃO versionados)
Arquivos de configuração com **credenciais reais** (SSH e MySQL).
- `config.dev.ini`: Usado quando `DOCKER_WATCHER_ENV=development` (Padrão)
- `config.prod.ini`: Usado quando `DOCKER_WATCHER_ENV=production`
- `config.ini`: Fallback geral se o arquivo específico do ambiente não existir.

Estes arquivos **NÃO devem ser commitados no git** pois contêm senhas.

### `config.ini.example` (Versionado)
Arquivo de exemplo que serve como template. 
Use-o para criar seus arquivos de config:

```bash
cp config.ini.example config.dev.ini
cp config.ini.example config.prod.ini
```

## 🔒 Segurança

Os arquivos `config.*.ini` estão listados no `.gitignore` e nunca serão versionados.
Apenas o `config.ini.example` (sem senhas) é versionado no git.

## 📝 Estrutura do config.ini

```ini
[ssh]
host = IP_DO_SERVIDOR_KUBERNETES
port = 22
username = seu_usuario
password = sua_senha

[mysql]
host = IP_DO_MYSQL
port = 3306
user = usuario_mysql
password = senha_mysql
database = bwav4
```

## 🚀 Como usar múltiplos ambientes

O sistema seleciona o arquivo baseado na variável de ambiente `DOCKER_WATCHER_ENV`.

### Local / Docker Compose
No `docker-compose.yml`, a variável `DOCKER_WATCHER_ENV` define qual arquivo será lido.

### Scripts de Deploy
Os scripts de deploy aceitam o ambiente como argumento:

**Linux:**
```bash
./deploy.sh production   # Usa config.prod.ini
./deploy.sh development  # Usa config.dev.ini (padrão)
```

**Windows (PowerShell):**
```powershell
.\deploy.ps1 -Env production    # Usa config.prod.ini
.\deploy.ps1 -Env development   # Usa config.dev.ini (padrão)
```

## 🚀 Deploy em novo servidor

1. Criar a pasta shared (se não existir)
2. Copiar `config.ini.example` para `config.prod.ini` (ou `config.dev.ini`)
3. Editar o arquivo com as credenciais do ambiente local/servidor
