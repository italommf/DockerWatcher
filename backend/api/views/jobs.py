"""
ViewSet para gerenciar Jobs.
Refatorado para usar módulo k8s/ nativo.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from api.serializers.models import JobSerializer, PodSerializer, PodLogsSerializer
import logging
import re
import time

from k8s.jobs import JobService
from k8s.pods import PodService

logger = logging.getLogger(__name__)


class JobViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar jobs."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.job_service = JobService()
        self.pod_service = PodService()
    
    def list(self, request):
        """Lista todos os jobs."""
        label_selector = request.query_params.get('label_selector', None)
        namespace = request.query_params.get('namespace', None)
        
        # Buscar jobs via API nativa (tempo real)
        jobs = self.job_service.list(namespace=namespace, labels=label_selector)
        
        # Converter para dict
        jobs_data = [job.to_dict() for job in jobs]
        
        serializer = JobSerializer(jobs_data, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um job específico."""
        namespace = request.query_params.get('namespace', None)
        
        job = self.job_service.get(name=pk, namespace=namespace)
        
        if not job:
            return Response({'error': 'Job não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = JobSerializer(job.to_dict())
        return Response(serializer.data)
    
    def create(self, request):
        """Cria um job manualmente."""
        nome_rpa = request.data.get('nome_rpa')
        docker_repository = request.data.get('docker_repository')
        docker_tag = request.data.get('docker_tag', 'latest')
        qtd_ram_maxima = request.data.get('qtd_ram_maxima', 512)
        
        if not nome_rpa:
            return Response(
                {'error': 'Campo obrigatório: nome_rpa'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Buscar repositório do banco se não fornecido
        if not docker_repository:
            try:
                from api.models import RoboDockerizado
                rpa = RoboDockerizado.objects.get(nome=nome_rpa, tipo='rpa')
                docker_repository = rpa.docker_repository
                if not docker_repository:
                    return Response(
                        {'error': 'Repositório Docker não configurado para este RPA. Configure o repositório primeiro.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except RoboDockerizado.DoesNotExist:
                return Response(
                    {'error': 'RPA não encontrado no banco de dados'},
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Construir imagem Docker
        docker_image = f"{docker_repository}:{docker_tag}"
        
        # Converter RAM para formato K8s
        memory_limit = f"{int(qtd_ram_maxima)}Mi"
        
        job = self.job_service.create(
            name=f"rpa-job-{nome_rpa.replace('_', '-').lower()}",
            image=docker_image,
            memory_limit=memory_limit,
            labels={'nome_robo': nome_rpa.lower()},
            env={'NOME_ROBO': nome_rpa.lower()}
        )
        
        if job:
            return Response({'message': 'Job criado com sucesso', 'name': job.name}, status=status.HTTP_201_CREATED)
        else:
            return Response({'error': 'Erro ao criar job'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um job."""
        namespace = request.query_params.get('namespace', None)
        
        success = self.job_service.delete(name=pk, namespace=namespace)
        
        if success:
            return Response({'message': 'Job deletado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao deletar job'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def status(self, request):
        """Obtém resumo de status dos jobs por RPA."""
        request_id = getattr(request, '_request_id', 'UNKNOWN')
        start_time = time.time()
        
        rpa_name = request.query_params.get('rpa_name', None)
        logger.info(f"[{request_id}] GET /api/jobs/status/ - rpa_name={rpa_name}")
        
        # Buscar jobs (tempo real)
        label_selector = f"nome_robo={rpa_name.lower()}" if rpa_name else None
        jobs = self.job_service.list(labels=label_selector)
        
        # Buscar pods para deployments
        pods = self.pod_service.list()
        
        # Agrupar por RPA
        status_by_rpa = {}
        
        for job in jobs:
            nome_robo = self._extract_rpa_name(job.name, job.labels)
            
            if nome_robo not in status_by_rpa:
                status_by_rpa[nome_robo] = {
                    'running': 0,
                    'pending': 0,
                    'error': 0,
                    'failed': 0,
                    'succeeded': 0,
                    'tipo': 'Cronjob' if 'cronjob' in job.name.lower() else 'RPA'
                }
            
            if job.active > 0:
                status_by_rpa[nome_robo]['running'] += job.active
            if job.failed > 0:
                status_by_rpa[nome_robo]['failed'] += job.failed
            if job.succeeded > 0:
                status_by_rpa[nome_robo]['succeeded'] += job.succeeded
        
        # Processar pods de deployments
        for pod in pods:
            # Ignorar pods de jobs
            if pod.labels.get('job-name') or pod.labels.get('controller-uid'):
                continue
            
            if pod.phase not in ['Running', 'Pending']:
                continue
            
            nome_robo = self._extract_rpa_name(pod.name, pod.labels)
            
            if nome_robo not in status_by_rpa:
                status_by_rpa[nome_robo] = {
                    'running': 0,
                    'pending': 0,
                    'error': 0,
                    'failed': 0,
                    'succeeded': 0,
                    'tipo': 'Deploy'
                }
            
            if pod.phase == 'Running':
                status_by_rpa[nome_robo]['running'] += 1
            elif pod.phase == 'Pending':
                status_by_rpa[nome_robo]['pending'] += 1
        
        # Adicionar execuções pendentes e apelidos
        self._enrich_with_db_info(status_by_rpa, request_id)
        
        elapsed = time.time() - start_time
        logger.info(f"[{request_id}] Status processado em {elapsed:.3f}s - {len(status_by_rpa)} RPAs")
        
        return Response(status_by_rpa)
    
    def _extract_rpa_name(self, resource_name: str, labels: dict) -> str:
        """Extrai nome do RPA de labels ou nome do recurso."""
        nome_robo = (labels.get('nome_robo') or 
                    labels.get('nome-robo') or 
                    labels.get('app'))
        
        if not nome_robo and resource_name:
            normalized = resource_name.lower()
            
            # Remover prefixos
            for prefix in ['rpa-cronjob-', 'rpa-job-', 'cronjob-', 'job-', 'rpa-', 'deployment-']:
                if normalized.startswith(prefix):
                    normalized = normalized[len(prefix):]
                    break
            
            # Remover sufixos de hash
            normalized = re.sub(r'-[a-z0-9]{4,10}-[a-z0-9]{4,10}$', '', normalized)
            normalized = re.sub(r'-[a-z0-9]+$', '', normalized)
            
            nome_robo = normalized
        
        return nome_robo or 'Unknown'
    
    def _enrich_with_db_info(self, status_by_rpa: dict, request_id: str):
        """Adiciona execuções pendentes e apelidos do banco."""
        try:
            from api.models import RoboDockerizado
            
            # Buscar robôs do banco
            robos_db = RoboDockerizado.objects.filter(ativo=True).values('nome', 'apelido', 'tipo')
            
            # Mapa de apelidos
            apelidos_map = {}
            for robo in robos_db:
                nome_norm = robo['nome'].replace(' ', '').replace('-', '').replace('_', '').lower()
                apelidos_map[nome_norm] = (robo['apelido'] or robo['nome'], robo['tipo'])
            
            # Enriquecer status
            for nome_robo in status_by_rpa.keys():
                nome_norm = nome_robo.replace(' ', '').replace('-', '').replace('_', '').lower()
                
                if nome_norm in apelidos_map:
                    apelido, tipo_db = apelidos_map[nome_norm]
                    status_by_rpa[nome_robo]['apelido'] = apelido
                    if tipo_db:
                        tipo_mapping = {'rpa': 'RPA', 'cronjob': 'Cronjob', 'deployment': 'Deploy'}
                        status_by_rpa[nome_robo]['tipo'] = tipo_mapping.get(tipo_db, status_by_rpa[nome_robo]['tipo'])
                else:
                    # Formatar nome como apelido
                    nome_formatado = nome_robo.replace('-', ' ').replace('_', ' ')
                    nome_formatado = ' '.join(word.capitalize() for word in nome_formatado.split())
                    status_by_rpa[nome_robo]['apelido'] = nome_formatado
                
                # Placeholder para execuções (será implementado com API MongoDB)
                status_by_rpa[nome_robo]['execucoes_pendentes'] = 0
                
        except Exception as e:
            logger.warning(f"[{request_id}] Erro ao enriquecer com dados do banco: {e}")
    
    @action(detail=False, methods=['get'])
    def unknown(self, request):
        """Lista jobs que não puderam ser identificados."""
        try:
            jobs = self.job_service.list()
            unknown_jobs = []
            
            for job in jobs:
                has_identification = (job.labels.get('nome_robo') or 
                                    job.labels.get('nome-robo') or 
                                    job.labels.get('app'))
                
                if not has_identification:
                    unknown_jobs.append(job.to_dict())
            
            return Response({
                'count': len(unknown_jobs),
                'jobs': unknown_jobs
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Erro ao listar jobs unknown: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
