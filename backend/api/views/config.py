"""
Endpoints para gerenciar configuração.
Refatorado - sem SSH, apenas MySQL/K8s/Prometheus.
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from config.config import get_config_path, load_config, get_mysql_config, get_kubernetes_config, get_prometheus_config
import configparser
import os
import logging

logger = logging.getLogger(__name__)


@api_view(['GET'])
def get_config(request):
    """Retorna as configurações atuais."""
    try:
        config_path = get_config_path()
        
        if not os.path.exists(config_path):
            return Response({
                'mysql': {
                    'host': '',
                    'port': 3306,
                    'user': '',
                    'database': '',
                    'has_password': False,
                },
                'kubernetes': {
                    'in_cluster': False,
                    'kubeconfig_path': '',
                    'namespace': 'default',
                },
                'prometheus': {
                    'url': 'http://localhost:9090',
                },
            }, status=status.HTTP_200_OK)
        
        mysql_config = get_mysql_config()
        k8s_config = get_kubernetes_config()
        prom_config = get_prometheus_config()
        
        mysql_password = mysql_config.get('password', '')
        
        return Response({
            'mysql': {
                'host': mysql_config.get('host', ''),
                'port': mysql_config.get('port', 3306),
                'user': mysql_config.get('user', ''),
                'database': mysql_config.get('database', ''),
                'has_password': bool(mysql_password),
            },
            'kubernetes': {
                'in_cluster': k8s_config.get('in_cluster', False),
                'kubeconfig_path': k8s_config.get('kubeconfig_path', ''),
                'namespace': k8s_config.get('namespace', 'default'),
            },
            'prometheus': {
                'url': prom_config.get('url', 'http://localhost:9090'),
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
        
        config_dir = os.path.dirname(config_path)
        if config_dir:
            os.makedirs(config_dir, exist_ok=True)
        
        config = configparser.ConfigParser()
        if os.path.exists(config_path):
            config.read(config_path)
        
        # Garantir seções existem
        for section in ['MySQL', 'KUBERNETES', 'PROMETHEUS']:
            if section not in config:
                config.add_section(section)
        
        # MySQL
        mysql_data = request.data.get('mysql', {})
        if mysql_data:
            if 'host' in mysql_data:
                config.set('MySQL', 'host', str(mysql_data['host']))
            if 'port' in mysql_data:
                config.set('MySQL', 'port', str(mysql_data['port']))
            if 'user' in mysql_data:
                config.set('MySQL', 'user', str(mysql_data['user']))
            if 'password' in mysql_data and mysql_data['password']:
                config.set('MySQL', 'password', str(mysql_data['password']))
            if 'database' in mysql_data:
                config.set('MySQL', 'database', str(mysql_data['database']))
        
        # Kubernetes
        k8s_data = request.data.get('kubernetes', {})
        if k8s_data:
            if 'in_cluster' in k8s_data:
                config.set('KUBERNETES', 'in_cluster', str(k8s_data['in_cluster']).lower())
            if 'kubeconfig_path' in k8s_data:
                config.set('KUBERNETES', 'kubeconfig_path', str(k8s_data['kubeconfig_path']))
            if 'namespace' in k8s_data:
                config.set('KUBERNETES', 'namespace', str(k8s_data['namespace']))
        
        # Prometheus
        prom_data = request.data.get('prometheus', {})
        if prom_data:
            if 'url' in prom_data:
                config.set('PROMETHEUS', 'url', str(prom_data['url']))
        
        with open(config_path, 'w') as configfile:
            config.write(configfile)
        
        logger.info(f"Configurações salvas em {config_path}")
        
        return Response({
            'message': 'Configurações salvas com sucesso',
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Erro ao salvar configurações: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
