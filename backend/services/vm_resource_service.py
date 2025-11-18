import logging
import re
from typing import Dict

logger = logging.getLogger(__name__)


def fetch_vm_resources(ssh_service) -> Dict:
    """
    Coleta métricas de recursos da VM via SSH (memória, storage, CPU).

    Args:
        ssh_service: instância de SSHService pronta para executar comandos.

    Returns:
        Dicionário com métricas agregadas.
    """
    import time
    fetch_id = f"FETCH-{int(time.time() * 1000)}-{id(ssh_service) % 10000}"
    logger.info(f"[{fetch_id}] Iniciando coleta de recursos da VM")
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

    # Memória
    try:
        mem_start = time.time()
        logger.debug(f"[{fetch_id}] Executando 'free -b' para obter memória")
        return_code, stdout, stderr = ssh_service.execute_command("free -b", timeout=10)
        mem_elapsed = time.time() - mem_start
        logger.debug(f"[{fetch_id}] 'free -b' concluído em {mem_elapsed:.3f}s (return_code={return_code})")
        if return_code == 0:
            lines = stdout.strip().split("\n")
            if len(lines) >= 2:
                mem_parts = lines[1].split()
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
        else:
            logger.warning(f"Erro ao executar free -b: {stderr}")
    except Exception as e:
        logger.warning(f"Erro ao obter memória: {e}")

    # Armazenamento
    try:
        disk_start = time.time()
        # Tentar primeiro com df -B1 (mais preciso)
        logger.debug(f"[{fetch_id}] Executando 'df -B1 /' para obter armazenamento")
        return_code, stdout, stderr = ssh_service.execute_command("df -B1 /", timeout=10)
        disk_elapsed = time.time() - disk_start
        logger.debug(f"[{fetch_id}] 'df -B1 /' concluído em {disk_elapsed:.3f}s (return_code={return_code})")
        
        disk_parsed = False
        
        if return_code == 0 and stdout:
            logger.debug(f"[{fetch_id}] Saída do df -B1: {repr(stdout)}")
            lines = stdout.strip().split("\n")
            logger.debug(f"[{fetch_id}] Linhas do df: {len(lines)}")
            
            # Procurar pela linha que contém o ponto de montagem "/" (geralmente a última linha)
            for line in lines:
                line = line.strip()
                if not line or line.startswith("Filesystem"):
                    continue
                    
                # Verificar se é a linha do root filesystem
                if line.endswith(" /") or (line.split()[-1] == "/" if line.split() else False):
                    fs_parts = line.split()
                    logger.debug(f"[{fetch_id}] Partes do df: {fs_parts}")
                    
                    # O formato do df -B1 é: Filesystem 1B-blocks Used Available Use% Mounted
                    # Exemplo: /dev/sda1 10737418240 2147483648 8589934592 20% /
                    if len(fs_parts) >= 4:
                        try:
                            # Índices: 0=Filesystem, 1=1B-blocks (total), 2=Used, 3=Available
                            total_bytes = int(fs_parts[1])
                            used_bytes = int(fs_parts[2])
                            available_bytes = int(fs_parts[3])
                            
                            # Validar que os valores fazem sentido
                            if total_bytes > 0 and used_bytes >= 0 and available_bytes >= 0:
                                resources["armazenamento"]["total"] = total_bytes
                                resources["armazenamento"]["usado"] = used_bytes
                                resources["armazenamento"]["livre"] = available_bytes
                                resources["armazenamento"]["total_gb"] = round(total_bytes / (1024 ** 3), 2)
                                resources["armazenamento"]["usado_gb"] = round(used_bytes / (1024 ** 3), 2)
                                resources["armazenamento"]["livre_gb"] = round(available_bytes / (1024 ** 3), 2)
                                
                                logger.info(f"[{fetch_id}] Armazenamento: {resources['armazenamento']['usado_gb']}GB usado de {resources['armazenamento']['total_gb']}GB total ({round(resources['armazenamento']['usado_gb'] / resources['armazenamento']['total_gb'] * 100, 1)}%)")
                                disk_parsed = True
                                break
                            else:
                                logger.warning(f"[{fetch_id}] Valores inválidos do df: total={total_bytes}, used={used_bytes}, available={available_bytes}")
                        except (ValueError, IndexError) as e:
                            logger.warning(f"[{fetch_id}] Erro ao parsear dados do df: {e}, partes: {fs_parts}")
                            continue
        
        # Se não conseguiu parsear com -B1, tentar com df sem -B1 (usa blocos de 1KB)
        if not disk_parsed:
            logger.debug(f"[{fetch_id}] Tentando comando alternativo 'df /' (sem -B1)")
            try:
                return_code2, stdout2, stderr2 = ssh_service.execute_command("df / | tail -1", timeout=10)
                if return_code2 == 0 and stdout2:
                    logger.debug(f"[{fetch_id}] Saída alternativa: {repr(stdout2)}")
                    fs_parts = stdout2.strip().split()
                    if len(fs_parts) >= 4:
                        try:
                            # df sem -B1 retorna em blocos de 1KB (1024 bytes)
                            # Índices: 0=Filesystem, 1=1K-blocks (total), 2=Used, 3=Available
                            total_blocks = int(fs_parts[1])
                            used_blocks = int(fs_parts[2])
                            available_blocks = int(fs_parts[3])
                            
                            # Converter blocos de 1KB para bytes
                            total_bytes = total_blocks * 1024
                            used_bytes = used_blocks * 1024
                            available_bytes = available_blocks * 1024
                            
                            if total_bytes > 0 and used_bytes >= 0 and available_bytes >= 0:
                                resources["armazenamento"]["total"] = total_bytes
                                resources["armazenamento"]["usado"] = used_bytes
                                resources["armazenamento"]["livre"] = available_bytes
                                resources["armazenamento"]["total_gb"] = round(total_bytes / (1024 ** 3), 2)
                                resources["armazenamento"]["usado_gb"] = round(used_bytes / (1024 ** 3), 2)
                                resources["armazenamento"]["livre_gb"] = round(available_bytes / (1024 ** 3), 2)
                                
                                logger.info(f"[{fetch_id}] Armazenamento (via df alternativo): {resources['armazenamento']['usado_gb']}GB usado de {resources['armazenamento']['total_gb']}GB total")
                                disk_parsed = True
                        except (ValueError, IndexError) as e2:
                            logger.warning(f"[{fetch_id}] Erro ao parsear df alternativo: {e2}, partes: {fs_parts}")
            except Exception as e2:
                logger.warning(f"[{fetch_id}] Erro no comando alternativo: {e2}")
        
        if not disk_parsed:
            logger.warning(f"[{fetch_id}] Não foi possível obter dados de armazenamento. return_code={return_code}, stderr={stderr}")
    except Exception as e:
        logger.error(f"[{fetch_id}] Erro ao obter armazenamento: {e}", exc_info=True)

    # CPU
    try:
        cpu_start = time.time()
        logger.debug(f"[{fetch_id}] Executando 'top -bn1 | grep Cpu(s)' para obter CPU")
        return_code, stdout, stderr = ssh_service.execute_command("top -bn1 | grep 'Cpu(s)'", timeout=10)
        cpu_elapsed = time.time() - cpu_start
        logger.debug(f"[{fetch_id}] 'top -bn1 | grep Cpu(s)' concluído em {cpu_elapsed:.3f}s (return_code={return_code})")
        if return_code == 0:
            cpu_match = re.search(r"(\d+\.?\d*)%?\s+id", stdout)
            if cpu_match:
                cpu_idle = float(cpu_match.group(1))
                cpu_used = round(100 - cpu_idle, 2)
                resources["cpu"]["usado"] = cpu_used
                resources["cpu"]["livre"] = round(cpu_idle, 2)
    except Exception as e:
        logger.warning(f"Erro ao obter CPU via top: {e}")
        try:
            return_code, stdout, stderr = ssh_service.execute_command("vmstat 1 2 | tail -1", timeout=10)
            if return_code == 0:
                parts = stdout.strip().split()
                if len(parts) >= 15:
                    cpu_idle = float(parts[14])
                    cpu_used = round(100 - cpu_idle, 2)
                    resources["cpu"]["usado"] = cpu_used
                    resources["cpu"]["livre"] = round(cpu_idle, 2)
        except Exception as e2:
            logger.warning(f"[{fetch_id}] Erro ao obter CPU via vmstat: {e2}")

    total_elapsed = time.time() - start_time
    logger.info(f"[{fetch_id}] Coleta de recursos da VM concluída em {total_elapsed:.3f}s")
    if total_elapsed > 5.0:
        logger.warning(f"[{fetch_id}] ATENÇÃO: fetch_vm_resources demorou {total_elapsed:.3f}s (acima de 5s)")
    
    return resources


