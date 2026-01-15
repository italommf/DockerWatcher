"""
Cliente Prometheus para queries PromQL.
"""

import logging
import time
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

import requests

logger = logging.getLogger(__name__)

# Configuração do Circuit Breaker
CIRCUIT_BREAKER_COOLDOWN = 60  # Segundos para esperar após falha
_last_fail_time = 0
_prometheus_available = True


class PrometheusClient:
    """
    Cliente para API do Prometheus com Circuit Breaker.
    """
    
    def __init__(self, url: str = None):
        """
        Inicializa cliente Prometheus.
        
        Args:
            url: URL do Prometheus (ex: http://prometheus:9090)
        """
        if url:
            self.url = url.rstrip('/')
        else:
            # Carregar da configuração
            try:
                from config.config import get_prometheus_config
                config = get_prometheus_config()
                self.url = config.get('url', 'http://localhost:9090').rstrip('/')
            except:
                self.url = 'http://localhost:9090'
        
        logger.info(f"PrometheusClient inicializado: {self.url}")
    
    def _check_circuit(self) -> bool:
        """Verifica se o circuit breaker está aberto."""
        global _prometheus_available, _last_fail_time
        if not _prometheus_available:
            if time.time() - _last_fail_time > CIRCUIT_BREAKER_COOLDOWN:
                logger.info("Tentando reconectar ao Prometheus (Circuit Breaker Cooldown encerrado)")
                _prometheus_available = True
                return True
            return False
        return True

    def _report_fail(self):
        """Reporta falha e abre o circuit breaker."""
        global _prometheus_available, _last_fail_time
        if _prometheus_available:
            logger.warning(f"Abrindo Circuit Breaker para Prometheus em {self.url}")
            _prometheus_available = False
            _last_fail_time = time.time()

    def query(self, promql: str) -> List[Dict]:
        """
        Executa query PromQL instantânea.
        
        Args:
            promql: Query PromQL
        
        Returns:
            Lista de resultados
        """
        if not self._check_circuit():
            return []
            
        try:
            response = requests.get(
                f"{self.url}/api/v1/query",
                params={"query": promql},
                timeout=1.0  # Timeout agressivo para query instantânea
            )
            response.raise_for_status()
            
            data = response.json()
            if data.get('status') == 'success':
                return data.get('data', {}).get('result', [])
            return []
        
        except requests.RequestException as e:
            logger.error(f"Erro ao executar query Prometheus: {e}")
            self._report_fail()
            return []
    
    def query_range(
        self,
        promql: str,
        start: datetime = None,
        end: datetime = None,
        step: str = "15s"
    ) -> List[Dict]:
        """
        Executa query PromQL com range de tempo (para gráficos).
        
        Args:
            promql: Query PromQL
            start: Data/hora inicial (default: 1 hora atrás)
            end: Data/hora final (default: agora)
            step: Intervalo entre pontos (ex: "15s", "1m", "5m")
        
        Returns:
            Lista de séries temporais
        """
        if not self._check_circuit():
            return []
            
        if not end:
            end = datetime.now()
        if not start:
            start = end - timedelta(hours=1)
        
        try:
            response = requests.get(
                f"{self.url}/api/v1/query_range",
                params={
                    "query": promql,
                    "start": start.timestamp(),
                    "end": end.timestamp(),
                    "step": step
                },
                timeout=5.0  # Timeout para range
            )
            response.raise_for_status()
            
            data = response.json()
            if data.get('status') == 'success':
                return data.get('data', {}).get('result', [])
            return []
        
        except requests.RequestException as e:
            logger.error(f"Erro ao executar query_range Prometheus: {e}")
            self._report_fail()
            return []
    
    def is_available(self) -> bool:
        """Verifica se Prometheus está disponível (usa circuit breaker)."""
        if not self._check_circuit():
            return False
            
        try:
            response = requests.get(f"{self.url}/-/healthy", timeout=1.0)
            available = response.status_code == 200
            if not available:
                self._report_fail()
            return available
        except:
            self._report_fail()
            return False
    
    def get_scalar(self, promql: str) -> Optional[float]:
        """
        Executa query e retorna valor escalar.
        
        Útil para queries que retornam um único valor.
        """
        result = self.query(promql)
        if result and len(result) > 0:
            try:
                # Formato: [timestamp, "value"]
                value = result[0].get('value', [None, None])[1]
                return float(value) if value else None
            except (ValueError, IndexError):
                return None
        return None


# Singleton
_client: Optional[PrometheusClient] = None


def get_prometheus_client() -> PrometheusClient:
    """Retorna instância singleton do cliente Prometheus."""
    global _client
    if _client is None:
        _client = PrometheusClient()
    return _client
