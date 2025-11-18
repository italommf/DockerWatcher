from django.apps import AppConfig
import logging
import threading
import time
import sys

logger = logging.getLogger(__name__)

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    
    def ready(self):
        """Inicializa serviços e inicia o WatcherService quando o Django estiver pronto."""
        # Evitar executar durante migrations ou outros comandos de gerenciamento
        if 'migrate' in sys.argv or 'makemigrations' in sys.argv or 'test' in sys.argv:
            return
        
        # Verificar se é o servidor de desenvolvimento (runserver)
        is_runserver = 'runserver' in sys.argv
        
        if not is_runserver:
            return
        
        # Importar aqui para evitar importação circular
        try:
            from backend.services.service_manager import initialize_services
            from backend.services.watcher_service import WatcherService
            
            def initialize_all_services():
                """Inicializa serviços e depois inicia o watcher."""
                try:
                    # Aguardar mais tempo para garantir que o Django está totalmente pronto
                    # e que todos os módulos foram carregados corretamente
                    time.sleep(8)
                    
                    # Verificar se o arquivo de configuração existe antes de tentar conectar
                    try:
                        from pathlib import Path
                        config_path = Path(__file__).parent.parent.parent.parent / 'shared' / 'config.ini'
                        if not config_path.exists():
                            logger.warning("Arquivo config.ini não encontrado. Serviços não serão inicializados automaticamente.")
                            return
                    except Exception as e:
                        logger.warning(f"Erro ao verificar config.ini: {e}")
                        return
                    
                    try:
                        # Inicializar conexões SSH e MySQL
                        logger.info("Inicializando conexões SSH e MySQL...")
                        initialize_services()
                        logger.info("✓ Serviços inicializados")
                    except Exception as e:
                        logger.warning(f"Erro ao inicializar serviços: {e}")
                        import traceback
                        logger.warning(traceback.format_exc())
                        # Continuar mesmo se falhar - os serviços serão conectados sob demanda
                    
                    # Aguardar mais um pouco antes de iniciar o watcher
                    time.sleep(2)
                    
                    try:
                        # Iniciar WatcherService
                        watcher = WatcherService()
                        watcher.start()
                        logger.info("✓ WatcherService iniciado automaticamente")
                    except Exception as e:
                        logger.warning(f"Erro ao iniciar WatcherService: {e}")
                        import traceback
                        logger.warning(traceback.format_exc())
                        # Continuar mesmo se falhar - o watcher pode ser iniciado manualmente
                except Exception as e:
                    logger.error(f"Erro crítico ao inicializar serviços: {e}")
                    import traceback
                    logger.error(traceback.format_exc())
                    # Não bloquear o servidor Django - continuar mesmo com erro
            
            # Iniciar em thread separada para não bloquear o startup do Django
            thread = threading.Thread(target=initialize_all_services, daemon=True)
            thread.start()
        except Exception as e:
            logger.warning(f"Não foi possível inicializar serviços automaticamente: {e}")
            import traceback
            logger.warning(traceback.format_exc())
            # Não bloquear o servidor Django - continuar mesmo com erro

