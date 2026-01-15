"""
Endpoints de status de conexão com cache para evitar sobrecarga.
Refatorado - MySQL, K8S e Prometheus apenas.
"""

import logging
import time
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from k8s.client import get_k8s_client, K8S_AVAILABLE
from metrics.client import get_prometheus_client, PROMETHEUS_AVAILABLE
from services.service_manager import get_database_service, reset_services

logger = logging.getLogger(__name__)

# Cache global simples
_connection_cache = {
    'timestamp': 0,
    'data': None
}
_CACHE_TTL = 10 

@api_view(['GET'])
def connection_status(request):
    """Retorna status das conexões com cache de 10s para não travar o backend."""
    global _connection_cache
    
    now = time.time()
    if _connection_cache['data'] and (now - _connection_cache['timestamp'] < _CACHE_TTL):
        # Marcar como cacheado para debug no front se necessário
        data = _connection_cache['data'].copy()
        data['cached'] = True
        return Response(data, status=status.HTTP_200_OK)

    # MySQL - Teste leve
    mysql_connected = False
    mysql_error = None
    try:
        db_service = get_database_service()
        mysql_connected, mysql_error = db_service.test_connection_with_details()
    except Exception as e:
        mysql_error = str(e)
    
    # Kubernetes - Chamada de rede
    k8s_connected = False
    k8s_error = None
    if K8S_AVAILABLE:
        try:
            client = get_k8s_client()
            k8s_connected = client.is_available()
        except Exception as e:
            k8s_error = str(e)
    else:
        k8s_error = "Pacote kubernetes não instalado"
    
    # Prometheus - Chamada de rede
    prom_connected = False
    prom_error = None
    if PROMETHEUS_AVAILABLE:
        try:
            prom = get_prometheus_client()
            prom_connected = prom.is_available()
        except Exception as e:
            prom_error = str(e)
    else:
        prom_error = "Prometheus não configurado"
    
    result = {
        'mysql_connected': mysql_connected,
        'mysql_error': mysql_error,
        'k8s_connected': k8s_connected,
        'k8s_error': k8s_error,
        'prometheus_connected': prom_connected,
        'prometheus_error': prom_error,
        'cached': False,
        'timestamp': now
    }
    
    # Atualizar cache
    _connection_cache['data'] = result
    _connection_cache['timestamp'] = now
    
    return Response(result, status=status.HTTP_200_OK)


@api_view(['POST'])
def reload_services(request):
    """Recarrega serviços e limpa cache de conexão."""
    global _connection_cache
    try:
        reset_services()
        _connection_cache['data'] = None
        _connection_cache['timestamp'] = 0
        return Response({'message': 'Serviços recarregados com sucesso.'}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao recarregar serviços: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def mysql_status(request):
    """Testa conexão MySQL sem cache."""
    db_service = get_database_service()
    mysql_connected, mysql_error = db_service.test_connection_with_details()
    return Response({
        'mysql_connected': mysql_connected,
        'mysql_error': mysql_error if not mysql_connected else None,
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
def k8s_status(request):
    """Testa conexão Kubernetes sem cache."""
    k8s_connected = False
    k8s_error = None
    if K8S_AVAILABLE:
        try:
            client = get_k8s_client()
            k8s_connected = client.is_available()
        except Exception as e:
            k8s_error = str(e)
    else:
        k8s_error = "Pacote kubernetes não instalado"
    
    return Response({
        'k8s_connected': k8s_connected,
        'k8s_error': k8s_error,
    }, status=status.HTTP_200_OK)
