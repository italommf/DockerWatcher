"""
Métricas da VM host via Prometheus (node-exporter).
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from metrics.client import get_prometheus_client, PrometheusClient

logger = logging.getLogger(__name__)


@dataclass
class VMMetrics:
    """Métricas resumidas da VM."""
    cpu_usage_percent: float
    memory_total_gb: float
    memory_used_gb: float
    memory_usage_percent: float
    disk_total_gb: float
    disk_used_gb: float
    disk_usage_percent: float
    
    def to_dict(self) -> dict:
        return {
            'cpu': {
                'usage_percent': round(self.cpu_usage_percent, 2),
            },
            'memory': {
                'total_gb': round(self.memory_total_gb, 2),
                'used_gb': round(self.memory_used_gb, 2),
                'usage_percent': round(self.memory_usage_percent, 2),
            },
            'disk': {
                'total_gb': round(self.disk_total_gb, 2),
                'used_gb': round(self.disk_used_gb, 2),
                'usage_percent': round(self.disk_usage_percent, 2),
            }
        }


class VMMetricsService:
    """
    Serviço para métricas da VM host via Prometheus.
    
    Requer node-exporter instalado no cluster (vem com kube-prometheus-stack).
    
    Métricas:
    - CPU (uso percentual)
    - Memória (total, usado, percentual)
    - Disco (total, usado, percentual)
    """
    
    def __init__(self, prometheus: PrometheusClient = None, node_name: str = None):
        """
        Args:
            prometheus: Cliente Prometheus
            node_name: Nome do node (se None, usa primeiro disponível)
        """
        self.prom = prometheus or get_prometheus_client()
        self.node_name = node_name
    
    def get_all(self) -> Optional[VMMetrics]:
        """
        Obtém todas as métricas da VM.
        
        Returns:
            VMMetrics com CPU, memória e disco
        """
        try:
            cpu = self.cpu_usage()
            memory = self.memory_usage()
            disk = self.disk_usage()
            
            return VMMetrics(
                cpu_usage_percent=cpu or 0,
                memory_total_gb=memory.get('total_gb', 0),
                memory_used_gb=memory.get('used_gb', 0),
                memory_usage_percent=memory.get('usage_percent', 0),
                disk_total_gb=disk.get('total_gb', 0),
                disk_used_gb=disk.get('used_gb', 0),
                disk_usage_percent=disk.get('usage_percent', 0),
            )
        except Exception as e:
            logger.error(f"Erro ao obter métricas da VM: {e}")
            return None
    
    def cpu_usage(self) -> Optional[float]:
        """
        Obtém uso de CPU da VM em percentual.
        
        Returns:
            Percentual de CPU usado (0-100)
        """
        # CPU usage = 100% - idle%
        query = '100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
        
        if self.node_name:
            query = f'100 - (avg(irate(node_cpu_seconds_total{{mode="idle",instance=~".*{self.node_name}.*"}}[5m])) * 100)'
        
        return self.prom.get_scalar(query)
    
    def memory_usage(self) -> Dict:
        """
        Obtém métricas de memória da VM.
        
        Returns:
            Dict com total_gb, used_gb, available_gb, usage_percent
        """
        node_filter = f',instance=~".*{self.node_name}.*"' if self.node_name else ''
        
        total = self.prom.get_scalar(f'node_memory_MemTotal_bytes{{{node_filter.lstrip(",")}}}') or 0
        available = self.prom.get_scalar(f'node_memory_MemAvailable_bytes{{{node_filter.lstrip(",")}}}') or 0
        
        used = total - available
        
        return {
            'total_gb': total / (1024 ** 3),
            'used_gb': used / (1024 ** 3),
            'available_gb': available / (1024 ** 3),
            'usage_percent': (used / total * 100) if total > 0 else 0
        }
    
    def disk_usage(self, mountpoint: str = "/") -> Dict:
        """
        Obtém métricas de disco da VM.
        
        Args:
            mountpoint: Ponto de montagem (default: "/")
        
        Returns:
            Dict com total_gb, used_gb, available_gb, usage_percent
        """
        node_filter = f',instance=~".*{self.node_name}.*"' if self.node_name else ''
        
        total = self.prom.get_scalar(
            f'node_filesystem_size_bytes{{mountpoint="{mountpoint}"{node_filter}}}'
        ) or 0
        available = self.prom.get_scalar(
            f'node_filesystem_avail_bytes{{mountpoint="{mountpoint}"{node_filter}}}'
        ) or 0
        
        used = total - available
        
        return {
            'total_gb': total / (1024 ** 3),
            'used_gb': used / (1024 ** 3),
            'available_gb': available / (1024 ** 3),
            'usage_percent': (used / total * 100) if total > 0 else 0
        }
    
    def cpu_history(self, hours: int = 1, step: str = "1m") -> List[Dict]:
        """
        Histórico de uso de CPU.
        """
        query = '100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
        
        end = datetime.now()
        start = end - timedelta(hours=hours)
        
        result = self.prom.query_range(query, start, end, step)
        
        if result and len(result) > 0:
            values = result[0].get('values', [])
            return [
                {
                    'timestamp': datetime.fromtimestamp(float(v[0])).isoformat(),
                    'usage_percent': round(float(v[1]), 2)
                }
                for v in values
            ]
        
        return []
    
    def memory_history(self, hours: int = 1, step: str = "1m") -> List[Dict]:
        """
        Histórico de uso de memória.
        """
        query = '''
            100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))
        '''
        
        end = datetime.now()
        start = end - timedelta(hours=hours)
        
        result = self.prom.query_range(query, start, end, step)
        
        if result and len(result) > 0:
            values = result[0].get('values', [])
            return [
                {
                    'timestamp': datetime.fromtimestamp(float(v[0])).isoformat(),
                    'usage_percent': round(float(v[1]), 2)
                }
                for v in values
            ]
        
        return []
