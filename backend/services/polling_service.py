import logging
import threading
import time
from typing import Optional, Set, Dict, List

from services.cache_service import CacheKeys, CacheService
from services.service_manager import (
    get_database_service,
    get_kubernetes_service,
    get_ssh_service,
)
from services.vm_resource_service import fetch_vm_resources

logger = logging.getLogger(__name__)


class PollingService:
    """
    Serviço em background responsável por coletar dados do Kubernetes e MySQL
    em intervalos fixos e armazená-los em cache.
    """

    def __init__(self, vm_interval: int = None, db_interval: int = None):
        # Usar configurações do config.ini se não fornecidas
        if vm_interval is None or db_interval is None:
            try:
                from config.ssh_config import get_backend_config
                backend_config = get_backend_config()
                if vm_interval is None:
                    vm_interval = backend_config.get('polling_interval_vm', 10)
                if db_interval is None:
                    db_interval = backend_config.get('polling_interval_db', 10)
            except Exception as e:
                logger.warning(f"Erro ao ler configurações do backend, usando valores padrão: {e}")
                vm_interval = vm_interval or 10
                db_interval = db_interval or 10
        
        self.vm_interval = vm_interval
        self.db_interval = db_interval
        self._running = False
        self._vm_thread: Optional[threading.Thread] = None
        self._db_thread: Optional[threading.Thread] = None
        self.k8s_service = get_kubernetes_service()
        self.db_service = get_database_service()
        self.ssh_service = get_ssh_service()
        self._connection_status = {
            'ssh_connected': False,
            'mysql_connected': False,
            'ssh_error': 'Status ainda não verificado',
            'mysql_error': 'Status ainda não verificado',
        }
        CacheService.update(CacheKeys.CONNECTION_STATUS, dict(self._connection_status))

    def start(self):
        if self._running:
            logger.warning("PollingService já está em execução")
            return
        self._running = True
        self._vm_thread = threading.Thread(target=self._vm_loop, daemon=True)
        self._db_thread = threading.Thread(target=self._db_loop, daemon=True)
        self._vm_thread.start()
        self._db_thread.start()
        logger.info("PollingService iniciado (VM: %ss | DB: %ss)", self.vm_interval, self.db_interval)

    def stop(self):
        self._running = False
        for thread in [self._vm_thread, self._db_thread]:
            if thread:
                thread.join(timeout=5)
        logger.info("PollingService parado")

    def _sleep_interval(self, target_seconds: float):
        slept = 0.0
        step = 0.5
        while self._running and slept < target_seconds:
            remaining = target_seconds - slept
            time.sleep(step if remaining > step else remaining)
            slept += step

    def _vm_loop(self):
        while self._running:
            start = time.time()
            ssh_errors = []
            ssh_success = True
            try:
                jobs = self.k8s_service.get_jobs()
                CacheService.update(CacheKeys.JOBS, jobs)
            except Exception as e:
                ssh_success = False
                ssh_errors.append(f"jobs: {e}")
                logger.warning(f"Erro ao atualizar cache de jobs: {e}")
                CacheService.update(CacheKeys.JOBS, CacheService.get_data(CacheKeys.JOBS, []), error=str(e))

            try:
                all_pods = self.k8s_service.get_pods()
                # Filtrar apenas pods que estão rodando (phase == 'Running')
                running_pods = [
                    pod for pod in all_pods 
                    if pod.get('phase') == 'Running'
                ]
                CacheService.update(CacheKeys.PODS, running_pods)
                logger.debug(f"Cache de pods atualizado: {len(running_pods)} pods rodando de {len(all_pods)} total")
            except Exception as e:
                ssh_success = False
                ssh_errors.append(f"pods: {e}")
                logger.warning(f"Erro ao atualizar cache de pods: {e}")
                CacheService.update(CacheKeys.PODS, CacheService.get_data(CacheKeys.PODS, []), error=str(e))

            try:
                cronjobs = self.k8s_service.get_cronjobs()
                CacheService.update(CacheKeys.CRONJOBS, cronjobs)
                # Processar e cachear cronjobs processados
                self._processar_e_cachear_cronjobs(cronjobs)
            except Exception as e:
                ssh_success = False
                ssh_errors.append(f"cronjobs: {e}")
                logger.warning(f"Erro ao atualizar cache de cronjobs: {e}")
                CacheService.update(CacheKeys.CRONJOBS, CacheService.get_data(CacheKeys.CRONJOBS, []), error=str(e))

            try:
                deployments = self.k8s_service.get_deployments()
                CacheService.update(CacheKeys.DEPLOYMENTS, deployments)
                # Processar e cachear deployments processados
                self._processar_e_cachear_deployments(deployments)
            except Exception as e:
                ssh_success = False
                ssh_errors.append(f"deployments: {e}")
                logger.warning(f"Erro ao atualizar cache de deployments: {e}")
                CacheService.update(CacheKeys.DEPLOYMENTS, CacheService.get_data(CacheKeys.DEPLOYMENTS, []), error=str(e))

            try:
                vm_resources = fetch_vm_resources(self.ssh_service)
                CacheService.update(CacheKeys.VM_RESOURCES, vm_resources)
            except Exception as e:
                ssh_success = False
                ssh_errors.append(f"vm_resources: {e}")
                logger.warning(f"Erro ao atualizar cache de recursos da VM: {e}")
                CacheService.update(CacheKeys.VM_RESOURCES, CacheService.get_data(CacheKeys.VM_RESOURCES, {}), error=str(e))

            ssh_error_msg = None if ssh_success else "; ".join(ssh_errors)
            self._update_connection_status(ssh=ssh_success, ssh_error=ssh_error_msg)

            elapsed = time.time() - start
            wait_time = max(0.0, self.vm_interval - elapsed)
            self._sleep_interval(wait_time)

    def _db_loop(self):
        while self._running:
            start = time.time()
            try:
                nomes = self._collect_rpa_names()
                if nomes:
                    execucoes = self.db_service.obter_execucoes(list(nomes))
                    CacheService.update(CacheKeys.EXECUTIONS, execucoes)
                else:
                    CacheService.update(CacheKeys.EXECUTIONS, {})
                
                # Processar e cachear lista de RPAs (do banco local - rápido)
                self._processar_e_cachear_rpas()
            except Exception as e:
                logger.warning(f"Erro ao atualizar cache de execuções: {e}")
                CacheService.update(CacheKeys.EXECUTIONS, CacheService.get_data(CacheKeys.EXECUTIONS, {}), error=str(e))
                self._update_connection_status(mysql=False, mysql_error=str(e))

            else:
                self._update_connection_status(mysql=True, mysql_error=None)

            elapsed = time.time() - start
            wait_time = max(0.0, self.db_interval - elapsed)
            self._sleep_interval(wait_time)

    def _collect_rpa_names(self) -> Set[str]:
        """Coleta nomes de RPAs que estão ativos ou rodando (jobs/pods)."""
        nomes: Set[str] = set()
        
        # 1. Coletar RPAs ativos do banco local
        rpas_ativos: Set[str] = set()
        try:
            from api.models import RoboDockerizado
            rpas_ativos = set(RoboDockerizado.objects.filter(tipo='rpa', status="active", ativo=True).values_list("nome", flat=True))
            nomes.update(rpas_ativos)
        except Exception as e:
            logger.debug(f"Não foi possível coletar RPAs do banco local: {e}")

        # Map lower -> original for active RPAs
        rpas_ativos_lower = {rpa.lower(): rpa for rpa in rpas_ativos}

        # 2. Coletar nomes dos jobs rodando
        jobs_cache = CacheService.get_data(CacheKeys.JOBS, []) or []
        import re
        
        for job in jobs_cache:
            labels = job.get("labels", {}) if isinstance(job, dict) else {}
            # Tentar pegar nome limpo dos labels primeiro
            nome_robo = (
                labels.get("nome_robo")
                or labels.get("nome-robo")
                or labels.get("app")
                or job.get("name", "")
            )
            
            if nome_robo:
                candidates = set()
                candidates.add(nome_robo)
                
                # Tentar limpar o nome (remover prefixos/sufixos comuns)
                clean_name = nome_robo
                
                # Remover prefixos
                for prefix in ['rpa-cronjob-', 'rpa-job-', 'cronjob-', 'job-', 'rpa-', 'exec-', 'manual-', 'deployment-']:
                    if clean_name.startswith(prefix):
                        clean_name = clean_name[len(prefix):]
                        break
                
                # Remover sufixos (hashes, timestamps)
                # Hash duplo K8s (ex: -w5mwl-tt5tw)
                clean_name = re.sub(r'-[a-z0-9]{4,10}-[a-z0-9]{4,10}$', '', clean_name) 
                # Hash simples ou timestamp (ex: -12345678, -abcde)
                clean_name = re.sub(r'-[a-z0-9]+$', '', clean_name)
                
                if clean_name and clean_name != nome_robo:
                    candidates.add(clean_name)

                # Processar candidatos
                for candidate in candidates:
                    # Verificar se bate com algum RPA ativo (para usar o caso correto)
                    if candidate.lower() in rpas_ativos_lower:
                        nomes.add(rpas_ativos_lower[candidate.lower()])
                    else:
                        nomes.add(candidate)

        return {nome for nome in nomes if nome}

    def _processar_e_cachear_rpas(self):
        """Processa lista de RPAs do banco local e armazena no cache."""
        try:
            from api.models import RoboDockerizado
            
            # Buscar RPAs do banco local
            rpas_queryset = RoboDockerizado.objects.filter(tipo='rpa')
            
            # Buscar dados do cache
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            jobs_por_rpa = self._contar_jobs_por_rpa_cache()
            
            # Processar RPAs
            rpas_processados = []
            for rpa_obj in rpas_queryset:
                rpa_data = rpa_obj.to_dict()
                
                # Obter execuções pendentes (do cache)
                execucoes_pendentes = self._buscar_execucoes_cache(rpa_obj.nome_rpa, execucoes_por_robo)
                
                # Obter jobs ativos (do cache)
                jobs_ativos = jobs_por_rpa.get(rpa_obj.nome_rpa.lower(), 0)
                
                # Garantir que tags tenha "Exec"
                tags = rpa_data.get('tags', [])
                if not isinstance(tags, list):
                    tags = []
                if 'Exec' not in tags:
                    tags.append('Exec')
                
                rpa_data['execucoes_pendentes'] = execucoes_pendentes
                rpa_data['jobs_ativos'] = jobs_ativos
                rpa_data['tags'] = tags
                rpas_processados.append(rpa_data)
            
            # Armazenar no cache
            CacheService.update(CacheKeys.RPAS_PROCESSED, rpas_processados)
        except Exception as e:
            logger.debug(f"Erro ao processar RPAs para cache: {e}")
    
    def _contar_jobs_por_rpa_cache(self) -> Dict[str, int]:
        """Conta jobs por RPA usando cache com identificação robusta."""
        jobs_cache = CacheService.get_data(CacheKeys.JOBS, []) or []
        jobs_por_rpa = {}
        import re
        
        for job in jobs_cache:
            if not isinstance(job, dict):
                continue
            
            labels = job.get("labels", {})
            nome_robo = (labels.get("nome_robo") or labels.get("nome-robo") or labels.get("app") or "").lower()
            
            if not nome_robo:
                # Fallback para o nome do job se as labels padrão falharem
                job_name = job.get("name", "")
                # Tentar extrair nome base (mesma lógica de _collect_rpa_names)
                nome_robo = re.sub(r'-(manual-)?\d+$', '', job_name)
                nome_robo = re.sub(r'-[a-z0-9]{5,}$', '', nome_robo)
                for prefix in ['rpa-cronjob-', 'rpa-job-', 'cronjob-', 'job-', 'rpa-', 'exec-', 'manual-', 'deployment-']:
                    if nome_robo.startswith(prefix):
                        nome_robo = nome_robo[len(prefix):]
                        break
                nome_robo = nome_robo.lower()

            if not nome_robo:
                continue
                
            active = job.get("active", 0)
            if active > 0:
                nome_normalizado = nome_robo.replace("-", "").replace("_", "")
                jobs_por_rpa[nome_normalizado] = jobs_por_rpa.get(nome_normalizado, 0) + active
                # Também guardar com o nome "com traços" para compatibilidade
                if nome_robo != nome_normalizado:
                    jobs_por_rpa[nome_robo] = jobs_por_rpa.get(nome_robo, 0) + active
                    
        return jobs_por_rpa
    
    def _buscar_execucoes_cache(self, nome_rpa: str, exec_cache: Dict[str, List[Dict]]) -> int:
        """Busca execuções no cache."""
        execucoes = exec_cache.get(nome_rpa, [])
        if execucoes:
            return len(execucoes)
        nome_normalizado = nome_rpa.replace("-", "").replace("_", "").lower()
        for nome_db, execs in exec_cache.items():
            if nome_normalizado == nome_db.replace("-", "").replace("_", "").lower():
                return len(execs)
        return 0

    def _processar_e_cachear_cronjobs(self, k8s_cronjobs: List[Dict]):
        try:
            from api.models import RoboDockerizado
            import re
            
            # 1. Buscar todos os cronjobs do banco de dados (base principal)
            try:
                db_cronjobs = {cj.nome: cj for cj in RoboDockerizado.objects.filter(tipo='cronjob', ativo=True)}
                logger.debug(f"[CRONJOBS] Encontrados {len(db_cronjobs)} cronjobs no banco de dados")
            except Exception as e:
                logger.debug(f"Erro ao buscar cronjobs do banco: {e}")
                db_cronjobs = {}
            
            # 2. Mapa dos cronjobs do Kubernetes para fácil busca
            k8s_map = {cj.get('name'): cj for cj in k8s_cronjobs if cj.get('name')}
            logger.debug(f"[CRONJOBS] Encontrados {len(k8s_cronjobs)} cronjobs no Kubernetes, {len(k8s_map)} com nome válido")
            
            # 3. Buscar execuções do cache
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            
            cronjobs_processados = []
            
            # Processar todos os cronjobs do banco
            for nome_cj, db_cj in db_cronjobs.items():
                try:
                    # Dados básicos do banco
                    cj_data = db_cj.to_dict()
                    
                    # Enriquecer com dados do Kubernetes se existir
                    k8s_cj = k8s_map.get(nome_cj)
                    if k8s_cj:
                        cj_data.update({
                            'schedule': k8s_cj.get('schedule', cj_data.get('schedule')),
                            'suspended': k8s_cj.get('suspended', cj_data.get('suspended')),
                            'last_schedule_time': k8s_cj.get('last_schedule_time', cj_data.get('last_schedule_time')),
                            'last_successful_time': k8s_cj.get('last_successful_time', cj_data.get('last_successful_time')),
                            'image': k8s_cj.get('image', ''),
                            'namespace': k8s_cj.get('namespace', cj_data.get('namespace')),
                        })
                        logger.debug(f"[CRONJOBS] Cronjob do banco '{nome_cj}' encontrado no K8s")
                    else:
                        cj_data['_no_k8s'] = True
                        logger.warning(f"[CRONJOBS] Cronjob do banco '{nome_cj}' NÃO encontrado no K8s")
                    
                    # Calcular execuções pendentes
                    execucoes_pendentes = 0
                    if db_cj.dependente_de_execucoes:
                        nome_rpa = nome_cj.replace('rpa-cronjob-', '').replace('-cronjob', '')
                        nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                        execucoes_pendentes = self._buscar_execucoes_cache(nome_rpa, execucoes_por_robo)
                    
                    cj_data['execucoes_pendentes'] = execucoes_pendentes
                    
                    # Adicionar tag automática "Agendado" se não existir
                    tags = cj_data.get('tags', [])
                    if 'Agendado' not in tags:
                        tags.append('Agendado')
                    cj_data['tags'] = tags
                    
                    cronjobs_processados.append(cj_data)
                except Exception as e:
                    logger.debug(f"Erro ao processar cronjob {nome_cj}: {e}")
                    continue
            
            # 4. Adicionar cronjobs que estão no K8s mas NÃO no banco (para visibilidade total)
            cronjobs_k8s_sem_banco = 0
            for nome_k8s, k8s_cj in k8s_map.items():
                if nome_k8s not in db_cronjobs:
                    try:
                        k8s_cj['execucoes_pendentes'] = 0
                        k8s_cj['apelido'] = k8s_cj.get('apelido') or 'Somente Kubernetes'
                        if 'Agendado' not in k8s_cj.get('tags', []):
                            k8s_cj.setdefault('tags', []).append('Agendado')
                        cronjobs_processados.append(k8s_cj)
                        cronjobs_k8s_sem_banco += 1
                    except Exception as e:
                        logger.debug(f"Erro ao adicionar cronjob do K8s '{nome_k8s}': {e}")
                        continue
            
            logger.debug(f"[CRONJOBS] Total processado: {len(cronjobs_processados)} (banco: {len(db_cronjobs)}, K8s sem banco: {cronjobs_k8s_sem_banco})")
            CacheService.update(CacheKeys.CRONJOBS_PROCESSED, cronjobs_processados)
        except Exception as e:
            logger.error(f"Erro ao processar cronjobs para cache: {e}", exc_info=True)

    def _processar_e_cachear_deployments(self, k8s_deployments: List[Dict]):
        try:
            from api.models import RoboDockerizado
            
            # 1. Buscar todos os deployments do banco de dados
            try:
                db_deployments = {dep.nome: dep for dep in RoboDockerizado.objects.filter(tipo='deployment', ativo=True)}
            except Exception as e:
                logger.debug(f"Erro ao buscar deployments do banco: {e}")
                db_deployments = {}
            
            # 2. Mapa dos deployments do Kubernetes
            k8s_map = {dep.get('name'): dep for dep in k8s_deployments if dep.get('name')}
            
            # 3. Buscar execuções do cache
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            
            deployments_processados = []
            
            # Processar todos do banco
            for nome_dep, db_dep in db_deployments.items():
                try:
                    # Dados básicos do banco
                    dep_data = db_dep.to_dict()
                    
                    # Enriquecer com K8s
                    k8s_dep = k8s_map.get(nome_dep)
                    if k8s_dep:
                        dep_data.update({
                            'replicas': k8s_dep.get('replicas', 0),
                            'ready_replicas': k8s_dep.get('ready_replicas', 0),
                            'available_replicas': k8s_dep.get('available_replicas', 0),
                            'namespace': k8s_dep.get('namespace', dep_data.get('namespace')),
                        })
                    else:
                        dep_data['_no_k8s'] = True
                        dep_data['ready_replicas'] = 0
                    
                    # Calcular execuções pendentes se necessário
                    if db_dep.dependente_de_execucoes:
                        nome_clean = nome_dep.replace('deployment-', '').replace('-deployment', '')
                        execucoes_pendentes = self._buscar_execucoes_cache(nome_clean, execucoes_por_robo)
                        dep_data['execucoes_pendentes'] = execucoes_pendentes
                    
                    deployments_processados.append(dep_data)
                except Exception as e:
                    logger.debug(f"Erro ao processar deployment {nome_dep}: {e}")
                    continue
            
            # 4. Adicionar deployments que estão no K8s mas NÃO no banco
            for nome_k8s, k8s_dep in k8s_map.items():
                if nome_k8s not in db_deployments:
                    try:
                        k8s_dep['apelido'] = 'Somente Kubernetes'
                        deployments_processados.append(k8s_dep)
                    except:
                        continue
            
            CacheService.update(CacheKeys.DEPLOYMENTS_PROCESSED, deployments_processados)
        except Exception as e:
            logger.debug(f"Erro ao processar deployments para cache: {e}")

    def _update_connection_status(
        self,
        *,
        ssh: Optional[bool] = None,
        ssh_error: Optional[str] = None,
        mysql: Optional[bool] = None,
        mysql_error: Optional[str] = None,
    ):
        """
        Atualiza o status de conexão no cache.

        Regras importantes:
        - Se ssh/mysql forem True, limpamos o erro correspondente (ssh_error/mysql_error = None).
        - Se ssh/mysql forem False, mantemos/atualizamos a mensagem de erro recebida.
        """
        updated = dict(self._connection_status)
        changed = False

        if ssh is not None and ssh != updated.get('ssh_connected'):
            updated['ssh_connected'] = ssh
            changed = True
        if mysql is not None and mysql != updated.get('mysql_connected'):
            updated['mysql_connected'] = mysql
            changed = True

        # Erros: permitir limpar quando conexão estiver OK
        if ssh is True:
            if updated.get('ssh_error') is not None:
                updated['ssh_error'] = None
                changed = True
        elif ssh is False:
            if ssh_error is not None and ssh_error != updated.get('ssh_error'):
                updated['ssh_error'] = ssh_error
                changed = True
            elif ssh_error is None and updated.get('ssh_error') is None:
                # manter None
                pass

        if mysql is True:
            if updated.get('mysql_error') is not None:
                updated['mysql_error'] = None
                changed = True
        elif mysql is False:
            if mysql_error is not None and mysql_error != updated.get('mysql_error'):
                updated['mysql_error'] = mysql_error
                changed = True
            elif mysql_error is None and updated.get('mysql_error') is None:
                pass

        if changed:
            self._connection_status = updated
            CacheService.update(CacheKeys.CONNECTION_STATUS, dict(updated))


