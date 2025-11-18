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


class CacheService:
    """
    Cache thread-safe para armazenar snapshots coletados em background.

    Cada entrada contém:
        - data: payload arbitrário
        - updated_at: timestamp epoch em segundos
        - error: última mensagem de erro (se houver)
        - meta: informações adicionais opcionais
    """

    _lock = threading.RLock()
    _cache: Dict[str, Dict[str, Any]] = {}

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
            return copy.deepcopy(entry) if entry is not None else None

    @classmethod
    def get_data(cls, key: str, default: Any = None) -> Any:
        entry = cls.get_entry(key)
        if entry is None:
            return default
        return copy.deepcopy(entry.get("data")) if entry.get("data") is not None else default


