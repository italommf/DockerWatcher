import logging
import re
import json
from typing import Dict, List

logger = logging.getLogger(__name__)


def fetch_pod_resources(ssh_service) -> List[Dict]:
    """
    Coleta métricas de recursos dos pods ativos via kubectl top pods e kubectl get pods.
    Inclui informações de recursos alocados, imagem docker, etc.

    Args:
        ssh_service: instância de SSHService pronta para executar comandos.

    Returns:
        Lista de dicionários com métricas completas de cada pod ativo.
    """
    import time
    fetch_id = f"POD-FETCH-{int(time.time() * 1000)}"
    logger.info(f"[{fetch_id}] Iniciando coleta de recursos dos pods")
    start_time = time.time()
    
    pods_metrics = []
    pods_info = {}  # Dicionário para armazenar info detalhada dos pods
    
    try:
        # 1. Primeiro, obter informações detalhadas dos pods (recursos alocados, imagem, etc.)
        cmd_pods = """kubectl get pods -o json 2>/dev/null"""
        logger.debug(f"[{fetch_id}] Executando kubectl get pods -o json")
        return_code_pods, stdout_pods, stderr_pods = ssh_service.execute_command(cmd_pods, timeout=20)
        
        if return_code_pods == 0 and stdout_pods:
            try:
                pods_data = json.loads(stdout_pods)
                for item in pods_data.get('items', []):
                    metadata = item.get('metadata', {})
                    spec = item.get('spec', {})
                    status = item.get('status', {})
                    
                    pod_name = metadata.get('name', '')
                    if not pod_name:
                        continue
                    
                    # Usar o nome do pod como nome do RPA (mais confiável)
                    labels = metadata.get('labels', {})
                    # Preferir nome do pod completo para exibição
                    rpa_name = pod_name
                    
                    # Informações dos containers (pode haver múltiplos)
                    containers = spec.get('containers', [])
                    container_statuses = status.get('containerStatuses', [])
                    
                    total_cpu_limit = 0
                    total_memory_limit = 0
                    total_cpu_request = 0
                    total_memory_request = 0
                    image_full = ''
                    image_tag = ''
                    
                    for container in containers:
                        # Imagem docker
                        image = container.get('image', '')
                        if image and not image_full:
                            image_full = image
                            # Extrair apenas a tag da imagem (parte após :)
                            if ':' in image:
                                image_tag = image.split(':')[-1]
                            else:
                                image_tag = 'latest'
                        
                        # Recursos alocados (limits e requests)
                        resources = container.get('resources', {})
                        limits = resources.get('limits', {})
                        requests = resources.get('requests', {})
                        
                        # CPU limits/requests
                        if limits.get('cpu'):
                            total_cpu_limit += parse_cpu(limits['cpu'])
                        if requests.get('cpu'):
                            total_cpu_request += parse_cpu(requests['cpu'])
                        
                        # Memory limits/requests
                        if limits.get('memory'):
                            total_memory_limit += parse_memory(limits['memory'])
                        if requests.get('memory'):
                            total_memory_request += parse_memory(requests['memory'])
                    
                    pods_info[pod_name] = {
                        'rpa_name': rpa_name,
                        'image_full': image_full,
                        'image_tag': image_tag,
                        'cpu_limit_millicores': int(total_cpu_limit * 1000),
                        'memory_limit_mb': round(total_memory_limit / (1024 * 1024), 2),
                        'cpu_request_millicores': int(total_cpu_request * 1000),
                        'memory_request_mb': round(total_memory_request / (1024 * 1024), 2),
                        'phase': status.get('phase', 'Unknown'),
                        'start_time': status.get('startTime', ''),
                        'node': spec.get('nodeName', ''),
                    }
                    
            except json.JSONDecodeError as e:
                logger.error(f"[{fetch_id}] Erro ao parsear JSON dos pods: {e}")
        
        # 2. Obter métricas de CPU e memória dos pods com kubectl top (namespace default)
        cmd_top = "kubectl top pods -n default --no-headers 2>&1"
        logger.info(f"[{fetch_id}] Executando '{cmd_top}'")
        return_code, stdout, stderr = ssh_service.execute_command(cmd_top, timeout=15)
        
        logger.info(f"[{fetch_id}] kubectl top - return_code={return_code}, stdout_len={len(stdout) if stdout else 0}")
        if stdout:
            logger.info(f"[{fetch_id}] kubectl top stdout: {stdout[:500]}")
        
        metrics_by_pod = {}
        if return_code == 0 and stdout:
            lines = stdout.strip().split("\n")
            logger.info(f"[{fetch_id}] Obtidos {len(lines)} linhas de métricas de pods")
            
            for line in lines:
                line = line.strip()
                if not line or 'error' in line.lower():
                    continue
                    
                # Formato: NAME CPU(cores) MEMORY(bytes)
                # Exemplo: rpa-job-honorarios-clientes-bitrix-9pltw-rz6lg   380m   183Mi
                parts = line.split()
                if len(parts) >= 3:
                    pod_name = parts[0]
                    cpu_raw = parts[1]  # Ex: "380m"
                    memory_raw = parts[2]  # Ex: "183Mi"
                    
                    # Parse CPU (ex: "380m" -> 380 millicores)
                    cpu_millicores = parse_cpu(cpu_raw)
                    cpu_used = int(cpu_millicores * 1000)  # Converter para millicores
                    
                    # Parse Memory (ex: "183Mi" -> MB)
                    memory_bytes = parse_memory(memory_raw)
                    memory_used_mb = round(memory_bytes / (1024 * 1024), 2)
                    
                    logger.info(f"[{fetch_id}] Pod {pod_name}: CPU={cpu_raw} ({cpu_used}m), MEM={memory_raw} ({memory_used_mb:.1f}MB)")
                    
                    metrics_by_pod[pod_name] = {
                        'cpu_used_millicores': cpu_used,
                        'cpu_raw': cpu_raw,
                        'memory_used_mb': memory_used_mb,
                        'memory_raw': memory_raw,
                    }
        else:
            logger.warning(f"[{fetch_id}] kubectl top pods falhou ou retornou vazio. return_code={return_code}, stdout={stdout[:200] if stdout else 'None'}")
        
        logger.info(f"[{fetch_id}] Total de {len(metrics_by_pod)} pods com métricas coletadas: {list(metrics_by_pod.keys())}")
        
        # 3. Combinar informações de pods com métricas do kubectl top
        logger.info(f"[{fetch_id}] Pods k8s disponíveis: {list(pods_info.keys())}")
        logger.info(f"[{fetch_id}] Pods com métricas: {list(metrics_by_pod.keys())}")
        
        for pod_name, info in pods_info.items():
            # Apenas incluir pods que estão Running
            if info.get('phase') != 'Running':
                continue
            
            # Buscar métricas diretamente pelo nome do pod (kubectl top retorna o mesmo nome)
            metrics = metrics_by_pod.get(pod_name, {})
            
            if metrics:
                logger.info(f"[{fetch_id}] ✓ Métricas encontradas para pod '{pod_name}'")
            else:
                logger.warning(f"[{fetch_id}] ✗ Sem métricas para pod '{pod_name}'")
            
            # Recursos alocados (limits do k8s)
            cpu_limit = info.get('cpu_limit_millicores', 0) or info.get('cpu_request_millicores', 0) or 1000
            memory_limit = info.get('memory_limit_mb', 0) or info.get('memory_request_mb', 0) or 512
            
            # Recursos consumidos (do kubectl top)
            cpu_used = metrics.get('cpu_used_millicores', 0)
            memory_used = metrics.get('memory_used_mb', 0)
            
            # Calcular percentuais
            cpu_percent = round((cpu_used / cpu_limit) * 100, 2) if cpu_limit > 0 else 0
            memory_percent = round((memory_used / memory_limit) * 100, 2) if memory_limit > 0 else 0
            
            # Imagem
            image_full = info.get('image_full', '')
            
            pods_metrics.append({
                'pod_name': pod_name,
                'rpa_name': info.get('rpa_name', pod_name),
                'image_full': image_full,
                'image_tag': info.get('image_tag', 'latest'),
                
                # Recursos alocados (limits do k8s)
                'cpu_allocated_millicores': cpu_limit,
                'memory_allocated_mb': memory_limit,
                
                # Recursos consumidos (do kubectl top)
                'cpu_used_millicores': cpu_used,
                'memory_used_mb': memory_used,
                
                # Percentuais calculados
                'cpu_percent': min(cpu_percent, 100),
                'memory_percent': min(memory_percent, 100),
                
                # Dados brutos (do kubectl top)
                'cpu_raw': metrics.get('cpu_raw', 'N/A'),
                'memory_raw': metrics.get('memory_raw', 'N/A'),
                
                # Metadados
                'start_time': info.get('start_time', ''),
                'node': info.get('node', ''),
            })
                    
        logger.info(f"[{fetch_id}] Métricas completas coletadas para {len(pods_metrics)} pods")
                    
    except Exception as e:
        logger.error(f"[{fetch_id}] Erro ao coletar métricas de pods: {e}", exc_info=True)
    
    total_elapsed = time.time() - start_time
    logger.info(f"[{fetch_id}] Coleta de recursos dos pods concluída em {total_elapsed:.3f}s")
    
    return pods_metrics


