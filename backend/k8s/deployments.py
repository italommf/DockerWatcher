"""
Serviço para gerenciar Deployments no Kubernetes.
"""

import logging
from typing import List, Optional
from kubernetes import client
from kubernetes.client.rest import ApiException

from k8s.client import get_k8s_client
from k8s.models import Deployment

logger = logging.getLogger(__name__)


class DeploymentService:
    """Serviço para operações com Deployments."""
    
    def __init__(self):
        self.client = get_k8s_client()
    
    def list(self, namespace: str = None) -> List[Deployment]:
        """Lista deployments."""
        try:
            if namespace:
                result = self.client.apps.list_namespaced_deployment(namespace=namespace)
            else:
                result = self.client.apps.list_deployment_for_all_namespaces()
            
            return [self._parse_deployment(d) for d in result.items]
        
        except ApiException as e:
            logger.error(f"Erro ao listar deployments: {e}")
            return []
    
    def get(self, name: str, namespace: str = None) -> Optional[Deployment]:
        """Obtém um deployment específico."""
        ns = namespace or self.client.namespace
        try:
            result = self.client.apps.read_namespaced_deployment(name=name, namespace=ns)
            return self._parse_deployment(result)
        except ApiException as e:
            if e.status == 404:
                return None
            logger.error(f"Erro ao obter deployment {name}: {e}")
            return None
    
    def create(
        self,
        name: str,
        image: str,
        replicas: int = 1,
        memory_limit: str = "512Mi",
        labels: dict = None,
        env: dict = None,
        port: int = None
    ) -> Optional[Deployment]:
        """
        Cria um novo Deployment.
        
        Args:
            name: Nome do deployment
            image: Imagem Docker
            replicas: Número de réplicas
            memory_limit: Limite de memória
            labels: Labels
            env: Variáveis de ambiente
            port: Porta do container (opcional)
        """
        ns = self.client.namespace
        
        # Labels padrão
        if not labels:
            labels = {'app': name}
        
        # Preparar env vars
        env_vars = []
        if env:
            for k, v in env.items():
                env_vars.append(client.V1EnvVar(name=k, value=str(v)))
        
        # Preparar ports
        ports = None
        if port:
            ports = [client.V1ContainerPort(container_port=port)]
        
        # Container
        container = client.V1Container(
            name=name,
            image=image,
            image_pull_policy='Always',
            env=env_vars if env_vars else None,
            ports=ports,
            resources=client.V1ResourceRequirements(
                limits={'memory': memory_limit}
            )
        )
        
        # Deployment spec
        deployment = client.V1Deployment(
            api_version='apps/v1',
            kind='Deployment',
            metadata=client.V1ObjectMeta(
                name=name,
                labels=labels
            ),
            spec=client.V1DeploymentSpec(
                replicas=replicas,
                selector=client.V1LabelSelector(
                    match_labels=labels
                ),
                template=client.V1PodTemplateSpec(
                    metadata=client.V1ObjectMeta(labels=labels),
                    spec=client.V1PodSpec(
                        containers=[container],
                        image_pull_secrets=[
                            client.V1LocalObjectReference(name='docker-hub-secret')
                        ]
                    )
                )
            )
        )
        
        try:
            result = self.client.apps.create_namespaced_deployment(namespace=ns, body=deployment)
            logger.info(f"Deployment '{name}' criado com {replicas} réplicas")
            return self._parse_deployment(result)
        except ApiException as e:
            logger.error(f"Erro ao criar deployment: {e}")
            return None
    
    def delete(self, name: str, namespace: str = None) -> bool:
        """Deleta um deployment."""
        ns = namespace or self.client.namespace
        try:
            self.client.apps.delete_namespaced_deployment(name=name, namespace=ns)
            logger.info(f"Deployment '{name}' deletado")
            return True
        except ApiException as e:
            if e.status == 404:
                return True
            logger.error(f"Erro ao deletar deployment {name}: {e}")
            return False
    
    def scale(self, name: str, replicas: int, namespace: str = None) -> bool:
        """
        Escala um deployment.
        
        Args:
            name: Nome do deployment
            replicas: Novo número de réplicas
            namespace: Namespace
        """
        ns = namespace or self.client.namespace
        try:
            self.client.apps.patch_namespaced_deployment_scale(
                name=name,
                namespace=ns,
                body={'spec': {'replicas': replicas}}
            )
            logger.info(f"Deployment '{name}' escalado para {replicas} réplicas")
            return True
        except ApiException as e:
            logger.error(f"Erro ao escalar deployment {name}: {e}")
            return False
    
    def update_image(self, name: str, image: str, namespace: str = None, container: str = None) -> bool:
        """
        Atualiza imagem de um deployment (rolling update).
        
        Args:
            name: Nome do deployment
            image: Nova imagem
            namespace: Namespace
            container: Nome do container (default: mesmo nome do deployment)
        """
        ns = namespace or self.client.namespace
        container_name = container or name
        
        try:
            self.client.apps.patch_namespaced_deployment(
                name=name,
                namespace=ns,
                body={
                    'spec': {
                        'template': {
                            'spec': {
                                'containers': [{
                                    'name': container_name,
                                    'image': image
                                }]
                            }
                        }
                    }
                }
            )
            logger.info(f"Deployment '{name}' atualizado para imagem '{image}'")
            return True
        except ApiException as e:
            logger.error(f"Erro ao atualizar imagem de {name}: {e}")
            return False
    
    def _parse_deployment(self, dep) -> Deployment:
        """Converte objeto K8s para DTO."""
        status = dep.status
        
        # Extrair imagem
        image = ''
        try:
            image = dep.spec.template.spec.containers[0].image
        except:
            pass
        
        return Deployment(
            name=dep.metadata.name,
            namespace=dep.metadata.namespace or 'default',
            replicas=dep.spec.replicas or 0,
            ready_replicas=status.ready_replicas or 0 if status else 0,
            available_replicas=status.available_replicas or 0 if status else 0,
            image=image
        )
