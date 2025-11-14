import yaml
import logging
import re
from typing import List, Dict, Optional
from backend.services.ssh_service import SSHService

logger = logging.getLogger(__name__)

class KubernetesService:
    """Serviço para executar comandos kubectl via SSH."""
    
    def __init__(self):
        self.ssh_service = SSHService()
    
    def get_pods(self, label_selector: str = None) -> List[Dict]:
        """
        Lista pods com informações detalhadas.
        
        Args:
            label_selector: Filtro por labels (ex: "nome_robo=att_infos_bitrix")
        
        Returns:
            Lista de dicionários com informações dos pods
        """
        cmd = "kubectl get pods -o json"
        if label_selector:
            cmd += f" -l {label_selector}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao listar pods: {stderr}")
                return []
            
            import json
            data = json.loads(stdout)
            pods = []
            
            for item in data.get('items', []):
                metadata = item.get('metadata', {})
                status = item.get('status', {})
                spec = item.get('spec', {})
                
                pod_info = {
                    'name': metadata.get('name', ''),
                    'namespace': metadata.get('namespace', 'default'),
                    'labels': metadata.get('labels', {}),
                    'phase': status.get('phase', 'Unknown'),
                    'status': self._get_pod_status(status),
                    'start_time': status.get('startTime', ''),
                    'containers': []
                }
                
                # Informações dos containers
                for container in status.get('containerStatuses', []):
                    container_info = {
                        'name': container.get('name', ''),
                        'ready': container.get('ready', False),
                        'restart_count': container.get('restartCount', 0),
                        'state': self._get_container_state(container.get('state', {}))
                    }
                    pod_info['containers'].append(container_info)
                
                pods.append(pod_info)
            
            return pods
        except Exception as e:
            logger.error(f"Erro ao processar pods: {e}")
            return []
    
    def _get_pod_status(self, status: Dict) -> str:
        """Determina o status detalhado de um pod."""
        phase = status.get('phase', 'Unknown')
        
        if phase == 'Failed':
            return 'Failed'
        elif phase == 'Succeeded':
            return 'Succeeded'
        elif phase == 'Running':
            # Verificar se os containers estão prontos
            container_statuses = status.get('containerStatuses', [])
            if container_statuses:
                for container in container_statuses:
                    state = container.get('state', {})
                    if 'waiting' in state:
                        reason = state['waiting'].get('reason', '')
                        if 'CrashLoopBackOff' in reason:
                            return 'CrashLoopBackOff'
                        if 'Error' in reason:
                            return 'Error'
                    if 'terminated' in state:
                        if state['terminated'].get('exitCode', 0) != 0:
                            return 'Error'
            return 'Running'
        elif phase == 'Pending':
            return 'Pending'
        else:
            return phase
    
    def _get_container_state(self, state: Dict) -> Dict:
        """Extrai informações de estado do container."""
        if 'running' in state:
            return {'type': 'running', 'started': state['running'].get('startedAt', '')}
        elif 'waiting' in state:
            return {
                'type': 'waiting',
                'reason': state['waiting'].get('reason', ''),
                'message': state['waiting'].get('message', '')
            }
        elif 'terminated' in state:
            return {
                'type': 'terminated',
                'exit_code': state['terminated'].get('exitCode', 0),
                'reason': state['terminated'].get('reason', ''),
                'finished': state['terminated'].get('finishedAt', '')
            }
        return {'type': 'unknown'}
    
    def get_jobs(self, label_selector: str = None) -> List[Dict]:
        """Lista jobs com informações detalhadas."""
        cmd = "kubectl get jobs -o json"
        if label_selector:
            cmd += f" -l {label_selector}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao listar jobs: {stderr}")
                return []
            
            import json
            data = json.loads(stdout)
            jobs = []
            
            for item in data.get('items', []):
                metadata = item.get('metadata', {})
                status = item.get('status', {})
                
                job_info = {
                    'name': metadata.get('name', ''),
                    'namespace': metadata.get('namespace', 'default'),
                    'labels': metadata.get('labels', {}),
                    'completions': status.get('succeeded', 0),
                    'active': status.get('active', 0),
                    'failed': status.get('failed', 0),
                    'start_time': status.get('startTime', ''),
                    'completion_time': status.get('completionTime', '')
                }
                
                jobs.append(job_info)
            
            return jobs
        except Exception as e:
            logger.error(f"Erro ao processar jobs: {e}")
            return []
    
    def count_active_jobs(self, nome_do_robo: str) -> int:
        """Conta jobs ativos de um RPA específico."""
        label_selector = f"nome_robo={nome_do_robo.lower()}"
        pods = self.get_pods(label_selector)
        
        count = 0
        for pod in pods:
            phase = pod.get('phase', '')
            status = pod.get('status', '')
            # Contar apenas Running, Pending ou Succeeded (mas ainda não terminou completamente)
            if phase in ['Running', 'Pending'] or (phase == 'Succeeded' and status == 'Succeeded'):
                count += 1
        
        return count
    
    def create_job(self, nome_rpa: str, docker_tag: str, qtd_ram_maxima: int,
                   qtd_max_instancias: int, utiliza_arquivos_externos: bool = False,
                   tempo_maximo_de_vida: int = 600) -> bool:
        """
        Cria um job Kubernetes para um RPA.
        
        Args:
            nome_rpa: Nome do RPA
            docker_tag: Tag da imagem Docker
            qtd_ram_maxima: RAM máxima em MB
            qtd_max_instancias: Quantidade máxima de instâncias
            utiliza_arquivos_externos: Se usa arquivos externos
            tempo_maximo_de_vida: Tempo máximo de vida em segundos
        """
        jobs_ativos = self.count_active_jobs(nome_rpa.lower())
        if jobs_ativos >= qtd_max_instancias:
            logger.warning(f"Limite de instâncias atingido para {nome_rpa}")
            return False
        
        vagas_disponiveis = qtd_max_instancias - jobs_ativos
        
        qtd_ram_mib = int(qtd_ram_maxima * 1000 / 1024)
        
        # Criar YAML do job
        job_yaml_base = {
            'apiVersion': 'batch/v1',
            'kind': 'Job',
            'metadata': {
                'generateName': f'rpa-job-{nome_rpa.replace("_", "-").lower()}-',
                'labels': {
                    'nome_robo': nome_rpa.lower(),
                    'instancia': '1'
                }
            },
            'spec': {
                'activeDeadlineSeconds': tempo_maximo_de_vida,
                'ttlSecondsAfterFinished': 10,
                'template': {
                    'spec': {
                        'restartPolicy': 'Never',
                        'imagePullSecrets': [{'name': 'docker-hub-secret'}],
                        'containers': [{
                            'name': 'rpa',
                            'image': f'rpaglobal/{nome_rpa.lower()}:{docker_tag}',
                            'imagePullPolicy': 'Always',
                            'env': [{
                                'name': 'NOME_ROBO',
                                'value': nome_rpa.lower()
                            }],
                            'resources': {
                                'limits': {
                                    'memory': f'{qtd_ram_mib}Mi'
                                }
                            }
                        }]
                    }
                }
            }
        }
        
        # Adicionar volumes se necessário
        if utiliza_arquivos_externos:
            job_yaml_base['spec']['template']['spec']['containers'][0]['volumeMounts'] = [{
                'name': 'auxiliar-volume',
                'mountPath': '/app/pasta_de_arquivos_auxiliares'
            }]
            job_yaml_base['spec']['template']['spec']['volumes'] = [{
                'name': 'auxiliar-volume',
                'hostPath': {
                    'path': '/mnt/k8s/honorarios/pasta_de_arquivos_auxiliares',
                    'type': 'Directory'
                }
            }]
        
        try:
            # Criar jobs
            for i in range(vagas_disponiveis):
                job_yaml = job_yaml_base.copy()
                job_yaml['metadata']['labels']['instancia'] = str(i + 1)
                
                yaml_content = yaml.dump(job_yaml, default_flow_style=False)
                
                # Criar job via kubectl
                cmd = f"kubectl create -f - <<EOF\n{yaml_content}\nEOF"
                return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
                
                if return_code != 0:
                    logger.error(f"Erro ao criar job: {stderr}")
                    return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao criar job: {e}")
            return False
    
    def delete_job(self, job_name: str) -> bool:
        """Deleta um job Kubernetes."""
        cmd = f"kubectl delete job {job_name}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao deletar job: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao deletar job: {e}")
            return False
    
    def delete_pod(self, pod_name: str) -> bool:
        """Deleta um pod Kubernetes."""
        cmd = f"kubectl delete pod {pod_name}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao deletar pod: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao deletar pod: {e}")
            return False
    
    def get_pod_logs(self, pod_name: str, tail: int = 100) -> str:
        """Obtém logs de um pod."""
        cmd = f"kubectl logs {pod_name} --tail={tail}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao obter logs: {stderr}")
                return ""
            
            return stdout
        except Exception as e:
            logger.error(f"Erro ao obter logs: {e}")
            return ""
    
    def get_cronjobs(self) -> List[Dict]:
        """Lista cronjobs com informações detalhadas."""
        cmd = "kubectl get cronjobs -o json"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao listar cronjobs: {stderr}")
                return []
            
            import json
            data = json.loads(stdout)
            cronjobs = []
            
            for item in data.get('items', []):
                metadata = item.get('metadata', {})
                spec = item.get('spec', {})
                status = item.get('status', {})
                
                cronjob_info = {
                    'name': metadata.get('name', ''),
                    'namespace': metadata.get('namespace', 'default'),
                    'schedule': spec.get('schedule', ''),
                    'suspended': spec.get('suspend', False),
                    'last_schedule_time': status.get('lastScheduleTime', ''),
                    'last_successful_time': status.get('lastSuccessfulTime', '')
                }
                
                cronjobs.append(cronjob_info)
            
            return cronjobs
        except Exception as e:
            logger.error(f"Erro ao processar cronjobs: {e}")
            return []
    
    def cronjob_exists(self, nome: str) -> bool:
        """Verifica se um cronjob existe."""
        cmd = f"kubectl get cronjob {nome}"
        return_code, _, _ = self.ssh_service.execute_command(cmd, timeout=10)
        return return_code == 0
    
    def apply_cronjob(self, yaml_path: str) -> bool:
        """Aplica um cronjob via kubectl apply."""
        cmd = f"kubectl apply -f {yaml_path}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao aplicar cronjob: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao aplicar cronjob: {e}")
            return False
    
    def delete_cronjob(self, nome: str) -> bool:
        """Deleta um cronjob."""
        cmd = f"kubectl delete cronjob {nome}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao deletar cronjob: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao deletar cronjob: {e}")
            return False
    
    def suspend_cronjob(self, nome: str) -> bool:
        """Suspende um cronjob."""
        cmd = f"kubectl patch cronjob {nome} -p '{{\"spec\":{{\"suspend\":true}}}}'"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao suspender cronjob: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao suspender cronjob: {e}")
            return False
    
    def unsuspend_cronjob(self, nome: str) -> bool:
        """Reativa um cronjob."""
        cmd = f"kubectl patch cronjob {nome} -p '{{\"spec\":{{\"suspend\":false}}}}'"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao reativar cronjob: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao reativar cronjob: {e}")
            return False
    
    def create_job_from_cronjob(self, cronjob_name: str) -> bool:
        """Cria um job manual a partir de um cronjob (executar agora)."""
        job_name = f"{cronjob_name}-manual-$(date +%s)"
        cmd = f"kubectl create job --from=cronjob/{cronjob_name} {job_name}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao criar job do cronjob: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao criar job do cronjob: {e}")
            return False
    
    def get_deployments(self) -> List[Dict]:
        """Lista deployments com informações detalhadas."""
        cmd = "kubectl get deployments -o json"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao listar deployments: {stderr}")
                return []
            
            import json
            data = json.loads(stdout)
            deployments = []
            
            for item in data.get('items', []):
                metadata = item.get('metadata', {})
                spec = item.get('spec', {})
                status = item.get('status', {})
                
                deployment_info = {
                    'name': metadata.get('name', ''),
                    'namespace': metadata.get('namespace', 'default'),
                    'replicas': spec.get('replicas', 0),
                    'ready_replicas': status.get('readyReplicas', 0),
                    'available_replicas': status.get('availableReplicas', 0)
                }
                
                deployments.append(deployment_info)
            
            return deployments
        except Exception as e:
            logger.error(f"Erro ao processar deployments: {e}")
            return []
    
    def apply_deployment(self, yaml_path: str) -> bool:
        """Aplica um deployment via kubectl apply."""
        cmd = f"kubectl apply -f {yaml_path}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao aplicar deployment: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao aplicar deployment: {e}")
            return False
    
    def delete_deployment(self, nome: str) -> bool:
        """Deleta um deployment."""
        cmd = f"kubectl delete deployment {nome}"
        
        try:
            return_code, stdout, stderr = self.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao deletar deployment: {stderr}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Erro ao deletar deployment: {e}")
            return False

