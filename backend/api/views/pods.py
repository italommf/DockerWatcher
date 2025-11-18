from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.service_manager import get_kubernetes_service
from api.serializers.models import PodSerializer, PodLogsSerializer
import logging

logger = logging.getLogger(__name__)

class PodViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar pods."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Usar serviços singleton para evitar reconexões constantes
        self.k8s_service = get_kubernetes_service()
    
    def list(self, request):
        """Lista todos os pods."""
        label_selector = request.query_params.get('label_selector', None)
        rpa_name = request.query_params.get('rpa_name', None)
        
        if rpa_name:
            label_selector = f"nome_robo={rpa_name.lower()}"
        
        pods = self.k8s_service.get_pods(label_selector)
        
        serializer = PodSerializer(pods, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um pod específico."""
        pods = self.k8s_service.get_pods()
        pod = next((p for p in pods if p['name'] == pk), None)
        
        if not pod:
            return Response({'error': 'Pod não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = PodSerializer(pod)
        return Response(serializer.data)
    
    def destroy(self, request, pk=None):
        """Deleta um pod."""
        success = self.k8s_service.delete_pod(pk)
        
        if success:
            return Response({'message': 'Pod deletado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao deletar pod'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """Obtém logs de um pod."""
        tail = request.query_params.get('tail', 100)
        try:
            tail = int(tail)
        except ValueError:
            tail = 100
        
        logs = self.k8s_service.get_pod_logs(pk, tail=tail)
        
        serializer = PodLogsSerializer({'logs': logs})
        return Response(serializer.data)

