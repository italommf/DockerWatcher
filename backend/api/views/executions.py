from rest_framework import viewsets, status
from rest_framework.response import Response
from backend.services.service_manager import (
    get_database_service,
    get_file_service
)
from api.serializers.models import ExecutionSerializer
import logging

logger = logging.getLogger(__name__)

class ExecutionViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar execuções do banco de dados."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Usar serviços singleton para evitar reconexões constantes
        self.db_service = get_database_service()
        self.file_service = get_file_service()
    
    def list(self, request):
        """Lista execuções pendentes (status_01=4) do banco de dados."""
        rpa_name = request.query_params.get('rpa_name', None)
        
        # Obter lista de RPAs ativos
        lista_json_rpas = self.file_service.obter_json_rpas()
        lista_nomes_rpas = []
        
        for rpa_path in lista_json_rpas:
            rpa_data = self.file_service.ler_json_rpa(rpa_path)
            if rpa_data:
                nome_rpa = rpa_data.get('nome_rpa')
                if nome_rpa and (not rpa_name or nome_rpa == rpa_name):
                    lista_nomes_rpas.append(nome_rpa)
        
        if not lista_nomes_rpas:
            return Response([])
        
        # Obter execuções do banco
        execucoes_por_robo = self.db_service.obter_execucoes(lista_nomes_rpas)
        
        # Flatten para lista simples
        execucoes = []
        for nome_robo, execs in execucoes_por_robo.items():
            execucoes.extend(execs)
        
        serializer = ExecutionSerializer(execucoes, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém execuções pendentes de um RPA específico."""
        try:
            execucoes = self.db_service.obter_execucoes_por_rpa(pk)
            serializer = ExecutionSerializer(execucoes, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao obter execuções: {e}")
            return Response(
                {'error': f'Erro ao obter execuções: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

