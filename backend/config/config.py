"""
Configurações do backend DockerWatcher.
Renomeado de ssh_config.py para config.py - sem SSH.
"""

import configparser
import os
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


def get_config_path():
    """Retorna o caminho do arquivo de configuração."""
    # 1. Variável de ambiente
    env_path = os.getenv("DOCKER_WATCHER_CONFIG_PATH")
    if env_path and os.path.exists(env_path):
        return str(env_path)

    # Nome do arquivo baseado no ambiente
    env = os.getenv("DOCKER_WATCHER_ENV", "").lower()
    if env == "production":
        target_filename = "config.prod.ini"
    elif env == "development":
        target_filename = "config.dev.ini"
    else:
        target_filename = "config.ini"

    # Docker path
    docker_path = Path("/app/shared") / target_filename
    if docker_path.exists():
        return str(docker_path)
    
    if target_filename != "config.ini":
        docker_fallback = Path("/app/shared/config.ini")
        if docker_fallback.exists():
            return str(docker_fallback)
        
    # Local path
    current_dir = Path(__file__).resolve().parent
    for _ in range(4):
        potential_path = current_dir / "shared" / target_filename
        if potential_path.exists():
            return str(potential_path.resolve())
        
        potential_path = current_dir / target_filename
        if potential_path.exists():
            return str(potential_path.resolve())

        if target_filename != "config.ini":
            fallback_path = current_dir / "shared" / "config.ini"
            if fallback_path.exists():
                return str(fallback_path.resolve())
            
        if current_dir.parent == current_dir:
            break
        current_dir = current_dir.parent
    
    return str(Path("shared/config.ini").resolve())


def load_config():
    """Carrega as configurações do arquivo config.ini."""
    config = configparser.ConfigParser()
    config_path = get_config_path()
    
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Arquivo de configuração não encontrado: {config_path}")
    
    config.read(config_path)
    return config


def get_mysql_config():
    """Retorna configurações MySQL."""
    config = load_config()
    return {
        'host': config.get('MySQL', 'host'),
        'port': config.getint('MySQL', 'port', fallback=3306),
        'user': config.get('MySQL', 'user'),
        'password': config.get('MySQL', 'password'),
        'database': config.get('MySQL', 'database'),
    }


def get_api_config():
    """Retorna configurações da API."""
    config = load_config()
    if config.has_section('BACKEND'):
        return {
            'host': config.get('BACKEND', 'bind_host', fallback='0.0.0.0'),
            'port': config.getint('BACKEND', 'bind_port', fallback=8000),
        }
    else:
        return {
            'host': config.get('API', 'host', fallback='127.0.0.1'),
            'port': config.getint('API', 'port', fallback=8000),
        }


def get_kubernetes_config():
    """Retorna configurações do Kubernetes."""
    config = load_config()
    
    defaults = {
        'in_cluster': False,
        'kubeconfig_path': '',
        'namespace': 'default',
    }
    
    if config.has_section('KUBERNETES'):
        return {
            'in_cluster': config.getboolean('KUBERNETES', 'in_cluster', fallback=defaults['in_cluster']),
            'kubeconfig_path': config.get('KUBERNETES', 'kubeconfig_path', fallback=defaults['kubeconfig_path']),
            'namespace': config.get('KUBERNETES', 'namespace', fallback=defaults['namespace']),
        }
    
    return defaults


def get_prometheus_config():
    """Retorna configurações do Prometheus."""
    config = load_config()
    
    defaults = {
        'url': 'http://localhost:9090',
    }
    
    if config.has_section('PROMETHEUS'):
        return {
            'url': config.get('PROMETHEUS', 'url', fallback=defaults['url']),
        }
    
    return defaults


def get_executions_api_config():
    """Retorna configurações da API de execuções (MongoDB)."""
    config = load_config()
    
    defaults = {
        'base_url': 'http://localhost:3000',
        'login_url': 'https://api.bwa.global:3334',
        'username': '',
        'password': ''
    }
    
    if config.has_section('EXECUCOES_API'):
        return {
            'base_url': config.get('EXECUCOES_API', 'base_url', fallback=defaults['base_url']),
            'login_url': config.get('EXECUCOES_API', 'login_url', fallback=defaults['login_url']),
            'username': config.get('EXECUCOES_API', 'username', fallback=defaults['username']),
            'password': config.get('EXECUCOES_API', 'password', fallback=defaults['password']),
        }
    
    return defaults
