"""
ViewSet para gerenciar Pods.
Refatorado para usar módulo k8s/ nativo.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from api.serializers.models import PodSerializer, PodLogsSerializer
import logging

from k8s.pods import PodService

logger = logging.getLogger(__name__)


class PodViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar pods."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.pod_service = PodService()
    
    def list(self, request):
        """Lista todos os pods."""
        label_selector = request.query_params.get('label_selector', None)
        rpa_name = request.query_params.get('rpa_name', None)
        namespace = request.query_params.get('namespace', None)
        
        if rpa_name:
            label_selector = f"nome_robo={rpa_name.lower()}"
        
        # Buscar pods via API nativa (tempo real, sem cache)
        pods = self.pod_service.list(namespace=namespace, labels=label_selector)
        
        # Converter para dict para serialização
        pods_data = [pod.to_dict() for pod in pods]
        
        serializer = PodSerializer(pods_data, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um pod específico."""
        namespace = request.query_params.get('namespace', None)
        
        pod = self.pod_service.get(name=pk, namespace=namespace)
        
        if not pod:
            return Response({'error': 'Pod não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = PodSerializer(pod.to_dict())
        return Response(serializer.data)
    
    def destroy(self, request, pk=None):
        """Deleta um pod."""
        namespace = request.query_params.get('namespace', None)
        
        success = self.pod_service.delete(name=pk, namespace=namespace)
        
        if success:
            return Response({'message': 'Pod deletado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao deletar pod'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        """
        Obtém logs de um pod ou job.
        
        Se 'pk' for um nome de pod, busca os logs diretamente.
        Se for um nome de job, tenta encontrar o pod associado primeiro.
        """
        tail = request.query_params.get('tail', 100)
        namespace = request.query_params.get('namespace', None)
        
        try:
            tail = int(tail)
        except ValueError:
            tail = 100
        
        logger.info(f"[PODS] Requisição de logs para '{pk}' (namespace={namespace}, tail={tail})")
        
        # Primeiro tentar obter logs diretamente (pk é nome do pod)
        logs = self.pod_service.logs(name=pk, namespace=namespace, tail=tail)
        
        # Se falhar e parecer ser um job (não encontrou pod), tentar buscar pod do job
        if not logs or "não encontrado" in logs.lower() or "error" in logs.lower():
            logger.info(f"[PODS] Tentando buscar pod associado ao job '{pk}'")
            
            # Buscar pods associados a este job
            all_pods = self.pod_service.list()
            
            # Procurar pod com label job-name = pk
            job_pod = None
            for pod in all_pods:
                if pod.labels.get('job-name') == pk:
                    job_pod = pod
                    break
            
            if job_pod:
                logger.info(f"[PODS] Encontrado pod '{job_pod.name}' para o job '{pk}'")
                logs = self.pod_service.logs(name=job_pod.name, namespace=job_pod.namespace, tail=tail)
            else:
                logger.warning(f"[PODS] Nenhum pod encontrado para o job '{pk}'")
                logs = f"Nenhum pod encontrado para o job '{pk}'. O job pode ter sido concluído e o pod removido."
        
        if not logs:
            logs = "Nenhum log disponível para este pod."
        
        logger.info(f"[PODS] Retornando {len(logs)} caracteres de logs para '{pk}'")
        
        serializer = PodLogsSerializer({'logs': logs})
        return Response(serializer.data)