def parse_size_to_mb(size_str: str) -> float:
    """Converte uma string de tamanho (ex: '750MB', '1.2GB') para MB."""
    size_str = size_str.strip().upper()
    try:
        if 'GB' in size_str:
            return float(size_str.replace('GB', '').strip()) * 1024
        elif 'MB' in size_str:
            return float(size_str.replace('MB', '').strip())
        elif 'KB' in size_str:
            return float(size_str.replace('KB', '').strip()) / 1024
        elif 'B' in size_str:
            return float(size_str.replace('B', '').strip()) / (1024 * 1024)
        else:
            return float(size_str)
    except:
        return 0


def parse_docker_memory(mem_str: str) -> float:
    """
    Converte uma string de memória do Docker para MB.
    Formatos suportados: '350MiB', '1.5GiB', '350MB', '1.5GB', '1024KiB', etc.
    """
    mem_str = mem_str.strip().upper()
    try:
        # Docker usa MiB/GiB (1024) e MB/GB (1000)
        if 'GIB' in mem_str:
            return float(mem_str.replace('GIB', '').strip()) * 1024
        elif 'GB' in mem_str:
            return float(mem_str.replace('GB', '').strip()) * 1000  # GB é base 1000
        elif 'MIB' in mem_str:
            return float(mem_str.replace('MIB', '').strip())
        elif 'MB' in mem_str:
            return float(mem_str.replace('MB', '').strip())
        elif 'KIB' in mem_str:
            return float(mem_str.replace('KIB', '').strip()) / 1024
        elif 'KB' in mem_str:
            return float(mem_str.replace('KB', '').strip()) / 1000
        elif 'B' in mem_str:
            return float(mem_str.replace('B', '').strip()) / (1024 * 1024)
        else:
            return float(mem_str)
    except:
        return 0


