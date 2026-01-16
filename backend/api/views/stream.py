"""
Server-Sent Events (SSE) endpoint para atualizações em tempo real.
Providencia streaming de dados para Dashboard e Containers Rodando.
"""

import json
import time
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from django.http import StreamingHttpResponse
from api.utils import identify_robot
# Removendo api_view para evitar erro 406 (Not Acceptable) com DRF
# from rest_framework.decorators import api_view
# from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Lazy loading dos serviços para evitar problemas de import circular
_pod_service = None
_job_service = None
_cronjob_service = None
_deployment_service = None
_pod_metrics = None
_vm_metrics = None

def get_services():
    """Lazy loading dos serviços K8s e Prometheus."""
    global _pod_service, _job_service, _cronjob_service, _deployment_service, _pod_metrics, _vm_metrics
    
    if _pod_service is None:
        try:
            from k8s import PodService, JobService, CronJobService, DeploymentService
            from metrics import PodMetricsService, VMMetricsService, PROMETHEUS_AVAILABLE
            
            _pod_service = PodService()
            _job_service = JobService()
            _cronjob_service = CronJobService()
            _deployment_service = DeploymentService()
            _pod_metrics = PodMetricsService() if PROMETHEUS_AVAILABLE else None
            _vm_metrics = VMMetricsService() if PROMETHEUS_AVAILABLE else None
        except Exception as e:
            logger.error(f"Erro ao inicializar serviços K8s: {e}", exc_info=True)
            # Retornar None para todos os serviços em caso de erro
            return None, None, None, None, None, None
    
    return _pod_service, _job_service, _cronjob_service, _deployment_service, _pod_metrics, _vm_metrics


