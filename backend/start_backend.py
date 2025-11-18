#!/usr/bin/env python
"""
Script para iniciar o backend Django e todos os seus serviços.
Execute este script para iniciar o servidor Django e o WatcherService.
"""
import os
import sys
import logging
from pathlib import Path

# Verificar se Django está instalado
try:
    import django
except ImportError:
    print("=" * 60)
    print("❌ ERRO: Django não está instalado!")
    print("=" * 60)
    print("Por favor, instale as dependências:")
    print("  pip install -r requirements.txt")
    print("=" * 60)
    sys.exit(1)

# Adicionar o diretório raiz ao path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / 'backend'))

# Configurar Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docker_watcher.settings')
django.setup()

# Importar depois de configurar Django
from django.core.management import execute_from_command_line

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Inicia o servidor Django."""
    logger.info("=" * 60)
    logger.info("🚀 Iniciando Backend Docker Watcher")
    logger.info("=" * 60)
    logger.info("Iniciando servidor Django em http://127.0.0.1:8000...")
    logger.info("O WatcherService será iniciado automaticamente quando o Django estiver pronto.")
    logger.info("=" * 60)
    
    try:
        # Executar servidor Django (mudar para o diretório backend)
        os.chdir(BASE_DIR / 'backend')
        execute_from_command_line(['manage.py', 'runserver', '127.0.0.1:8000'])
    except KeyboardInterrupt:
        logger.info("\n" + "=" * 60)
        logger.info("⚠️  Encerrando backend...")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"Erro ao iniciar servidor: {e}")
        raise

if __name__ == '__main__':
    main()

