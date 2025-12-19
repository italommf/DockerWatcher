from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.cache_service import CacheKeys, CacheService
from backend.services.service_manager import get_kubernetes_service
from api.serializers.models import JobSerializer, PodSerializer, PodLogsSerializer
import logging
import re

logger = logging.getLogger(__name__)

class JobViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar jobs."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Usar serviços singleton para evitar reconexões constantes
        self.k8s_service = get_kubernetes_service()
    
    def list(self, request):
        """Lista todos os jobs."""
        label_selector = request.query_params.get('label_selector', None)
        jobs = CacheService.get_data(CacheKeys.JOBS, []) or []
        if not jobs:
            jobs = self.k8s_service.get_jobs()
            CacheService.update(CacheKeys.JOBS, jobs)
        if label_selector:
            jobs = self._filter_by_label(jobs, label_selector)
        
        serializer = JobSerializer(jobs, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um job específico."""
        jobs = self.k8s_service.get_jobs()
        job = next((j for j in jobs if j['name'] == pk), None)
        
        if not job:
            return Response({'error': 'Job não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = JobSerializer(job)
        return Response(serializer.data)
    
    def create(self, request):
        """Cria um job manualmente."""
        nome_rpa = request.data.get('nome_rpa')
        docker_tag = request.data.get('docker_tag')
        qtd_ram_maxima = request.data.get('qtd_ram_maxima')
        qtd_max_instancias = request.data.get('qtd_max_instancias')
        utiliza_arquivos_externos = request.data.get('utiliza_arquivos_externos', False)
        tempo_maximo_de_vida = request.data.get('tempo_maximo_de_vida', 600)
        
        if not all([nome_rpa, docker_tag, qtd_ram_maxima, qtd_max_instancias]):
            return Response(
                {'error': 'Campos obrigatórios: nome_rpa, docker_tag, qtd_ram_maxima, qtd_max_instancias'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        success = self.k8s_service.create_job(
            nome_rpa=nome_rpa,
            docker_tag=docker_tag,
            qtd_ram_maxima=qtd_ram_maxima,
            qtd_max_instancias=qtd_max_instancias,
            utiliza_arquivos_externos=utiliza_arquivos_externos,
            tempo_maximo_de_vida=tempo_maximo_de_vida
        )
        
        if success:
            return Response({'message': 'Job criado com sucesso'}, status=status.HTTP_201_CREATED)
        else:
            return Response({'error': 'Erro ao criar job'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um job."""
        success = self.k8s_service.delete_job(pk)
        
        if success:
            return Response({'message': 'Job deletado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao deletar job'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def status(self, request):
        """Obtém resumo de status dos jobs por RPA usando kubectl get jobs."""
        import time
        request_id = getattr(request, '_request_id', 'UNKNOWN')
        start_time = time.time()
        
        rpa_name = request.query_params.get('rpa_name', None)
        logger.info(f"[{request_id}] GET /api/jobs/status/ - rpa_name={rpa_name}")
        
        jobs = CacheService.get_data(CacheKeys.JOBS, []) or []
        if not jobs:
            logger.warning(f"[{request_id}] Cache de jobs vazio, buscando do Kubernetes")
            try:
                jobs = self.k8s_service.get_jobs()
                CacheService.update(CacheKeys.JOBS, jobs)
                logger.info(f"[{request_id}] {len(jobs)} jobs obtidos do Kubernetes")
            except Exception as e:
                logger.error(f"[{request_id}] Erro ao buscar jobs: {e}", exc_info=True)
                jobs = []
        else:
            logger.debug(f"[{request_id}] {len(jobs)} jobs obtidos do cache")
        
        if rpa_name:
            label_selector = f"nome_robo={rpa_name.lower()}"
            jobs = self._filter_by_label(jobs, label_selector)
        
        # Agrupar por RPA baseado nos jobs
        status_by_rpa = {}
        unknown_jobs_info = []  # Armazenar informações de jobs unknown para debug
        
        for job in jobs:
            # Obter nome_robo do label do job
            labels = job.get('labels', {})
            job_name = job.get('name', '')
            
            # Tentar várias formas de identificar o RPA
            nome_robo = (labels.get('nome_robo') or 
                        labels.get('nome-robo') or 
                        labels.get('app') or
                        None)
            
            # Se não encontrou nos labels, tentar extrair do nome do job
            if not nome_robo and job_name:
                normalized_name = job_name.lower()
                
                # 1. Remover prefixos conhecidos (ordem importa: strings mais longas primeiro)
                for prefix in ['rpa-cronjob-', 'rpa-job-', 'cronjob-', 'job-', 'rpa-']:
                    if normalized_name.startswith(prefix):
                        normalized_name = normalized_name[len(prefix):]
                        break
                
                # 2. Remover sufixos de hash/timestamp
                # Remove timestamps numéricos ou hashes hexadecimais no final
                # Ex: -1734567890 (cronjob) ou -w5mwl-tt5tw (job k8s) ou -abc12 (pod)
                
                # Remover padrão de hash duplo do K8s (ex: -w5mwl-tt5tw)
                normalized_name = re.sub(r'-[a-z0-9]{4,10}-[a-z0-9]{4,10}$', '', normalized_name)
                
                # Remover padrão de timestamp ou hash simples (ex: -123456 ou -abcde)
                normalized_name = re.sub(r'-[a-z0-9]+$', '', normalized_name)
                
                nome_robo = normalized_name
            
            # Se ainda não encontrou, marcar como unknown
            if not nome_robo or nome_robo == 'unknown':
                nome_robo = 'Unknown'
            else:
                # Manter o nome original (sem formatação) como chave
                # A formatação/apelido será adicionado depois
                nome_robo = nome_robo.lower()  # Apenas lowercase, sem formatação
            
            
            # Obter status do job
            active = job.get('active', 0)  # Pods ativos do job
            failed = job.get('failed', 0)  # Pods falhados do job
            completions = job.get('completions', 0)  # Pods completados com sucesso

            # Log de debug para identificação
            if active > 0 or failed > 0:
                 logger.info(f"[{request_id}] Job '{job_name}' -> RPA: '{nome_robo}'")
            
            # Determinar o tipo baseado no nome original do job
            tipo = 'RPA'  # Padrão
            if 'cronjob' in job_name.lower():
                tipo = 'Cronjob'
            # Nota: Deployments não aparecem como jobs, então não precisamos verificar aqui
            
            if nome_robo not in status_by_rpa:
                status_by_rpa[nome_robo] = {
                    'running': 0,
                    'pending': 0,
                    'error': 0,
                    'failed': 0,
                    'succeeded': 0,
                    'tipo': tipo  # Adicionar informação de tipo
                }
            else:
                # Se já existe, atualizar o tipo se necessário (priorizar Cronjob)
                if tipo == 'Cronjob':
                    status_by_rpa[nome_robo]['tipo'] = 'Cronjob'
            
            # Se tem pods ativos (running), adicionar aos running
            if active > 0:
                status_by_rpa[nome_robo]['running'] += active
            
            # Se tem pods falhados, adicionar aos failed
            if failed > 0:
                status_by_rpa[nome_robo]['failed'] += failed
            
            # Completions são jobs que terminaram com sucesso
            if completions > 0:
                status_by_rpa[nome_robo]['succeeded'] += completions
        
        # Buscar PODS de deployments (não aparecem como jobs)
        try:
            pods = CacheService.get_data(CacheKeys.PODS, []) or []
            if not pods:
                pods = self.k8s_service.get_pods()
                CacheService.update(CacheKeys.PODS, pods)
            
            logger.debug(f"[{request_id}] Processando {len(pods)} pods para detectar deployments")
            
            # Processar pods que não estão associados a jobs (deployments)
            for pod in pods:
                if not pod or not isinstance(pod, dict):
                    continue
                
                pod_name = pod.get('name', '')
                labels = pod.get('labels', {})
                phase = pod.get('phase', '')
                
                # Ignorar pods que fazem parte de jobs (já contabilizados)
                if labels.get('job-name') or labels.get('controller-uid'):
                    continue
                
                # Apenas pods Running ou Pending
                if phase not in ['Running', 'Pending']:
                    continue
                
                # Extrair nome do robô do pod
                nome_robo = (labels.get('nome_robo') or 
                            labels.get('nome-robo') or 
                            labels.get('app') or
                            None)
                
                # Se não encontrou, tentar extrair do nome do pod
                if not nome_robo and pod_name:
                    normalized_name = pod_name.lower()
                    
                    # Remover prefixos
                    for prefix in ['rpa-deployment-', 'deployment-', 'rpa-']:
                        if normalized_name.startswith(prefix):
                            normalized_name = normalized_name[len(prefix):]
                            break
                    
                    # Remover sufixos de hash do pod (ex: -abc123-xyz45)
                    normalized_name = re.sub(r'-[a-z0-9]{4,10}-[a-z0-9]{4,10}$', '', normalized_name)
                    normalized_name = re.sub(r'-[a-z0-9]{5,}$', '', normalized_name)
                    
                    nome_robo = normalized_name
                
                if not nome_robo or nome_robo == 'unknown':
                    continue
                
                nome_robo = nome_robo.lower()
                
                # Adicionar ou atualizar status
                if nome_robo not in status_by_rpa:
                    status_by_rpa[nome_robo] = {
                        'running': 0,
                        'pending': 0,
                        'error': 0,
                        'failed': 0,
                        'succeeded': 0,
                        'tipo': 'Deploy'  # Assumir Deploy para pods sem job
                    }
                
                # Contabilizar pod
                if phase == 'Running':
                    status_by_rpa[nome_robo]['running'] += 1
                    logger.debug(f"[{request_id}] Pod deployment '{pod_name}' -> '{nome_robo}' (Running)")
                elif phase == 'Pending':
                    status_by_rpa[nome_robo]['pending'] += 1
                    
        except Exception as e:
            logger.warning(f"[{request_id}] Erro ao buscar pods (continuando sem informações de  pods de deployment): {e}")
        
        # Buscar execuções pendentes do banco MySQL para todos os jobs identificados
        execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
        
        # Buscar apelidos do banco de dados
        from api.models import RoboDockerizado
        robos_db = RoboDockerizado.objects.filter(ativo=True).values('nome', 'apelido', 'tipo')
        
        # Criar mapa de apelidos: {nome_normalizado: (apelido, tipo)}
        apelidos_map = {}
        for robo in robos_db:
            nome_norm = robo['nome'].replace(' ', '').replace('-', '').replace('_', '').lower()
            apelido = robo['apelido'] or robo['nome']  # Usar apelido se existe, senão nome
            apelidos_map[nome_norm] = (apelido, robo['tipo'])
            logger.debug(f"[{request_id}] Mapeamento: '{robo['nome']}' (norm: '{nome_norm}') -> apelido: '{apelido}'")
        
        logger.info(f"[{request_id}] {len(apelidos_map)} robôs cadastrados no banco, {len(status_by_rpa)} detectados rodando")
        
        # Set de nomes normalizados já processados (para evitar duplicatas)
        processed_normalized_names = set()
        for nome in status_by_rpa.keys():
            if nome != 'Unknown':
                processed_normalized_names.add(nome.replace(' ', '').replace('-', '').replace('_', '').lower())

        # 1. Atualizar execuções e apelidos para jobs já identificados
        for nome_robo in list(status_by_rpa.keys()):  # Usar list() para permitir modificação do dict durante iteração
            if nome_robo == 'Unknown':
                status_by_rpa[nome_robo]['execucoes_pendentes'] = 0
                status_by_rpa[nome_robo]['apelido'] = 'Unknown'
                continue
            
            # Buscar apelido do banco
            nome_robo_norm = nome_robo.replace(' ', '').replace('-', '').replace('_', '').lower()
            apelido_info = apelidos_map.get(nome_robo_norm)
            
            if apelido_info:
                apelido, tipo_db = apelido_info
                status_by_rpa[nome_robo]['apelido'] = apelido
                logger.debug(f"[{request_id}] Apelido encontrado para '{nome_robo}': '{apelido}'")
                # Atualizar tipo se veio do banco (mais confiável)
                if tipo_db:
                    tipo_mapping = {'rpa': 'RPA', 'cronjob': 'Cronjob', 'deployment': 'Deploy'}
                    status_by_rpa[nome_robo]['tipo'] = tipo_mapping.get(tipo_db, status_by_rpa[nome_robo].get('tipo', 'RPA'))
            else:
                # Se não encontrou no banco, usar o nome formatado como apelido
                nome_formatado = nome_robo.replace('-', ' ').replace('_', ' ')
                nome_formatado = ' '.join(word.capitalize() for word in nome_formatado.split())
                status_by_rpa[nome_robo]['apelido'] = nome_formatado
                logger.warning(f"[{request_id}] Robô '{nome_robo}' não encontrado no banco (nome_norm: '{nome_robo_norm}'), usando nome formatado: '{nome_formatado}'")
            
            # Tentar encontrar correspondência exata ou normalizada
            execucoes = execucoes_por_robo.get(nome_robo, [])
            if not execucoes:
                # Busca flexível
                for nome_db, execs in execucoes_por_robo.items():
                    nome_db_norm = nome_db.replace(' ', '').replace('-', '').replace('_', '').lower()
                    if nome_robo_norm == nome_db_norm:
                        execucoes = execs
                        break
            
            status_by_rpa[nome_robo]['execucoes_pendentes'] = len(execucoes)

        # 2. Adicionar RPAs que têm execuções pendentes mas não têm jobs rodando (status parado)
        for nome_db, execs in execucoes_por_robo.items():
            if not execs:
                continue
                
            nome_db_norm = nome_db.replace(' ', '').replace('-', '').replace('_', '').lower()
            if nome_db_norm not in processed_normalized_names:
                # Buscar apelido do banco
                apelido_info = apelidos_map.get(nome_db_norm)
                
                if apelido_info:
                    apelido, tipo_db = apelido_info
                    display_name = nome_db  # Manter nome original como chave
                    tipo_mapping = {'rpa': 'RPA', 'cronjob': 'Cronjob', 'deployment': 'Deploy'}
                    tipo = tipo_mapping.get(tipo_db, 'RPA')
                else:
                    # Se não encontrou no banco, formatar nome
                    display_name = nome_db.replace('-', ' ').replace('_', ' ')
                    display_name = ' '.join(word.capitalize() for word in display_name.split())
                    apelido = display_name
                    tipo = 'RPA'
                
                status_by_rpa[display_name] = {
                    'running': 0,
                    'pending': 0,
                    'error': 0,
                    'failed': 0,
                    'succeeded': 0,
                    'tipo': tipo,
                    'execucoes_pendentes': len(execs),
                    'apelido': apelido
                }
                # Marcar como processado
                processed_normalized_names.add(nome_db_norm)
        
        # Filtrar "unknown" se não tiver pods ativos (para não poluir o dashboard)
        # Mas manter se tiver pods ativos para o usuário ver
        if 'unknown' in status_by_rpa:
            unknown_status = status_by_rpa['unknown']
            if unknown_status['running'] == 0 and unknown_status['failed'] == 0:
                # Remover unknown se não tem pods ativos ou falhados
                del status_by_rpa['unknown']
                logger.debug("Removido 'unknown' sem pods ativos do status")
            else:
                # Logar detalhes dos jobs unknown com pods ativos
                jobs_details = ', '.join([f"{j['name']} ({j['active']} pods)" for j in unknown_jobs_info])
                logger.warning(f"Jobs 'unknown' encontrados com {unknown_status['running']} pods ativos: {jobs_details}. "
                             f"Verifique os jobs no Kubernetes. Acesse /api/jobs/unknown/ para mais detalhes.")
        
        elapsed = time.time() - start_time
        logger.info(f"[{request_id}] Status por RPA processado em {elapsed:.3f}s - {len(status_by_rpa)} RPAs encontrados")
        
        # Log detalhado do resultado FINAL
        for rpa, status in status_by_rpa.items():
            if status['running'] > 0 or status['execucoes_pendentes'] > 0:
                logger.info(f"[{request_id}] RPA '{rpa}' -> Running: {status['running']}, Pending: {status['execucoes_pendentes']}")
                
        if elapsed > 1.0:
            logger.warning(f"[{request_id}] ATENÇÃO: Método status demorou {elapsed:.3f}s (acima de 1s)")
        return Response(status_by_rpa)

    def _filter_by_label(self, jobs, label_selector: str):
        if not label_selector or '=' not in label_selector:
            return jobs
        key, value = [part.strip() for part in label_selector.split('=', 1)]
        if not key:
            return jobs
        filtered = []
        for job in jobs:
            labels = job.get('labels', {}) if isinstance(job, dict) else {}
            if labels.get(key) == value:
                filtered.append(job)
        return filtered
    
    @action(detail=False, methods=['get'])
    def unknown(self, request):
        """Lista jobs que não puderam ser identificados (sem label nome_robo)."""
        try:
            jobs = self.k8s_service.get_jobs()
            unknown_jobs = []
            
            for job in jobs:
                labels = job.get('labels', {})
                job_name = job.get('name', '')
                
                # Verificar se tem label de identificação
                has_identification = (labels.get('nome_robo') or 
                                    labels.get('nome-robo') or 
                                    labels.get('app'))
                
                if not has_identification:
                    # Tentar extrair do nome
                    match = re.search(r'rpa-job-([^-]+)', job_name.lower())
                    if not match:
                        # Tentar padrão de cronjob: rpa-cronjob-{nome_completo}-{hash}
                        match = re.search(r'rpa-cronjob-(.+)-(\d+)$', job_name.lower())
                        if not match:
                            # Fallback: tentar sem hash no final
                            match = re.search(r'rpa-cronjob-(.+?)(?:-(\d+))?$', job_name.lower())
                    if not match:
                        match = re.search(r'job-([^-]+)', job_name.lower())
                    
                    # Se encontrou match mas não tem identificação, é unknown
                    unknown_jobs.append({
                        'name': job_name,
                        'namespace': job.get('namespace', 'default'),
                        'labels': labels,
                        'active': job.get('active', 0),
                        'failed': job.get('failed', 0),
                        'succeeded': job.get('completions', 0),
                        'start_time': job.get('start_time', ''),
                    })
            
            return Response({
                'count': len(unknown_jobs),
                'jobs': unknown_jobs
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Erro ao listar jobs unknown: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

