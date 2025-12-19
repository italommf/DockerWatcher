from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from services.cache_service import CacheKeys, CacheService
from services.service_manager import get_kubernetes_service
from api.serializers.models import CronjobSerializer, CreateCronjobSerializer, UpdateCronjobSerializer
from api.models import RoboDockerizado
from django.utils import timezone
import yaml
import logging
import re

logger = logging.getLogger(__name__)

class CronjobViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar cronjobs (armazenados no banco de dados)."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.k8s_service = get_kubernetes_service()
    
    def list(self, request):
        """Lista todos os cronjobs do banco de dados."""
        try:
            # Buscar cronjobs do banco
            cronjobs_db = RoboDockerizado.objects.filter(tipo='cronjob', ativo=True)
            
            # Buscar execuções do cache
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            
            cronjobs_list = []
            for cj in cronjobs_db:
                cj_data = cj.to_dict()
                
                # Buscar execuções se for dependente
                execucoes_pendentes = 0
                if cj.dependente_de_execucoes:
                    nome_rpa = cj.nome.replace('rpa-cronjob-', '').replace('-cronjob', '')
                    nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                    execucoes_pendentes = self._buscar_execucoes_por_nome(nome_rpa, execucoes_por_robo)
                
                cj_data['execucoes_pendentes'] = execucoes_pendentes
                cronjobs_list.append(cj_data)
            
            serializer = CronjobSerializer(cronjobs_list, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar cronjobs: {e}", exc_info=True)
            return Response({'error': f'Erro ao listar cronjobs: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def kubernetes(self, request):
        """Lista cronjobs ATIVOS no Kubernetes (para Dashboard)."""
        try:
            # Buscar cronjobs do Kubernetes (cache ou direto)
            k8s_cronjobs = CacheService.get_data(CacheKeys.CRONJOBS, []) or []
            if not k8s_cronjobs:
                k8s_cronjobs = self.k8s_service.get_cronjobs()
                CacheService.update(CacheKeys.CRONJOBS, k8s_cronjobs)
            
            # Buscar execuções do cache
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            
            cronjobs_list = []
            for cj in k8s_cronjobs:
                nome = cj.get('name', '')
                if not nome:
                    continue
                
                # Buscar execuções
                execucoes_pendentes = 0
                nome_rpa = nome.replace('rpa-cronjob-', '').replace('-cronjob', '')
                nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                execucoes_pendentes = self._buscar_execucoes_por_nome(nome_rpa, execucoes_por_robo)
                
                cj['execucoes_pendentes'] = execucoes_pendentes
                cronjobs_list.append(cj)
            
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
            
            # Buscar execuções
            exec_cache = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            execucoes_pendentes = 0
            if cj.dependente_de_execucoes:
                nome_rpa = pk.replace('rpa-cronjob-', '').replace('-cronjob', '')
                nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                execucoes_pendentes = self._buscar_execucoes_por_nome(nome_rpa, exec_cache)
            
            cj_data['execucoes_pendentes'] = execucoes_pendentes
            
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
        
        # Construir docker_image
        docker_repository = dados.get('docker_repository')
        docker_tag = dados.get('docker_tag')
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
        
        # Adicionar tag padrão
        if not isinstance(tags, list):
            tags = []
        if 'Agendado' not in tags:
            tags.append('Agendado')
        
        try:
            # Salvar no banco de dados
            cronjob = RoboDockerizado.objects.create(
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
            
            # Gerar YAML dinamicamente
            env_section = ""
            if nome_robo:
                env_section = f"""
              env:
                - name: NOME_ROBO
                  value: "{nome_robo}" """
            
            yaml_content = f"""apiVersion: batch/v1
kind: CronJob
metadata:
  name: {nome}
spec:
  schedule: "{schedule}"
  timeZone: "{timezone_str}"
  jobTemplate:
    spec:
      ttlSecondsAfterFinished: {ttl_seconds}
      template:
        spec:
          imagePullSecrets:
            - name: docker-hub-secret
          containers:
            - name: rpa
              image: {docker_image}
              imagePullPolicy: Always{env_section}
              resources:
                limits:
                  memory: "{memory_limit}"
          restartPolicy: Never
"""
            
            # Aplicar YAML diretamente via stdin
            cronjob_dict = yaml.safe_load(yaml_content)
            yaml_formatted = yaml.dump(cronjob_dict, default_flow_style=False)
            
            cmd = f"kubectl create -f - <<EOF\n{yaml_formatted}\nEOF"
            return_code, stdout, stderr = self.k8s_service.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao criar cronjob: {stderr}")
                cronjob.delete()
                return Response(
                    {'error': f'Erro ao criar cronjob no Kubernetes: {stderr}'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Invalidar cache
            CacheService.update(CacheKeys.CRONJOBS, None)
            CacheService.update(CacheKeys.CRONJOBS_PROCESSED, None)
            
            return Response({'message': 'Cronjob criado com sucesso'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Erro ao criar cronjob: {e}")
            return Response({'error': f'Erro ao criar cronjob: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um cronjob do banco e Kubernetes."""
        try:
            # Deletar do Kubernetes
            success = self.k8s_service.delete_cronjob(pk)
            
            if success:
                # Marcar como inativo no banco
                try:
                    cronjob = RoboDockerizado.objects.get(nome=pk, tipo='cronjob')
                    cronjob.ativo = False
                    cronjob.inativado_em = timezone.now()
                    cronjob.save()
                except RoboDockerizado.DoesNotExist:
                    pass
                
                # Invalidar cache
                CacheService.update(CacheKeys.CRONJOBS, None)
                CacheService.update(CacheKeys.CRONJOBS_PROCESSED, None)
                
                return Response({'message': 'Cronjob deletado com sucesso'}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'Erro ao deletar cronjob do Kubernetes'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao deletar cronjob: {e}")
            return Response({'error': f'Erro ao deletar cronjob: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        """Executa um cronjob manualmente agora."""
        success = self.k8s_service.create_job_from_cronjob(pk)
        
        if success:
            return Response({'message': 'Job criado a partir do cronjob com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao executar cronjob manualmente'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def standby(self, request, pk=None):
        """Suspende um cronjob e finaliza jobs ativos."""
        # Suspender cronjob no Kubernetes
        success = self.k8s_service.suspend_cronjob(pk)
        
        # Deletar jobs ativos deste cronjob
        jobs_deletados = 0
        try:
            jobs_cache = CacheService.get_data(CacheKeys.JOBS, []) or []
            if not jobs_cache:
                jobs_cache = self.k8s_service.get_jobs()
            
            # Filtrar jobs deste cronjob (jobs criados por cronjobs têm o nome do cronjob como prefixo)
            for job in jobs_cache:
                job_name = job.get('name', '')
                # Jobs criados por cronjobs geralmente têm formato: cronjob-name-1234567
                if job_name.startswith(pk + '-'):
                    # Deletar job
                    job_success = self.k8s_service.delete_job(job_name)
                    if job_success:
                        jobs_deletados += 1
                        logger.info(f"Job {job_name} deletado (Cronjob {pk} em standby)")
            
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
            
            CacheService.update(CacheKeys.CRONJOBS_PROCESSED, None)
            CacheService.update(CacheKeys.JOBS, None)
            return Response({
                'message': f'Cronjob suspenso. {jobs_deletados} job(s) finalizado(s).',
                'jobs_deletados': jobs_deletados
            }, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao suspender cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Reativa um cronjob."""
        success = self.k8s_service.unsuspend_cronjob(pk)
        
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
            
            CacheService.update(CacheKeys.CRONJOBS_PROCESSED, None)
            return Response({'message': 'Cronjob reativado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao reativar cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _buscar_execucoes_por_nome(self, nome_rpa: str, exec_cache):
        if not isinstance(exec_cache, dict):
            return 0
        execucoes = exec_cache.get(nome_rpa, [])
        if execucoes:
            return len(execucoes)
        nome_normalizado = nome_rpa.replace('-', '').replace('_', '').lower()
        for nome_db, execs in exec_cache.items():
            if nome_normalizado == nome_db.replace('-', '').replace('_', '').lower():
                return len(execs)
        return 0
