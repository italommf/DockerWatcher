#!/usr/bin/env python
"""
Script para aplicar migrations do Django, especialmente a tabela FailedPod.
"""
import os
import sys
import django
from pathlib import Path

# Adicionar o diretório raiz ao path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR.parent))

# Configurar Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docker_watcher.settings')
django.setup()

from django.core.management import call_command

def main():
    """Aplica todas as migrations."""
    print("Criando migrations...")
    try:
        call_command('makemigrations', verbosity=2, interactive=False)
        print("✓ Migrations criadas")
    except Exception as e:
        print(f"⚠ Erro ao criar migrations: {e}")
    
    print("\nAplicando migrations...")
    try:
        call_command('migrate', verbosity=2, interactive=False)
        print("✓ Migrations aplicadas com sucesso")
    except Exception as e:
        print(f"❌ Erro ao aplicar migrations: {e}")
        import traceback
        traceback.print_exc()
        
        # Tentar aplicar especificamente a migração do FailedPod
        print("\nTentando aplicar migração do FailedPod especificamente...")
        try:
            call_command('migrate', 'api', '0002_cronjob_dependente_de_execucoes_and_more', verbosity=2, interactive=False)
            print("✓ Migração do FailedPod aplicada")
        except Exception as e2:
            print(f"❌ Erro ao aplicar migração específica: {e2}")
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    main()

