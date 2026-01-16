# Como Instalar o Prometheus

## Windows (PowerShell)

### Opção 1: Via PowerShell (Recomendado)

1. Abra o **PowerShell** (não o Prompt de Comando)
2. Navegue até a pasta do projeto:
   ```powershell
   cd "D:\Git\Projetos Pessoais\DockerWatcher"
   ```
3. Execute o script:
   ```powershell
   .\install-prometheus.ps1
   ```

**Se aparecer erro de política de execução**, execute primeiro:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Opção 2: Instalar no Kubernetes (via Helm)

Se preferir instalar manualmente:

```powershell
# Adicionar repositório Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Criar namespace
kubectl create namespace monitoring

# Instalar Prometheus
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack `
    --namespace monitoring `
    -f ./prometheus/values.yaml `
    --wait
```

### Opção 3: Rodar localmente (Docker Compose)

Para desenvolvimento rápido sem Kubernetes:

```powershell
# Criar rede
docker network create docker-watcher-network

# Iniciar Prometheus
docker-compose -f docker-compose.prometheus.yml up -d
```

## Verificar Instalação

Após instalar, verifique:

```powershell
# Se instalado no Kubernetes
kubectl get pods -n monitoring
kubectl get svc -n monitoring

# Se rodando via Docker Compose
docker ps | findstr prometheus
```

Acesse: **http://localhost:9090**

## Atualizar Config

Certifique-se que `shared/config.ini` tem:

```ini
[PROMETHEUS]
url = http://localhost:9090
```
