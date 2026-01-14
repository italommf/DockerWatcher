"""
ViewSet para gerenciar CronJobs.
Refatorado para usar módulo k8s/ nativo.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from api.serializers.models import CronjobSerializer, CreateCronjobSerializer
from api.models import RoboDockerizado
from django.utils import timezone
import logging
import re

from k8s.cronjobs import CronJobService
from k8s.jobs import JobService

logger = logging.getLogger(__name__)


class CronjobViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar cronjobs."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cronjob_service = CronJobService()
        self.job_service = JobService()
    
    def list(self, request):
        """Lista todos os cronjobs do banco de dados."""
        try:
            cronjobs_db = RoboDockerizado.objects.filter(tipo='cronjob', ativo=True)
            
            cronjobs_list = []
            for cj in cronjobs_db:
                cj_data = cj.to_dict()
                cj_data['execucoes_pendentes'] = 0  # Será implementado com API MongoDB
                cronjobs_list.append(cj_data)
            
            serializer = CronjobSerializer(cronjobs_list, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar cronjobs: {e}", exc_info=True)
            return Response({'error': f'Erro ao listar cronjobs: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def kubernetes(self, request):
        """Lista cronjobs ATIVOS no Kubernetes (tempo real)."""
        try:
            # Buscar cronjobs via API nativa
            k8s_cronjobs = self.cronjob_service.list()
            
            cronjobs_list = []
            for cj in k8s_cronjobs:
                cj_data = cj.to_dict()
                cj_data['execucoes_pendentes'] = 0  # Será implementado com API MongoDB
                cronjobs_list.append(cj_data)
            
            serializer = CronjobSerializer(cronjobs_list, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar cronjobs do Kubernetes: {e}", exc_info=True)
            return Response({'error': f'Erro ao listar cronjobs do Kubernetes: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um cronjob específico."""
        try:
            cj = RoboDockerizado.objects.get(nome=pk, tipo='cronjob')
            cj_data = cj.to_dict()
            cj_data['execucoes_pendentes'] = 0
            
            serializer = CronjobSerializer(cj_data)
            return Response(serializer.data)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'Cronjob não encontrado'}, status=status.HTTP_404_NOT_FOUND)
    
    def create(self, request):
        """Cria um novo cronjob no banco e Kubernetes."""
        serializer = CreateCronjobSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        dados = serializer.validated_data
        nome = dados['name']
        schedule = dados['schedule']
        timezone_str = dados.get('timezone', 'America/Sao_Paulo')
        nome_robo = dados.get('nome_robo', '').strip()
        
        # Construir imagem
        docker_repository = dados.get('docker_repository')
        docker_tag = dados.get('docker_tag', 'latest')
        docker_image = dados.get('docker_image')
        
        if docker_repository and docker_tag:
            docker_image = f"{docker_repository}:{docker_tag}"
        elif docker_repository:
            docker_image = f"{docker_repository}:latest"
        elif not docker_image:
            return Response(
                {'error': 'É necessário fornecer docker_repository e docker_tag ou docker_image completo'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        memory_limit = dados.get('memory_limit', '256Mi')
        ttl_seconds = dados.get('ttl_seconds_after_finished', 60)
        apelido = dados.get('apelido', '')
        tags = dados.get('tags', []) or []
        dependente_de_execucoes = dados.get('dependente_de_execucoes', True)
        
        if not isinstance(tags, list):
            tags = []
        if 'Agendado' not in tags:
            tags.append('Agendado')
        
        try:
            # Salvar no banco de dados
            cronjob_db = RoboDockerizado.objects.create(
                nome=nome,
                tipo='cronjob',
                schedule=schedule,
                timezone=timezone_str,
                docker_tag=docker_tag or 'latest',
                docker_repository=docker_repository or docker_image.split(':')[0],
                memory_limit=memory_limit,
                ttl_seconds_after_finished=ttl_seconds,
                ativo=True,
                apelido=apelido,
                tags=tags,
                dependente_de_execucoes=dependente_de_execucoes,
                suspended=False
            )
            
            # Criar no Kubernetes via API nativa
            env = {'NOME_ROBO': nome_robo} if nome_robo else None
            
            result = self.cronjob_service.create(
                name=nome,
                schedule=schedule,
                image=docker_image,
                memory_limit=memory_limit,
                labels={'nome_robo': nome_robo.lower()} if nome_robo else None,
                env=env,
                timezone=timezone_str,
                ttl_seconds=ttl_seconds
            )
            
            if not result:
                logger.error(f"Erro ao criar cronjob no Kubernetes")
                cronjob_db.delete()
                return Response(
                    {'error': 'Erro ao criar cronjob no Kubernetes'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            return Response({'message': 'Cronjob criado com sucesso'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Erro ao criar cronjob: {e}")
            return Response({'error': f'Erro ao criar cronjob: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um cronjob do banco e Kubernetes."""
        try:
            # Deletar do Kubernetes via API nativa
            success = self.cronjob_service.delete(pk)
            
            if success:
                # Marcar como inativo no banco
                try:
                    cronjob = RoboDockerizado.objects.get(nome=pk, tipo='cronjob')
                    cronjob.ativo = False
                    cronjob.inativado_em = timezone.now()
                    cronjob.save()
                except RoboDockerizado.DoesNotExist:
                    pass
                
                return Response({'message': 'Cronjob deletado com sucesso'}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'Erro ao deletar cronjob do Kubernetes'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao deletar cronjob: {e}")
            return Response({'error': f'Erro ao deletar cronjob: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        """Executa um cronjob manualmente agora."""
        success = self.cronjob_service.trigger_now(pk)
        
        if success:
            return Response({'message': 'Job criado a partir do cronjob com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao executar cronjob manualmente'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def standby(self, request, pk=None):
        """Suspende um cronjob e finaliza jobs ativos."""
        # Suspender cronjob
        success = self.cronjob_service.suspend(pk)
        
        # Deletar jobs ativos deste cronjob
        jobs_deletados = 0
        try:
            jobs = self.job_service.list()
            
            for job in jobs:
                if job.name.startswith(pk + '-'):
                    if self.job_service.delete(job.name, job.namespace):
                        jobs_deletados += 1
                        logger.info(f"Job {job.name} deletado (Cronjob {pk} em standby)")
            
            logger.info(f"{jobs_deletados} job(s) deletado(s) ao suspender Cronjob {pk}")
        except Exception as e:
            logger.warning(f"Erro ao deletar jobs do Cronjob {pk}: {e}")
        
        if success:
            # Atualizar no banco
            try:
                cronjob = RoboDockerizado.objects.get(nome=pk, tipo='cronjob')
                cronjob.suspended = True
                cronjob.status = 'standby'
                cronjob.ativo = False
                cronjob.inativado_em = timezone.now()
                cronjob.save()
            except RoboDockerizado.DoesNotExist:
                pass
            
            return Response({
                'message': f'Cronjob suspenso. {jobs_deletados} job(s) finalizado(s).',
                'jobs_deletados': jobs_deletados
            }, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao suspender cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Reativa um cronjob."""
        success = self.cronjob_service.resume(pk)
        
        if success:
            # Atualizar no banco
            try:
                cronjob = RoboDockerizado.objects.get(nome=pk, tipo='cronjob')
                cronjob.suspended = False
                cronjob.status = 'active'
                cronjob.ativo = True
                cronjob.inativado_em = None
                cronjob.save()
            except RoboDockerizado.DoesNotExist:
                pass
            
            return Response({'message': 'Cronjob reativado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao reativar cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
