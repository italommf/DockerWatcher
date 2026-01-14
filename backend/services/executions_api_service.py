"""
Serviço para buscar execuções da API REST (MongoDB).
Substitui a busca direta no MySQL bwav4.
"""
import logging
import threading
import time
from typing import Dict, List, Optional

import requests

from config.config import get_executions_api_config

logger = logging.getLogger(__name__)


class ExecutionsApiService:
    """Serviço para buscar execuções via API REST (MongoDB)."""
    
    def __init__(self):
        self._config = get_executions_api_config()
        self._token: Optional[str] = None
        self._token_expiry: float = 0
        self._lock = threading.RLock()
        self._session = requests.Session()
        self._session.timeout = 30
    
    def _login(self) -> str:
        """
        Autentica na API e retorna o token de acesso.
        """
        try:
            payload = {
                "email": self._config["username"],
                "senha": self._config["password"]
            }
            
            response = self._session.post(
                f"{self._config['login_url']}/api/autenticacao/obter-token-acesso/",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code != 200:
                logger.error(f"Erro ao fazer login na API de execuções: {response.status_code}")
                raise Exception(f"Erro de autenticação: {response.status_code}")
            
            data = response.json()
            access_token = data.get("access")
            
            if not access_token:
                raise Exception("Token de acesso não retornado pela API")
            
            # Token JWT geralmente expira em 1 hora, vamos renovar a cada 50 minutos
            self._token_expiry = time.time() + (50 * 60)
            
            logger.info("Login na API de execuções realizado com sucesso")
            return access_token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Erro de conexão ao fazer login na API: {e}")
            raise Exception(f"Erro de conexão: {e}")
    
    def _get_token(self) -> str:
        """
        Retorna um token válido, renovando se necessário.
        """
        with self._lock:
            # Se o token ainda é válido, retorná-lo
            if self._token and time.time() < self._token_expiry:
                return self._token
            
            # Renovar o token
            self._token = self._login()
            return self._token
    
    def obter_execucoes_por_uuid(self, robo_uuid: str) -> List[Dict]:
        """
        Busca execuções pendentes para um robô pelo seu UUID.
        
        Args:
            robo_uuid: UUID do robô no MongoDB
            
        Returns:
            Lista de execuções pendentes (dicionários)
        """
        if not robo_uuid or robo_uuid == "PLACEHOLDER-UUID":
            return []
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                token = self._get_token()
                
                response = self._session.get(
                    f"{self._config['base_url']}/execucao",
                    params={"robo_id": robo_uuid},
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    timeout=30
                )
                
                if response.status_code == 401:
                    # Token expirado, forçar renovação
                    logger.warning("Token expirado, renovando...")
                    with self._lock:
                        self._token = None
                        self._token_expiry = 0
                    continue
                
                if response.status_code != 200:
                    logger.error(f"Erro ao buscar execuções (UUID: {robo_uuid}): {response.status_code}")
                    return []
                
                data = response.json()
                
                # Se a API retorna lista vazia, retorna lista vazia
                if data == [] or not data:
                    return []
                
                # Extrair lista de execuções
                todas_execucoes = []
                if isinstance(data, list):
                    todas_execucoes = data
                elif isinstance(data, dict):
                    todas_execucoes = data.get("execucoes", data.get("data", []))
                
                # Filtrar apenas execuções pendentes (etapa 4)
                execucoes_pendentes = []
                for exec in todas_execucoes:
                    try:
                        status = exec.get('status', [])
                        if isinstance(status, list) and len(status) > 0:
                            if status[0].get('etapa') == 4:
                                execucoes_pendentes.append(exec)
                    except (KeyError, TypeError, IndexError):
                        continue
                
                return execucoes_pendentes
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Erro de conexão ao buscar execuções (tentativa {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(1)
                continue
            except Exception as e:
                logger.error(f"Erro inesperado ao buscar execuções: {e}")
                return []
        
        return []
    
    def obter_execucoes_em_lote(self, rpas: List[Dict]) -> Dict[str, List[Dict]]:
        """
        Busca execuções para múltiplos RPAs.
        
        Args:
            rpas: Lista de dicts com 'nome' e 'robo_uuid'
            
        Returns:
            Dict com nome do RPA como chave e lista de execuções como valor
        """
        resultados: Dict[str, List[Dict]] = {}
        
        for rpa in rpas:
            nome = rpa.get("nome") or rpa.get("nome_rpa", "")
            uuid = rpa.get("robo_uuid", "")
            
            if uuid and uuid != "PLACEHOLDER-UUID":
                execucoes = self.obter_execucoes_por_uuid(uuid)
                if execucoes:
                    resultados[nome] = execucoes
        
        return resultados
    
    def test_connection(self) -> bool:
        """Testa a conexão com a API de execuções."""
        try:
            self._get_token()
            return True
        except Exception as e:
            logger.error(f"Erro ao testar conexão com API de execuções: {e}")
            return False


# Singleton para uso global
_executions_api_service: Optional[ExecutionsApiService] = None
_executions_api_lock = threading.Lock()


def get_executions_api_service() -> ExecutionsApiService:
    """Retorna a instância singleton do serviço de API de execuções."""
    global _executions_api_service
    
    with _executions_api_lock:
        if _executions_api_service is None:
            _executions_api_service = ExecutionsApiService()
        return _executions_api_service


def reset_executions_api_service():
    """Reseta a instância do serviço (útil para recarregar configurações)."""
    global _executions_api_service
    
    with _executions_api_lock:
        _executions_api_service = None
