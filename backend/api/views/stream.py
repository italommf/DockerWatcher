"""
Server-Sent Events (SSE) endpoint para atualizações em tempo real.
Providencia streaming de dados para Dashboard e Containers Rodando.
"""

import json
import time
import logging
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response

from k8s import PodService, JobService, CronJobService, DeploymentService
from metrics import PodMetricsService, VMMetricsService, PROMETHEUS_AVAILABLE

logger = logging.getLogger(__name__)

# Serviços globais
pod_service = PodService()
job_service = JobService()
cronjob_service = CronJobService()
deployment_service = DeploymentService()
pod_metrics = PodMetricsService() if PROMETHEUS_AVAILABLE else None
vm_metrics = VMMetricsService() if PROMETHEUS_AVAILABLE else None


def generate_dashboard_events(interval=2):
    """
    Generator que envia eventos SSE a cada 'interval' segundos.
    """
    while True:
        try:
            # Buscar dados em tempo real
            pods = pod_service.list()
            jobs = job_service.list()
            cronjobs = cronjob_service.list()
            deployments = deployment_service.list()
            
            # Contagem de stats
            running_pods = [p for p in pods if p.phase == 'Running']
            failed_pods = [p for p in pods if p.phase == 'Failed']
            active_cronjobs = [c for c in cronjobs if not c.suspended]
            
            # Métricas de pods (se Prometheus disponível)
            pod_metrics_data = []
            if pod_metrics:
                try:
                    pod_metrics_data = pod_metrics.get_all_current()
                except Exception as e:
                    logger.warning(f"Erro ao obter métricas de pods: {e}")
            
            # VM metrics (se Prometheus disponível)
            vm_data = None
            if vm_metrics:
                try:
                    vm_data = vm_metrics.get_current()
                except Exception as e:
                    logger.warning(f"Erro ao obter métricas VM: {e}")
            
            # Montar dados do dashboard
            data = {
                "timestamp": time.time(),
                "stats": {
                    "pods_running": len(running_pods),
                    "pods_failed": len(failed_pods),
                    "jobs_active": len([j for j in jobs if j.status == 'Running']),
                    "cronjobs_active": len(active_cronjobs),
                    "deployments_total": len(deployments),
                },
                "pods": [p.to_dict() for p in pods],
                "jobs": [j.to_dict() for j in jobs],
                "cronjobs": [c.to_dict() for c in cronjobs],
                "deployments": [d.to_dict() for d in deployments],
                "pod_metrics": pod_metrics_data,
                "vm_metrics": vm_data,
            }
            
            # Formatar como SSE
            yield f"data: {json.dumps(data)}\n\n"
            
        except Exception as e:
            logger.error(f"Erro no SSE stream: {e}")
            error_data = {"error": str(e), "timestamp": time.time()}
            yield f"data: {json.dumps(error_data)}\n\n"
        
        # Aguardar intervalo antes do próximo evento
        time.sleep(interval)


def generate_jobs_events(interval=1):
    """
    Generator específico para Jobs/Containers Rodando.
    Intervalo menor (1s) para maior responsividade.
    """
    while True:
        try:
            jobs = job_service.list()
            pods = pod_service.list()
            
            # Pods associados a jobs (têm label job-name)
            job_pods = [p for p in pods if p.labels.get('job-name')]
            
            data = {
                "timestamp": time.time(),
                "jobs": [j.to_dict() for j in jobs],
                "pods": [p.to_dict() for p in job_pods],
                "stats": {
                    "running": len([j for j in jobs if j.status == 'Running']),
                    "succeeded": len([j for j in jobs if j.status == 'Succeeded']),
                    "failed": len([j for j in jobs if j.status == 'Failed']),
                }
            }
            
            yield f"data: {json.dumps(data)}\n\n"
            
        except Exception as e:
            logger.error(f"Erro no SSE jobs stream: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        time.sleep(interval)


@api_view(['GET'])
def stream_dashboard(request):
    """
    Endpoint SSE para Dashboard.
    Envia updates a cada 2 segundos.
    """
    interval = int(request.query_params.get('interval', 2))
    interval = max(1, min(10, interval))  # Clamp entre 1 e 10 segundos
    
    response = StreamingHttpResponse(
        generate_dashboard_events(interval),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'  # Para nginx
    return response


@api_view(['GET'])
def stream_jobs(request):
    """
    Endpoint SSE para Containers Rodando (Jobs).
    Envia updates a cada 1 segundo.
    """
    interval = int(request.query_params.get('interval', 1))
    interval = max(1, min(5, interval))  # Clamp entre 1 e 5 segundos
    
    response = StreamingHttpResponse(
        generate_jobs_events(interval),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response
