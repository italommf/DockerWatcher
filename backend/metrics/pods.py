"""
Métricas de Pods via Prometheus.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from metrics.client import get_prometheus_client, PrometheusClient

logger = logging.getLogger(__name__)


@dataclass
class PodCpuMetric:
    """Métrica de CPU de um pod."""
    pod_name: str
    namespace: str
    cpu_cores: float  # Cores usadas (ex: 0.5 = 500m)
    cpu_millicores: int  # Millicores (ex: 500)
    
    def to_dict(self) -> dict:
        return {
            'pod_name': self.pod_name,
            'namespace': self.namespace,
            'cpu_cores': round(self.cpu_cores, 4),
            'cpu_millicores': self.cpu_millicores,
        }


@dataclass
class PodMemoryMetric:
    """Métrica de memória de um pod."""
    pod_name: str
    namespace: str
    memory_bytes: int
    memory_mb: float
    
    def to_dict(self) -> dict:
        return {
            'pod_name': self.pod_name,
            'namespace': self.namespace,
            'memory_bytes': self.memory_bytes,
            'memory_mb': round(self.memory_mb, 2),
        }


@dataclass
class PodMetricsSummary:
    """Resumo completo de métricas de um pod."""
    pod_name: str
    namespace: str
    cpu_millicores: int = 0
    memory_mb: float = 0
    
    def to_dict(self) -> dict:
        return {
            'pod_name': self.pod_name,
            'namespace': self.namespace,
            'cpu_millicores': self.cpu_millicores,
            'memory_mb': round(self.memory_mb, 2),
        }


class PodMetricsService:
    """
    Serviço para métricas de pods via Prometheus.
    
    Métricas disponíveis:
    - CPU (atual e histórico)
    - Memória (atual e histórico)
    """
    
    def __init__(self, prometheus: PrometheusClient = None):
        self.prom = prometheus or get_prometheus_client()
    
    def get_all(self, namespace: str = "default") -> List[PodMetricsSummary]:
        """
        Obtém métricas de todos os pods de um namespace.
        
        Returns:
            Lista de PodMetricsSummary com CPU e memória
        """
        cpu_metrics = self.cpu_usage(namespace)
        memory_metrics = self.memory_usage(namespace)
        
        # Combinar métricas por pod
        metrics_map: Dict[str, PodMetricsSummary] = {}
        
        for cpu in cpu_metrics:
            key = f"{cpu.namespace}/{cpu.pod_name}"
            metrics_map[key] = PodMetricsSummary(
                pod_name=cpu.pod_name,
                namespace=cpu.namespace,
                cpu_millicores=cpu.cpu_millicores
            )
        
        for mem in memory_metrics:
            key = f"{mem.namespace}/{mem.pod_name}"
            if key in metrics_map:
                metrics_map[key].memory_mb = mem.memory_mb
            else:
                metrics_map[key] = PodMetricsSummary(
                    pod_name=mem.pod_name,
                    namespace=mem.namespace,
                    memory_mb=mem.memory_mb
                )
        
        return list(metrics_map.values())
    
    def cpu_usage(self, namespace: str = "default") -> List[PodCpuMetric]:
        """
        Obtém uso de CPU atual de cada pod.
        
        Returns:
            Lista de PodCpuMetric
        """
        query = f'''
            sum(rate(container_cpu_usage_seconds_total{{
                namespace="{namespace}",
                container!="",
                container!="POD"
            }}[5m])) by (pod, namespace)
        '''
        
        result = self.prom.query(query)
        metrics = []
        
        for item in result:
            pod_name = item.get('metric', {}).get('pod', 'unknown')
            ns = item.get('metric', {}).get('namespace', namespace)
            value = item.get('value', [None, '0'])
            
            try:
                cpu_cores = float(value[1])
                metrics.append(PodCpuMetric(
                    pod_name=pod_name,
                    namespace=ns,
                    cpu_cores=cpu_cores,
                    cpu_millicores=int(cpu_cores * 1000)
                ))
            except (ValueError, IndexError):
                continue
        
        return metrics
    
    def memory_usage(self, namespace: str = "default") -> List[PodMemoryMetric]:
        """
        Obtém uso de memória atual de cada pod.
        
        Returns:
            Lista de PodMemoryMetric
        """
        query = f'''
            sum(container_memory_usage_bytes{{
                namespace="{namespace}",
                container!="",
                container!="POD"
            }}) by (pod, namespace)
        '''
        
        result = self.prom.query(query)
        metrics = []
        
        for item in result:
            pod_name = item.get('metric', {}).get('pod', 'unknown')
            ns = item.get('metric', {}).get('namespace', namespace)
            value = item.get('value', [None, '0'])
            
            try:
                memory_bytes = int(float(value[1]))
                metrics.append(PodMemoryMetric(
                    pod_name=pod_name,
                    namespace=ns,
                    memory_bytes=memory_bytes,
                    memory_mb=memory_bytes / (1024 * 1024)
                ))
            except (ValueError, IndexError):
                continue
        
        return metrics
    
    def cpu_history(
        self,
        pod_name: str,
        namespace: str = "default",
        hours: int = 1,
        step: str = "1m"
    ) -> List[Dict]:
        """
        Obtém histórico de CPU de um pod.
        
        Args:
            pod_name: Nome do pod
            namespace: Namespace
            hours: Horas de histórico
            step: Intervalo entre pontos
        
        Returns:
            Lista de pontos {timestamp, value}
        """
        query = f'''
            sum(rate(container_cpu_usage_seconds_total{{
                pod="{pod_name}",
                namespace="{namespace}",
                container!="",
                container!="POD"
            }}[5m]))
        '''
        
        end = datetime.now()
        start = end - timedelta(hours=hours)
        
        result = self.prom.query_range(query, start, end, step)
        
        if result and len(result) > 0:
            values = result[0].get('values', [])
            return [
                {
                    'timestamp': datetime.fromtimestamp(float(v[0])).isoformat(),
                    'cpu_millicores': int(float(v[1]) * 1000)
                }
                for v in values
            ]
        
        return []
    
    def memory_history(
        self,
        pod_name: str,
        namespace: str = "default",
        hours: int = 1,
        step: str = "1m"
    ) -> List[Dict]:
        """
        Obtém histórico de memória de um pod.
        """
        query = f'''
            sum(container_memory_usage_bytes{{
                pod="{pod_name}",
                namespace="{namespace}",
                container!=""
            }})
        '''
        
        end = datetime.now()
        start = end - timedelta(hours=hours)
        
        result = self.prom.query_range(query, start, end, step)
        
        if result and len(result) > 0:
            values = result[0].get('values', [])
            return [
                {
                    'timestamp': datetime.fromtimestamp(float(v[0])).isoformat(),
                    'memory_mb': round(float(v[1]) / (1024 * 1024), 2)
                }
                for v in values
            ]
        
        return []
