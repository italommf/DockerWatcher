from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from backend.services.service_manager import get_ssh_service
import logging
import re

logger = logging.getLogger(__name__)

@api_view(['GET'])
def vm_resources(request):
    """Obtém informações de recursos da VM (RAM, armazenamento, CPU)."""
    try:
        ssh_service = get_ssh_service()
        
        resources = {
            'memoria': {
                'total': 0,
                'livre': 0,
                'usada': 0,
                'total_gb': 0,
                'livre_gb': 0,
                'usada_gb': 0,
            },
            'armazenamento': {
                'total': 0,
                'livre': 0,
                'usado': 0,
                'total_gb': 0,
                'livre_gb': 0,
                'usado_gb': 0,
            },
            'cpu': {
                'total': 100,  # CPU é percentual
                'usado': 0,
                'livre': 100,
            }
        }
        
        # Obter informações de memória (free -h)
        try:
            return_code, stdout, stderr = ssh_service.execute_command("free -b", timeout=10)
            if return_code == 0:
                lines = stdout.strip().split('\n')
                if len(lines) >= 2:
                    # Parsear linha Mem:
                    mem_line = lines[1]
                    mem_parts = mem_line.split()
                    if len(mem_parts) >= 4:
                        total_bytes = int(mem_parts[1])
                        used_bytes = int(mem_parts[2])
                        free_bytes = int(mem_parts[3])
                        
                        resources['memoria']['total'] = total_bytes
                        resources['memoria']['usada'] = used_bytes
                        resources['memoria']['livre'] = free_bytes
                        resources['memoria']['total_gb'] = round(total_bytes / (1024**3), 2)
                        resources['memoria']['usada_gb'] = round(used_bytes / (1024**3), 2)
                        resources['memoria']['livre_gb'] = round(free_bytes / (1024**3), 2)
        except Exception as e:
            logger.warning(f"Erro ao obter memória: {e}")
        
        # Obter informações de armazenamento (df -h /)
        try:
            return_code, stdout, stderr = ssh_service.execute_command("df -B1 /", timeout=10)
            if return_code == 0:
                lines = stdout.strip().split('\n')
                if len(lines) >= 2:
                    # Parsear linha do filesystem root
                    fs_line = lines[1]
                    fs_parts = fs_line.split()
                    if len(fs_parts) >= 4:
                        total_bytes = int(fs_parts[1])
                        used_bytes = int(fs_parts[2])
                        available_bytes = int(fs_parts[3])
                        
                        resources['armazenamento']['total'] = total_bytes
                        resources['armazenamento']['usado'] = used_bytes
                        resources['armazenamento']['livre'] = available_bytes
                        resources['armazenamento']['total_gb'] = round(total_bytes / (1024**3), 2)
                        resources['armazenamento']['usado_gb'] = round(used_bytes / (1024**3), 2)
                        resources['armazenamento']['livre_gb'] = round(available_bytes / (1024**3), 2)
        except Exception as e:
            logger.warning(f"Erro ao obter armazenamento: {e}")
        
        # Obter informações de CPU (top -bn1 | grep "Cpu(s)")
        try:
            return_code, stdout, stderr = ssh_service.execute_command("top -bn1 | grep 'Cpu(s)'", timeout=10)
            if return_code == 0:
                # Parsear linha como: %Cpu(s):  2.3 us,  0.5 sy,  0.0 ni, 97.2 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st
                cpu_match = re.search(r'(\d+\.?\d*)%?\s+id', stdout)
                if cpu_match:
                    cpu_idle = float(cpu_match.group(1))
                    cpu_used = round(100 - cpu_idle, 2)
                    resources['cpu']['usado'] = cpu_used
                    resources['cpu']['livre'] = round(cpu_idle, 2)
        except Exception as e:
            logger.warning(f"Erro ao obter CPU: {e}")
            # Tentar método alternativo com vmstat
            try:
                return_code, stdout, stderr = ssh_service.execute_command("vmstat 1 2 | tail -1", timeout=10)
                if return_code == 0:
                    parts = stdout.strip().split()
                    if len(parts) >= 15:
                        # Coluna 15 é geralmente o idle
                        cpu_idle = float(parts[14])
                        cpu_used = round(100 - cpu_idle, 2)
                        resources['cpu']['usado'] = cpu_used
                        resources['cpu']['livre'] = round(cpu_idle, 2)
            except Exception as e2:
                logger.warning(f"Erro ao obter CPU com vmstat: {e2}")
        
        return Response(resources, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao obter recursos da VM: {e}")
        return Response({
            'error': str(e),
            'memoria': {'total': 0, 'livre': 0, 'usada': 0, 'total_gb': 0, 'livre_gb': 0, 'usada_gb': 0},
            'armazenamento': {'total': 0, 'livre': 0, 'usado': 0, 'total_gb': 0, 'livre_gb': 0, 'usado_gb': 0},
            'cpu': {'total': 100, 'usado': 0, 'livre': 100}
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

