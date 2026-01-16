#!/bin/bash
# =============================================================================
# DockerWatcher - Iniciar Prometheus localmente (Linux/Mac)
# =============================================================================
# Inicia Prometheus via docker-compose para desenvolvimento local
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN} Iniciando Prometheus Local ${NC}"
echo -e "${GREEN}======================================${NC}"

# Verificar se docker-compose está disponível
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose não encontrado${NC}"
    exit 1
fi

# Usar docker compose V2 se disponível, senão docker-compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
else
    DOCKER_COMPOSE_CMD="docker-compose"
fi

# Criar rede se não existir
docker network create docker-watcher-network 2>&1 | true

# Iniciar Prometheus
echo -e "${YELLOW}Iniciando Prometheus...${NC}"
$DOCKER_COMPOSE_CMD -f docker-compose.prometheus.yml up -d

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Prometheus iniciado!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "Prometheus está disponível em:"
echo -e "  ${GREEN}http://localhost:9090${NC}"
echo ""
echo -e "${YELLOW}Para ver logs:${NC}"
echo -e "  docker logs -f docker-watcher-prometheus"
echo ""
echo -e "${YELLOW}Para parar:${NC}"
echo -e "  $DOCKER_COMPOSE_CMD -f docker-compose.prometheus.yml down"
