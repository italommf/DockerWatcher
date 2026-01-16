#!/usr/bin/env python
"""
Script para limpar todos os RPAs do banco de dados.
"""
import os
import sys
import django

# Configurar Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'docker_watcher.settings')
django.setup()

from api.models import RoboDockerizado

def clear_rpas():
    """Remove todos os RPAs do banco de dados."""
    count = RoboDockerizado.objects.filter(tipo='rpa').count()
    print(f'RPAs encontrados: {count}')
    
    if count > 0:
        RoboDockerizado.objects.filter(tipo='rpa').delete()
        print('✅ Todos os RPAs foram deletados com sucesso!')
    else:
        print('ℹ️  Nenhum RPA encontrado no banco de dados.')

if __name__ == '__main__':
    clear_rpas()
