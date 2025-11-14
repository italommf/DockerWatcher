from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from backend.services.ssh_service import SSHService
from backend.services.database_service import DatabaseService
from api.serializers.models import ConnectionStatusSerializer
import logging

logger = logging.getLogger(__name__)

@api_view(['GET'])
def connection_status(request):
    """Verifica o status das conexões SSH e MySQL."""
    ssh_service = SSHService()
    db_service = DatabaseService()
    
    ssh_connected = ssh_service.test_connection()
    mysql_connected = db_service.test_connection()
    
    ssh_error = None
    mysql_error = None
    
    if not ssh_connected:
        ssh_error = "Falha na conexão SSH"
    
    if not mysql_connected:
        mysql_error = "Falha na conexão MySQL"
    
    data = {
        'ssh_connected': ssh_connected,
        'mysql_connected': mysql_connected,
        'ssh_error': ssh_error,
        'mysql_error': mysql_error
    }
    
    serializer = ConnectionStatusSerializer(data=data)
    if serializer.is_valid():
        return Response(serializer.validated_data, status=status.HTTP_200_OK)
    
    return Response(data, status=status.HTTP_200_OK)

@api_view(['POST'])
def reload_services(request):
    """Recarrega as configurações e reinicializa os serviços."""
    try:
        # Criar novas instâncias dos serviços que já leem as configurações atualizadas do arquivo
        # Como os serviços são criados a cada chamada, eles naturalmente usam as configurações mais recentes
        # Mas vamos forçar o recarregamento para garantir que conexões antigas sejam fechadas
        
        ssh_service = SSHService()
        db_service = DatabaseService()
        
        # Recarregar configurações explicitamente (fecha conexões antigas se houver)
        ssh_service.reload_config()
        db_service.reload_config()
        
        # Testar conexões com novas configurações
        ssh_connected = ssh_service.test_connection()
        mysql_connected = db_service.test_connection()
        
        logger.info(f"Serviços recarregados. SSH: {ssh_connected}, MySQL: {mysql_connected}")
        
        return Response({
            'message': 'Serviços recarregados com sucesso',
            'ssh_connected': ssh_connected,
            'mysql_connected': mysql_connected,
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao recarregar serviços: {e}")
        return Response({
            'error': str(e),
            'message': 'Erro ao recarregar serviços'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

