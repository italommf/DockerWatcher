"""
Cliente Kubernetes singleton.
Gerencia conexão com o cluster via API oficial.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Verificar se kubernetes está disponível
try:
    from kubernetes import client, config
    from kubernetes.client.rest import ApiException
    K8S_AVAILABLE = True
except ImportError:
    K8S_AVAILABLE = False
    client = None
    config = None
    ApiException = Exception
    logger.warning("Pacote 'kubernetes' não instalado. Execute: pip install kubernetes")


class K8sClient:
    """
    Cliente Kubernetes singleton.
    
    Gerencia conexão e fornece acesso às APIs:
    - CoreV1Api (pods, services, configmaps)
    - BatchV1Api (jobs, cronjobs)
    - AppsV1Api (deployments)
    """
    
    _instance: Optional['K8sClient'] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        if not K8S_AVAILABLE:
            raise ImportError("Pacote 'kubernetes' não está instalado")
        
        self._load_config()
        self._init_apis()
        self._initialized = True
        logger.info("K8sClient inicializado com sucesso")
    
    def _load_config(self):
        """Carrega configuração (in-cluster ou kubeconfig)."""
        try:
            # Tentar in-cluster primeiro (quando Django roda dentro do K8s)
            config.load_incluster_config()
            logger.info("Configuração in-cluster carregada")
        except config.ConfigException:
            # Fallback para kubeconfig
            try:
                from config.config import get_kubernetes_config
                k8s_config = get_kubernetes_config()
                kubeconfig_path = k8s_config.get('kubeconfig_path')
                
                if kubeconfig_path:
                    config.load_kube_config(config_file=kubeconfig_path)
                    logger.info(f"Kubeconfig carregado: {kubeconfig_path}")
                else:
                    config.load_kube_config()
                    logger.info("Kubeconfig padrão carregado (~/.kube/config)")
            except Exception as e:
                logger.error(f"Erro ao carregar kubeconfig: {e}")
                raise
    
    def _init_apis(self):
        """Inicializa APIs do Kubernetes."""
        self.core = client.CoreV1Api()
        self.batch = client.BatchV1Api()
        self.apps = client.AppsV1Api()
        self.custom = client.CustomObjectsApi()
    
    @property
    def namespace(self) -> str:
        """Retorna namespace padrão."""
        try:
            from config.config import get_kubernetes_config
            return get_kubernetes_config().get('namespace', 'default')
        except:
            return 'default'
    
    def is_available(self) -> bool:
        """Verifica se conexão com cluster está ativa."""
        try:
            self.core.list_namespace(limit=1)
            return True
        except Exception as e:
            logger.warning(f"Cluster não disponível: {e}")
            return False


# Função global para obter cliente
_client: Optional[K8sClient] = None


def get_k8s_client() -> K8sClient:
    """Retorna instância singleton do cliente K8s."""
    global _client
    if _client is None:
        _client = K8sClient()
    return _client
