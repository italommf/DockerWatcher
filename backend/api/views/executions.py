"""
ViewSet para execuções.
Refatorado - placeholder até integrar API MongoDB.
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from api.serializers.models import ExecutionSerializer
import logging

logger = logging.getLogger(__name__)


class ExecutionViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar execuções."""
    
    def list(self, request):
        """Lista execuções pendentes."""
        # TODO: Integrar com API MongoDB de execuções
        rpa_name = request.query_params.get('rpa_name', None)
        
        # Por enquanto retorna lista vazia
        # Será integrado com executions_api_service quando API MongoDB estiver pronta
        execucoes = []
        
        serializer = ExecutionSerializer(execucoes, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém execuções de um RPA específico."""
        # TODO: Integrar com API MongoDB
        execucoes = []
        
        serializer = ExecutionSerializer(execucoes, many=True)
        return Response(serializer.data)