def generate_dashboard_events(interval=2):
    """
    Generator que envia eventos SSE a cada 'interval' segundos.
    """
    try:
        from api.models import RoboDockerizado
    except Exception as e:
        logger.error(f"Erro ao importar modelos: {e}", exc_info=True)
        yield f"data: {json.dumps({'error': 'Erro ao inicializar modelos', 'timestamp': time.time()})}\n\n"
        return
    
    # Enviar evento inicial (heartbeat) para confirmar conexão imediatamente
    try:
        yield f"data: {json.dumps({'type': 'connected', 'timestamp': time.time()})}\n\n"
    except Exception as e:
        logger.error(f"Erro ao enviar heartbeat inicial: {e}", exc_info=True)
        # Tentar enviar erro como fallback
        try:
            yield f"data: {json.dumps({'error': 'Erro ao estabelecer conexão', 'timestamp': time.time()})}\n\n"
        except:
            pass
        return
    
    # Inicializar serviços uma vez no início para evitar erros na primeira iteração
    try:
        pod_service, job_service, cronjob_service, deployment_service, pod_metrics, vm_metrics = get_services()
    except Exception as e:
        logger.error(f"Erro ao obter serviços: {e}", exc_info=True)
        pod_service = job_service = cronjob_service = deployment_service = None
        pod_metrics = vm_metrics = None
    
    if not pod_service or not job_service:
        logger.warning("Serviços K8s não inicializados, enviando dados vazios")
        # Enviar dados vazios mas manter conexão ativa
        while True:
            if sys.is_finalizing():
                break
            error_data = {
                "error": "Serviços K8s não disponíveis",
                "timestamp": time.time(),
                "pods": [],
                "jobs": [],
                "cronjobs": [],
                "deployments": [],
                "stats": {
                    "instancias_ativas": 0,
                    "execucoes_pendentes": 0,
                    "falhas_containers": 0,
                    "rpas_ativos": 0,
                    "cronjobs_ativos": 0,
                    "deployments_ativos": 0,
                },
                "vm_metrics": None,
                "pod_metrics": []
            }
            yield f"data: {json.dumps(error_data)}\n\n"
            try:
                time.sleep(interval)
            except (KeyboardInterrupt, SystemExit):
                break
        return
    
    while True:
        # Removida verificação de sys.is_finalizing() no início do loop
        # O Django dev server gerencia o shutdown automaticamente
        # Verificamos apenas em pontos críticos (ThreadPoolExecutor, sleep)
            
        t_start = time.time()
        try:
            
            # Buscar robôs cadastrados para filtrar e pegar apelidos
            robos = list(RoboDockerizado.objects.filter(ativo=True))
            robo_map = {r.nome.lower(): r.apelido or r.nome for r in robos}
            robo_names = set(robo_map.keys())
            
            # Buscar dados em tempo real em paralelo
            t_par_start = time.time()
            pods = []
            jobs = []
            cronjobs = []
            deployments = []
            
            try:
                with ThreadPoolExecutor(max_workers=5) as executor:
                    f_pods = executor.submit(pod_service.list)
                    f_jobs = executor.submit(job_service.list)
                    f_cronjobs = executor.submit(cronjob_service.list)
                    f_deployments = executor.submit(deployment_service.list)
                    
                    pods = f_pods.result(timeout=5)
                    jobs = f_jobs.result(timeout=5)
                    cronjobs = f_cronjobs.result(timeout=5)
                    deployments = f_deployments.result(timeout=5)
            except RuntimeError as e:
                if "cannot schedule new futures after interpreter shutdown" in str(e):
                    logger.info("Python em shutdown, encerrando SSE stream graciosamente")
                    break
                # Usar debug para reduzir spam de logs em caso de erros temporários
                logger.debug(f"Erro ao buscar dados K8s: {e}")
                # Continuar com listas vazias em caso de erro
            except Exception as e:
                # Usar debug para reduzir spam de logs em caso de erros temporários
                logger.debug(f"Erro ao buscar dados K8s (timeout ou outro): {e}")
                # Continuar com listas vazias em caso de erro
            
            logger.debug(f"[SSE Dashboard] K8s API parallel fetch in {time.time() - t_par_start:.3f}s")
            
            # Filtrar PODS: apenas os que pertencem a robôs cadastrados
            filtered_pods = []
            robo_ativos_set = set()  # Trackéia robôs únicos com pods rodando
            for p in pods:
                nome_identificado = identify_robot(p.name, p.labels, robo_names)
                
                if nome_identificado:
                    p_dict = p.to_dict()
                    p_dict['apelido'] = robo_map.get(nome_identificado, p.name)
                    filtered_pods.append(p_dict)
                    if p.phase == 'Running':
                        robo_ativos_set.add(nome_identificado)
            
            # Filtrar JOBS
            filtered_jobs = []
            for j in jobs:
                nome_identificado = identify_robot(j.name, j.labels, robo_names)
                
                if nome_identificado:
                    j_dict = j.to_dict()
                    j_dict['apelido'] = robo_map.get(nome_identificado, j.name)
                    filtered_jobs.append(j_dict)

            # Filtrar CRONJOBS
            filtered_cronjobs = []
            for c in cronjobs:
                nome_identificado = identify_robot(c.name, c.labels if hasattr(c, 'labels') else {}, robo_names)
                if nome_identificado:
                    c_dict = c.to_dict()
                    c_dict['apelido'] = robo_map.get(nome_identificado, c.name)
                    filtered_cronjobs.append(c_dict)

            # Filtrar DEPLOYMENTS
            filtered_deployments = []
            for d in deployments:
                nome_identificado = identify_robot(d.name, d.labels if hasattr(d, 'labels') else {}, robo_names)
                if nome_identificado:
                    d_dict = d.to_dict()
                    d_dict['apelido'] = robo_map.get(nome_identificado, d.name)
                    filtered_deployments.append(d_dict)

            # Contagem de stats
            running_pods = [p for p in filtered_pods if p['phase'] == 'Running']
            failed_pods = [p for p in filtered_pods if p['phase'] in ('Failed', 'Error', 'CrashLoopBackOff')]
            
            # Métricas de pods (se Prometheus disponível)
            t_metrics = time.time()
            pod_metrics_data = []
            if pod_metrics:
                try:
                    raw_metrics = pod_metrics.get_all()
                    pod_metrics_data = [m.to_dict() for m in raw_metrics]
                except Exception as e:
                    logger.warning(f"Erro ao obter métricas de pods: {e}")
            
            # VM metrics
            vm_data = None
            if vm_metrics:
                try:
                    vm_data = vm_metrics.get_all()
                except Exception as e:
                    logger.warning(f"Erro ao obter métricas VM: {e}")
            
            t_end = time.time()
            logger.debug(f"[SSE Dashboard] Coleta completa em {t_end-t_start:.3f}s (Metrics: {t_end-t_metrics:.3f}s)")

            # Enviar dados resumidos para o Dashboard
            sse_data = {
                'timestamp': time.time(),
                'pods': filtered_pods,
                'jobs': filtered_jobs,
                'cronjobs': filtered_cronjobs,
                'deployments': filtered_deployments,
                'stats': {
                    'instancias_ativas': len(running_pods),
                    'execucoes_pendentes': 0,
                    'falhas_containers': len(failed_pods),
                    'rpas_ativos': len(robo_ativos_set),
                    'cronjobs_ativos': len([c for c in filtered_cronjobs if not c.get('suspended', False)]),
                    'deployments_ativos': len(filtered_deployments),
                },
                'vm_metrics': vm_data.to_dict() if vm_data else None,
                'pod_metrics': pod_metrics_data
            }
            yield f"data: {json.dumps(sse_data)}\n\n"
            
        except RuntimeError as e:
            if "cannot schedule new futures after interpreter shutdown" in str(e) or "interpreter shutdown" in str(e):
                logger.info("Python em shutdown, encerrando SSE stream graciosamente")
                break
            logger.error(f"Erro no SSE stream: {e}", exc_info=True)
            error_data = {"error": str(e), "timestamp": time.time()}
            yield f"data: {json.dumps(error_data)}\n\n"
        except Exception as e:
            logger.error(f"Erro no SSE stream: {e}", exc_info=True)
            error_data = {"error": str(e), "timestamp": time.time()}
            yield f"data: {json.dumps(error_data)}\n\n"
        
        # Verificar shutdown apenas antes do sleep (não no início do loop)
        # Isso evita encerrar prematuramente conexões válidas
        if sys.is_finalizing():
            logger.info("Python em shutdown, encerrando SSE stream")
            break
            
        # Aguardar intervalo antes do próximo evento
        try:
            time.sleep(interval)
        except (KeyboardInterrupt, SystemExit):
            logger.info("SSE stream interrompido")
            break


