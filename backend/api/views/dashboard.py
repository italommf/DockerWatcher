"""
Endpoints consolidados para o Dashboard.

Este módulo implementa endpoints otimizados que retornam dados agregados,
reduzindo o número de chamadas HTTP do frontend de ~5 para 1.
"""
import logging
import time
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from api.models import FailedPod
from api.serializers.models import PodSerializer, ExecutionSerializer

from services.cache_service import CacheKeys, CacheService

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
        logger.error(f"Erro ao obter falhas para dashboard consolidado: {e}")
        return []


def _get_all_executions_list(execucoes_dict):
    """Retorna lista flat de todas as execuções do cache."""
    try:
        all_execs = []
        for exec_list in execucoes_dict.values():
            if isinstance(exec_list, list):
                all_execs.extend(exec_list)
        return ExecutionSerializer(all_execs, many=True).data
    except Exception as e:
        logger.error(f"Erro ao obter execuções para dashboard consolidado: {e}")
        return []


@api_view(['GET'])
def dashboard_full(request):
    """
    Endpoint consolidado que retorna todos os dados do Dashboard em uma única chamada.
    
    Este endpoint agrega:
    - Recursos da VM (memória, CPU, armazenamento)
    - Status de conexão (SSH, MySQL)
    - Estatísticas (instâncias ativas, execuções pendentes, falhas)
    - Robôs em execução
    - Próximos cronjobs
    
    Returns:
        JSON com todos os dados necessários para renderizar o Dashboard
    """
    request_id = getattr(request, '_request_id', f"DASH-{int(time.time() * 1000)}")
    start_time = time.time()
    
    logger.info(f"[{request_id}] GET /api/dashboard/full/ - Iniciando")
    
    try:
        # Coletar dados do cache (tudo já está pré-processado pelo PollingService)
        vm_resources = CacheService.get_data(CacheKeys.VM_RESOURCES, {
            "memoria": {"total_gb": 0, "livre_gb": 0, "usada_gb": 0},
            "armazenamento": {"total_gb": 0, "livre_gb": 0, "usado_gb": 0},
            "cpu": {"usado": 0, "livre": 100}
        })
        
        connection_status = CacheService.get_data(CacheKeys.CONNECTION_STATUS, {
            "ssh_connected": False,
            "mysql_connected": False,
            "ssh_error": None,
            "mysql_error": None,
        })
        
        # Jobs e Pods: SEMPRE buscar frescos do K8s para evitar mostrar jobs que já não existem
        from services.service_manager import get_kubernetes_service
        k8s_service = get_kubernetes_service()
        
        try:
            jobs = k8s_service.get_jobs()
            CacheService.update(CacheKeys.JOBS, jobs)
            logger.info(f"[DASHBOARD] Jobs obtidos do K8s: {len(jobs)}")
        except Exception as e:
            logger.warning(f"[DASHBOARD] Erro ao buscar jobs do K8s, usando cache: {e}")
            jobs = CacheService.get_data(CacheKeys.JOBS, [])
        
        pods = CacheService.get_data(CacheKeys.PODS, [])
        rpas_processed = CacheService.get_data(CacheKeys.RPAS_PROCESSED, [])
        cronjobs_processed = CacheService.get_data(CacheKeys.CRONJOBS_PROCESSED, [])
        deployments_processed = CacheService.get_data(CacheKeys.DEPLOYMENTS_PROCESSED, [])
        execucoes = CacheService.get_data(CacheKeys.EXECUTIONS, {})
        
        logger.info(f"[DASHBOARD] Cronjobs processados do cache: {len(cronjobs_processed)}")
        if cronjobs_processed:
            logger.info(f"[DASHBOARD] Nomes dos cronjobs processados: {[cj.get('name', 'N/A') for cj in cronjobs_processed[:5]]}")
        
        # Se o cache de cronjobs estiver vazio, tentar buscar diretamente do K8s como fallback
        if not cronjobs_processed:
            logger.warning("[DASHBOARD] Cache de cronjobs vazio, tentando buscar diretamente do K8s...")
            try:
                from services.service_manager import get_kubernetes_service
                k8s_service = get_kubernetes_service()
                k8s_cronjobs = k8s_service.get_cronjobs()
                logger.info(f"[DASHBOARD] Buscou {len(k8s_cronjobs)} cronjobs diretamente do K8s")
                
                # Processar cronjobs do K8s para o formato esperado
                cronjobs_processed = []
                for cj in k8s_cronjobs:
                    if not cj.get('suspended', False):
                        cronjobs_processed.append({
                            'name': cj.get('name', ''),
                            'schedule': cj.get('schedule', ''),
                            'suspended': cj.get('suspended', False),
                            'last_schedule_time': cj.get('last_schedule_time'),
                            'last_successful_time': cj.get('last_successful_time'),
                            'execucoes_pendentes': 0,
                            'apelido': cj.get('name', '').replace('rpa-cronjob-', '').replace('-cronjob', ''),
                            '_from_k8s_direct': True
                        })
                logger.info(f"[DASHBOARD] Processou {len(cronjobs_processed)} cronjobs ativos do K8s")
            except Exception as e:
                logger.error(f"[DASHBOARD] Erro ao buscar cronjobs do K8s: {e}", exc_info=True)
                # Fallback final: buscar do banco
                from api.models import RoboDockerizado
                db_cronjobs = RoboDockerizado.objects.filter(tipo='cronjob', ativo=True)
                cronjobs_processed = [cj.to_dict() for cj in db_cronjobs]
                for cj in cronjobs_processed:
                    cj['_no_k8s_status'] = True

        if not rpas_processed:
            from api.models import RoboDockerizado
            db_rpas = RoboDockerizado.objects.filter(tipo='rpa', ativo=True)
            rpas_processed = [rpa.to_dict() for rpa in db_rpas]
        
        # Calcular estatísticas
        instancias_ativas = 0
        execucoes_pendentes = 0
        falhas_containers = 0
        
        # Mapa para consolidar robôs em execução: nome_normalizado -> {detalhes}
        running_map = {} # nome_normalizado -> {nome, instancias, tipo, tags, etc}
        nomes_adicionados = set()
        
        # 1. Primeiro, processar RPAs que o PollingService já identificou no banco
        for rpa in rpas_processed:
            nome = rpa.get("nome_rpa", "")
            nome_normalizado = nome.lower().replace("-", "").replace("_", "")
            
            jobs_ativos = rpa.get("jobs_ativos", 0)
            if jobs_ativos > 0:
                running_map[nome_normalizado] = {
                    "nome": rpa.get("apelido") or nome,
                    "nome_rpa": nome,
                    "instancias": jobs_ativos,
                    "execucoes_pendentes": rpa.get("execucoes_pendentes", 0),
                    "tipo": "RPA",
                    "tags": rpa.get("tags", []),
                }
                nomes_adicionados.add(nome_normalizado)

        # 2. Processar Jobs do Kubernetes (para estatísticas e descobrir novos robôs)
        import re
        for job in jobs:
            if not isinstance(job, dict):
                continue
                
            active = job.get("active", 0)
            failed = job.get("failed", 0)
            instancias_ativas += active
            falhas_containers += failed
            
            if active > 0:
                labels = job.get("labels", {})
                nome_robo = (
                    labels.get("nome_robo") 
                    or labels.get("nome-robo") 
                    or labels.get("app") 
                    or labels.get("job-name")
                )
                
                # Fallback robusto para identificação
                if not nome_robo:
                    raw_name = job.get("name", "")
                    
                    # 1. Primeiramente, tentar ver se o nome contém algum nome de RPA conhecido
                    # Isso evita que o regex limpe demais o nome
                    for rpa in rpas_processed:
                        nome_db = rpa.get("nome_rpa", "")
                        if nome_db.lower() in raw_name.lower():
                            nome_robo = nome_db
                            break
                    
                    if not nome_robo:
                        # 2. Tentar com Cronjobs conhecidos
                        for cj in cronjobs_processed:
                            nome_cj = cj.get("name", "")
                            if nome_cj.lower() in raw_name.lower():
                                nome_robo = nome_cj
                                break
                    
                    if not nome_robo:
                        # 3. Fallback: Limpeza via Regex (mais conservadora)
                        # Remover apenas sufixos de hashes numéricos ou markers de manual
                        nome_robo = re.sub(r'-(manual-)?\d+$', '', raw_name) 
                        
                        # Remover prefixos recursivamente
                        prefixes = ['rpa-cronjob-', 'rpa-job-', 'cronjob-', 'job-', 'rpa-', 'deployment-', 'exec-']
                        cleaned = True
                        while cleaned:
                            cleaned = False
                            for prefix in prefixes:
                                if nome_robo.lower().startswith(prefix):
                                    nome_robo = nome_robo[len(prefix):]
                                    cleaned = True
                
                if not nome_robo:
                    nome_robo = "Desconhecido"

                nome_normalizado = nome_robo.lower().replace("-", "").replace("_", "")
                
                if nome_normalizado in running_map:
                    # Se já está no mapa (via RPA ou outro job do mesmo robo), somar instâncias
                    if nome_normalizado not in nomes_adicionados:
                        running_map[nome_normalizado]["instancias"] += active
                        
                    # Recalcular execuções se necessário
                    if running_map[nome_normalizado]["execucoes_pendentes"] == 0:
                        for k, v in execucoes.items():
                            if k.lower().replace("-", "").replace("_", "") == nome_normalizado:
                                running_map[nome_normalizado]["execucoes_pendentes"] = len(v)
                                break
                else:
                    # Novo robô ou cronjob rodando
                    is_cronjob = any(cj.get("name", "").lower() == nome_robo.lower() or 
                                     cj.get("name", "").lower().replace("-", "").replace("_", "") == nome_normalizado 
                                     for cj in cronjobs_processed)
                    
                    # Buscar execuções
                    exec_count = 0
                    for k, v in execucoes.items():
                        if k.lower().replace("-", "").replace("_", "") == nome_normalizado:
                            exec_count = len(v)
                            break

                    running_map[nome_normalizado] = {
                        "nome": nome_robo,
                        "nome_rpa": nome_robo,
                        "instancias": active,
                        "execucoes_pendentes": exec_count,
                        "tipo": "Cronjob" if is_cronjob else "RPA",
                        "tags": [],
                    }
        
        # Contar execuções pendentes do cache
        for nome_rpa, execs in execucoes.items():
            if isinstance(execs, list):
                execucoes_pendentes += len(execs)
        
        # Converter mapa para lista ordenada por instâncias
        robots_running = sorted(running_map.values(), key=lambda x: x['instancias'], reverse=True)
        
        # Próximos cronjobs (ordenados por próxima execução)
        # Filtrar apenas os não suspensos e que têm schedule válido
        cronjobs_ativos = [cj for cj in cronjobs_processed if not cj.get("suspended", False) and cj.get("schedule")]
        
        # Ordenar por last_schedule_time (mais recente primeiro) como fallback
        # O frontend fará a ordenação correta por próxima execução
        cronjobs_ativos.sort(key=lambda x: x.get("last_schedule_time") or "", reverse=True)
        
        cronjobs_proximos = []
        for cj in cronjobs_ativos[:10]:  # Top 10
            cronjobs_proximos.append({
                "name": cj.get("name", ""),
                "apelido": cj.get("apelido", ""),
                "schedule": cj.get("schedule", ""),
                "last_schedule_time": cj.get("last_schedule_time"),
                "last_successful_time": cj.get("last_successful_time"),
                "execucoes_pendentes": cj.get("execucoes_pendentes", 0),
                "suspended": cj.get("suspended", False),
            })
        
        logger.info(f"[DASHBOARD] Retornando {len(cronjobs_proximos)} cronjobs próximos de {len(cronjobs_ativos)} ativos (total processado: {len(cronjobs_processed)})")
        
        # Montar resposta consolidada
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
                "deployments_ativos": len([d for d in deployments_processed if d.get("ready_replicas", 0) > 0]),
            },
            "robots_running": robots_running,
            "cronjobs_proximos": cronjobs_proximos,
            # NOVOS: Dados completos para popular todas as páginas do frontend de uma vez
            "full_data": {
                "rpas": rpas_processed,
                "cronjobs": cronjobs_processed,
                "deployments": deployments_processed,
                "failed_pods": _get_failed_pods_list(),
                "executions": _get_all_executions_list(execucoes)
            },
            "cache_stats": {
                "vm_resources_age": CacheService.get_age(CacheKeys.VM_RESOURCES),
                "jobs_age": CacheService.get_age(CacheKeys.JOBS),
                "executions_age": CacheService.get_age(CacheKeys.EXECUTIONS),
            }
        }
        
        elapsed = time.time() - start_time
        logger.info(f"[{request_id}] Dashboard consolidado retornado em {elapsed:.3f}s")
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"[{request_id}] Erro no dashboard consolidado após {elapsed:.3f}s: {e}", exc_info=True)
        return Response({
            "error": str(e),
            "timestamp": time.time(),
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def cache_stats(request):
    """
    Retorna estatísticas do cache para debug e monitoramento.
    """
    try:
        stats = CacheService.get_all_stats()
        return Response({
            "cache_stats": stats,
            "timestamp": time.time(),
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            "error": str(e),
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
