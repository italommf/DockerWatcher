from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from backend.services.cache_service import CacheKeys, CacheService
from backend.services.service_manager import get_ssh_service
from backend.services.vm_resource_service import fetch_vm_resources
import logging

logger = logging.getLogger(__name__)

@api_view(['GET'])
def vm_resources(request):
    """Obtém informações de recursos da VM (RAM, armazenamento, CPU) com cache."""
    import time
    request_id = getattr(request, '_request_id', 'UNKNOWN')
    start_time = time.time()
    
    logger.info(f"[{request_id}] GET /api/resources/vm/ - Iniciando")
    
    try:
        cache_entry = CacheService.get_entry(CacheKeys.VM_RESOURCES)
        if cache_entry and cache_entry.get('data'):
            elapsed = time.time() - start_time
            logger.info(f"[{request_id}] Recursos da VM retornados do cache em {elapsed:.3f}s")
            return Response(cache_entry['data'], status=status.HTTP_200_OK)
        
        logger.warning(f"[{request_id}] Cache vazio, buscando recursos da VM via SSH")
        ssh_service = get_ssh_service()
        
        fetch_start = time.time()
        resources = fetch_vm_resources(ssh_service)
        fetch_elapsed = time.time() - fetch_start
        logger.info(f"[{request_id}] fetch_vm_resources concluído em {fetch_elapsed:.3f}s")
        
        CacheService.update(CacheKeys.VM_RESOURCES, resources)
        elapsed = time.time() - start_time
        logger.info(f"[{request_id}] Recursos da VM obtidos e cacheados em {elapsed:.3f}s")
        
        if elapsed > 2.0:
            logger.warning(f"[{request_id}] ATENÇÃO: Endpoint vm_resources demorou {elapsed:.3f}s (acima de 2s)")
        
        return Response(resources, status=status.HTTP_200_OK)
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[{request_id}] Erro ao obter recursos da VM após {elapsed:.3f}s: {e}", exc_info=True)
        cached = CacheService.get_data(CacheKeys.VM_RESOURCES)
        if cached:
            logger.info(f"[{request_id}] Retornando dados do cache devido ao erro")
            return Response(cached, status=status.HTTP_200_OK)
        return Response({
            'error': str(e),
            'memoria': {'total': 0, 'livre': 0, 'usada': 0, 'total_gb': 0, 'livre_gb': 0, 'usada_gb': 0},
            'armazenamento': {'total': 0, 'livre': 0, 'usado': 0, 'total_gb': 0, 'livre_gb': 0, 'usado_gb': 0},
            'cpu': {'total': 100, 'usado': 0, 'livre': 100}
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

