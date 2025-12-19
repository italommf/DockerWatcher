#!/usr/bin/env python
"""
Script para iniciar o servidor Django com Waitress em produção.
Inicializa serviços de background (PollingService e WatcherService).
"""
import os
import sys
import django
import logging
from pathlib import Path

# Configurar caminhos
BASE_DIR = Path(__file__).resolve().parent
# Adicionar diretório raiz do projeto (painel acima de backend/) ao path para permitir imports 'from backend...'
sys.path.insert(0, str(BASE_DIR.parent))
# Adicionar diretório backend/ ao path para permitir imports diretos (opcional)
sys.path.insert(0, str(BASE_DIR))

# Configurar Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docker_watcher.settings')
django.setup()

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    """Inicia o servidor com todos os serviços."""
    try:
        # Importar serviços
        from backend.services.service_manager import initialize_services
        from backend.services.polling_service import PollingService
        from backend.services.watcher_service import WatcherService
        from backend.config.ssh_config import get_api_config
        
        logger.info("=== Docker Watcher Backend - Iniciando ===")
        
        # Inicializar serviços (SSH, MySQL, etc)
        logger.info("Inicializando serviços...")
        initialize_services()
        
        # Iniciar PollingService
        logger.info("Iniciando PollingService...")
        polling_service = PollingService()
        polling_service.start()
        logger.info("✓ PollingService iniciado")
        
        # Iniciar WatcherService
        logger.info("Iniciando WatcherService...")
        watcher_service = WatcherService()
        watcher_service.start()
        logger.info("✓ WatcherService iniciado")
        
        # Obter configurações da API
        api_config = get_api_config()
        host = api_config.get('host', '0.0.0.0')
        port = api_config.get('port', 8000)
        
        # Importar Waitress e WSGI application
        from waitress import serve
        from docker_watcher.wsgi import application
        
        logger.info(f"Servidor iniciado em http://{host}:{port}")
        logger.info("Aguardando requisições...")
        
        # Iniciar servidor Waitress
        serve(application, host=host, port=port, threads=4)
        
    except KeyboardInterrupt:
        logger.info("Encerrando servidor...")
    except Exception as e:
        logger.error(f"Erro ao iniciar servidor: {e}", exc_info=True)
        sys.exit(1)

if __name__ == '__main__':
    main()

