from rest_framework import viewsets, status
from rest_framework.response import Response
from services.cache_service import CacheKeys, CacheService
from api.serializers.models import ExecutionSerializer
import logging

logger = logging.getLogger(__name__)

class ExecutionViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar execuções do banco de dados."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.file_service = None  # Compatibilidade mantida, mas cache é a fonte primária
    
    def list(self, request):
        """Lista execuções pendentes (status_01=4) do banco de dados."""
        rpa_name = request.query_params.get('rpa_name', None)
        
        execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
        execucoes = []
        if rpa_name:
            execucoes = self._buscar_execucoes_cache(rpa_name, execucoes_por_robo)
        else:
            for execs in execucoes_por_robo.values():
                execucoes.extend(execs)
        
        serializer = ExecutionSerializer(execucoes, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém execuções pendentes de um RPA específico."""
        try:
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            execucoes = self._buscar_execucoes_cache(pk, execucoes_por_robo)
            serializer = ExecutionSerializer(execucoes, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao obter execuções: {e}")
            return Response(
                {'error': f'Erro ao obter execuções: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _buscar_execucoes_cache(self, nome_rpa, exec_cache):
        execucoes = exec_cache.get(nome_rpa, [])
        if execucoes:
            return execucoes
        nome_normalizado = nome_rpa.replace('-', '').replace('_', '').lower()
        for nome_db, execs in exec_cache.items():
            if nome_normalizado == nome_db.replace('-', '').replace('_', '').lower():
                return execs
        return []

