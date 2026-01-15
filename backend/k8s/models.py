"""
Modelos de dados (DTOs) para recursos Kubernetes.
Tipagem forte para evitar dicionários soltos.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional


@dataclass
class ContainerState:
    """Estado de um container."""
    type: str  # 'running', 'waiting', 'terminated'
    reason: str = ''
    message: str = ''
    exit_code: Optional[int] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


@dataclass
class Container:
    """Informações de um container."""
    name: str
    ready: bool = False
    restart_count: int = 0
    state: Optional[ContainerState] = None
    image: str = ''


@dataclass
class Pod:
    """Representação de um Pod."""
    name: str
    namespace: str
    phase: str  # 'Pending', 'Running', 'Succeeded', 'Failed', 'Unknown'
    status: str  # Status detalhado (ex: 'CrashLoopBackOff')
    labels: Dict[str, str] = field(default_factory=dict)
    start_time: Optional[datetime] = None
    containers: List[Container] = field(default_factory=list)
    node: str = ''
    
    def to_dict(self) -> dict:
        return {
            'name': self.name,
            'namespace': self.namespace,
            'phase': self.phase,
            'status': self.status,
            'labels': self.labels,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'containers': [
                {
                    'name': c.name,
                    'ready': c.ready,
                    'restart_count': c.restart_count,
                    'image': c.image,
                    'state': {
                        'type': c.state.type if c.state else 'unknown',
                        'reason': c.state.reason if c.state else '',
                    } if c.state else None
                }
                for c in self.containers
            ],
            'node': self.node,
        }


@dataclass
class Job:
    """Representação de um Job."""
    name: str
    namespace: str
    completions: int = 0
    active: int = 0
    succeeded: int = 0
    failed: int = 0
    status: str = 'Unknown'  # 'Pending', 'Running', 'Succeeded', 'Failed'
    image: str = ''
    start_time: Optional[datetime] = None
    completion_time: Optional[datetime] = None
    labels: Dict[str, str] = field(default_factory=dict)
    pod_name: str = ''
    
    def to_dict(self) -> dict:
        return {
            'name': self.name,
            'namespace': self.namespace,
            'completions': self.completions,
            'active': self.active,
            'succeeded': self.succeeded,
            'failed': self.failed,
            'status': self.status,
            'image': self.image,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'completion_time': self.completion_time.isoformat() if self.completion_time else None,
            'labels': self.labels,
            'pod_name': self.pod_name,
        }


@dataclass
class CronJob:
    """Representação de um CronJob."""
    name: str
    namespace: str
    schedule: str
    suspended: bool = False
    last_schedule_time: Optional[datetime] = None
    last_successful_time: Optional[datetime] = None
    image: str = ''
    timezone: str = 'America/Sao_Paulo'
    
    def to_dict(self) -> dict:
        return {
            'name': self.name,
            'namespace': self.namespace,
            'schedule': self.schedule,
            'suspended': self.suspended,
            'last_schedule_time': self.last_schedule_time.isoformat() if self.last_schedule_time else None,
            'last_successful_time': self.last_successful_time.isoformat() if self.last_successful_time else None,
            'image': self.image,
            'timezone': self.timezone,
        }


@dataclass
class Deployment:
    """Representação de um Deployment."""
    name: str
    namespace: str
    replicas: int = 0
    ready_replicas: int = 0
    available_replicas: int = 0
    image: str = ''
    
    def to_dict(self) -> dict:
        return {
            'name': self.name,
            'namespace': self.namespace,
            'replicas': self.replicas,
            'ready_replicas': self.ready_replicas,
            'available_replicas': self.available_replicas,
            'image': self.image,
        }


@dataclass  
class PodMetrics:
    """Métricas de um Pod."""
    name: str
    namespace: str
    cpu_millicores: int = 0
    memory_bytes: int = 0
    
    @property
    def memory_mb(self) -> float:
        return round(self.memory_bytes / (1024 * 1024), 2)
    
    def to_dict(self) -> dict:
        return {
            'name': self.name,
            'namespace': self.namespace,
            'cpu_millicores': self.cpu_millicores,
            'memory_mb': self.memory_mb,
        }
