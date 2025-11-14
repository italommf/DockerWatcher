cd#!/usr/bin/env python
"""
Script para iniciar o servidor Django e o watcher em background.
"""
import os
import sys
import django
import logging
import threading
from pathlib import Path

# Adicionar o diretório raiz ao path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / 'backend'))

# Configurar Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docker_watcher.settings')
django.setup()

# Importar depois de configurar Django
from backend.services.watcher_service import WatcherService
from backend.config.ssh_config import get_api_config
from django.core.management import execute_from_command_line

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Inicia o servidor Django e o watcher."""
    watcher = None
    try:
        # Tentar iniciar watcher em background (pode falhar se não houver conexão)
        try:
            watcher = WatcherService()
            watcher.start()
            logger.info("Watcher iniciado em background")
        except Exception as e:
            logger.warning(f"Não foi possível iniciar o watcher (continuando sem ele): {e}")
            logger.info("O servidor Django iniciará mesmo sem o watcher ativo")
        
        logger.info("Iniciando servidor Django...")
        
        # Executar servidor Django (mudar para o diretório backend)
        os.chdir(BASE_DIR / 'backend')
        execute_from_command_line(['manage.py', 'runserver', '127.0.0.1:8000'])
    except KeyboardInterrupt:
        logger.info("Parando watcher...")
        if watcher:
            try:
                watcher.stop()
            except:
                pass
        logger.info("Encerrando...")
    except Exception as e:
        logger.error(f"Erro ao iniciar servidor: {e}")
        if watcher:
            try:
                watcher.stop()
            except:
                pass
        raise

if __name__ == '__main__':
    main()

