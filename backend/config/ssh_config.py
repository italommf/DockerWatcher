import configparser
import os
from pathlib import Path

def get_config_path():
    """Retorna o caminho do arquivo de configuração."""
    # Tenta encontrar o config.ini no diretório shared
    base_dir = Path(__file__).parent.parent.parent
    config_path = base_dir / "shared" / "config.ini"
    return str(config_path)

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
    return {
        'host': config.get('API', 'host', fallback='127.0.0.1'),
        'port': config.getint('API', 'port', fallback=8000),
    }

