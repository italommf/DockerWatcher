from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.service_manager import (
    get_kubernetes_service,
    get_database_service,
    get_file_service
)
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
        self.db_service = get_database_service()
        self.file_service = get_file_service()
    
    def list(self, request):
        """Lista todos os jobs."""
        label_selector = request.query_params.get('label_selector', None)
        jobs = self.k8s_service.get_jobs(label_selector)
        
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
        rpa_name = request.query_params.get('rpa_name', None)
        
        # Usar kubectl get jobs para obter informações dos jobs
        try:
            if rpa_name:
                label_selector = f"nome_robo={rpa_name.lower()}"
                jobs = self.k8s_service.get_jobs(label_selector)
            else:
                # Buscar todos os jobs
                jobs = self.k8s_service.get_jobs()
        except Exception as e:
            logger.error(f"Erro ao buscar jobs: {e}")
            jobs = []
        
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
                # Padrão comum: rpa-job-{nome_rpa}-{hash}
                match = re.search(r'rpa-job-([^-]+)', job_name.lower())
                if match:
                    nome_robo = match.group(1)
                else:
                    # Padrão de cronjob: rpa-cronjob-{nome_rpa_completo}-{hash}
                    # O hash geralmente é um número no final, então pegamos tudo até o último hífen seguido de número
                    # Exemplo: rpa-cronjob-painel-de-processos-acessorias-29387700
                    # Deve extrair: painel-de-processos-acessorias
                    match = re.search(r'rpa-cronjob-(.+)-(\d+)$', job_name.lower())
                    if match:
                        # Pegar o nome completo antes do hash (grupo 1)
                        nome_robo = match.group(1)
                    else:
                        # Tentar padrão alternativo sem hash no final (fallback)
                        match = re.search(r'rpa-cronjob-(.+?)(?:-(\d+))?$', job_name.lower())
                        if match:
                            nome_robo = match.group(1)
                        else:
                            # Tentar outros padrões
                            match = re.search(r'job-([^-]+)', job_name.lower())
                            if match:
                                nome_robo = match.group(1)
            
            # Se ainda não encontrou, usar 'unknown' mas logar para debug
            if not nome_robo:
                active = job.get('active', 0)
                if active > 0:  # Só logar se tiver pods ativos
                    unknown_jobs_info.append({
                        'name': job_name,
                        'labels': labels,
                        'active': active
                    })
                nome_robo = 'unknown'
            
            # Normalizar para minúsculas para comparação consistente
            nome_robo = nome_robo.lower()
            
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
            
            # Obter status do job
            active = job.get('active', 0)  # Pods ativos do job
            failed = job.get('failed', 0)  # Pods falhados do job
            completions = job.get('completions', 0)  # Pods completados com sucesso
            
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
            # Pods pendentes/erro são menos críticos e podem ser obtidos depois se necessário
            pass  # Pular busca de pods por enquanto para melhorar performance
        except Exception as e:
            logger.warning(f"Erro ao buscar pods (continuando sem informações de pods): {e}")
            # Continuar mesmo se falhar ao buscar pods - os dados dos jobs já são suficientes
        
        # Buscar execuções pendentes do banco MySQL para todos os jobs identificados
        # Coletar todos os nomes de RPA identificados (exceto 'unknown')
        nomes_rpas_para_buscar = [nome for nome in status_by_rpa.keys() if nome != 'unknown']
        
        if nomes_rpas_para_buscar:
            try:
                execucoes_por_robo = self.db_service.obter_execucoes(nomes_rpas_para_buscar)
                
                # Adicionar contagem de execuções pendentes para cada RPA
                for nome_robo in status_by_rpa.keys():
                    if nome_robo != 'unknown':
                        # Buscar execuções para este RPA (pode ter variações de nome)
                        execucoes = execucoes_por_robo.get(nome_robo, [])
                        # Também tentar buscar com variações (com/sem hífens/underscores)
                        if not execucoes:
                            # Tentar buscar com diferentes variações do nome
                            for nome_db, execs in execucoes_por_robo.items():
                                # Normalizar nomes para comparação (remover hífens/underscores)
                                nome_robo_normalizado = nome_robo.replace('-', '').replace('_', '').lower()
                                nome_db_normalizado = nome_db.replace('-', '').replace('_', '').lower()
                                if nome_robo_normalizado == nome_db_normalizado:
                                    execucoes = execs
                                    break
                        
                        execucoes_pendentes = len(execucoes)
                        status_by_rpa[nome_robo]['execucoes_pendentes'] = execucoes_pendentes
                    else:
                        # Para 'unknown', não buscar execuções
                        status_by_rpa[nome_robo]['execucoes_pendentes'] = 0
            except Exception as e:
                logger.warning(f"Erro ao buscar execuções do banco MySQL: {e}")
                # Se falhar, definir execuções como 0 para todos
                for nome_robo in status_by_rpa.keys():
                    status_by_rpa[nome_robo]['execucoes_pendentes'] = 0
        else:
            # Se não há nomes para buscar, definir execuções como 0
            for nome_robo in status_by_rpa.keys():
                status_by_rpa[nome_robo]['execucoes_pendentes'] = 0
        
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
        
        logger.info(f"Status por RPA: {status_by_rpa}")
        return Response(status_by_rpa)
    
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

