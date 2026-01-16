# =============================================================================
# DockerWatcher - Iniciar Prometheus localmente (Windows)
# =============================================================================
# Inicia Prometheus via docker-compose para desenvolvimento local
# =============================================================================

Write-Host "========================================" -ForegroundColor Green
Write-Host " Iniciando Prometheus Local " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Verificar se docker-compose está disponível
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "Docker não encontrado" -ForegroundColor Red
        exit 1
    }
    # Docker Compose V2 usa 'docker compose' em vez de 'docker-compose'
    $DOCKER_COMPOSE_CMD = "docker compose"
} else {
    $DOCKER_COMPOSE_CMD = "docker-compose"
}

# Criar rede se não existir
docker network create docker-watcher-network 2>&1 | Out-Null

# Iniciar Prometheus
Write-Host "Iniciando Prometheus..." -ForegroundColor Yellow
& $DOCKER_COMPOSE_CMD -f docker-compose.prometheus.yml up -d

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Prometheus iniciado!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Prometheus está disponível em:" -ForegroundColor Cyan
Write-Host "  http://localhost:9090" -ForegroundColor White
Write-Host ""
Write-Host "Para ver logs:" -ForegroundColor Yellow
Write-Host "  docker logs -f docker-watcher-prometheus" -ForegroundColor White
Write-Host ""
Write-Host "Para parar:" -ForegroundColor Yellow
Write-Host "  docker-compose -f docker-compose.prometheus.yml down" -ForegroundColor White
