"""
ViewSet para gerenciar RPAs.
Refatorado para usar módulo k8s/ nativo.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from api.serializers.models import RPASerializer, CreateRPASerializer, UpdateRPASerializer
from api.models import RoboDockerizado
from django.utils import timezone
from typing import Dict, List
import logging

from k8s.jobs import JobService

logger = logging.getLogger(__name__)


class RPAViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar RPAs."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._job_service = None
    
    @property
    def job_service(self):
        if self._job_service is None:
            self._job_service = JobService()
        return self._job_service
    
    def list(self, request):
        """Lista todos os RPAs do banco."""
        rpas_queryset = RoboDockerizado.objects.filter(tipo='rpa')
        
        # Contar jobs ativos
        jobs = self.job_service.list()
        jobs_por_rpa = {}
        for job in jobs:
            nome = job.labels.get('nome_robo', '').lower()
            if nome and job.active > 0:
                jobs_por_rpa[nome] = jobs_por_rpa.get(nome, 0) + job.active
        
        rpas = []
        for rpa_obj in rpas_queryset:
            rpa_data = rpa_obj.to_dict()
            
            # Jobs ativos
            jobs_ativos = jobs_por_rpa.get(rpa_obj.nome.lower(), 0)
            
            # Tags
            tags = rpa_data.get('tags', [])
            if not isinstance(tags, list):
                tags = []
            if 'Exec' not in tags:
                tags.append('Exec')
            
            rpa_data['execucoes_pendentes'] = 0  # Será integrado com API MongoDB
            rpa_data['jobs_ativos'] = jobs_ativos
            rpa_data['tags'] = tags
            rpas.append(rpa_data)
        
        serializer = RPASerializer(rpas, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um RPA."""
        try:
            rpa_obj = RoboDockerizado.objects.get(nome=pk, tipo='rpa')
            rpa_data = rpa_obj.to_dict()
            
            # Jobs ativos
            jobs = self.job_service.list()
            jobs_ativos = sum(j.active for j in jobs if j.labels.get('nome_robo', '').lower() == pk.lower())
            
            tags = rpa_data.get('tags', [])
            if not isinstance(tags, list):
                tags = []
            if 'Exec' not in tags:
                tags.append('Exec')
            
            rpa_data['execucoes_pendentes'] = 0
            rpa_data['jobs_ativos'] = jobs_ativos
            rpa_data['tags'] = tags
            
            serializer = RPASerializer(rpa_data)
            return Response(serializer.data)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
    
    def create(self, request):
        """Cria um novo RPA."""
        serializer = CreateRPASerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        dados = serializer.validated_data.copy()
        
        tags = dados.get('tags', []) or []
        if not isinstance(tags, list):
            tags = []
        if 'Exec' not in tags:
            tags.append('Exec')
        
        try:
            rpa = RoboDockerizado.objects.create(
                nome=dados['nome_rpa'],
                tipo='rpa',
                docker_tag=dados['docker_tag'],
                robo_uuid=dados.get('robo_uuid', ''),
                qtd_max_instancias=dados['qtd_max_instancias'],
                qtd_ram_maxima=dados['qtd_ram_maxima'],
                utiliza_arquivos_externos=dados.get('utiliza_arquivos_externos', False),
                tempo_maximo_de_vida=dados.get('tempo_maximo_de_vida', 600),
                status='active',
                ativo=True,
                apelido=dados.get('apelido', ''),
                tags=tags
            )
            
            return Response({'message': 'RPA criado com sucesso'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Erro ao criar RPA: {e}")
            return Response({'error': f'Erro ao criar RPA: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def update(self, request, pk=None):
        """Atualiza um RPA."""
        serializer = UpdateRPASerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            rpa = RoboDockerizado.objects.get(nome=pk, tipo='rpa')
            dados = serializer.validated_data
            
            if 'docker_tag' in dados:
                rpa.docker_tag = dados['docker_tag']
            if 'robo_uuid' in dados:
                rpa.robo_uuid = dados['robo_uuid']
            if 'qtd_max_instancias' in dados:
                rpa.qtd_max_instancias = dados['qtd_max_instancias']
            if 'qtd_ram_maxima' in dados:
                rpa.qtd_ram_maxima = dados['qtd_ram_maxima']
            if 'utiliza_arquivos_externos' in dados:
                rpa.utiliza_arquivos_externos = dados['utiliza_arquivos_externos']
            if 'tempo_maximo_de_vida' in dados:
                rpa.tempo_maximo_de_vida = dados['tempo_maximo_de_vida']
            if 'apelido' in dados:
                rpa.apelido = dados['apelido']
            if 'tags' in dados:
                tags = dados['tags'] or []
                if not isinstance(tags, list):
                    tags = []
                if 'Exec' not in tags:
                    tags.append('Exec')
                rpa.tags = tags
            
            rpa.save()
            
            return Response({'message': 'RPA atualizado com sucesso'}, status=status.HTTP_200_OK)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao atualizar RPA: {e}")
            return Response({'error': f'Erro ao atualizar RPA: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um RPA."""
        try:
            rpa = RoboDockerizado.objects.get(nome=pk, tipo='rpa')
            rpa.delete()
            
            return Response({'message': 'RPA deletado com sucesso'}, status=status.HTTP_200_OK)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao deletar RPA: {e}")
            return Response({'error': f'Erro ao deletar RPA: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def standby(self, request, pk=None):
        """Move RPA para standby e finaliza jobs."""
        try:
            rpa = RoboDockerizado.objects.get(nome=pk, tipo='rpa')
            
            # Deletar jobs ativos
            jobs_deletados = 0
            jobs = self.job_service.list()
            for job in jobs:
                nome_norm = job.labels.get('nome_robo', '').lower().replace('-', '').replace('_', '')
                pk_norm = pk.lower().replace('-', '').replace('_', '')
                if nome_norm == pk_norm:
                    if self.job_service.delete(job.name, job.namespace):
                        jobs_deletados += 1
                        logger.info(f"Job {job.name} deletado (RPA {pk} em standby)")
            
            # Atualizar banco
            rpa.status = 'standby'
            rpa.ativo = False
            rpa.inativado_em = timezone.now()
            rpa.save()
            
            return Response({
                'message': f'RPA movido para standby. {jobs_deletados} instância(s) finalizada(s).',
                'jobs_deletados': jobs_deletados
            }, status=status.HTTP_200_OK)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao mover RPA para standby: {e}")
            return Response({'error': f'Erro: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Ativa um RPA do standby."""
        try:
            rpa = RoboDockerizado.objects.get(nome=pk, tipo='rpa')
            rpa.status = 'active'
            rpa.ativo = True
            rpa.inativado_em = None
            rpa.save()
            
            return Response({'message': 'RPA ativado com sucesso'}, status=status.HTTP_200_OK)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao ativar RPA: {e}")
            return Response({'error': f'Erro: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
