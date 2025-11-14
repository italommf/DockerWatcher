import logging
import threading
import time
from typing import Dict, List
from backend.services.file_service import FileService
from backend.services.kubernetes_service import KubernetesService
from backend.services.database_service import DatabaseService

logger = logging.getLogger(__name__)

class WatcherService:
    """Serviço que executa o loop do watcher em background."""
    
    def __init__(self):
        try:
            self.file_service = FileService()
            self.k8s_service = KubernetesService()
            self.db_service = DatabaseService()
        except Exception as e:
            logger.warning(f"Erro ao inicializar serviços do watcher: {e}")
            # Ainda assim criar os serviços (podem estar parcialmente funcionais)
            try:
                self.file_service = FileService()
            except:
                self.file_service = None
            try:
                self.k8s_service = KubernetesService()
            except:
                self.k8s_service = None
            try:
                self.db_service = DatabaseService()
            except:
                self.db_service = None
        
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
                # Verificar se os serviços estão disponíveis
                if not self.file_service:
                    logger.debug("FileService não disponível - aguardando...")
                    time.sleep(5)
                    continue
                
                # Obter lista de JSONs de RPA
                try:
                    lista_json_rpas = self.file_service.obter_json_rpas()
                except Exception as e:
                    logger.warning(f"Erro ao obter RPAs: {e}")
                    lista_json_rpas = []
                
                if lista_json_rpas:
                    # Extrair nomes dos RPAs
                    lista_nomes_rpas = []
                    for rpa_path in lista_json_rpas:
                        try:
                            rpa_data = self.file_service.ler_json_rpa(rpa_path)
                            if rpa_data:
                                nome_rpa = rpa_data.get('nome_rpa')
                                if nome_rpa:
                                    lista_nomes_rpas.append(nome_rpa)
                        except Exception as e:
                            logger.warning(f"Erro ao ler RPA {rpa_path}: {e}")
                    
                    if lista_nomes_rpas and self.db_service:
                        try:
                            # Obter execuções pendentes do banco
                            execucoes_por_robo = self.db_service.obter_execucoes(lista_nomes_rpas)
                            
                            # Processar cada RPA com execuções
                            if self.k8s_service:
                                for nome_do_rpa, execs_do_rpa in execucoes_por_robo.items():
                                    if execs_do_rpa and len(execs_do_rpa) > 0:
                                        logger.info(f"Existem {len(execs_do_rpa)} execuções para o RPA {nome_do_rpa}")
                                        
                                        # Encontrar configuração do RPA
                                        rpa_config = None
                                        for rpa_path in lista_json_rpas:
                                            try:
                                                rpa_data = self.file_service.ler_json_rpa(rpa_path)
                                                if rpa_data and rpa_data.get('nome_rpa') == nome_do_rpa:
                                                    rpa_config = rpa_data
                                                    break
                                            except:
                                                continue
                                        
                                        if rpa_config:
                                            try:
                                                # Criar jobs baseado nas execuções
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
                        except Exception as e:
                            logger.warning(f"Erro ao processar execuções: {e}")
                
                # Gerenciar cronjobs
                if self.file_service and self.k8s_service:
                    try:
                        lista_yaml_cronjobs = self.file_service.obter_yaml_cronjobs()
                        for cronjob_path in lista_yaml_cronjobs:
                            try:
                                cronjob_data = self.file_service.ler_yaml_cronjob(cronjob_path)
                                if cronjob_data:
                                    nome_cronjob = cronjob_data.get('metadata', {}).get('name')
                                    if nome_cronjob and not self.k8s_service.cronjob_exists(nome_cronjob):
                                        self.k8s_service.apply_cronjob(cronjob_path)
                                        logger.info(f"Cronjob {nome_cronjob} aplicado")
                            except Exception as e:
                                logger.error(f"Erro ao processar cronjob {cronjob_path}: {e}")
                    except Exception as e:
                        logger.warning(f"Erro ao obter cronjobs: {e}")
                
                # Gerenciar deployments
                if self.file_service and self.k8s_service:
                    try:
                        lista_yaml_deployments = self.file_service.obter_yaml_deployments()
                        for deployment_path in lista_yaml_deployments:
                            try:
                                deployment_data = self.file_service.ler_yaml_deployment(deployment_path)
                                if deployment_data:
                                    nome_deployment = deployment_data.get('metadata', {}).get('name')
                                    if nome_deployment:
                                        self.k8s_service.apply_deployment(deployment_path)
                                        logger.info(f"Deployment {nome_deployment} aplicado/atualizado")
                            except Exception as e:
                                logger.error(f"Erro ao processar deployment {deployment_path}: {e}")
                    except Exception as e:
                        logger.warning(f"Erro ao obter deployments: {e}")
                
                # Aguardar antes da próxima iteração
                time.sleep(5)
                
            except Exception as e:
                logger.error(f"Erro no loop do watcher: {e}")
                time.sleep(5)  # Aguardar antes de tentar novamente
    
    def is_running(self) -> bool:
        """Verifica se o watcher está rodando."""
        return self._running

