"""
ViewSet para pods com falhas.
Refatorado - sem referências a kubernetes_service antigo.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from api.models import FailedPod
from api.serializers.models import PodSerializer, PodLogsSerializer
import logging

logger = logging.getLogger(__name__)


class FalhasViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar pods com falhas."""
    
    def list(self, request):
        """Lista todos os pods com falhas do banco de dados."""
        try:
            failed_pods = FailedPod.objects.all().order_by('-failed_at')
            
            pods_data = []
            for failed_pod in failed_pods:
                labels = failed_pod.labels or {}
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
                    'nome_robo': failed_pod.nome_robo,
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
                return Response({'error': 'Pod não encontrado'}, status=status.HTTP_404_NOT_FOUND)
            
            labels = failed_pod.labels or {}
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
                'nome_robo': failed_pod.nome_robo,
                'failed_at': failed_pod.failed_at.isoformat() if failed_pod.failed_at else None,
            }
            
            serializer = PodSerializer(pod_data)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """Obtém logs de um pod com falha."""
        try:
            failed_pod = FailedPod.objects.filter(name=pk).first()
            
            if not failed_pod:
                return Response({'error': 'Pod não encontrado'}, status=status.HTTP_404_NOT_FOUND)
            
            logs = failed_pod.logs or 'Nenhum log disponível'
            serializer = PodLogsSerializer({'logs': logs})
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
