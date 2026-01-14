#!/bin/bash
# =============================================================================
# DockerWatcher - Instalação do Prometheus no Kubernetes
# =============================================================================
# Uso: ./install-prometheus.sh
# =============================================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN} Instalando Prometheus no Kubernetes ${NC}"
echo -e "${GREEN}======================================${NC}"

# Verificar se kubectl está disponível
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}kubectl não encontrado${NC}"
    exit 1
fi

# Verificar se helm está instalado
if ! command -v helm &> /dev/null; then
    echo -e "${YELLOW}Helm não encontrado. Instalando...${NC}"
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi

# Adicionar repositório
echo -e "${YELLOW}[1/4] Adicionando repositório Helm...${NC}"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Criar namespace
echo -e "${YELLOW}[2/4] Criando namespace...${NC}"
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Verificar se arquivo values.yaml existe
VALUES_FILE="./prometheus/values.yaml"
if [ ! -f "$VALUES_FILE" ]; then
    echo -e "${YELLOW}Arquivo values.yaml não encontrado, usando configuração padrão${NC}"
    VALUES_FILE=""
fi

# Instalar/atualizar prometheus
echo -e "${YELLOW}[3/4] Instalando kube-prometheus-stack...${NC}"
if [ -n "$VALUES_FILE" ]; then
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        -f "$VALUES_FILE" \
        --wait
else
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --set alertmanager.enabled=false \
        --set grafana.enabled=true \
        --set grafana.service.type=NodePort \
        --set grafana.service.nodePort=30091 \
        --set prometheus.service.type=NodePort \
        --set prometheus.service.nodePort=30090 \
        --wait
fi

# Aplicar RBAC do DockerWatcher
echo -e "${YELLOW}[4/4] Aplicando RBAC...${NC}"
if [ -f "./k8s-rbac.yaml" ]; then
    kubectl apply -f ./k8s-rbac.yaml
fi

# Exibir informações
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Prometheus instalado com sucesso!${NC}"
echo -e "${GREEN}======================================${NC}"

# Obter IP do node
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')

echo -e "Prometheus: http://${NODE_IP}:30090"
echo -e "Grafana:    http://${NODE_IP}:30091 (admin/admin123)"
echo ""
echo -e "${YELLOW}Atualize o config.ini com:${NC}"
echo -e "[PROMETHEUS]"
echo -e "url = http://${NODE_IP}:30090"

# Verificar pods
echo ""
echo -e "${YELLOW}Pods no namespace monitoring:${NC}"
kubectl get pods -n monitoring
