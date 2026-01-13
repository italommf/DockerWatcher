import logging
import re
from typing import Dict

logger = logging.getLogger(__name__)


def fetch_vm_resources(ssh_service) -> Dict:
    """
    Coleta métricas de recursos da VM via SSH (memória, storage, CPU).
    
    OTIMIZADO: Usa um único comando SSH batched em vez de 3 comandos separados,
    reduzindo latência de ~3-6s para ~1-2s.

    Args:
        ssh_service: instância de SSHService pronta para executar comandos.

    Returns:
        Dicionário com métricas agregadas.
    """
    import time
    fetch_id = f"FETCH-{int(time.time() * 1000)}-{id(ssh_service) % 10000}"
    logger.info(f"[{fetch_id}] Iniciando coleta de recursos da VM (batched)")
    start_time = time.time()
    
    resources = {
        "memoria": {
            "total": 0,
            "livre": 0,
            "usada": 0,
            "total_gb": 0,
            "livre_gb": 0,
            "usada_gb": 0,
        },
        "armazenamento": {
            "total": 0,
            "livre": 0,
            "usado": 0,
            "total_gb": 0,
            "livre_gb": 0,
            "usado_gb": 0,
        },
        "cpu": {
            "total": 100,
            "usado": 0,
            "livre": 100,
        },
    }

    # Comando batched: executa tudo em uma única conexão SSH
    BATCH_CMD = """echo "===MEM===" && free -b && echo "===DISK===" && df -B1 / | tail -1 && echo "===CPU===" && top -bn1 | grep 'Cpu(s)'"""
    
    try:
        logger.info(f"[{fetch_id}] Executando comando batched para obter recursos")
        return_code, stdout, stderr = ssh_service.execute_command(BATCH_CMD, timeout=15)
        cmd_elapsed = time.time() - start_time
        logger.info(f"[{fetch_id}] Comando batched concluído em {cmd_elapsed:.3f}s (return_code={return_code}, stdout_len={len(stdout) if stdout else 0})")
        
        if stdout:
            logger.info(f"[{fetch_id}] Stdout (primeiros 500 chars): {stdout[:500]}")
        
        if return_code == 0 and stdout:
            # Parsear output separado por delimitadores
            # Format: ===MEM===\ndata\n===DISK===\ndata\n===CPU===\ndata
            logger.info(f"[{fetch_id}] Parseando stdout completo...")
            
            # Extrair seção de memória (entre ===MEM=== e ===DISK===)
            mem_match = re.search(r'===MEM===\s*(.*?)\s*===DISK===', stdout, re.DOTALL)
            if mem_match:
                mem_output = mem_match.group(1).strip()
                _parse_memory(resources, mem_output, fetch_id)
            else:
                logger.warning(f"[{fetch_id}] Seção MEM não encontrada no stdout")
            
            # Extrair seção de disco (entre ===DISK=== e ===CPU===)
            disk_match = re.search(r'===DISK===\s*(.*?)\s*===CPU===', stdout, re.DOTALL)
            if disk_match:
                disk_output = disk_match.group(1).strip()
                _parse_disk(resources, disk_output, fetch_id)
            else:
                logger.warning(f"[{fetch_id}] Seção DISK não encontrada no stdout")
            
            # Extrair seção de CPU (após ===CPU===)
            cpu_match = re.search(r'===CPU===\s*(.*)', stdout, re.DOTALL)
            if cpu_match:
                cpu_output = cpu_match.group(1).strip()
                _parse_cpu(resources, cpu_output, fetch_id)
            else:
                logger.warning(f"[{fetch_id}] Seção CPU não encontrada no stdout")
        else:
            logger.warning(f"[{fetch_id}] Comando batched falhou (return_code={return_code}): {stderr}")
            # Fallback: tentar comandos individuais
            logger.info(f"[{fetch_id}] Tentando fallback com comandos individuais...")
            _fetch_vm_resources_legacy(ssh_service, resources, fetch_id)
            
    except Exception as e:
        logger.error(f"[{fetch_id}] Erro no comando batched: {e}", exc_info=True)
        # Fallback: tentar comandos individuais
        _fetch_vm_resources_legacy(ssh_service, resources, fetch_id)

    total_elapsed = time.time() - start_time
    logger.info(f"[{fetch_id}] Coleta de recursos da VM concluída em {total_elapsed:.3f}s")
    if total_elapsed > 3.0:
        logger.warning(f"[{fetch_id}] ATENÇÃO: fetch_vm_resources demorou {total_elapsed:.3f}s (acima de 3s)")
    
    return resources


