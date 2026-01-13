#!/bin/bash

# Script de Deploy - DockerWatcher Backend
# Executa o deploy do backend em container Docker com Gunicorn

set -e  # Encerra o script em caso de erro

echo "🚀 Deploy - DockerWatcher Backend"
echo "=================================="

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # Sem cor

# Nome do container e imagem
IMAGE_NAME="dockerwatcher-backend"
CONTAINER_NAME="dockerwatcher-backend"

# Diretório do script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SHARED_DIR="${SCRIPT_DIR}/../shared"

# Verificar se o diretório shared existe
if [ ! -d "$SHARED_DIR" ]; then
    echo -e "${YELLOW}Criando diretório shared...${NC}"
    mkdir -p "$SHARED_DIR"
fi

# Definir ambiente (default: development)
ENV=${1:-development}
if [ "$ENV" != "production" ] && [ "$ENV" != "development" ]; then
    echo -e "${RED}Erro: Ambiente inválido. Use 'development' ou 'production'.${NC}"
    exit 1
fi

echo -e "Ambiente selecionado: ${YELLOW}${ENV}${NC}"

# Verificar se existe arquivo de config correspondente
CONFIG_FILE="config.ini"
if [ "$ENV" == "production" ]; then
    CONFIG_FILE="config.prod.ini"
elif [ "$ENV" == "development" ]; then
    CONFIG_FILE="config.dev.ini"
fi

if [ ! -f "$SHARED_DIR/$CONFIG_FILE" ]; then
    echo -e "${YELLOW}Aviso: $SHARED_DIR/$CONFIG_FILE não encontrado.${NC}"
    if [ -f "$SHARED_DIR/config.ini" ]; then
        echo "Usando config.ini como fallback."
    else
        echo "O arquivo será necessário para conexão SSH e MySQL."
    fi
fi

echo -e "${GREEN}✓${NC} Verificações iniciais concluídas"

# Passo 1: Parar container existente se houver
echo ""
echo "🛑 Parando container existente..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Passo 2: Construir a imagem
echo ""
echo "🐳 Construindo imagem Docker..."
docker build -t $IMAGE_NAME "$SCRIPT_DIR"

echo -e "${GREEN}✓${NC} Imagem construída"

# Passo 3: Iniciar o container
echo ""
echo "🚀 Iniciando container ($ENV)..."
docker run -d \
    --name $CONTAINER_NAME \
    --restart unless-stopped \
    -p 8000:8000 \
    -v "$SHARED_DIR:/app/shared" \
    -e DOCKER_WATCHER_ENV=$ENV \
    $IMAGE_NAME

echo -e "${GREEN}✓${NC} Container iniciado"

# Passo 4: Aguardar serviço iniciar
echo ""
echo "⏳ Aguardando serviço iniciar..."
sleep 10

# Passo 5: Verificar saúde do serviço
echo ""
echo "🏥 Verificando saúde do serviço..."

if docker ps | grep -q $CONTAINER_NAME; then
    echo -e "${GREEN}✓${NC} Container está rodando"
else
    echo -e "${RED}⨯${NC} Container falhou ao iniciar"
    docker logs $CONTAINER_NAME --tail=50
    exit 1
fi

# Passo 6: Testar endpoint
echo ""
echo "🔍 Testando endpoint de saúde..."
if curl -s http://localhost:8000/api/connection/status/ > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend respondendo corretamente"
else
    echo -e "${YELLOW}Aviso: Backend ainda inicializando...${NC}"
fi

# Mostrar logs recentes
echo ""
echo "📋 Logs recentes:"
docker logs $CONTAINER_NAME --tail=10

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 Deploy concluído com sucesso!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Acesse a API em:"
echo "  • http://localhost:8000/api/"
echo "  • http://localhost:8000/api/dashboard/full/"
echo ""
echo "Comandos úteis:"
echo "  docker logs $CONTAINER_NAME -f     # Ver logs"
echo "  docker stop $CONTAINER_NAME        # Parar"
echo "  docker restart $CONTAINER_NAME     # Reiniciar"
echo ""
