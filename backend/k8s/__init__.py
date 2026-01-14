"""
Módulo Kubernetes - API nativa para gerenciar recursos K8s.

Substitui toda dependência de SSH+kubectl por chamadas diretas à API.
"""

from k8s.client import get_k8s_client
from k8s.pods import PodService
from k8s.jobs import JobService
from k8s.cronjobs import CronJobService
from k8s.deployments import DeploymentService

__all__ = [
    'get_k8s_client',
    'PodService',
    'JobService',
    'CronJobService',
    'DeploymentService',
]
