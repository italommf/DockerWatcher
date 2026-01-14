"""
Serviço para gerenciar Jobs no Kubernetes.
"""

import logging
import time
from typing import List, Optional
from kubernetes import client
from kubernetes.client.rest import ApiException

from k8s.client import get_k8s_client
from k8s.models import Job

logger = logging.getLogger(__name__)


class JobService:
    """Serviço para operações com Jobs."""
    
    def __init__(self):
        self.client = get_k8s_client()
    
    def list(self, namespace: str = None, labels: str = None) -> List[Job]:
        """
        Lista jobs.
        
        Args:
            namespace: Namespace específico ou None para todos
            labels: Label selector (ex: "nome_robo=meu_rpa")
        """
        try:
            if namespace:
                result = self.client.batch.list_namespaced_job(
                    namespace=namespace,
                    label_selector=labels
                )
            else:
                result = self.client.batch.list_job_for_all_namespaces(
                    label_selector=labels
                )
            
            return [self._parse_job(j) for j in result.items]
        
        except ApiException as e:
            logger.error(f"Erro ao listar jobs: {e}")
            return []
    
    def get(self, name: str, namespace: str = None) -> Optional[Job]:
        """Obtém um job específico."""
        ns = namespace or self.client.namespace
        try:
            result = self.client.batch.read_namespaced_job(name=name, namespace=ns)
            return self._parse_job(result)
        except ApiException as e:
            if e.status == 404:
                return None
            logger.error(f"Erro ao obter job {name}: {e}")
            return None
    
    def count_active(self, label_selector: str) -> int:
        """Conta jobs ativos com determinado label."""
        jobs = self.list(labels=label_selector)
        return sum(j.active for j in jobs)
    
    def create(
        self,
        name: str,
        image: str,
        memory_limit: str = "512Mi",
        labels: dict = None,
        env: dict = None,
        ttl_seconds: int = 10,
        active_deadline: int = 600,
        volumes: list = None
    ) -> Optional[Job]:
        """
        Cria um novo Job.
        
        Args:
            name: Nome base do job (será adicionado timestamp)
            image: Imagem Docker
            memory_limit: Limite de memória (ex: "512Mi")
            labels: Labels do job
            env: Variáveis de ambiente
            ttl_seconds: Segundos para deletar após completar
            active_deadline: Timeout do job
            volumes: Lista de volumes [(name, hostPath, mountPath)]
        """
        ns = self.client.namespace
        job_name = f"{name}-{int(time.time())}"
        
        # Preparar env vars
        env_vars = []
        if env:
            for k, v in env.items():
                env_vars.append(client.V1EnvVar(name=k, value=str(v)))
        
        # Preparar volumes
        volume_mounts = []
        volume_specs = []
        if volumes:
            for vol_name, host_path, mount_path in volumes:
                volume_mounts.append(client.V1VolumeMount(
                    name=vol_name,
                    mount_path=mount_path
                ))
                volume_specs.append(client.V1Volume(
                    name=vol_name,
                    host_path=client.V1HostPathVolumeSource(
                        path=host_path,
                        type='Directory'
                    )
                ))
        
        # Container spec
        container = client.V1Container(
            name='worker',
            image=image,
            image_pull_policy='Always',
            env=env_vars if env_vars else None,
            resources=client.V1ResourceRequirements(
                limits={'memory': memory_limit}
            ),
            volume_mounts=volume_mounts if volume_mounts else None
        )
        
        # Pod template
        template = client.V1PodTemplateSpec(
            metadata=client.V1ObjectMeta(labels=labels),
            spec=client.V1PodSpec(
                restart_policy='Never',
                image_pull_secrets=[
                    client.V1LocalObjectReference(name='docker-hub-secret')
                ],
                containers=[container],
                volumes=volume_specs if volume_specs else None
            )
        )
        
        # Job spec
        job_spec = client.V1JobSpec(
            ttl_seconds_after_finished=ttl_seconds,
            active_deadline_seconds=active_deadline,
            template=template
        )
        
        # Job object
        job = client.V1Job(
            api_version='batch/v1',
            kind='Job',
            metadata=client.V1ObjectMeta(
                name=job_name,
                labels=labels
            ),
            spec=job_spec
        )
        
        try:
            result = self.client.batch.create_namespaced_job(namespace=ns, body=job)
            logger.info(f"Job '{job_name}' criado")
            return self._parse_job(result)
        except ApiException as e:
            logger.error(f"Erro ao criar job: {e}")
            return None
    
    def delete(self, name: str, namespace: str = None) -> bool:
        """Deleta um job."""
        ns = namespace or self.client.namespace
        
        # Se namespace não foi passado, tentar encontrar
        if not namespace:
            job = self.get(name)
            if job:
                ns = job.namespace
        
        try:
            self.client.batch.delete_namespaced_job(
                name=name,
                namespace=ns,
                propagation_policy='Background'
            )
            logger.info(f"Job '{name}' deletado")
            return True
        except ApiException as e:
            if e.status == 404:
                return True
            logger.error(f"Erro ao deletar job {name}: {e}")
            return False
    
    def _parse_job(self, job) -> Job:
        """Converte objeto K8s para DTO."""
        status = job.status
        
        # Determinar status
        job_status = 'Pending'
        if status.active and status.active > 0:
            job_status = 'Running'
        elif status.failed and status.failed > 0:
            job_status = 'Failed'
        elif status.succeeded and status.succeeded > 0:
            job_status = 'Succeeded'
        
        # Extrair imagem
        image = ''
        try:
            image = job.spec.template.spec.containers[0].image
        except:
            pass
        
        return Job(
            name=job.metadata.name,
            namespace=job.metadata.namespace or 'default',
            active=status.active or 0,
            succeeded=status.succeeded or 0,
            failed=status.failed or 0,
            status=job_status,
            image=image,
            start_time=status.start_time,
            completion_time=status.completion_time,
            labels=job.metadata.labels or {}
        )
