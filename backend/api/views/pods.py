from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from services.cache_service import CacheKeys, CacheService
from services.service_manager import get_kubernetes_service
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
        
        pods = CacheService.get_data(CacheKeys.PODS, []) or []
        if not pods:
            pods = self.k8s_service.get_pods()
            CacheService.update(CacheKeys.PODS, pods)
        if label_selector:
            pods = self._filter_by_label(pods, label_selector)
        
        serializer = PodSerializer(pods, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um pod específico."""
        pods = CacheService.get_data(CacheKeys.PODS, []) or []
        if not pods:
            pods = self.k8s_service.get_pods()
            CacheService.update(CacheKeys.PODS, pods)
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
        """Obtém logs de um pod ou job.
        
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
        logs = self.k8s_service.get_pod_logs(pk, tail=tail, namespace=namespace)
        
        # Se falhar e parecer ser um job (não encontrou pod), tentar buscar pod do job
        if not logs or "não encontrado" in logs.lower() or "error" in logs.lower():
            logger.info(f"[PODS] Tentando buscar pod associado ao job '{pk}'")
            
            # Buscar pods associados a este job
            all_pods = CacheService.get_data(CacheKeys.PODS, []) or self.k8s_service.get_pods()
            
            # Procurar pod com label job-name = pk
            job_pod = None
            for pod in all_pods:
                labels = pod.get('labels', {})
                if labels.get('job-name') == pk:
                    job_pod = pod
                    break
            
            if job_pod:
                pod_name = job_pod.get('name', '')
                pod_namespace = job_pod.get('namespace', namespace)
                logger.info(f"[PODS] Encontrado pod '{pod_name}' para o job '{pk}'")
                logs = self.k8s_service.get_pod_logs(pod_name, tail=tail, namespace=pod_namespace)
            else:
                logger.warning(f"[PODS] Nenhum pod encontrado para o job '{pk}'")
                logs = f"Nenhum pod encontrado para o job '{pk}'. O job pode ter sido concluído e o pod removido."
        
        if not logs:
            logs = "Nenhum log disponível para este pod."
        
        logger.info(f"[PODS] Retornando {len(logs)} caracteres de logs para '{pk}'")
        
        serializer = PodLogsSerializer({'logs': logs})
        return Response(serializer.data)

    def _filter_by_label(self, pods, label_selector: str):
        if not label_selector or '=' not in label_selector:
            return pods
        key, value = [part.strip() for part in label_selector.split('=', 1)]
        if not key:
            return pods
        filtered = []
        for pod in pods:
            labels = pod.get('labels', {}) if isinstance(pod, dict) else {}
            if labels.get(key) == value:
                filtered.append(pod)
        return filtered

