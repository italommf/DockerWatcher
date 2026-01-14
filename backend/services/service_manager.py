"""
Gerenciador de serviços singleton.
Refatorado para usar módulos k8s/ e metrics/.
"""

import threading
import logging
from typing import Optional

from services.database_service import DatabaseService

# Novos módulos K8s e Metrics
from k8s.client import get_k8s_client, K8S_AVAILABLE
from k8s.jobs import JobService
from k8s.pods import PodService
from k8s.cronjobs import CronJobService
from k8s.deployments import DeploymentService

from metrics.client import get_prometheus_client
from metrics.pods import PodMetricsService
from metrics.vm import VMMetricsService

logger = logging.getLogger(__name__)

# Instâncias singleton
_db_service: Optional[DatabaseService] = None

# Serviços K8s (lazy init)
_job_service: Optional[JobService] = None
_pod_service: Optional[PodService] = None
_cronjob_service: Optional[CronJobService] = None
_deployment_service: Optional[DeploymentService] = None

# Serviços Metrics (lazy init)
_pod_metrics_service: Optional[PodMetricsService] = None
_vm_metrics_service: Optional[VMMetricsService] = None

# Lock para thread-safety
_lock = threading.Lock()
_initialized = False


def initialize_services():
    """Inicializa serviços essenciais ao iniciar o aplicativo."""
    global _initialized, _db_service
    if _initialized:
        return
    
    try:
        with _lock:
            if _initialized:
                return
            
            logger.info("Inicializando serviços...")
            
            # Verificar configuração
            try:
                from pathlib import Path
                from config.ssh_config import get_config_path
                config_path = Path(get_config_path())
                if not config_path.exists():
                    logger.warning("Arquivo config.ini não encontrado.")
                    _initialized = True
                    return
            except Exception as e:
                logger.warning(f"Erro ao verificar config.ini: {e}")
                _initialized = True
                return
            
            # 1. Conectar Banco de Dados
            try:
                logger.info("Conectando ao MySQL...")
                _db_service = DatabaseService(auto_connect=True)
                if _db_service:
                    mysql_ok, mysql_msg = _db_service.test_connection_with_details()
                    if mysql_ok:
                        logger.info("✓ MySQL conectado")
                    else:
                        logger.warning(f"⚠ MySQL: {mysql_msg}")
            except Exception as e:
                logger.warning(f"⚠ Erro MySQL: {e}")
                try:
                    _db_service = DatabaseService(auto_connect=False)
                except:
                    _db_service = None
            
            # 2. Verificar K8s
            try:
                if K8S_AVAILABLE:
                    client = get_k8s_client()
                    if client.is_available():
                        logger.info("✓ Kubernetes conectado")
                    else:
                        logger.warning("⚠ Kubernetes não disponível")
                else:
                    logger.warning("⚠ Pacote kubernetes não instalado")
            except Exception as e:
                logger.warning(f"⚠ Erro K8s: {e}")
            
            # 3. Verificar Prometheus
            try:
                prom = get_prometheus_client()
                if prom.is_available():
                    logger.info("✓ Prometheus conectado")
                else:
                    logger.warning("⚠ Prometheus não disponível")
            except Exception as e:
                logger.warning(f"⚠ Erro Prometheus: {e}")
            
            _initialized = True
            logger.info("✓ Serviços inicializados")
            
    except Exception as e:
        logger.error(f"Erro ao inicializar serviços: {e}")
        _initialized = True


def get_database_service() -> DatabaseService:
    """Retorna instância singleton do DatabaseService."""
    global _db_service
    if _db_service is None:
        with _lock:
            if _db_service is None:
                _db_service = DatabaseService()
    return _db_service


# Getters K8s
def get_job_service() -> JobService:
    """Retorna instância singleton do JobService."""
    global _job_service
    if _job_service is None:
        with _lock:
            if _job_service is None:
                _job_service = JobService()
    return _job_service


def get_pod_service() -> PodService:
    """Retorna instância singleton do PodService."""
    global _pod_service
    if _pod_service is None:
        with _lock:
            if _pod_service is None:
                _pod_service = PodService()
    return _pod_service


def get_cronjob_service() -> CronJobService:
    """Retorna instância singleton do CronJobService."""
    global _cronjob_service
    if _cronjob_service is None:
        with _lock:
            if _cronjob_service is None:
                _cronjob_service = CronJobService()
    return _cronjob_service


def get_deployment_service() -> DeploymentService:
    """Retorna instância singleton do DeploymentService."""
    global _deployment_service
    if _deployment_service is None:
        with _lock:
            if _deployment_service is None:
                _deployment_service = DeploymentService()
    return _deployment_service


# Getters Metrics
def get_pod_metrics_service() -> PodMetricsService:
    """Retorna instância singleton do PodMetricsService."""
    global _pod_metrics_service
    if _pod_metrics_service is None:
        with _lock:
            if _pod_metrics_service is None:
                _pod_metrics_service = PodMetricsService()
    return _pod_metrics_service


def get_vm_metrics_service() -> VMMetricsService:
    """Retorna instância singleton do VMMetricsService."""
    global _vm_metrics_service
    if _vm_metrics_service is None:
        with _lock:
            if _vm_metrics_service is None:
                _vm_metrics_service = VMMetricsService()
    return _vm_metrics_service


def reset_services():
    """Reseta todas as instâncias."""
    global _db_service
    global _job_service, _pod_service, _cronjob_service, _deployment_service
    global _pod_metrics_service, _vm_metrics_service
    
    with _lock:
        if _db_service:
            try:
                _db_service.reload_config()
            except:
                pass
        
        _db_service = None
        _job_service = None
        _pod_service = None
        _cronjob_service = None
        _deployment_service = None
        _pod_metrics_service = None
        _vm_metrics_service = None