def generate_jobs_events(interval=1):
    """
    Generator específico para Jobs/Containers Rodando.
    Intervalo menor (1s) para maior responsividade.
    """
    from api.models import RoboDockerizado
    
    while True:
        # Verificar se o Python está em shutdown
        if sys.is_finalizing():
            logger.info("Python em shutdown, encerrando SSE jobs stream")
            break
            
        t_start = time.time()
        try:
            # Obter serviços (lazy loading)
            pod_service, job_service, _, _, _, _ = get_services()
            
            robos = list(RoboDockerizado.objects.filter(ativo=True))
            robo_map = {r.nome.lower(): r.apelido or r.nome for r in robos}
            robo_names = set(robo_map.keys())
            
            # Coleta em paralelo
            t_par_start = time.time()
            try:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    f_jobs = executor.submit(job_service.list)
                    f_pods = executor.submit(pod_service.list)
                    
                    jobs = f_jobs.result()
                    pods = f_pods.result()
            except RuntimeError as e:
                if "cannot schedule new futures after interpreter shutdown" in str(e):
                    logger.info("Python em shutdown, encerrando SSE jobs stream graciosamente")
                    break
                raise
            
            logger.debug(f"[SSE Jobs] K8s API parallel fetch in {time.time() - t_par_start:.3f}s")
            
            # Filtrar pods associados a jobs de robôs
            filtered_pods = []
            for p in pods:
                job_name_label = p.labels.get('job-name')
                nome_robo = p.labels.get('nome_robo') or p.labels.get('nome-robo')
                
                if not nome_robo and job_name_label:
                    for name in robo_names:
                        if p.name.startswith(name):
                            nome_robo = name
                            break
                
                if nome_robo and nome_robo.lower() in robo_names:
                    p_dict = p.to_dict()
                    p_dict['apelido'] = robo_map.get(nome_robo.lower(), nome_robo)
                    filtered_pods.append(p_dict)
            
            data = {
                "timestamp": time.time(),
                "jobs": [j.to_dict() for j in jobs if (j.labels.get('nome_robo') or '').lower() in robo_names],
                "pods": filtered_pods,
                "stats": {
                    "running": len([p for p in filtered_pods if p['phase'] == 'Running']),
                    "succeeded": len([p for p in filtered_pods if p['phase'] == 'Succeeded']),
                    "failed": len([p for p in filtered_pods if p['phase'] == 'Failed']),
                }
            }
            
            yield f"data: {json.dumps(data)}\n\n"
            
        except RuntimeError as e:
            if "cannot schedule new futures after interpreter shutdown" in str(e) or "interpreter shutdown" in str(e):
                logger.info("Python em shutdown, encerrando SSE jobs stream graciosamente")
                break
            logger.error(f"Erro no SSE jobs stream: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        except Exception as e:
            logger.error(f"Erro no SSE jobs stream: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
        # Verificar shutdown antes de aguardar
        if sys.is_finalizing():
            break
            
        try:
            time.sleep(interval)
        except (KeyboardInterrupt, SystemExit):
            logger.info("SSE jobs stream interrompido")
            break


# @api_view(['GET'])
def stream_dashboard(request):
    """
    Endpoint SSE para Dashboard.
    Envia updates a cada 2 segundos.
    """
    try:
        # Usar query_params do Django puro já que removemos api_view
        interval_str = request.GET.get('interval', '2')
        try:
            interval = int(interval_str)
        except ValueError:
            interval = 2
            
        interval = max(1, min(10, interval))  # Clamp entre 1 e 10 segundos
        
        response = StreamingHttpResponse(
            generate_dashboard_events(interval),
            content_type='text/event-stream'
        )
        response['Cache-Control'] = 'no-cache'
        response['Content-Encoding'] = 'none' # Evitar compressão que quebra SSE
        response['X-Accel-Buffering'] = 'no'  # Para nginx
        # Não adicionar Connection: keep-alive - o servidor de desenvolvimento do Django não permite headers hop-by-hop
        # CORS headers se necessário
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Headers'] = 'Cache-Control'
        return response
    except Exception as e:
        logger.error(f"Erro ao iniciar stream_dashboard: {e}", exc_info=True)
        from django.http import JsonResponse
        return JsonResponse({'error': str(e)}, status=500)


# @api_view(['GET'])
def stream_jobs(request):
    """
    Endpoint SSE para Containers Rodando (Jobs).
    Envia updates a cada 1 segundo.
    """
    interval_str = request.GET.get('interval', '1')
    try:
        interval = int(interval_str)
    except ValueError:
        interval = 1
        
    interval = max(1, min(5, interval))  # Clamp entre 1 e 5 segundos
    
    response = StreamingHttpResponse(
        generate_jobs_events(interval),
        content_type='text/event-stream'
    )
    response['Cache-Control'] = 'no-cache'
    response['Content-Encoding'] = 'none' # Evitar compressão
    response['X-Accel-Buffering'] = 'no'
    return response
