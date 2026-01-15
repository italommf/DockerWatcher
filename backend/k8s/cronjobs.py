"""
Serviço para gerenciar CronJobs no Kubernetes.
"""

import logging
import time
from typing import List, Optional
from kubernetes import client
from kubernetes.client.rest import ApiException

from k8s.client import get_k8s_client
from k8s.models import CronJob

logger = logging.getLogger(__name__)


class CronJobService:
    """Serviço para operações com CronJobs."""
    
    def __init__(self):
        self.client = get_k8s_client()
    
    def list(self, namespace: str = None) -> List[CronJob]:
        """Lista cronjobs."""
        try:
            if namespace:
                result = self.client.batch.list_namespaced_cron_job(namespace=namespace, _request_timeout=5)
            else:
                result = self.client.batch.list_cron_job_for_all_namespaces(_request_timeout=5)
            
            return [self._parse_cronjob(cj) for cj in result.items]
        
        except ApiException as e:
            logger.error(f"Erro ao listar cronjobs: {e}")
            return []
    
    def get(self, name: str, namespace: str = None) -> Optional[CronJob]:
        """Obtém um cronjob específico."""
        ns = namespace or self.client.namespace
        try:
            result = self.client.batch.read_namespaced_cron_job(name=name, namespace=ns)
            return self._parse_cronjob(result)
        except ApiException as e:
            if e.status == 404:
                return None
            logger.error(f"Erro ao obter cronjob {name}: {e}")
            return None
    
    def exists(self, name: str, namespace: str = None) -> bool:
        """Verifica se cronjob existe."""
        return self.get(name, namespace) is not None
    
    def create(
        self,
        name: str,
        schedule: str,
        image: str,
        memory_limit: str = "512Mi",
        labels: dict = None,
        env: dict = None,
        timezone: str = "America/Sao_Paulo",
        ttl_seconds: int = 60
    ) -> Optional[CronJob]:
        """
        Cria um novo CronJob.
        
        Args:
            name: Nome do cronjob
            schedule: Expressão cron (ex: "0 8 * * *")
            image: Imagem Docker
            memory_limit: Limite de memória
            labels: Labels
            env: Variáveis de ambiente
            timezone: Timezone (padrão: America/Sao_Paulo)
            ttl_seconds: TTL após conclusão do job
        """
        ns = self.client.namespace
        
        # Preparar env vars
        env_vars = []
        if env:
            for k, v in env.items():
                env_vars.append(client.V1EnvVar(name=k, value=str(v)))
        
        # Container
        container = client.V1Container(
            name='worker',
            image=image,
            image_pull_policy='Always',
            env=env_vars if env_vars else None,
            resources=client.V1ResourceRequirements(
                limits={'memory': memory_limit}
            )
        )
        
        # Job template
        job_template = client.V1JobTemplateSpec(
            spec=client.V1JobSpec(
                ttl_seconds_after_finished=ttl_seconds,
                template=client.V1PodTemplateSpec(
                    spec=client.V1PodSpec(
                        restart_policy='Never',
                        image_pull_secrets=[
                            client.V1LocalObjectReference(name='docker-hub-secret')
                        ],
                        containers=[container]
                    )
                )
            )
        )
        
        # CronJob spec
        cronjob = client.V1CronJob(
            api_version='batch/v1',
            kind='CronJob',
            metadata=client.V1ObjectMeta(
                name=name,
                labels=labels
            ),
            spec=client.V1CronJobSpec(
                schedule=schedule,
                time_zone=timezone,
                job_template=job_template,
                suspend=False
            )
        )
        
        try:
            result = self.client.batch.create_namespaced_cron_job(namespace=ns, body=cronjob)
            logger.info(f"CronJob '{name}' criado")
            return self._parse_cronjob(result)
        except ApiException as e:
            logger.error(f"Erro ao criar cronjob: {e}")
            return None
    
    def delete(self, name: str, namespace: str = None) -> bool:
        """Deleta um cronjob."""
        ns = namespace or self.client.namespace
        try:
            self.client.batch.delete_namespaced_cron_job(name=name, namespace=ns)
            logger.info(f"CronJob '{name}' deletado")
            return True
        except ApiException as e:
            if e.status == 404:
                return True
            logger.error(f"Erro ao deletar cronjob {name}: {e}")
            return False
    
    def suspend(self, name: str, namespace: str = None) -> bool:
        """Suspende um cronjob."""
        ns = namespace or self.client.namespace
        try:
            self.client.batch.patch_namespaced_cron_job(
                name=name,
                namespace=ns,
                body={'spec': {'suspend': True}}
            )
            logger.info(f"CronJob '{name}' suspenso")
            return True
        except ApiException as e:
            logger.error(f"Erro ao suspender cronjob {name}: {e}")
            return False
    
    def resume(self, name: str, namespace: str = None) -> bool:
        """Reativa um cronjob."""
        ns = namespace or self.client.namespace
        try:
            self.client.batch.patch_namespaced_cron_job(
                name=name,
                namespace=ns,
                body={'spec': {'suspend': False}}
            )
            logger.info(f"CronJob '{name}' reativado")
            return True
        except ApiException as e:
            logger.error(f"Erro ao reativar cronjob {name}: {e}")
            return False
    
    def trigger_now(self, name: str, namespace: str = None) -> bool:
        """Cria job imediato a partir de cronjob (executar agora)."""
        ns = namespace or self.client.namespace
        
        try:
            # Buscar cronjob para obter template
            cronjob = self.client.batch.read_namespaced_cron_job(name=name, namespace=ns)
            
            # Criar job com nome único
            job_name = f"{name}-manual-{int(time.time())}"
            
            job = client.V1Job(
                api_version='batch/v1',
                kind='Job',
                metadata=client.V1ObjectMeta(
                    name=job_name,
                    labels=cronjob.spec.job_template.metadata.labels if cronjob.spec.job_template.metadata else None
                ),
                spec=cronjob.spec.job_template.spec
            )
            
            self.client.batch.create_namespaced_job(namespace=ns, body=job)
            logger.info(f"Job '{job_name}' criado a partir de '{name}'")
            return True
        
        except ApiException as e:
            logger.error(f"Erro ao criar job de cronjob {name}: {e}")
            return False
    
    def _parse_cronjob(self, cj) -> CronJob:
        """Converte objeto K8s para DTO."""
        # Extrair imagem
        image = ''
        try:
            image = cj.spec.job_template.spec.template.spec.containers[0].image
        except:
            pass
        
        return CronJob(
            name=cj.metadata.name,
            namespace=cj.metadata.namespace or 'default',
            schedule=cj.spec.schedule,
            suspended=cj.spec.suspend or False,
            last_schedule_time=cj.status.last_schedule_time if cj.status else None,
            last_successful_time=cj.status.last_successful_time if cj.status else None,
            image=image,
            timezone=cj.spec.time_zone or 'America/Sao_Paulo'
        )
