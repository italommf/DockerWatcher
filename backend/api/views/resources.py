"""
API para recursos de VM e Pods.
Refatorado para usar módulo metrics/ (Prometheus).
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
import logging
import time

from metrics.vm import VMMetricsService
from metrics.pods import PodMetricsService

logger = logging.getLogger(__name__)


@api_view(['GET'])
def vm_resources(request):
    """Obtém informações de recursos da VM (RAM, armazenamento, CPU) via Prometheus."""
    request_id = getattr(request, '_request_id', 'UNKNOWN')
    start_time = time.time()
    
    logger.info(f"[{request_id}] GET /api/resources/vm/ - Iniciando")
    
    try:
        vm_service = VMMetricsService()
        metrics = vm_service.get_all()
        
        if not metrics:
            logger.warning(f"[{request_id}] Prometheus não disponível ou sem métricas")
            return Response({
                'error': 'Prometheus não disponível',
                'memoria': {'total': 0, 'livre': 0, 'usada': 0, 'total_gb': 0, 'livre_gb': 0, 'usada_gb': 0},
                'armazenamento': {'total': 0, 'livre': 0, 'usado': 0, 'total_gb': 0, 'livre_gb': 0, 'usado_gb': 0},
                'cpu': {'total': 100, 'usado': 0, 'livre': 100}
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        # Formatar resposta no formato esperado pelo frontend
        response_data = {
            'memoria': {
                'total_gb': round(metrics.memory_total_gb, 2),
                'usada_gb': round(metrics.memory_used_gb, 2),
                'livre_gb': round(metrics.memory_total_gb - metrics.memory_used_gb, 2),
                'percentual': round(metrics.memory_usage_percent, 2)
            },
            'armazenamento': {
                'total_gb': round(metrics.disk_total_gb, 2),
                'usado_gb': round(metrics.disk_used_gb, 2),
                'livre_gb': round(metrics.disk_total_gb - metrics.disk_used_gb, 2),
                'percentual': round(metrics.disk_usage_percent, 2)
            },
            'cpu': {
                'total': 100,
                'usado': round(metrics.cpu_usage_percent, 2),
                'livre': round(100 - metrics.cpu_usage_percent, 2)
            }
        }
        
        elapsed = time.time() - start_time
        logger.info(f"[{request_id}] Recursos da VM obtidos via Prometheus em {elapsed:.3f}s")
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[{request_id}] Erro ao obter recursos da VM após {elapsed:.3f}s: {e}", exc_info=True)
        return Response({
            'error': str(e),
            'memoria': {'total': 0, 'livre': 0, 'usada': 0, 'total_gb': 0, 'livre_gb': 0, 'usada_gb': 0},
            'armazenamento': {'total': 0, 'livre': 0, 'usado': 0, 'total_gb': 0, 'livre_gb': 0, 'usado_gb': 0},
            'cpu': {'total': 100, 'usado': 0, 'livre': 100}
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def pod_resources(request):
    """Obtém informações de recursos (CPU, memória) dos pods via Prometheus."""
    request_id = getattr(request, '_request_id', 'UNKNOWN')
    start_time = time.time()
    
    logger.info(f"[{request_id}] GET /api/resources/pods/ - Iniciando")
    
    try:
        namespace = request.query_params.get('namespace', 'default')
        
        pod_service = PodMetricsService()
        metrics = pod_service.get_all(namespace=namespace)
        
        # Formatar resposta
        pods_data = [m.to_dict() for m in metrics]
        
        elapsed = time.time() - start_time
        logger.info(f"[{request_id}] Métricas de {len(pods_data)} pods obtidas em {elapsed:.3f}s")
        
        return Response({
            'pods': pods_data,
            'count': len(pods_data),
            'timestamp': time.time()
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[{request_id}] Erro ao obter recursos dos pods após {elapsed:.3f}s: {e}", exc_info=True)
        return Response({
            'error': str(e),
            'pods': [],
            'count': 0
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def vm_history(request):
    """Obtém histórico de CPU e memória da VM."""
    try:
        hours = int(request.query_params.get('hours', 1))
        
        vm_service = VMMetricsService()
        
        return Response({
            'cpu': vm_service.cpu_history(hours=hours),
            'memory': vm_service.memory_history(hours=hours)
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Erro ao obter histórico da VM: {e}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def pod_history(request, pod_name):
    """Obtém histórico de CPU e memória de um pod específico."""
    try:
        hours = int(request.query_params.get('hours', 1))
        namespace = request.query_params.get('namespace', 'default')
        
        pod_service = PodMetricsService()
        
        return Response({
            'cpu': pod_service.cpu_history(pod_name=pod_name, namespace=namespace, hours=hours),
            'memory': pod_service.memory_history(pod_name=pod_name, namespace=namespace, hours=hours)
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Erro ao obter histórico do pod {pod_name}: {e}", exc_info=True)
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
