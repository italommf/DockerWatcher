import copy
import threading
import time
from typing import Any, Dict, Optional


class CacheKeys:
    """Chaves centralizadas do cache de dados compartilhados."""

    VM_RESOURCES = "vm_resources"
    JOBS = "jobs"
    PODS = "pods"
    CRONJOBS = "cronjobs"
    DEPLOYMENTS = "deployments"
    EXECUTIONS = "executions"
    CONNECTION_STATUS = "connection_status"
    RPAS_PROCESSED = "rpas_processed"  # Lista de RPAs já processada e pronta para exibição
    CRONJOBS_PROCESSED = "cronjobs_processed"  # Lista de cronjobs já processada e pronta para exibição
    DEPLOYMENTS_PROCESSED = "deployments_processed"  # Lista de deployments já processada e pronta para exibição


# TTLs padrão por tipo de dado (em segundos)
DEFAULT_TTLS = {
    CacheKeys.VM_RESOURCES: 10,
    CacheKeys.JOBS: 10,
    CacheKeys.PODS: 10,
    CacheKeys.CRONJOBS: 15,
    CacheKeys.DEPLOYMENTS: 15,
    CacheKeys.EXECUTIONS: 30,  # Dados do bwav4 - podem ter TTL maior
    CacheKeys.CONNECTION_STATUS: 5,
    CacheKeys.RPAS_PROCESSED: 15,
    CacheKeys.CRONJOBS_PROCESSED: 15,
    CacheKeys.DEPLOYMENTS_PROCESSED: 15,
}


class CacheService:
    """
    Cache thread-safe para armazenar snapshots coletados em background.

    Cada entrada contém:
        - data: payload arbitrário
        - updated_at: timestamp epoch em segundos
        - error: última mensagem de erro (se houver)
        - meta: informações adicionais opcionais
        - access_count: contador de acessos para métricas
    """

    _lock = threading.RLock()
    _cache: Dict[str, Dict[str, Any]] = {}
    _access_counts: Dict[str, int] = {}

    @classmethod
    def update(cls, key: str, data: Any, error: Optional[str] = None, meta: Optional[Dict[str, Any]] = None):
        entry = {
            "data": data,
            "updated_at": time.time(),
            "error": error,
            "meta": meta or {},
        }
        with cls._lock:
            cls._cache[key] = entry

    @classmethod
    def get_entry(cls, key: str) -> Optional[Dict[str, Any]]:
        with cls._lock:
            entry = cls._cache.get(key)
            if entry is not None:
                cls._access_counts[key] = cls._access_counts.get(key, 0) + 1
            return copy.deepcopy(entry) if entry is not None else None

    @classmethod
    def get_data(cls, key: str, default: Any = None) -> Any:
        entry = cls.get_entry(key)
        if entry is None:
            return default
        return copy.deepcopy(entry.get("data")) if entry.get("data") is not None else default

    @classmethod
    def is_stale(cls, key: str, max_age: Optional[float] = None) -> bool:
        """
        Verifica se o cache está desatualizado.
        
        Args:
            key: Chave do cache
            max_age: Idade máxima em segundos (usa TTL padrão se não especificado)
            
        Returns:
            True se o cache não existe ou está mais antigo que max_age
        """
        with cls._lock:
            entry = cls._cache.get(key)
            if entry is None:
                return True
            
            if max_age is None:
                max_age = DEFAULT_TTLS.get(key, 30)
            
            age = time.time() - entry.get("updated_at", 0)
            return age > max_age
    
    @classmethod
    def get_age(cls, key: str) -> Optional[float]:
        """Retorna a idade do cache em segundos, ou None se não existir."""
        with cls._lock:
            entry = cls._cache.get(key)
            if entry is None:
                return None
            return time.time() - entry.get("updated_at", 0)
    
    @classmethod
    def get_if_fresh(cls, key: str, max_age: Optional[float] = None, default: Any = None) -> Any:
        """
        Retorna dados do cache apenas se ainda estiverem frescos.
        
        Args:
            key: Chave do cache
            max_age: Idade máxima em segundos
            default: Valor padrão se cache não existe ou está stale
            
        Returns:
            Dados do cache se frescos, default caso contrário
        """
        if cls.is_stale(key, max_age):
            return default
        return cls.get_data(key, default)
    
    @classmethod
    def get_access_count(cls, key: str) -> int:
        """Retorna contador de acessos para uma chave."""
        with cls._lock:
            return cls._access_counts.get(key, 0)
    
    @classmethod
    def get_all_stats(cls) -> Dict[str, Any]:
        """Retorna estatísticas de todas as chaves do cache."""
        with cls._lock:
            stats = {}
            for key, entry in cls._cache.items():
                age = time.time() - entry.get("updated_at", 0)
                ttl = DEFAULT_TTLS.get(key, 30)
                stats[key] = {
                    "age": round(age, 2),
                    "ttl": ttl,
                    "is_stale": age > ttl,
                    "access_count": cls._access_counts.get(key, 0),
                    "has_error": entry.get("error") is not None,
                }
            return stats

