"""
Serviço para gerenciar Pods no Kubernetes.
"""

import logging
from typing import List, Optional
from kubernetes.client.rest import ApiException

from k8s.client import get_k8s_client
from k8s.models import Pod, Container, ContainerState

logger = logging.getLogger(__name__)


class PodService:
    """Serviço para operações com Pods."""
    
    def __init__(self):
        self.client = get_k8s_client()
    
    def list(self, namespace: str = None, labels: str = None) -> List[Pod]:
        """
        Lista pods.
        
        Args:
            namespace: Namespace específico ou None para todos
            labels: Label selector (ex: "app=myapp")
        
        Returns:
            Lista de Pods
        """
        try:
            if namespace:
                result = self.client.core.list_namespaced_pod(
                    namespace=namespace,
                    label_selector=labels,
                    _request_timeout=5
                )
            else:
                result = self.client.core.list_pod_for_all_namespaces(
                    label_selector=labels,
                    _request_timeout=5
                )
            
            return [self._parse_pod(p) for p in result.items]
        
        except ApiException as e:
            logger.error(f"Erro ao listar pods: {e}")
            return []
    
    def get(self, name: str, namespace: str = None) -> Optional[Pod]:
        """Obtém um pod específico."""
        ns = namespace or self.client.namespace
        try:
            result = self.client.core.read_namespaced_pod(name=name, namespace=ns)
            return self._parse_pod(result)
        except ApiException as e:
            if e.status == 404:
                return None
            logger.error(f"Erro ao obter pod {name}: {e}")
            return None
    
    def delete(self, name: str, namespace: str = None) -> bool:
        """Deleta um pod."""
        ns = namespace or self.client.namespace
        try:
            self.client.core.delete_namespaced_pod(name=name, namespace=ns)
            logger.info(f"Pod '{name}' deletado")
            return True
        except ApiException as e:
            if e.status == 404:
                return True  # Já não existe
            logger.error(f"Erro ao deletar pod {name}: {e}")
            return False
    
    def logs(self, name: str, namespace: str = None, tail: int = 100) -> str:
        """
        Obtém logs de um pod.
        
        Args:
            name: Nome do pod
            namespace: Namespace
            tail: Número de linhas do final
        """
        ns = namespace or self.client.namespace
        
        # Se namespace não foi passado, tentar encontrar
        if not namespace:
            pod = self._find_pod_namespace(name)
            if pod:
                ns = pod
        
        try:
            return self.client.core.read_namespaced_pod_log(
                name=name,
                namespace=ns,
                tail_lines=tail
            )
        except ApiException as e:
            logger.error(f"Erro ao obter logs de {name}: {e}")
            return f"Erro ao obter logs: {e.reason}"
    
    def _find_pod_namespace(self, name: str) -> Optional[str]:
        """Encontra o namespace de um pod pelo nome."""
        pods = self.list()
        for pod in pods:
            if pod.name == name:
                return pod.namespace
        return None
    
    def _parse_pod(self, pod) -> Pod:
        """Converte objeto K8s para DTO."""
        containers = []
        
        if pod.status.container_statuses:
            for cs in pod.status.container_statuses:
                state = self._parse_container_state(cs.state)
                containers.append(Container(
                    name=cs.name,
                    ready=cs.ready,
                    restart_count=cs.restart_count,
                    state=state,
                    image=cs.image or ''
                ))
        
        return Pod(
            name=pod.metadata.name,
            namespace=pod.metadata.namespace or 'default',
            phase=pod.status.phase or 'Unknown',
            status=self._get_pod_status(pod.status),
            labels=pod.metadata.labels or {},
            start_time=pod.status.start_time,
            containers=containers,
            node=pod.spec.node_name or ''
        )
    
    def _get_pod_status(self, status) -> str:
        """Determina status detalhado do pod."""
        phase = status.phase or 'Unknown'
        
        if phase in ('Failed', 'Succeeded'):
            return phase
        
        if phase == 'Running' and status.container_statuses:
            for cs in status.container_statuses:
                if cs.state and cs.state.waiting:
                    reason = cs.state.waiting.reason or ''
                    if 'CrashLoopBackOff' in reason:
                        return 'CrashLoopBackOff'
                    if 'Error' in reason:
                        return 'Error'
                if cs.state and cs.state.terminated:
                    if cs.state.terminated.exit_code != 0:
                        return 'Error'
        
        return phase
    
    def _parse_container_state(self, state) -> Optional[ContainerState]:
        """Converte estado do container."""
        if not state:
            return None
        
        if state.running:
            return ContainerState(
                type='running',
                started_at=state.running.started_at
            )
        elif state.waiting:
            return ContainerState(
                type='waiting',
                reason=state.waiting.reason or '',
                message=state.waiting.message or ''
            )
        elif state.terminated:
            return ContainerState(
                type='terminated',
                reason=state.terminated.reason or '',
                exit_code=state.terminated.exit_code,
                finished_at=state.terminated.finished_at
            )
        
        return None
