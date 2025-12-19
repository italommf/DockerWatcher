"""
Gerenciador de serviços singleton para evitar reconexões constantes.
Reutiliza instâncias dos serviços em todas as requisições.
Inicializa conexões ao iniciar o aplicativo.
"""
import threading
import logging
from typing import Optional
from services.ssh_service import SSHService
from services.database_service import DatabaseService
from services.kubernetes_service import KubernetesService
from services.file_service import FileService

logger = logging.getLogger(__name__)

# Instâncias singleton dos serviços
_ssh_service: Optional[SSHService] = None
_db_service: Optional[DatabaseService] = None
_k8s_service: Optional[KubernetesService] = None
_file_service: Optional[FileService] = None

# Lock para thread-safety
_lock = threading.Lock()
_initialized = False


def initialize_services():
    """Inicializa todas as conexões ao iniciar o aplicativo na ordem: Banco de Dados -> VM."""
    global _initialized, _ssh_service, _db_service, _k8s_service, _file_service
    if _initialized:
        return
    
    try:
        with _lock:
            if _initialized:
                return
            
            logger.info("Inicializando conexões na ordem: Banco de Dados -> VM...")
            
            # Verificar se o arquivo de configuração existe antes de tentar conectar
            try:
                from pathlib import Path
                from config.ssh_config import get_config_path
                config_path = Path(get_config_path())
                if not config_path.exists():
                    logger.warning("Arquivo config.ini não encontrado. Serviços não serão inicializados.")
                    _initialized = True
                    return
            except Exception as e:
                logger.warning(f"Erro ao verificar config.ini: {e}")
                _initialized = True
                return
            
            # 1. Conectar Banco de Dados primeiro
            _db_service = None
            try:
                logger.info("1/2 Conectando ao Banco de Dados MySQL...")
                _db_service = DatabaseService(auto_connect=True)
                if _db_service is not None:
                    try:
                        mysql_ok, mysql_msg = _db_service.test_connection_with_details()
                        if mysql_ok:
                            logger.info("✓ Conexão MySQL estabelecida e testada")
                        else:
                            logger.warning(f"⚠ Conexão MySQL não pôde ser estabelecida: {mysql_msg}")
                    except Exception as test_e:
                        logger.warning(f"⚠ Erro ao testar conexão MySQL: {test_e}")
                else:
                    logger.warning("⚠ Não foi possível criar instância do DatabaseService")
            except Exception as e:
                logger.warning(f"⚠ Erro ao inicializar MySQL: {e}")
                import traceback
                logger.warning(traceback.format_exc())
                # Criar instância mesmo se falhar (será conectada sob demanda)
                try:
                    _db_service = DatabaseService(auto_connect=False)
                except Exception as e2:
                    logger.warning(f"⚠ Erro ao criar DatabaseService sem auto_connect: {e2}")
                    _db_service = None
            
            # 2. Conectar VM (SSH) depois do banco de dados
            _ssh_service = None
            try:
                logger.info("2/2 Conectando à VM via SSH...")
                _ssh_service = SSHService(auto_connect=True)
                if _ssh_service is not None:
                    try:
                        ssh_ok = _ssh_service.test_connection()
                        if ssh_ok:
                            logger.info("✓ Conexão SSH estabelecida e testada")
                        else:
                            logger.warning("⚠ Conexão SSH não pôde ser estabelecida")
                    except Exception as test_e:
                        logger.warning(f"⚠ Erro ao testar conexão SSH: {test_e}")
                else:
                    logger.warning("⚠ Não foi possível criar instância do SSHService")
            except Exception as e:
                logger.warning(f"⚠ Erro ao inicializar SSH: {e}")
                import traceback
                logger.warning(traceback.format_exc())
                # Criar instância mesmo se falhar (será conectada sob demanda)
                try:
                    _ssh_service = SSHService(auto_connect=False)
                except Exception as e2:
                    logger.warning(f"⚠ Erro ao criar SSHService sem auto_connect: {e2}")
                    _ssh_service = None
            
            # Criar serviços dependentes (já usam as conexões estabelecidas)
            try:
                if _ssh_service is not None:
                    _k8s_service = KubernetesService(ssh_service=_ssh_service)
                    _file_service = FileService(ssh_service=_ssh_service)
                else:
                    logger.warning("⚠ SSHService não disponível, serviços dependentes não serão criados")
            except Exception as e:
                logger.warning(f"⚠ Erro ao inicializar serviços dependentes: {e}")
                import traceback
                logger.warning(traceback.format_exc())
            
            _initialized = True
            logger.info("✓ Serviços inicializados. Conexões prontas para uso.")
    except Exception as e:
        logger.error(f"Erro crítico ao inicializar serviços: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # Marcar como inicializado mesmo com erro para não tentar novamente
        _initialized = True


def get_ssh_service() -> SSHService:
    """Retorna instância singleton do SSHService."""
    global _ssh_service
    if _ssh_service is None:
        with _lock:
            if _ssh_service is None:
                _ssh_service = SSHService()
                # Tentar estabelecer conexão imediatamente
                try:
                    _ssh_service.test_connection()
                except:
                    pass
    return _ssh_service


def get_database_service() -> DatabaseService:
    """Retorna instância singleton do DatabaseService."""
    global _db_service
    if _db_service is None:
        with _lock:
            if _db_service is None:
                _db_service = DatabaseService()
                # Tentar estabelecer conexão imediatamente
                try:
                    _db_service.test_connection()
                except:
                    pass
    return _db_service


def get_kubernetes_service() -> KubernetesService:
    """Retorna instância singleton do KubernetesService."""
    global _k8s_service
    if _k8s_service is None:
        with _lock:
            if _k8s_service is None:
                # Reutilizar ssh_service singleton
                _k8s_service = KubernetesService(ssh_service=get_ssh_service())
    return _k8s_service


def get_file_service() -> FileService:
    """Retorna instância singleton do FileService."""
    global _file_service
    if _file_service is None:
        with _lock:
            if _file_service is None:
                # Reutilizar ssh_service singleton
                _file_service = FileService(ssh_service=get_ssh_service())
    return _file_service


def reset_services():
    """Reseta todas as instâncias dos serviços (útil para testes ou recarregamento)."""
    global _ssh_service, _db_service, _k8s_service, _file_service
    with _lock:
        if _ssh_service:
            try:
                _ssh_service.reload_config()
            except:
                pass
        if _db_service:
            try:
                _db_service.reload_config()
            except:
                pass
        
        # Recriar serviços para usar novas configurações
        _ssh_service = None
        _db_service = None
        _k8s_service = None
        _file_service = None