def extract_rpa_name(pod_name: str) -> str:
    """
    Extrai o nome do RPA do nome do pod.
    Ex: 'rpa-att-infos-bitrix-abc123-xyz' -> 'att-infos-bitrix'
    """
    # Remover prefixos comuns
    name = pod_name
    for prefix in ['rpa-cronjob-', 'cronjob-rpa-', 'rpa-', 'job-', 'deployment-']:
        if name.lower().startswith(prefix):
            name = name[len(prefix):]
            break
    
    # Remover sufixos de hash (geralmente últimos 2 segmentos separados por -)
    parts = name.split('-')
    if len(parts) > 2:
        # Verificar se os últimos segmentos parecem hashes (alfanuméricos de 5+ chars)
        while len(parts) > 1 and len(parts[-1]) >= 5 and parts[-1].isalnum():
            parts.pop()
    
    return '-'.join(parts) if parts else pod_name


def parse_cpu(cpu_str: str) -> float:
    """
    Converte string de CPU para número de cores.
    Ex: '50m' -> 0.05, '1' -> 1.0, '500m' -> 0.5
    """
    try:
        if cpu_str.endswith('m'):
            return float(cpu_str[:-1]) / 1000
        else:
            return float(cpu_str)
    except (ValueError, IndexError):
        return 0.0


def parse_memory(mem_str: str) -> int:
    """
    Converte string de memória para bytes.
    Ex: '256Mi' -> 268435456, '1Gi' -> 1073741824, '512Ki' -> 524288
    """
    try:
        # Kubernetes usa unidades binárias (Ki, Mi, Gi) ou decimais (K, M, G)
        multipliers = {
            'Ki': 1024,
            'Mi': 1024 ** 2,
            'Gi': 1024 ** 3,
            'Ti': 1024 ** 4,
            'K': 1000,
            'M': 1000 ** 2,
            'G': 1000 ** 3,
            'T': 1000 ** 4,
        }
        
        for suffix, mult in multipliers.items():
            if mem_str.endswith(suffix):
                return int(float(mem_str[:-len(suffix)]) * mult)
        
        # Sem sufixo, assume bytes
        return int(mem_str)
    except (ValueError, IndexError):
        return 0
