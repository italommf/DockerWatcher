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
            
            # 3. Formatar para exibição limpa (Title Case)
            if nome_robo and nome_robo != 'unknown':
                # Substituir separadores por espaços
                display_name = nome_robo.replace('-', ' ').replace('_', ' ')
                # Capitalizar cada palavra
                display_name = ' '.join(word.capitalize() for word in display_name.split())
                
                # Usar o nome limpo como chave para agrupar
                nome_robo = display_name
            else:
                 nome_robo = 'Unknown'
            
            
            # Obter status do job
            active = job.get('active', 0)  # Pods ativos do job
            failed = job.get('failed', 0)  # Pods falhados do job
            completions = job.get('completions', 0)  # Pods completados com sucesso

            # Log de debug para identificação
            if active > 0 or failed > 0:
                 logger.info(f"[{request_id}] Job '{job_name}' -> RPA: '{nome_robo}'")
            
            # Normalizar para minúsculas para comparação consistente
            # REMOVIDO: Agora usamos Title Case para exibição bonita
            # nome_robo = nome_robo.lower()
            
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
        
        # Buscar pods APENAS se necessário e de forma otimizada
        # Os dados dos jobs já fornecem a maioria das informações (running, failed, succeeded)
        # Pods são buscados apenas para detectar pending/error que podem não estar nos jobs
        # Otimização: pular busca de pods se não houver necessidade (dados dos jobs são suficientes)
        try:
            # Buscar pods apenas se houver necessidade (ex: para detectar pending)
            # Por enquanto, vamos pular a busca de pods para melhorar performance
            # Os dados dos jobs já fornecem running, failed e succeeded
            logger.debug(f"[{request_id}] Pulando busca de pods (otimização)")
            # Pods pendentes/erro são menos críticos e podem ser obtidos depois se necessário
            pass  # Pular busca de pods por enquanto para melhorar performance
        except Exception as e:
            logger.warning(f"Erro ao buscar pods (continuando sem informações de pods): {e}")
            # Continuar mesmo se falhar ao buscar pods - os dados dos jobs já são suficientes
        
        # Buscar execuções pendentes do banco MySQL para todos os jobs identificados
        execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
        
        # Set de nomes normalizados já processados (para evitar duplicatas)
        processed_normalized_names = set()
        for nome in status_by_rpa.keys():
            if nome != 'Unknown':
                processed_normalized_names.add(nome.replace(' ', '').replace('-', '').replace('_', '').lower())

        # 1. Atualizar execuções para jobs já identificados
        for nome_robo in status_by_rpa.keys():
            if nome_robo == 'Unknown':
                status_by_rpa[nome_robo]['execucoes_pendentes'] = 0
                continue
            
            # Tentar encontrar correspondência exata ou normalizada
            execucoes = execucoes_por_robo.get(nome_robo, [])
            if not execucoes:
                # Busca flexível
                nome_robo_norm = nome_robo.replace(' ', '').replace('-', '').replace('_', '').lower()
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
                # Adicionar entrada para este RPA
                # Usar o nome do banco formatado como chave
                display_name = nome_db.replace('-', ' ').replace('_', ' ')
                display_name = ' '.join(word.capitalize() for word in display_name.split())
                
                status_by_rpa[display_name] = {
                    'running': 0,
                    'pending': 0,
                    'error': 0,
                    'failed': 0,
                    'succeeded': 0,
                    'tipo': 'RPA', # Assumir RPA se vem da fila de execuções
                    'execucoes_pendentes': len(execs)
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

