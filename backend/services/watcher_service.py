import logging
import threading
import time
from typing import Dict, List
from backend.services.cache_service import CacheKeys, CacheService
from backend.services.service_manager import get_kubernetes_service

logger = logging.getLogger(__name__)

# Importar modelos Django
# Não fazer django.setup() aqui - o Django já foi inicializado pelo manage.py
# Apenas importar os modelos diretamente
try:
    from api.models import RPA, FailedPod
    from django.utils import timezone
    from datetime import timedelta
except Exception as e:
    logger.warning(f"Erro ao importar modelos Django: {e}")
    RPA = None
    FailedPod = None
    timezone = None
    timedelta = None

class WatcherService:
    """Serviço que executa o loop do watcher em background."""
    
    def __init__(self):
        try:
            # Usar serviços singleton para evitar reconexões constantes
            self.k8s_service = get_kubernetes_service()
        except Exception as e:
            logger.warning(f"Erro ao inicializar serviços do watcher: {e}")
            # Ainda assim tentar criar os serviços (podem estar parcialmente funcionais)
            try:
                self.k8s_service = get_kubernetes_service()
            except:
                self.k8s_service = None
        
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
    
    def _watch_loop(self):
        """Loop principal do watcher que verifica execuções e cria jobs."""
        while self._running:
            try:
                # Obter lista de RPAs do banco de dados
                lista_nomes_rpas = []
                rpas_config = {}  # Dicionário para armazenar configurações dos RPAs
                
                try:
                    if RPA:
                        # Buscar apenas RPAs ativos
                        rpas_ativos = RPA.objects.filter(status='active')
                        for rpa_obj in rpas_ativos:
                            nome_rpa = rpa_obj.nome_rpa
                            lista_nomes_rpas.append(nome_rpa)
                            # Armazenar configuração do RPA
                            rpas_config[nome_rpa] = {
                                'docker_tag': rpa_obj.docker_tag,
                                'qtd_max_instancias': rpa_obj.qtd_max_instancias,
                                'qtd_ram_maxima': rpa_obj.qtd_ram_maxima,
                                'utiliza_arquivos_externos': rpa_obj.utiliza_arquivos_externos,
                                'tempo_maximo_de_vida': rpa_obj.tempo_maximo_de_vida,
                            }
                    else:
                        logger.warning("Modelo RPA não disponível - aguardando...")
                        time.sleep(5)
                        continue
                except Exception as e:
                    logger.warning(f"Erro ao obter RPAs do banco: {e}")
                    lista_nomes_rpas = []
                
                execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
                if not execucoes_por_robo:
                    logger.debug("Cache de execuções vazio - aguardando próximo ciclo")
                
                if lista_nomes_rpas and execucoes_por_robo and self.k8s_service:
                    for nome_do_rpa in lista_nomes_rpas:
                        execs_do_rpa = execucoes_por_robo.get(nome_do_rpa) or []
                        if execs_do_rpa:
                            logger.info(f"Existem {len(execs_do_rpa)} execuções para o RPA {nome_do_rpa}")
                            rpa_config = rpas_config.get(nome_do_rpa)
                            if rpa_config:
                                try:
                                    self.k8s_service.create_job(
                                        nome_rpa=nome_do_rpa,
                                        docker_tag=rpa_config.get('docker_tag', 'latest'),
                                        qtd_ram_maxima=rpa_config.get('qtd_ram_maxima', 256),
                                        qtd_max_instancias=rpa_config.get('qtd_max_instancias', 1),
                                        utiliza_arquivos_externos=rpa_config.get('utiliza_arquivos_externos', False),
                                        tempo_maximo_de_vida=rpa_config.get('tempo_maximo_de_vida', 600)
                                    )
                                except Exception as e:
                                    logger.error(f"Erro ao criar job para {nome_do_rpa}: {e}")
                
                # Cronjobs e Deployments agora são gerenciados diretamente via API
                # Não precisamos mais verificar arquivos YAML aqui
                
                # Verificar e salvar pods com falhas
                if self.k8s_service:
                    try:
                        self._check_and_save_failed_pods()
                    except Exception as e:
                        logger.warning(f"Erro ao verificar pods com falhas: {e}")
                
                # Limpar pods com falhas antigos (mais de 7 dias)
                try:
                    self._cleanup_old_failed_pods()
                except Exception as e:
                    logger.warning(f"Erro ao limpar pods com falhas antigos: {e}")
                
                # Aguardar 10 segundos antes da próxima iteração (verificar novas execuções)
                time.sleep(10)
                
            except Exception as e:
                logger.error(f"Erro no loop do watcher: {e}")
                time.sleep(10)  # Aguardar 10 segundos antes de tentar novamente
    
    def is_running(self) -> bool:
        """Verifica se o watcher está rodando."""
        return self._running
    
    def _check_and_save_failed_pods(self):
        """Verifica pods com falhas e os salva no banco de dados."""
        if not FailedPod or not self.k8s_service:
            return
        
        try:
            # Buscar todos os pods
            all_pods = self.k8s_service.get_pods()
            
            # Filtrar apenas pods com falhas
            failed_pods = []
            for pod in all_pods:
                phase = pod.get('phase', '')
                status = pod.get('status', '')
                containers = pod.get('containers', [])
                
                # Verificar se o pod falhou
                is_failed = (
                    phase == 'Failed' or
                    status == 'Failed' or
                    status == 'CrashLoopBackOff' or
                    status == 'Error' or
                    any(
                        # Verificar se o container terminou com erro
                        (c.get('state', {}).get('type') == 'terminated' and 
                         c.get('state', {}).get('exit_code', 0) != 0) or
                        # Verificar se o container está esperando por erro
                        (c.get('state', {}).get('type') == 'waiting' and 
                         (c.get('state', {}).get('reason') == 'CrashLoopBackOff' or
                          c.get('state', {}).get('reason') == 'Error'))
                        for c in containers
                    )
                )
                
                if is_failed:
                    failed_pods.append(pod)
            
            # Salvar pods com falhas no banco de dados
            for pod in failed_pods:
                pod_name = pod.get('name', '')
                if not pod_name:
                    continue
                
                # Verificar se já existe no banco
                existing = FailedPod.objects.filter(name=pod_name).first()
                
                if not existing:
                    # Buscar logs do pod
                    logs = ''
                    try:
                        logs = self.k8s_service.get_pod_logs(pod_name, tail=1000)
                    except Exception as e:
                        logger.warning(f"Erro ao obter logs do pod {pod_name}: {e}")
                    
                    # Extrair nome do robô dos labels
                    labels = pod.get('labels', {})
                    nome_robo = (
                        labels.get('nome_robo') or
                        labels.get('nome-robo') or
                        labels.get('app') or
                        None
                    )
                    
                    # Salvar no banco
                    FailedPod.objects.create(
                        name=pod_name,
                        namespace=pod.get('namespace', 'default'),
                        labels=labels,
                        phase=pod.get('phase', ''),
                        status=pod.get('status', ''),
                        start_time=pod.get('start_time', ''),
                        containers=pod.get('containers', []),
                        logs=logs,
                        nome_robo=nome_robo
                    )
                    logger.info(f"Pod com falha salvo no banco: {pod_name}")
        
        except Exception as e:
            logger.error(f"Erro ao verificar e salvar pods com falhas: {e}")
    
    def _cleanup_old_failed_pods(self):
        """Remove pods com falhas que têm mais de 7 dias."""
        if not FailedPod:
            return
        
        try:
            # Calcular data limite (7 dias atrás)
            cutoff_date = timezone.now() - timedelta(days=7)
            
            # Deletar pods com falhas antigos
            deleted_count = FailedPod.objects.filter(failed_at__lt=cutoff_date).delete()[0]
            
            if deleted_count > 0:
                logger.info(f"Removidos {deleted_count} pods com falhas antigos (mais de 7 dias)")
        
        except Exception as e:
            logger.error(f"Erro ao limpar pods com falhas antigos: {e}")

