#!/bin/bash
# =============================================================================
# DockerWatcher - Script de Deploy para Ambiente de DESENVOLVIMENTO
# =============================================================================
# Uso: ./deploy-dev.sh
# =============================================================================

set -e  # Parar em caso de erro

# Configurações
REPO_URL="https://github.com/SEU_USUARIO/DockerWatcher.git"
APP_DIR="/opt/dockerwatcher-dev"
BRANCH="develop"
VENV_DIR="$APP_DIR/venv"
USER="bwa"
SERVICE_NAME="dockerwatcher-dev"
CONFIG_FILE="config.dev.ini"
PORT=8001

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN} DockerWatcher - Deploy DEV          ${NC}"
echo -e "${GREEN}======================================${NC}"

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Execute como root (sudo)${NC}"
    exit 1
fi

# 1. Instalar dependências do sistema
echo -e "${YELLOW}[1/7] Instalando dependências do sistema...${NC}"
apt-get update
apt-get install -y python3 python3-pip python3-venv git

# 2. Criar diretório e clonar/atualizar repositório
echo -e "${YELLOW}[2/7] Configurando repositório...${NC}"
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git fetch origin
    git checkout $BRANCH
    git pull origin $BRANCH
else
    git clone -b $BRANCH "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# 3. Criar/atualizar ambiente virtual
echo -e "${YELLOW}[3/7] Configurando ambiente virtual...${NC}"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn

# 4. Configurar arquivo de configuração
echo -e "${YELLOW}[4/7] Configurando ambiente...${NC}"
if [ -f "$APP_DIR/shared/$CONFIG_FILE" ]; then
    cp "$APP_DIR/shared/$CONFIG_FILE" "$APP_DIR/shared/config.ini"
    echo -e "${GREEN}Usando configuração: $CONFIG_FILE${NC}"
fi

# 5. Criar arquivo de serviço systemd
echo -e "${YELLOW}[5/7] Configurando serviço systemd...${NC}"
cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=DockerWatcher Backend (DEV)
After=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$APP_DIR/backend
Environment="PATH=$VENV_DIR/bin"
Environment="PYTHONPATH=$APP_DIR/backend"
ExecStart=$VENV_DIR/bin/gunicorn \\
    --bind 0.0.0.0:$PORT \\
    --workers 2 \\
    --timeout 120 \\
    --access-logfile /var/log/$SERVICE_NAME-access.log \\
    --error-logfile /var/log/$SERVICE_NAME-error.log \\
    api.wsgi:application

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 6. Ajustar permissões
echo -e "${YELLOW}[6/7] Ajustando permissões...${NC}"
chown -R $USER:$USER "$APP_DIR"
chmod +x "$APP_DIR"/*.sh 2>/dev/null || true

# 7. Iniciar serviço
echo -e "${YELLOW}[7/7] Iniciando serviço...${NC}"
systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

# Verificar status
sleep 2
if systemctl is-active --quiet $SERVICE_NAME; then
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}Deploy DEV concluído com sucesso!${NC}"
    echo -e "${GREEN}Serviço: $SERVICE_NAME${NC}"
    echo -e "${GREEN}Porta: $PORT${NC}"
    echo -e "${GREEN}======================================${NC}"
    systemctl status $SERVICE_NAME --no-pager
else
    echo -e "${RED}Erro ao iniciar serviço${NC}"
    journalctl -u $SERVICE_NAME -n 20 --no-pager
    exit 1
fi
