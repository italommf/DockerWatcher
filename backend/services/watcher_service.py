"""
Serviço Watcher - Monitora execuções e cria jobs automaticamente.
Refatorado para usar módulo k8s/ nativo.
"""

import logging
import threading
import time
from typing import Dict, List

from k8s.jobs import JobService
from k8s.pods import PodService

logger = logging.getLogger(__name__)

# Importar modelos Django
try:
    from api.models import RoboDockerizado, FailedPod
    from django.utils import timezone
    from datetime import timedelta
except Exception as e:
    logger.warning(f"Erro ao importar modelos Django: {e}")
    RoboDockerizado = None
    FailedPod = None
    timezone = None
    timedelta = None


class WatcherService:
    """
    Serviço que monitora execuções pendentes e cria jobs automaticamente.
    
    Funcionalidades:
    - Verifica RPAs ativos no banco de dados
    - Busca execuções pendentes da API de execuções
    - Cria jobs no Kubernetes quando há execuções
    - Monitora pods com falhas e salva no banco
    """
    
    def __init__(self):
        try:
            self.job_service = JobService()
            self.pod_service = PodService()
        except Exception as e:
            logger.warning(f"Erro ao inicializar serviços K8s: {e}")
            self.job_service = None
            self.pod_service = None
        
        self._running = False
        self._thread = None
    
    def start(self):
        """Inicia o watcher em uma thread separada."""
        if self._running:
            logger.warning("Watcher já está rodando")
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._watch_loop, daemon=True)
        self._thread.start()
        logger.info("Watcher iniciado")
    
    def stop(self):
        """Para o watcher."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Watcher parado")
    
    def is_running(self) -> bool:
        """Verifica se o watcher está rodando."""
        return self._running
    
    def _watch_loop(self):
        """Loop principal do watcher."""
        while self._running:
            try:
                self._process_rpas()
                self._check_and_save_failed_pods()
                self._cleanup_old_failed_pods()
                
                time.sleep(10)
                
            except Exception as e:
                logger.error(f"Erro no loop do watcher: {e}")
                time.sleep(10)
    
    def _process_rpas(self):
        """Processa RPAs ativos e cria jobs quando há execuções."""
        if not RoboDockerizado or not self.job_service:
            return
        
        # Obter RPAs ativos do banco
        try:
            rpas_ativos = RoboDockerizado.objects.filter(tipo='rpa', status='active', ativo=True)
        except Exception as e:
            logger.warning(f"Erro ao obter RPAs do banco: {e}")
            return
        
        # Obter execuções pendentes (da API MongoDB)
        # TODO: Integrar com executions_api_service quando pronto
        try:
            from services.executions_api_service import ExecutionsAPIService
            api = ExecutionsAPIService()
            nomes_rpas = [rpa.nome for rpa in rpas_ativos]
            execucoes_por_robo = api.obter_execucoes_por_rpas(nomes_rpas)
        except Exception as e:
            logger.debug(f"API de execuções não disponível: {e}")
            execucoes_por_robo = {}
        
        if not execucoes_por_robo:
            logger.debug("Sem execuções pendentes")
            return
        
        # Contar jobs ativos por RPA (tempo real via API)
        jobs = self.job_service.list()
        jobs_por_rpa = {}
        for job in jobs:
            nome = job.labels.get('nome_robo', '').lower()
            if nome:
                jobs_por_rpa[nome] = jobs_por_rpa.get(nome, 0) + 1
        
        # Processar cada RPA
        jobs_criados = {}
        
        for rpa in rpas_ativos:
            nome = rpa.nome
            execucoes = execucoes_por_robo.get(nome, [])
            
            if not execucoes:
                continue
            
            nome_lower = nome.lower()
            jobs_ativos = jobs_por_rpa.get(nome_lower, 0) + jobs_criados.get(nome_lower, 0)
            qtd_max = rpa.qtd_max_instancias or 1
            
            if jobs_ativos >= qtd_max:
                logger.debug(f"RPA {nome}: Limite atingido ({jobs_ativos}/{qtd_max})")
                continue
            
            if jobs_criados.get(nome_lower, 0) > 0:
                continue
            
            logger.info(f"RPA {nome}: {len(execucoes)} execuções, {jobs_ativos}/{qtd_max} jobs. Criando...")
            
            try:
                # Validar que o repositório foi fornecido
                if not rpa.docker_repository:
                    logger.warning(f"RPA {nome}: docker_repository não fornecido, pulando criação de job")
                    continue
                
                # Construir imagem Docker
                docker_image = f"{rpa.docker_repository}:{rpa.docker_tag or 'latest'}"
                
                # Criar job via API nativa
                job = self.job_service.create(
                    name=f"rpa-job-{nome.replace('_', '-').lower()}",
                    image=docker_image,
                    memory_limit=f"{rpa.qtd_ram_maxima or 256}Mi",
                    labels={'nome_robo': nome_lower},
                    env={'NOME_ROBO': nome_lower},
                    active_deadline=rpa.tempo_maximo_de_vida or 600
                )
                
                if job:
                    jobs_criados[nome_lower] = jobs_criados.get(nome_lower, 0) + 1
                    logger.info(f"Job criado: {job.name}")
                    
            except Exception as e:
                logger.error(f"Erro ao criar job para {nome}: {e}")
    
    def _check_and_save_failed_pods(self):
        """Verifica pods com falhas e salva no banco."""
        if not FailedPod or not self.pod_service:
            return
        
        try:
            pods = self.pod_service.list()
            
            for pod in pods:
                if not self._is_failed_pod(pod):
                    continue
                
                # Verificar se já existe
                if FailedPod.objects.filter(name=pod.name).exists():
                    continue
                
                # Buscar logs
                logs = ''
                try:
                    logs = self.pod_service.logs(pod.name, pod.namespace, tail=1000)
                except Exception as e:
                    logger.warning(f"Erro ao obter logs de {pod.name}: {e}")
                
                # Extrair nome do robô
                nome_robo = (
                    pod.labels.get('nome_robo') or
                    pod.labels.get('nome-robo') or
                    pod.labels.get('app')
                )
                
                # Salvar
                FailedPod.objects.create(
                    name=pod.name,
                    namespace=pod.namespace,
                    labels=pod.labels,
                    phase=pod.phase,
                    status=pod.status,
                    start_time=pod.start_time.isoformat() if pod.start_time else '',
                    containers=[c.__dict__ for c in pod.containers if hasattr(c, '__dict__')],
                    logs=logs,
                    nome_robo=nome_robo
                )
                logger.info(f"Pod com falha salvo: {pod.name}")
                
        except Exception as e:
            logger.error(f"Erro ao verificar pods com falhas: {e}")
    
    def _is_failed_pod(self, pod) -> bool:
        """Verifica se um pod está em estado de falha."""
        if pod.phase == 'Failed':
            return True
        if pod.status in ('Failed', 'CrashLoopBackOff', 'Error'):
            return True
        for c in pod.containers:
            if c.state and c.state.type == 'terminated' and c.state.exit_code != 0:
                return True
            if c.state and c.state.type == 'waiting' and c.state.reason in ('CrashLoopBackOff', 'Error'):
                return True
        return False
    
    def _cleanup_old_failed_pods(self):
        """Remove pods com falhas antigos (mais de 7 dias)."""
        if not FailedPod or not timezone or not timedelta:
            return
        
        try:
            cutoff = timezone.now() - timedelta(days=7)
            deleted, _ = FailedPod.objects.filter(failed_at__lt=cutoff).delete()
            if deleted:
                logger.info(f"Removidos {deleted} pods antigos")
        except Exception as e:
            logger.error(f"Erro ao limpar pods antigos: {e}")
