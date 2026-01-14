"""
Endpoints consolidados para o Dashboard.
Refatorado para usar k8s/ e metrics/.
"""

import logging
import time
import re
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from api.models import FailedPod, RoboDockerizado
from api.serializers.models import PodSerializer, ExecutionSerializer

from k8s.jobs import JobService
from k8s.pods import PodService
from k8s.cronjobs import CronJobService
from k8s.deployments import DeploymentService
from metrics.vm import VMMetricsService

logger = logging.getLogger(__name__)


def _get_failed_pods_list():
    """Retorna lista de pods com falhas formatada."""
    try:
        failed_pods = FailedPod.objects.all().order_by('-failed_at')
        pods_data = []
        for failed_pod in failed_pods:
            labels = failed_pod.labels or {}
            if failed_pod.nome_robo and 'nome_robo' not in labels:
                labels['nome_robo'] = failed_pod.nome_robo
            
            pods_data.append({
                'name': failed_pod.name,
                'namespace': failed_pod.namespace,
                'labels': labels,
                'phase': failed_pod.phase,
                'status': failed_pod.status,
                'start_time': failed_pod.start_time,
                'containers': failed_pod.containers or [],
                'nome_robo': failed_pod.nome_robo,
                'failed_at': failed_pod.failed_at.isoformat() if failed_pod.failed_at else None,
            })
        return PodSerializer(pods_data, many=True).data
    except Exception as e:
        logger.error(f"Erro ao obter falhas: {e}")
        return []


@api_view(['GET'])
def dashboard_full(request):
    """
    Endpoint consolidado que retorna todos os dados do Dashboard.
    Agora usa k8s/ e metrics/ diretamente (tempo real, sem cache).
    """
    request_id = getattr(request, '_request_id', f"DASH-{int(time.time() * 1000)}")
    start_time = time.time()
    
    logger.info(f"[{request_id}] GET /api/dashboard/full/")
    
    try:
        # Serviços
        job_service = JobService()
        pod_service = PodService()
        cronjob_service = CronJobService()
        deployment_service = DeploymentService()
        vm_service = VMMetricsService()
        
        # 1. VM Resources (Prometheus)
        try:
            vm_metrics = vm_service.get_all()
            vm_resources = {
                "memoria": {
                    "total_gb": round(vm_metrics.memory_total_gb, 2) if vm_metrics else 0,
                    "usada_gb": round(vm_metrics.memory_used_gb, 2) if vm_metrics else 0,
                    "livre_gb": round(vm_metrics.memory_total_gb - vm_metrics.memory_used_gb, 2) if vm_metrics else 0,
                },
                "armazenamento": {
                    "total_gb": round(vm_metrics.disk_total_gb, 2) if vm_metrics else 0,
                    "usado_gb": round(vm_metrics.disk_used_gb, 2) if vm_metrics else 0,
                    "livre_gb": round(vm_metrics.disk_total_gb - vm_metrics.disk_used_gb, 2) if vm_metrics else 0,
                },
                "cpu": {
                    "usado": round(vm_metrics.cpu_usage_percent, 2) if vm_metrics else 0,
                    "livre": round(100 - vm_metrics.cpu_usage_percent, 2) if vm_metrics else 100,
                }
            }
        except:
            vm_resources = {
                "memoria": {"total_gb": 0, "usada_gb": 0, "livre_gb": 0},
                "armazenamento": {"total_gb": 0, "usado_gb": 0, "livre_gb": 0},
                "cpu": {"usado": 0, "livre": 100}
            }
        
        # 2. Connection status
        connection_status = {
            "mysql_connected": True,
            "k8s_connected": True,
        }
        
        # 3. Buscar dados do K8s (tempo real)
        jobs = job_service.list()
        pods = pod_service.list()
        cronjobs = cronjob_service.list()
        deployments = deployment_service.list()
        
        # 4. RPAs do banco
        rpas_db = RoboDockerizado.objects.filter(tipo='rpa', ativo=True)
        rpas_processed = [rpa.to_dict() for rpa in rpas_db]
        
        # 5. CronJobs do banco
        cronjobs_db = RoboDockerizado.objects.filter(tipo='cronjob', ativo=True)
        cronjobs_processed = [cj.to_dict() for cj in cronjobs_db]
        
        # 6. Deployments do banco
        deployments_db = RoboDockerizado.objects.filter(tipo='deployment', ativo=True)
        deployments_processed = [dep.to_dict() for dep in deployments_db]
        
        # Calcular estatísticas
        instancias_ativas = sum(job.active for job in jobs)
        falhas_containers = sum(job.failed for job in jobs)
        execucoes_pendentes = 0  # Será integrado com API MongoDB depois
        
        # Robôs em execução
        running_map = {}
        
        for job in jobs:
            if job.active <= 0:
                continue
            
            nome_robo = job.labels.get('nome_robo', '')
            if not nome_robo:
                nome_robo = re.sub(r'-(manual-)?\d+$', '', job.name)
                for prefix in ['rpa-cronjob-', 'rpa-job-', 'cronjob-', 'job-', 'rpa-']:
                    if nome_robo.lower().startswith(prefix):
                        nome_robo = nome_robo[len(prefix):]
                        break
            
            if not nome_robo:
                nome_robo = "Desconhecido"
            
            nome_norm = nome_robo.lower().replace("-", "").replace("_", "")
            
            if nome_norm in running_map:
                running_map[nome_norm]["instancias"] += job.active
            else:
                is_cronjob = 'cronjob' in job.name.lower()
                running_map[nome_norm] = {
                    "nome": nome_robo,
                    "nome_rpa": nome_robo,
                    "instancias": job.active,
                    "execucoes_pendentes": 0,
                    "tipo": "Cronjob" if is_cronjob else "RPA",
                    "tags": [],
                }
        
        robots_running = sorted(running_map.values(), key=lambda x: x['instancias'], reverse=True)
        
        # Próximos cronjobs
        cronjobs_proximos = []
        for cj in cronjobs_processed[:10]:
            cronjobs_proximos.append({
                "name": cj.get("nome", ""),
                "apelido": cj.get("apelido", ""),
                "schedule": cj.get("schedule", ""),
                "last_schedule_time": None,
                "execucoes_pendentes": 0,
                "suspended": cj.get("suspended", False),
            })
        
        # Resposta
        response_data = {
            "timestamp": time.time(),
            "vm_resources": vm_resources,
            "connection_status": connection_status,
            "stats": {
                "instancias_ativas": instancias_ativas,
                "execucoes_pendentes": execucoes_pendentes,
                "falhas_containers": falhas_containers,
                "rpas_ativos": len([r for r in robots_running if r['tipo'] == 'RPA']),
                "cronjobs_ativos": len([c for c in cronjobs_processed if not c.get("suspended", False)]),
                "deployments_ativos": len(deployments),
            },
            "robots_running": robots_running,
            "cronjobs_proximos": cronjobs_proximos,
            "full_data": {
                "rpas": rpas_processed,
                "cronjobs": cronjobs_processed,
                "deployments": deployments_processed,
                "failed_pods": _get_failed_pods_list(),
                "executions": []  # Será integrado com API MongoDB
            }
        }
        
        elapsed = time.time() - start_time
        logger.info(f"[{request_id}] Dashboard retornado em {elapsed:.3f}s")
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[{request_id}] Erro após {elapsed:.3f}s: {e}", exc_info=True)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def cache_stats(request):
    """Estatísticas (legado - retorna vazio)."""
    return Response({
        "cache_stats": {},
        "timestamp": time.time(),
        "message": "Cache removido - dados agora são em tempo real"
    }, status=status.HTTP_200_OK)
