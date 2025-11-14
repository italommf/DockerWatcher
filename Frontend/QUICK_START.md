# Quick Start - Como Rodar o Docker Watcher

## Pré-requisitos

- **Node.js 18+** instalado
- **Python 3.8+** instalado
- **Dependências Python** do backend instaladas
- **Arquivo de configuração** `shared/config.ini` configurado

## Passo a Passo

### 1. Instalar Dependências do Backend (se ainda não fez)

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
```

### 2. Configurar `shared/config.ini`

Certifique-se de que o arquivo `shared/config.ini` está configurado com suas credenciais:

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
```

### 3. Instalar Dependências do Frontend

```bash
cd Frontend
npm install
```

### 4. Rodar a Aplicação

#### Opção 1: Rodar Tudo Junto (Recomendado)

Em um único terminal:

```bash
cd Frontend
npm run dev
```

Isso irá:
- ✅ Iniciar o Vite (React) na porta 5173
- ✅ Aguardar o React iniciar
- ✅ Abrir o Electron automaticamente
- ✅ O Electron tentará iniciar o backend Django automaticamente

#### Opção 2: Rodar Separadamente (Mais Controle)

**Terminal 1 - Backend Django:**
```bash
cd backend
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

## Verificar se Está Funcionando

1. **Backend Django**: Deve estar rodando em `http://127.0.0.1:8000`
2. **React**: Deve estar rodando em `http://localhost:5173`
3. **Electron**: Deve abrir uma janela automaticamente

## Troubleshooting

### Backend não inicia
- ✅ Verifique se o Python está instalado: `python --version`
- ✅ Verifique se as dependências estão instaladas: `pip list`
- ✅ Verifique o arquivo `shared/config.ini`
- ✅ Verifique se a porta 8000 está livre

### Frontend não conecta ao backend
- ✅ Certifique-se que o backend está rodando em `http://127.0.0.1:8000`
- ✅ Verifique os logs no console do Electron (DevTools)
- ✅ Verifique se há erros de CORS no console

### Electron não abre
- ✅ Verifique se o React está rodando em `http://localhost:5173`
- ✅ Verifique os logs no terminal onde rodou `npm run dev`
- ✅ Certifique-se que a porta 5173 está livre

### Erro ao instalar dependências
- ✅ Certifique-se que o Node.js 18+ está instalado: `node --version`
- ✅ Tente limpar o cache: `npm cache clean --force`
- ✅ Delete `node_modules` e `package-lock.json` e rode `npm install` novamente

## Comandos Úteis

```bash
# Limpar cache do npm
npm cache clean --force

# Reinstalar dependências
rm -rf node_modules package-lock.json
npm install

# Ver versão do Node.js
node --version

# Ver versão do Python
python --version

# Ver portas em uso (Windows PowerShell)
netstat -ano | findstr :8000
netstat -ano | findstr :5173
```

## Build para Produção

Para gerar um executável (.exe):

```bash
cd Frontend
npm run package
```

O executável será gerado em `Frontend/out/` ou `Frontend/dist/`.
