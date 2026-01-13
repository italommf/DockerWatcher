param (
    [ValidateSet("development", "production")]
    [string]$Env = "development"
)

$ErrorActionPreference = "Stop"

Write-Host ">>> Deploy - DockerWatcher Backend (Windows)" -ForegroundColor Cyan
Write-Host "Ambiente: $($Env.ToUpper())" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# Nome do container e imagem
$IMAGE_NAME = "dockerwatcher-backend"
$CONTAINER_NAME = "dockerwatcher-backend"

# Diretórios
$SCRIPT_DIR = $PSScriptRoot
if (-not $SCRIPT_DIR) { $SCRIPT_DIR = Get-Location }
$SHARED_DIR = Join-Path (Get-Item $SCRIPT_DIR).Parent.FullName "shared"

# Verificar se o diretório shared existe
if (-not (Test-Path $SHARED_DIR)) {
    Write-Host "Creating shared directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $SHARED_DIR | Out-Null
}

# Verificar se existe arquivo de config correspondente
$TARGET_CONFIG = "config.ini"
if ($Env -eq "production") {
    $TARGET_CONFIG = "config.prod.ini"
} elseif ($Env -eq "development") {
    $TARGET_CONFIG = "config.dev.ini"
}

$CONFIG_PATH = Join-Path $SHARED_DIR $TARGET_CONFIG
if (-not (Test-Path $CONFIG_PATH)) {
    Write-Host "Aviso: shared/$TARGET_CONFIG não encontrado." -ForegroundColor Yellow
    if (Test-Path (Join-Path $SHARED_DIR "config.ini")) {
        Write-Host "Usando config.ini como fallback." -ForegroundColor Cyan
    } else {
        Write-Host "O arquivo será necessário para conexão SSH e MySQL." -ForegroundColor Yellow
    }
}

Write-Host "[OK] Verificações iniciais concluídas" -ForegroundColor Green

# Passo 1: Parar container existente se houver
$existing = docker ps -a -q --filter "name=^/$CONTAINER_NAME$"
if ($existing) {
    Write-Host "`n[!] Parando e removendo container existente..."
    docker stop $CONTAINER_NAME 2>$null | Out-Null
    docker rm $CONTAINER_NAME 2>$null | Out-Null
} else {
    Write-Host "`n[INFO] Nenhum container anterior encontrado. Seguindo para construcao..."
}

# Passo 2: Construir a imagem
Write-Host "`n[DOCKER] Construindo imagem Docker..."
docker build -t $IMAGE_NAME $SCRIPT_DIR

Write-Host "[OK] Imagem construída" -ForegroundColor Green

# Passo 3: Iniciar o container
Write-Host "`n>>> Iniciando container..."
docker run -d `
    --name $CONTAINER_NAME `
    --restart unless-stopped `
    -p 8000:8000 `
    -v "$($SHARED_DIR):/app/shared" `
    -e DOCKER_WATCHER_ENV=$Env `
    $IMAGE_NAME

Write-Host "[OK] Container iniciado" -ForegroundColor Green

# Passo 4: Aguardar serviço iniciar
Write-Host "`n[WAIT] Aguardando serviço iniciar (10s)..."
Start-Sleep -Seconds 10

# Passo 5: Verificar saúde do serviço
Write-Host "`n[CHECK] Verificando saúde do serviço..."
$status = docker ps --filter "name=$CONTAINER_NAME" --format "{{.Status}}"
if ($status -like "*Up*") {
    Write-Host "[OK] Container está rodando" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Container falhou ao iniciar" -ForegroundColor Red
    docker logs $CONTAINER_NAME --tail 50
    exit 1
}

# Passo 6: Mostrar logs recentes
Write-Host "`n[LOGS] Logs recentes:"
docker logs $CONTAINER_NAME --tail 10

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "SUCCESS: Deploy concluído com sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "Acesse a API em:"
Write-Host "  * http://localhost:8000/api/"
Write-Host "  * http://localhost:8000/api/dashboard/full/"

Write-Host "`nComandos úteis:"
Write-Host "  docker logs $CONTAINER_NAME -f     # Ver logs"
Write-Host "  docker stop $CONTAINER_NAME        # Parar"
Write-Host "  docker restart $CONTAINER_NAME     # Reiniciar"
