from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from services.cache_service import CacheKeys, CacheService
from services.service_manager import (
    get_ssh_service,
    get_database_service,
    reset_services
)
from api.serializers.models import ConnectionStatusSerializer
import logging

logger = logging.getLogger(__name__)

@api_view(['GET'])
def connection_status(request):
    """Retorna o status conhecido das conexões SSH/MySQL sem retestar."""
    request_id = getattr(request, '_request_id', 'UNKNOWN')
    logger.info(f"[{request_id}] GET /api/connection/status/ - Consultando status do cache")
    
    cached_status = CacheService.get_data(CacheKeys.CONNECTION_STATUS)
    if not cached_status:
        logger.warning(f"[{request_id}] Status de conexão não encontrado no cache")
        cached_status = {
            'ssh_connected': False,
            'mysql_connected': False,
            'ssh_error': 'Status ainda não disponível',
            'mysql_error': 'Status ainda não disponível'
        }
    else:
        logger.debug(f"[{request_id}] Status encontrado no cache: SSH={cached_status.get('ssh_connected')}, MySQL={cached_status.get('mysql_connected')}")
    
    serializer = ConnectionStatusSerializer(data=cached_status)
    if serializer.is_valid():
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
    
    return Response(cached_status, status=status.HTTP_200_OK)

@api_view(['POST'])
def reload_services(request):
    """Recarrega as configurações e reinicializa os serviços (sem testar conexões)."""
    try:
        # Resetar serviços singleton para forçar recarregamento
        reset_services()
        
        # Obter novas instâncias dos serviços
        ssh_service = get_ssh_service()
        db_service = get_database_service()
        
        # Recarregar configurações explicitamente (fecha conexões antigas se houver)
        # Não testar conexões aqui para evitar timeout - os testes serão feitos separadamente
        ssh_service.reload_config()
        db_service.reload_config()
        
        logger.info("Serviços recarregados com sucesso (configurações atualizadas)")
        
        return Response({
            'message': 'Serviços recarregados com sucesso. Use os botões de teste para verificar as conexões.',
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao recarregar serviços: {e}")
        return Response({
            'error': str(e),
            'message': 'Erro ao recarregar serviços'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
def mysql_status(request):
    """Testa apenas a conexão MySQL e retorna status detalhado."""
    # Usar serviço singleton para evitar reconexões constantes
    db_service = get_database_service()
    mysql_connected, mysql_error = db_service.test_connection_with_details()
    
    data = {
        'mysql_connected': mysql_connected,
        'mysql_error': mysql_error if not mysql_connected else None,
        'message': 'Conexão MySQL verificada' if mysql_connected else 'Falha na conexão MySQL'
    }
    
    return Response(data, status=status.HTTP_200_OK)

@api_view(['GET'])
def ssh_status(request):
    """Testa apenas a conexão SSH e retorna status detalhado."""
    try:
        # Usar serviço singleton para evitar reconexões constantes
        ssh_service = get_ssh_service()
        ssh_connected = ssh_service.test_connection()
        
        ssh_error = None
        if not ssh_connected:
            ssh_error = "Falha na conexão SSH. Verifique host, porta, usuário e senha/chave no config.ini"
        
        data = {
            'ssh_connected': ssh_connected,
            'ssh_error': ssh_error,
            'message': 'Conexão SSH verificada' if ssh_connected else 'Falha na conexão SSH'
        }
        
        logger.info(f"Teste SSH: {ssh_connected}, Erro: {ssh_error}")
        
        return Response(data, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao testar conexão SSH: {e}")
        return Response({
            'ssh_connected': False,
            'ssh_error': f"Erro ao testar conexão: {str(e)}",
            'message': 'Erro ao testar conexão SSH'
        }, status=status.HTTP_200_OK)

