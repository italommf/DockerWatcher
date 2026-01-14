"""
Cliente Prometheus para queries PromQL.
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

import requests

logger = logging.getLogger(__name__)

# Flag para indicar que Prometheus está disponível
PROMETHEUS_AVAILABLE = True


class PrometheusClient:
    """
    Cliente para API do Prometheus.
    
    Permite executar queries PromQL para obter métricas em tempo real ou histórico.
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
                from config.ssh_config import get_prometheus_config
                config = get_prometheus_config()
                self.url = config.get('url', 'http://localhost:9090').rstrip('/')
            except:
                self.url = 'http://localhost:9090'
        
        logger.info(f"PrometheusClient inicializado: {self.url}")
    
    def query(self, promql: str) -> List[Dict]:
        """
        Executa query PromQL instantânea.
        
        Args:
            promql: Query PromQL
        
        Returns:
            Lista de resultados
        """
        try:
            response = requests.get(
                f"{self.url}/api/v1/query",
                params={"query": promql},
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            if data.get('status') == 'success':
                return data.get('data', {}).get('result', [])
            else:
                logger.warning(f"Query falhou: {data.get('error')}")
                return []
        
        except requests.RequestException as e:
            logger.error(f"Erro ao executar query Prometheus: {e}")
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
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            if data.get('status') == 'success':
                return data.get('data', {}).get('result', [])
            else:
                logger.warning(f"Query range falhou: {data.get('error')}")
                return []
        
        except requests.RequestException as e:
            logger.error(f"Erro ao executar query_range Prometheus: {e}")
            return []
    
    def is_available(self) -> bool:
        """Verifica se Prometheus está disponível."""
        try:
            response = requests.get(f"{self.url}/-/healthy", timeout=5)
            return response.status_code == 200
        except:
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
