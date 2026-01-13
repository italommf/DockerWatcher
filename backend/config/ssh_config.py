import configparser
import os
from pathlib import Path

import logging
logger = logging.getLogger(__name__)

def get_config_path():
    """Retorna o caminho do arquivo de configuração com múltiplas estratégias de descoberta."""
    # 1. Tentar através de variável de ambiente (setada no Docker ou manual)
    env_path = os.getenv("DOCKER_WATCHER_CONFIG_PATH")
    if env_path and os.path.exists(env_path):
        return str(env_path)

    # Determinar o nome do arquivo com base no ambiente
    env = os.getenv("DOCKER_WATCHER_ENV", "").lower()
    if env == "production":
        target_filename = "config.prod.ini"
    elif env == "development":
        target_filename = "config.dev.ini"
    else:
        target_filename = "config.ini"

    # 2. Tentar caminho absoluto do Docker (montado em /app/shared)
    docker_path = Path("/app/shared") / target_filename
    if docker_path.exists():
        return str(docker_path)
    
    # Fallback para config.ini no Docker se o específico não existir
    if target_filename != "config.ini":
        docker_fallback = Path("/app/shared/config.ini")
        if docker_fallback.exists():
            return str(docker_fallback)
        
    # 3. Estratégia local (subindo níveis a partir deste arquivo)
    current_dir = Path(__file__).resolve().parent
    for _ in range(4): # Sobe até 4 níveis
        # Tenta o arquivo específico do ambiente
        potential_path = current_dir / "shared" / target_filename
        if potential_path.exists():
            return str(potential_path.resolve())
        
        # Tenta o arquivo específico na pasta atual
        potential_path = current_dir / target_filename
        if potential_path.exists():
            return str(potential_path.resolve())

        # Fallback para config.ini se o específico não existir
        if target_filename != "config.ini":
            fallback_path = current_dir / "shared" / "config.ini"
            if fallback_path.exists():
                return str(fallback_path.resolve())
            
            fallback_path = current_dir / "config.ini"
            if fallback_path.exists():
                return str(fallback_path.resolve())
            
        if current_dir.parent == current_dir: # Raiz do sistema
            break
        current_dir = current_dir.parent
    
    # Fallback final: presume que o desenvolvedor sabe o que está fazendo no CWD
    final_path = Path("shared") / target_filename
    if final_path.exists():
        return str(final_path.resolve())
    
    return str(Path("shared/config.ini").resolve())

def load_config():
    """Carrega as configurações do arquivo config.ini."""
    config = configparser.ConfigParser()
    config_path = get_config_path()
    
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Arquivo de configuração não encontrado: {config_path}")
    
    config.read(config_path)
    return config

def get_ssh_config():
    """Retorna configurações SSH."""
    config = load_config()
    return {
        'host': config.get('SSH', 'host'),
        'port': config.getint('SSH', 'port', fallback=22),
        'username': config.get('SSH', 'username'),
        'use_key': config.getboolean('SSH', 'use_key', fallback=False),
        'key_path': config.get('SSH', 'key_path', fallback=''),
        'password': config.get('SSH', 'password', fallback=''),
    }

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

def get_paths_config():
    """Retorna configurações de caminhos."""
    config = load_config()
    return {
        'rpa_config_path': config.get('PATHS', 'rpa_config_path'),
        'cronjobs_path': config.get('PATHS', 'cronjobs_path'),
        'deployments_path': config.get('PATHS', 'deployments_path'),
    }

def get_api_config():
    """Retorna configurações da API."""
    config = load_config()
    # Priorizar [BACKEND] se existir, senão usar [API] para compatibilidade
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

def get_backend_config():
    """Retorna configurações do backend (polling intervals, etc)."""
    config = load_config()
    if config.has_section('BACKEND'):
        return {
            'polling_interval_vm': config.getint('BACKEND', 'polling_interval_vm', fallback=10),
            'polling_interval_db': config.getint('BACKEND', 'polling_interval_db', fallback=10),
        }
    return {
        'polling_interval_vm': 10,
        'polling_interval_db': 10,
    }

