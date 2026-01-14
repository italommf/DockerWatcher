from django.apps import AppConfig
import logging
import threading
import time
import sys
import os

logger = logging.getLogger(__name__)


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'
    
    def ready(self):
        """Inicializa serviços quando o Django estiver pronto."""
        # Evitar executar durante migrations
        if 'migrate' in sys.argv or 'makemigrations' in sys.argv or 'test' in sys.argv:
            return
        
        is_runserver = 'runserver' in sys.argv
        is_gunicorn = os.getenv('GUNICORN_RUNNING') == '1'
        
        if not is_runserver and not is_gunicorn:
            return
        
        try:
            from services.service_manager import initialize_services
            from services.watcher_service import WatcherService
            
            def initialize_all_services():
                """Inicializa serviços em background."""
                try:
                    time.sleep(2)
                    
                    # Verificar config
                    try:
                        from pathlib import Path
                        config_path = Path(__file__).resolve().parent.parent.parent / 'shared' / 'config.ini'
                        if not config_path.exists():
                            logger.warning("config.ini não encontrado")
                            return
                    except Exception as e:
                        logger.warning(f"Erro ao verificar config: {e}")
                        return
                    
                    try:
                        logger.info("Inicializando serviços...")
                        initialize_services()
                        logger.info("✓ Serviços inicializados")
                    except Exception as e:
                        logger.warning(f"Erro ao inicializar serviços: {e}")
                    
                    time.sleep(2)
                    
                    try:
                        watcher = WatcherService()
                        watcher.start()
                        logger.info("✓ WatcherService iniciado")
                    except Exception as e:
                        logger.warning(f"Erro ao iniciar WatcherService: {e}")
                    
                    try:
                        if os.environ.get('RUN_MAIN') == 'true' or is_gunicorn:
                            from services.heartbeat_service import HeartbeatService
                            heartbeat = HeartbeatService()
                            if not heartbeat.is_running():
                                heartbeat.start()
                                logger.info("✓ HeartbeatService iniciado")
                    except Exception as e:
                        logger.warning(f"Erro ao iniciar HeartbeatService: {e}")
                        
                except Exception as e:
                    logger.error(f"Erro ao inicializar serviços: {e}")
            
            thread = threading.Thread(target=initialize_all_services, daemon=True)
            thread.start()
        except Exception as e:
            logger.warning(f"Não foi possível inicializar serviços: {e}")
