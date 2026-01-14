"""
Endpoints de status de conexão.
Refatorado - MySQL, K8s e Prometheus apenas (sem SSH).
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from services.service_manager import get_database_service, reset_services
import logging

from k8s.client import get_k8s_client, K8S_AVAILABLE
from metrics.client import get_prometheus_client, PROMETHEUS_AVAILABLE

logger = logging.getLogger(__name__)


@api_view(['GET'])
def connection_status(request):
    """Retorna status das conexões (MySQL, K8s, Prometheus)."""
    # MySQL
    mysql_connected = False
    mysql_error = None
    try:
        db_service = get_database_service()
        mysql_connected, mysql_error = db_service.test_connection_with_details()
    except Exception as e:
        mysql_error = str(e)
    
    # Kubernetes
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
    
    # Prometheus
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
    
    return Response({
        'mysql_connected': mysql_connected,
        'mysql_error': mysql_error,
        'k8s_connected': k8s_connected,
        'k8s_error': k8s_error,
        'prometheus_connected': prom_connected,
        'prometheus_error': prom_error,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
def reload_services(request):
    """Recarrega serviços."""
    try:
        reset_services()
        return Response({'message': 'Serviços recarregados com sucesso.'}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao recarregar serviços: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def mysql_status(request):
    """Testa conexão MySQL."""
    db_service = get_database_service()
    mysql_connected, mysql_error = db_service.test_connection_with_details()
    
    return Response({
        'mysql_connected': mysql_connected,
        'mysql_error': mysql_error if not mysql_connected else None,
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
def k8s_status(request):
    """Testa conexão Kubernetes."""
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
