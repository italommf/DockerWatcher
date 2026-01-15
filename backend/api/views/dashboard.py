"""
Endpoints consolidados para o Dashboard.
Refatorado para usar k8s/ e metrics/.
"""

import logging
import time
import re
from concurrent.futures import ThreadPoolExecutor
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from api.models import FailedPod, RoboDockerizado
from api.serializers.models import PodSerializer, ExecutionSerializer
from api.utils import identify_robot

# Usar singletons de serviços ao invés de instanciar por request
from services.service_manager import (
    get_job_service, get_pod_service, get_cronjob_service,
    get_deployment_service, get_vm_metrics_service
)

logger = logging.getLogger(__name__)

# ThreadPool compartilhado para reutilização entre requests
_executor = ThreadPoolExecutor(max_workers=5)


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
    
    t_total_start = time.time()
    try:
        # Obter singletons de serviços (reutiliza instâncias)
        job_service = get_job_service()
        pod_service = get_pod_service()
        cronjob_service = get_cronjob_service()
        deployment_service = get_deployment_service()
        vm_service = get_vm_metrics_service()
        
        # Buscar dados do K8s e Métricas em paralelo usando pool compartilhado
        t_par_start = time.time()
        
        def safe_list(service_method, name):
            ts = time.time()
            res = service_method()
            te = time.time()
            logger.info(f"[{request_id}] Service {name} levou {te-ts:.3f}s")
            return res

        f_jobs = _executor.submit(safe_list, job_service.list, "Jobs")
        f_pods = _executor.submit(safe_list, pod_service.list, "Pods")
        f_cronjobs = _executor.submit(safe_list, cronjob_service.list, "CronJobs")
        f_deployments = _executor.submit(safe_list, deployment_service.list, "Deployments")
        f_vm = _executor.submit(safe_list, vm_service.get_all, "VM")
        
        # Obter resultados com timeout global de 5s para não travar o dashboard
        try:
            jobs = f_jobs.result(timeout=5)
        except Exception as e:
            logger.error(f"[{request_id}] Timeout/Erro ao obter Jobs: {e}")
            jobs = []

        try:
            pods = f_pods.result(timeout=5)
        except Exception as e:
            logger.error(f"[{request_id}] Timeout/Erro ao obter Pods: {e}")
            pods = []

        try:
            cronjobs = f_cronjobs.result(timeout=5)
        except Exception as e:
            logger.error(f"[{request_id}] Timeout/Erro ao obter CronJobs: {e}")
            cronjobs = []

        try:
            deployments = f_deployments.result(timeout=5)
        except Exception as e:
            logger.error(f"[{request_id}] Timeout/Erro ao obter Deployments: {e}")
            deployments = []

        try:
            vm_metrics = f_vm.result(timeout=5)
        except Exception as e:
            logger.error(f"[{request_id}] Timeout/Erro ao obter VM Metrics: {e}")
            vm_metrics = None

        logger.info(f"[{request_id}] Coleta paralela concluída (ou atingiu timeout) em {time.time() - t_par_start:.3f}s")

        # 2. Connection status
        connection_status = {
            "mysql_connected": True,
            "k8s_connected": True,
        }

        # Processar VM Resources
        try:
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
                "armazenamento": {"total_gb": 0, "usada_gb": 0, "livre_gb": 0},
                "cpu": {"usado": 0, "livre": 100}
            }
        
        # 4. Robôs do banco (QUERY ÚNICA para todos os tipos)
        all_robos = list(RoboDockerizado.objects.filter(ativo=True))
        
        # Processar por tipo
        rpas_processed = [r.to_dict() for r in all_robos if r.tipo == 'rpa']
        cronjobs_processed = [r.to_dict() for r in all_robos if r.tipo == 'cronjob']
        deployments_processed = [r.to_dict() for r in all_robos if r.tipo == 'deployment']
        
        # Mapas para apelidos (todos os tipos)
        robo_names = {r.nome.lower() for r in all_robos}
        robo_map = {r.nome.lower(): r.apelido or r.nome for r in all_robos}
        
        # Identificar e filtrar recursos em tempo real (pods e jobs)
        filtered_pods = []
        robo_ativos_set = set()
        
        for p in pods:
            nome_identificado = identify_robot(p.name, p.labels, robo_names)
            if nome_identificado:
                p_dict = p.to_dict()
                p_dict['apelido'] = robo_map.get(nome_identificado, p.name)
                filtered_pods.append(p_dict)
                if p.phase == 'Running':
                    robo_ativos_set.add(nome_identificado)
        
        filtered_jobs = []
        for j in jobs:
            nome_identificado = identify_robot(j.name, j.labels, robo_names)
            if nome_identificado:
                j_dict = j.to_dict()
                j_dict['apelido'] = robo_map.get(nome_identificado, j.name)
                filtered_jobs.append(j_dict)

        # Calcular estatísticas filtradas (apenas o que foi identificado)
        # Instâncias Ativas = Pods Running + Jobs Ativos que pertencem a robôs
        instancias_ativas = len([p for p in filtered_pods if p['phase'] == 'Running'])
        falhas_containers = sum(j['failed'] for j in filtered_jobs)
        execucoes_pendentes = 0  # Será integrado com API MongoDB depois

        # Robôs em execução (para a tabela legada se ainda usada)
        running_map = {}
        for p_dict in filtered_pods:
            if p_dict['phase'] != 'Running':
                continue
            
            nome_norm = p_dict['labels'].get('nome_robo') or p_dict['name']
            # Simplificar para o mapa legado
            if nome_norm not in running_map:
                running_map[nome_norm] = {
                    "nome": p_dict['apelido'],
                    "nome_rpa": p_dict['name'],
                    "instancias": 1,
                    "execucoes_pendentes": 0,
                    "tipo": "Pod",
                    "tags": [],
                }
            else:
                running_map[nome_norm]["instancias"] += 1
        
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
        t_ser_start = time.time()
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
            "pods": filtered_pods,
            "jobs": filtered_jobs,
            "cronjobs_proximos": cronjobs_proximos,
            "full_data": {
                "rpas": rpas_processed,
                "cronjobs": cronjobs_processed,
                "deployments": deployments_processed,
                "failed_pods": _get_failed_pods_list(),
                "executions": []  # Será integrado com API MongoDB
            }
        }
        
        elapsed_total = time.time() - t_total_start
        logger.info(f"[{request_id}] Serialização e resposta completa em {time.time() - t_ser_start:.3f}s")
        logger.info(f"[{request_id}] Dashboard retornado em {elapsed_total:.3f}s")
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        elapsed = time.time() - start_time
        error_msg = str(e) if str(e) else f"{type(e).__name__}: {repr(e)}"
        logger.error(f"[{request_id}] Erro após {elapsed:.3f}s: {error_msg}", exc_info=True)
        return Response({"error": error_msg}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def cache_stats(request):
    """Estatísticas (legado - retorna vazio)."""
    return Response({
        "cache_stats": {},
        "timestamp": time.time(),
        "message": "Cache removido - dados agora são em tempo real"
    }, status=status.HTTP_200_OK)
