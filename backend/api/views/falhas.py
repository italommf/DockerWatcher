from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.service_manager import get_kubernetes_service
from api.models import FailedPod
from api.serializers.models import PodSerializer, PodLogsSerializer
import logging

logger = logging.getLogger(__name__)

class FalhasViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar pods com falhas."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.k8s_service = get_kubernetes_service()
    
    def list(self, request):
        """Lista todos os pods com falhas do banco de dados."""
        try:
            # Buscar pods com falhas do banco de dados
            failed_pods = FailedPod.objects.all().order_by('-failed_at')
            
            # Converter para formato compatível com o serializer
            pods_data = []
            for failed_pod in failed_pods:
                labels = failed_pod.labels or {}
                # Garantir que o nome_robo esteja nos labels para compatibilidade com o frontend
                if failed_pod.nome_robo and 'nome_robo' not in labels:
                    labels['nome_robo'] = failed_pod.nome_robo
                
                pod_data = {
                    'name': failed_pod.name,
                    'namespace': failed_pod.namespace,
                    'labels': labels,
                    'phase': failed_pod.phase,
                    'status': failed_pod.status,
                    'start_time': failed_pod.start_time,
                    'containers': failed_pod.containers or [],
                    'nome_robo': failed_pod.nome_robo,  # Incluir nome_robo diretamente
                    'failed_at': failed_pod.failed_at.isoformat() if failed_pod.failed_at else None,
                }
                pods_data.append(pod_data)
            
            serializer = PodSerializer(pods_data, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar pods com falhas: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um pod com falha específico."""
        try:
            failed_pod = FailedPod.objects.filter(name=pk).first()
            
            if not failed_pod:
                return Response({'error': 'Pod com falha não encontrado'}, status=status.HTTP_404_NOT_FOUND)
            
            labels = failed_pod.labels or {}
            # Garantir que o nome_robo esteja nos labels para compatibilidade com o frontend
            if failed_pod.nome_robo and 'nome_robo' not in labels:
                labels['nome_robo'] = failed_pod.nome_robo
            
            pod_data = {
                'name': failed_pod.name,
                'namespace': failed_pod.namespace,
                'labels': labels,
                'phase': failed_pod.phase,
                'status': failed_pod.status,
                'start_time': failed_pod.start_time,
                'containers': failed_pod.containers or [],
                'nome_robo': failed_pod.nome_robo,  # Incluir nome_robo diretamente
                'failed_at': failed_pod.failed_at.isoformat() if failed_pod.failed_at else None,
            }
            
            serializer = PodSerializer(pod_data)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao recuperar pod com falha: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """Obtém logs de um pod com falha (do banco de dados)."""
        try:
            failed_pod = FailedPod.objects.filter(name=pk).first()
            
            if not failed_pod:
                return Response({'error': 'Pod com falha não encontrado'}, status=status.HTTP_404_NOT_FOUND)
            
            logs = failed_pod.logs or 'Nenhum log disponível'
            serializer = PodLogsSerializer({'logs': logs})
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao obter logs do pod com falha: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

