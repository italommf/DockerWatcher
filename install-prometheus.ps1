# =============================================================================
# DockerWatcher - Instalação do Prometheus no Kubernetes (Windows)
# =============================================================================
# Uso: .\install-prometheus.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Green
Write-Host " Instalando Prometheus no Kubernetes " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Verificar se kubectl está disponível
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Host "kubectl não encontrado" -ForegroundColor Red
    exit 1
}

# Verificar se helm está instalado
if (-not (Get-Command helm -ErrorAction SilentlyContinue)) {
    Write-Host "Helm não encontrado. Por favor, instale o Helm primeiro:" -ForegroundColor Yellow
    Write-Host "  winget install Helm.Helm" -ForegroundColor Yellow
    Write-Host "  Ou visite: https://helm.sh/docs/intro/install/" -ForegroundColor Yellow
    exit 1
}

# Adicionar repositório
Write-Host "[1/4] Adicionando repositório Helm..." -ForegroundColor Yellow
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>&1 | Out-Null
helm repo update

# Criar namespace
Write-Host "[2/4] Criando namespace..." -ForegroundColor Yellow
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f | Out-Null

# Verificar se arquivo values.yaml existe
$VALUES_FILE = "./prometheus/values.yaml"
if (-not (Test-Path $VALUES_FILE)) {
    Write-Host "Arquivo values.yaml não encontrado, usando configuração padrão" -ForegroundColor Yellow
    $VALUES_FILE = $null
}

# Instalar/atualizar prometheus
Write-Host "[3/4] Instalando kube-prometheus-stack..." -ForegroundColor Yellow
if ($VALUES_FILE) {
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack `
        --namespace monitoring `
        -f $VALUES_FILE `
        --wait
} else {
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack `
        --namespace monitoring `
        --set alertmanager.enabled=false `
        --set grafana.enabled=true `
        --set grafana.service.type=LoadBalancer `
        --set prometheus.service.type=LoadBalancer `
        --wait
}

# Aplicar RBAC do DockerWatcher
Write-Host "[4/4] Aplicando RBAC..." -ForegroundColor Yellow
if (Test-Path "./k8s-rbac.yaml") {
    kubectl apply -f ./k8s-rbac.yaml
}

# Aguardar serviço estar pronto
Write-Host ""
Write-Host "Aguardando serviço estar pronto..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Obter informações do serviço
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Prometheus instalado com sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Para Docker Desktop, o LoadBalancer geralmente expõe via localhost
$PROMETHEUS_URL = "http://localhost:9090"
if ($env:KUBERNETES_SERVICE_HOST) {
    # Se estiver dentro do cluster, usar o serviço
    $PROMETHEUS_URL = "http://prometheus-prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090"
}

Write-Host ""
Write-Host "Prometheus: $PROMETHEUS_URL" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para verificar o status do serviço:" -ForegroundColor Yellow
Write-Host "  kubectl get svc -n monitoring" -ForegroundColor White
Write-Host ""
Write-Host "Para fazer port-forward (se necessário):" -ForegroundColor Yellow
Write-Host "  kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090" -ForegroundColor White
Write-Host ""
Write-Host "Atualize o config.ini com:" -ForegroundColor Yellow
Write-Host "[PROMETHEUS]" -ForegroundColor White
Write-Host "url = $PROMETHEUS_URL" -ForegroundColor White

# Verificar pods
Write-Host ""
Write-Host "Pods no namespace monitoring:" -ForegroundColor Yellow
kubectl get pods -n monitoring