def _parse_memory(resources: Dict, mem_output: str, fetch_id: str):
    """Parseia output do comando 'free -b'."""
    try:
        logger.info(f"[{fetch_id}] Parseando memória. Output len={len(mem_output)}")
        lines = mem_output.strip().split("\n")
        logger.info(f"[{fetch_id}] Memória - {len(lines)} linhas encontradas")
        if len(lines) >= 2:
            mem_parts = lines[1].split()
            logger.info(f"[{fetch_id}] Memória parts: {mem_parts[:5]}")
            if len(mem_parts) >= 4:
                total_bytes = int(mem_parts[1])
                used_bytes = int(mem_parts[2])
                free_bytes = int(mem_parts[3])
                resources["memoria"]["total"] = total_bytes
                resources["memoria"]["usada"] = used_bytes
                resources["memoria"]["livre"] = free_bytes
                resources["memoria"]["total_gb"] = round(total_bytes / (1024 ** 3), 2)
                resources["memoria"]["usada_gb"] = round(used_bytes / (1024 ** 3), 2)
                resources["memoria"]["livre_gb"] = round(free_bytes / (1024 ** 3), 2)
                logger.info(f"[{fetch_id}] Memória parseada: {resources['memoria']['usada_gb']}GB usado de {resources['memoria']['total_gb']}GB")
            else:
                logger.warning(f"[{fetch_id}] Memória - mem_parts insuficiente: {len(mem_parts)}")
        else:
            logger.warning(f"[{fetch_id}] Memória - poucas linhas: {len(lines)}")
    except Exception as e:
        logger.warning(f"[{fetch_id}] Erro ao parsear memória: {e}")


def _parse_disk(resources: Dict, disk_output: str, fetch_id: str):
    """Parseia output do comando 'df -B1 / | tail -1'."""
    try:
        logger.info(f"[{fetch_id}] Parseando disco. Output: '{disk_output[:200]}'")
        fs_parts = disk_output.strip().split()
        logger.info(f"[{fetch_id}] Disco parts: {fs_parts[:5]}")
        if len(fs_parts) >= 4:
            # Índices: 0=Filesystem, 1=1B-blocks (total), 2=Used, 3=Available
            total_bytes = int(fs_parts[1])
            used_bytes = int(fs_parts[2])
            available_bytes = int(fs_parts[3])
            
            if total_bytes > 0 and used_bytes >= 0 and available_bytes >= 0:
                resources["armazenamento"]["total"] = total_bytes
                resources["armazenamento"]["usado"] = used_bytes
                resources["armazenamento"]["livre"] = available_bytes
                resources["armazenamento"]["total_gb"] = round(total_bytes / (1024 ** 3), 2)
                resources["armazenamento"]["usado_gb"] = round(used_bytes / (1024 ** 3), 2)
                resources["armazenamento"]["livre_gb"] = round(available_bytes / (1024 ** 3), 2)
                logger.info(f"[{fetch_id}] Disco parseado: {resources['armazenamento']['usado_gb']}GB usado de {resources['armazenamento']['total_gb']}GB")
        else:
            logger.warning(f"[{fetch_id}] Disco - parts insuficiente: {len(fs_parts)}")
    except Exception as e:
        logger.warning(f"[{fetch_id}] Erro ao parsear disco: {e}")


def _parse_cpu(resources: Dict, cpu_output: str, fetch_id: str):
    """Parseia output do comando 'top -bn1 | grep Cpu(s)'."""
    try:
        logger.info(f"[{fetch_id}] Parseando CPU. Output: '{cpu_output[:200]}'")
        # Regex para capturar idle% - suporta tanto ponto quanto vírgula como separador decimal
        cpu_match = re.search(r"(\d+[,.]?\d*)\s*%?\s*id", cpu_output)
        if cpu_match:
            idle_str = cpu_match.group(1).replace(',', '.')  # Converter vírgula para ponto
            cpu_idle = float(idle_str)
            cpu_used = round(100 - cpu_idle, 2)
            resources["cpu"]["usado"] = cpu_used
            resources["cpu"]["livre"] = round(cpu_idle, 2)
            logger.info(f"[{fetch_id}] CPU parseada: {cpu_used}% usado (idle={cpu_idle}%)")
        else:
            logger.warning(f"[{fetch_id}] CPU - regex não encontrou 'id' em: {cpu_output[:100]}")
    except Exception as e:
        logger.warning(f"[{fetch_id}] Erro ao parsear CPU: {e}")


def _fetch_vm_resources_legacy(ssh_service, resources: Dict, fetch_id: str):
    """Fallback: coleta recursos com comandos SSH individuais (versão legada)."""
    import time
    
    # Memória
    try:
        return_code, stdout, stderr = ssh_service.execute_command("free -b", timeout=10)
        if return_code == 0:
            _parse_memory(resources, stdout, fetch_id)
    except Exception as e:
        logger.warning(f"[{fetch_id}] Fallback - Erro ao obter memória: {e}")

    # Armazenamento
    try:
        return_code, stdout, stderr = ssh_service.execute_command("df -B1 / | tail -1", timeout=10)
        if return_code == 0:
            _parse_disk(resources, stdout, fetch_id)
    except Exception as e:
        logger.warning(f"[{fetch_id}] Fallback - Erro ao obter disco: {e}")

    # CPU
    try:
        return_code, stdout, stderr = ssh_service.execute_command("top -bn1 | grep 'Cpu(s)'", timeout=10)
        if return_code == 0:
            _parse_cpu(resources, stdout, fetch_id)
    except Exception as e:
        logger.warning(f"[{fetch_id}] Fallback - Erro ao obter CPU: {e}")


