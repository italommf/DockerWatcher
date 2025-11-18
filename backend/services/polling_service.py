import logging
import threading
import time
from typing import Optional, Set, Dict, List

from backend.services.cache_service import CacheKeys, CacheService
from backend.services.service_manager import (
    get_database_service,
    get_kubernetes_service,
    get_ssh_service,
)
from backend.services.vm_resource_service import fetch_vm_resources

logger = logging.getLogger(__name__)


class PollingService:
    """
    Serviço em background responsável por coletar dados do Kubernetes e MySQL
    em intervalos fixos e armazená-los em cache.
    """

    def __init__(self, vm_interval: int = 5, db_interval: int = 10):
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
        """Coleta apenas nomes de RPAs que estão ativos (status='active')."""
        nomes: Set[str] = set()
        
        # Primeiro, coletar todos os RPAs ativos do banco de dados
        rpas_ativos: Set[str] = set()
        try:
            from api.models import RPA
            rpas_ativos = set(RPA.objects.filter(status="active").values_list("nome_rpa", flat=True))
            nomes.update(rpas_ativos)
        except Exception as e:
            logger.debug(f"Não foi possível coletar RPAs do banco local: {e}")

        # Filtrar nomes do cache de execuções para incluir apenas RPAs ativos
        exec_cache = CacheService.get_data(CacheKeys.EXECUTIONS, {})
        if isinstance(exec_cache, dict) and rpas_ativos:
            # Normalizar nomes para comparação (lowercase, sem hífens/underscores)
            rpas_ativos_normalizados = {
                nome.replace("-", "").replace("_", "").lower(): nome 
                for nome in rpas_ativos
            }
            
            for nome_cache in exec_cache.keys():
                nome_normalizado = nome_cache.replace("-", "").replace("_", "").lower()
                # Verificar se o nome do cache corresponde a algum RPA ativo
                if nome_normalizado in rpas_ativos_normalizados:
                    # Usar o nome original do banco (pode ter diferenças de formatação)
                    nomes.add(rpas_ativos_normalizados[nome_normalizado])
                elif nome_cache.lower() in {rpa.lower() for rpa in rpas_ativos}:
                    # Comparação direta (case-insensitive)
                    nomes.add(nome_cache)

        # Filtrar nomes dos jobs para incluir apenas RPAs ativos
        if rpas_ativos:
            jobs_cache = CacheService.get_data(CacheKeys.JOBS, []) or []
            rpas_ativos_lower = {rpa.lower() for rpa in rpas_ativos}
            
            for job in jobs_cache:
                labels = job.get("labels", {}) if isinstance(job, dict) else {}
                nome_robo = (
                    labels.get("nome_robo")
                    or labels.get("nome-robo")
                    or labels.get("app")
                    or job.get("name", "").replace("rpa-job-", "")
                )
                if nome_robo:
                    nome_robo_lower = nome_robo.lower()
                    # Verificar se o nome do job corresponde a algum RPA ativo
                    if nome_robo_lower in rpas_ativos_lower:
                        # Encontrar o nome original do banco (pode ter diferenças de formatação)
                        for rpa_ativo in rpas_ativos:
                            if rpa_ativo.lower() == nome_robo_lower:
                                nomes.add(rpa_ativo)
                                break

        return {nome for nome in nomes if nome}

    def _processar_e_cachear_rpas(self):
        """Processa lista de RPAs do banco local e armazena no cache."""
        try:
            from api.models import RPA
            
            # Buscar RPAs do banco local (rápido - SQLite)
            rpas_queryset = RPA.objects.all()
            
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
        """Conta jobs por RPA usando cache."""
        jobs_cache = CacheService.get_data(CacheKeys.JOBS, []) or []
        jobs_por_rpa = {}
        for job in jobs_cache:
            labels = job.get("labels", {}) if isinstance(job, dict) else {}
            nome_robo = (labels.get("nome_robo") or labels.get("nome-robo") or labels.get("app") or "").lower()
            if not nome_robo:
                continue
            active = job.get("active", 0)
            if active > 0:
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
        """Processa lista de cronjobs do Kubernetes e banco local, armazena no cache."""
        try:
            from api.models import Cronjob
            import re
            
            # Buscar cronjobs do banco de dados
            try:
                db_cronjobs = {cj.name: cj for cj in Cronjob.objects.all()}
            except Exception as e:
                logger.debug(f"Erro ao buscar cronjobs do banco: {e}")
                db_cronjobs = {}
            
            # Buscar execuções do cache
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            
            cronjobs_processados = []
            for cj in k8s_cronjobs:
                try:
                    nome = cj.get('name', '')
                    if not nome:
                        continue
                    
                    # Buscar no banco de dados
                    db_cj = db_cronjobs.get(nome)
                    
                    if db_cj:
                        apelido = db_cj.apelido or ''
                        tags = db_cj.tags or []
                        dependente_de_execucoes = getattr(db_cj, 'dependente_de_execucoes', True)
                        if not isinstance(tags, list):
                            tags = []
                    else:
                        apelido = ''
                        tags = []
                        dependente_de_execucoes = True
                    
                    # Adicionar tag automática "Agendado" se não existir
                    if 'Agendado' not in tags:
                        tags.append('Agendado')
                    
                    # Buscar execuções se for dependente
                    execucoes_pendentes = 0
                    if dependente_de_execucoes:
                        nome_rpa = nome.replace('rpa-cronjob-', '').replace('-cronjob', '')
                        nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                        execucoes_pendentes = self._buscar_execucoes_cache(nome_rpa, execucoes_por_robo)
                    
                    cj['apelido'] = apelido
                    cj['tags'] = tags
                    cj['dependente_de_execucoes'] = dependente_de_execucoes
                    cj['execucoes_pendentes'] = execucoes_pendentes
                    cronjobs_processados.append(cj)
                except Exception as e:
                    logger.debug(f"Erro ao processar cronjob {cj.get('name', 'unknown')}: {e}")
                    continue
            
            CacheService.update(CacheKeys.CRONJOBS_PROCESSED, cronjobs_processados)
        except Exception as e:
            logger.debug(f"Erro ao processar cronjobs para cache: {e}")

    def _processar_e_cachear_deployments(self, k8s_deployments: List[Dict]):
        """Processa lista de deployments do Kubernetes e banco local, armazena no cache."""
        try:
            from api.models import Deployment
            
            # Buscar deployments do banco de dados
            try:
                db_deployments = {dep.name: dep for dep in Deployment.objects.all()}
            except Exception as e:
                logger.debug(f"Erro ao buscar deployments do banco: {e}")
                db_deployments = {}
            
            # Buscar execuções do cache
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            
            deployments_processados = []
            for dep in k8s_deployments:
                try:
                    nome = dep.get('name', '')
                    if not nome:
                        continue
                    
                    # Buscar no banco de dados
                    db_dep = db_deployments.get(nome)
                    
                    if db_dep:
                        apelido = db_dep.apelido or ''
                        tags = db_dep.tags or []
                        dependente_de_execucoes = getattr(db_dep, 'dependente_de_execucoes', True)
                        if not isinstance(tags, list):
                            tags = []
                    else:
                        apelido = ''
                        tags = []
                        dependente_de_execucoes = True
                    
                    # Adicionar tag automática "24/7" se não existir
                    if '24/7' not in tags:
                        tags.append('24/7')
                    
                    # Buscar execuções se for dependente
                    execucoes_pendentes = 0
                    if dependente_de_execucoes:
                        nome_rpa = nome.replace('deployment-', '').replace('-deployment', '')
                        execucoes_pendentes = self._buscar_execucoes_cache(nome_rpa, execucoes_por_robo)
                    
                    dep['apelido'] = apelido
                    dep['tags'] = tags
                    dep['dependente_de_execucoes'] = dependente_de_execucoes
                    dep['execucoes_pendentes'] = execucoes_pendentes
                    deployments_processados.append(dep)
                except Exception as e:
                    logger.debug(f"Erro ao processar deployment {dep.get('name', 'unknown')}: {e}")
                    continue
            
            CacheService.update(CacheKeys.DEPLOYMENTS_PROCESSED, deployments_processados)
        except Exception as e:
            logger.debug(f"Erro ao processar deployments para cache: {e}")

    def _update_connection_status(self, *, ssh: Optional[bool] = None, ssh_error: Optional[str] = None,
                                   mysql: Optional[bool] = None, mysql_error: Optional[str] = None):
        updated = dict(self._connection_status)
        changed = False
        if ssh is not None and ssh != updated['ssh_connected']:
            updated['ssh_connected'] = ssh
            changed = True
        if ssh_error is not None and ssh_error != updated['ssh_error']:
            updated['ssh_error'] = ssh_error
            changed = True
        if mysql is not None and mysql != updated['mysql_connected']:
            updated['mysql_connected'] = mysql
            changed = True
        if mysql_error is not None and mysql_error != updated['mysql_error']:
            updated['mysql_error'] = mysql_error
            changed = True
        if changed:
            self._connection_status = updated
            CacheService.update(CacheKeys.CONNECTION_STATUS, dict(updated))


