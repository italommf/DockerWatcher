from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from config.ssh_config import get_config_path, load_config, get_ssh_config, get_mysql_config
import configparser
import os
import logging

logger = logging.getLogger(__name__)

@api_view(['GET'])
def get_config(request):
    """Retorna as configurações atuais."""
    try:
        config_path = get_config_path()
        
        # Se o arquivo não existir, retornar configurações vazias
        if not os.path.exists(config_path):
            logger.info(f"Arquivo de configuração não encontrado: {config_path}. Retornando configurações vazias.")
            return Response({
                'ssh': {
                    'host': '',
                    'port': 22,
                    'username': '',
                    'use_key': False,
                    'key_path': '',
                    'password': '',
                },
                'mysql': {
                    'host': '',
                    'port': 3306,
                    'user': '',
                    'password': '',
                    'database': '',
                },
            }, status=status.HTTP_200_OK)
        
        ssh_config = get_ssh_config()
        mysql_config = get_mysql_config()
        
        # Retornar indicador se senha existe (mas não a senha em si)
        ssh_password = ssh_config.get('password', '')
        mysql_password = mysql_config.get('password', '')
        
        ssh_config_safe = {
            'host': ssh_config.get('host', ''),
            'port': ssh_config.get('port', 22),
            'username': ssh_config.get('username', ''),
            'use_key': ssh_config.get('use_key', False),
            'key_path': ssh_config.get('key_path', ''),
            'password': 'secret' if ssh_password else '',  # Indicar se senha existe
            'has_password': bool(ssh_password),  # Flag adicional para indicar presença
        }
        
        mysql_config_safe = {
            'host': mysql_config.get('host', ''),
            'port': mysql_config.get('port', 3306),
            'user': mysql_config.get('user', ''),
            'password': 'secret' if mysql_password else '',  # Indicar se senha existe
            'has_password': bool(mysql_password),  # Flag adicional para indicar presença
            'database': mysql_config.get('database', ''),
        }
        
        return Response({
            'ssh': ssh_config_safe,
            'mysql': mysql_config_safe,
        }, status=status.HTTP_200_OK)
    except FileNotFoundError as e:
        logger.warning(f"Arquivo de configuração não encontrado: {e}")
        # Retornar configurações vazias ao invés de erro
        return Response({
            'ssh': {
                'host': '',
                'port': 22,
                'username': '',
                'use_key': False,
                'key_path': '',
                'password': '',
            },
            'mysql': {
                'host': '',
                'port': 3306,
                'user': '',
                'password': '',
                'database': '',
            },
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao obter configurações: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
def save_config(request):
    """Salva as configurações."""
    try:
        config_path = get_config_path()
        
        # Criar diretório se não existir
        config_dir = os.path.dirname(config_path)
        if config_dir:
            os.makedirs(config_dir, exist_ok=True)
        
        # Carregar configuração existente ou criar nova
        config = configparser.ConfigParser()
        if os.path.exists(config_path):
            config.read(config_path)
        
        # Criar seções se não existirem
        if 'SSH' not in config:
            config.add_section('SSH')
        if 'MySQL' not in config:
            config.add_section('MySQL')
        if 'PATHS' not in config:
            config.add_section('PATHS')
        if 'API' not in config:
            config.add_section('API')
        
        # Atualizar configurações SSH
        ssh_data = request.data.get('ssh', {})
        if ssh_data:
            if 'host' in ssh_data:
                config.set('SSH', 'host', str(ssh_data['host']))
            if 'port' in ssh_data:
                config.set('SSH', 'port', str(ssh_data['port']))
            if 'username' in ssh_data:
                config.set('SSH', 'username', str(ssh_data['username']))
            if 'use_key' in ssh_data:
                config.set('SSH', 'use_key', str(ssh_data['use_key']).lower())
            if 'key_path' in ssh_data:
                config.set('SSH', 'key_path', str(ssh_data['key_path']))
            if 'password' in ssh_data and ssh_data['password'] and ssh_data['password'] != 'secret':
                # Só atualizar senha se foi fornecida (não vazia e não é o placeholder "secret")
                config.set('SSH', 'password', str(ssh_data['password']))
        
        # Atualizar configurações MySQL
        mysql_data = request.data.get('mysql', {})
        if mysql_data:
            if 'host' in mysql_data:
                config.set('MySQL', 'host', str(mysql_data['host']))
            if 'port' in mysql_data:
                config.set('MySQL', 'port', str(mysql_data['port']))
            if 'user' in mysql_data:
                config.set('MySQL', 'user', str(mysql_data['user']))
            if 'password' in mysql_data and mysql_data['password'] and mysql_data['password'] != 'secret':
                # Só atualizar senha se foi fornecida (não vazia e não é o placeholder "secret")
                config.set('MySQL', 'password', str(mysql_data['password']))
            if 'database' in mysql_data:
                config.set('MySQL', 'database', str(mysql_data['database']))
        
        # Salvar arquivo
        with open(config_path, 'w') as configfile:
            config.write(configfile)
        
        logger.info(f"Configurações salvas em {config_path}")
        
        # Recarregar configurações após salvar
        # Remover senhas do retorno por segurança
        try:
            ssh_config_updated = get_ssh_config()
            mysql_config_updated = get_mysql_config()
            
            ssh_password_updated = ssh_config_updated.get('password', '')
            mysql_password_updated = mysql_config_updated.get('password', '')
            
            ssh_safe = {
                'host': ssh_config_updated.get('host', ''),
                'port': ssh_config_updated.get('port', 22),
                'username': ssh_config_updated.get('username', ''),
                'use_key': ssh_config_updated.get('use_key', False),
                'key_path': ssh_config_updated.get('key_path', ''),
                'password': 'secret' if ssh_password_updated else '',
                'has_password': bool(ssh_password_updated),
            }
            
            mysql_safe = {
                'host': mysql_config_updated.get('host', ''),
                'port': mysql_config_updated.get('port', 3306),
                'user': mysql_config_updated.get('user', ''),
                'password': 'secret' if mysql_password_updated else '',
                'has_password': bool(mysql_password_updated),
                'database': mysql_config_updated.get('database', ''),
            }
            
            return Response({
                'message': 'Configurações salvas com sucesso',
                'ssh': ssh_safe,
                'mysql': mysql_safe,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.warning(f"Erro ao recarregar configurações: {e}")
            return Response({
                'message': 'Configurações salvas com sucesso',
            }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao salvar configurações: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

