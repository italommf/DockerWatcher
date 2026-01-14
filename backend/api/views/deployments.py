"""
ViewSet para gerenciar Deployments.
Refatorado para usar módulo k8s/ nativo.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from api.serializers.models import DeploymentSerializer, CreateDeploymentSerializer
from api.models import RoboDockerizado
from django.utils import timezone
import logging

from k8s.deployments import DeploymentService

logger = logging.getLogger(__name__)


class DeploymentViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar deployments."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.deployment_service = DeploymentService()
    
    def list(self, request):
        """Lista todos os deployments do banco de dados."""
        try:
            deployments_db = RoboDockerizado.objects.filter(tipo='deployment', ativo=True)
            
            deployments_list = []
            for dep in deployments_db:
                dep_data = dep.to_dict()
                dep_data['execucoes_pendentes'] = 0  # Será implementado com API MongoDB
                deployments_list.append(dep_data)
            
            serializer = DeploymentSerializer(deployments_list, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar deployments: {e}", exc_info=True)
            return Response({'error': f'Erro ao listar deployments: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def kubernetes(self, request):
        """Lista deployments ATIVOS no Kubernetes (tempo real)."""
        try:
            k8s_deployments = self.deployment_service.list()
            
            deployments_list = [dep.to_dict() for dep in k8s_deployments]
            
            serializer = DeploymentSerializer(deployments_list, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar deployments do Kubernetes: {e}", exc_info=True)
            return Response({'error': f'Erro ao listar deployments: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um deployment específico."""
        try:
            dep = RoboDockerizado.objects.get(nome=pk, tipo='deployment')
            dep_data = dep.to_dict()
            dep_data['execucoes_pendentes'] = 0
            
            serializer = DeploymentSerializer(dep_data)
            return Response(serializer.data)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'Deployment não encontrado'}, status=status.HTTP_404_NOT_FOUND)
    
    def create(self, request):
        """Cria um novo deployment no banco e Kubernetes."""
        serializer = CreateDeploymentSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        dados = serializer.validated_data
        nome = dados['name']
        replicas = dados.get('replicas', 1)
        nome_robo = dados['nome_robo']
        docker_image = dados['docker_image']
        memory_limit = dados.get('memory_limit', '256Mi')
        apelido = dados.get('apelido', '')
        tags = dados.get('tags', []) or []
        dependente_de_execucoes = dados.get('dependente_de_execucoes', True)
        
        if not isinstance(tags, list):
            tags = []
        if '24/7' not in tags:
            tags.append('24/7')
        
        try:
            # Salvar no banco de dados
            deployment_db = RoboDockerizado.objects.create(
                nome=nome,
                tipo='deployment',
                docker_tag=docker_image.split(':')[-1] if ':' in docker_image else 'latest',
                docker_repository=docker_image.split(':')[0] if ':' in docker_image else docker_image,
                replicas=replicas,
                memory_limit=memory_limit,
                ativo=True,
                apelido=apelido,
                tags=tags,
                dependente_de_execucoes=dependente_de_execucoes
            )
            
            # Criar no Kubernetes via API nativa
            result = self.deployment_service.create(
                name=nome,
                image=docker_image,
                replicas=replicas,
                memory_limit=memory_limit,
                labels={'app': nome, 'nome_robo': nome_robo.lower()},
                env={'NOME_ROBO': nome_robo}
            )
            
            if not result:
                logger.error(f"Erro ao criar deployment no Kubernetes")
                deployment_db.delete()
                return Response(
                    {'error': 'Erro ao criar deployment no Kubernetes'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            return Response({'message': 'Deployment criado com sucesso'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Erro ao criar deployment: {e}")
            return Response({'error': f'Erro ao criar deployment: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um deployment do banco e Kubernetes."""
        try:
            success = self.deployment_service.delete(pk)
            
            if success:
                try:
                    deployment = RoboDockerizado.objects.get(nome=pk, tipo='deployment')
                    deployment.ativo = False
                    deployment.inativado_em = timezone.now()
                    deployment.save()
                except RoboDockerizado.DoesNotExist:
                    pass
                
                return Response({'message': 'Deployment deletado com sucesso'}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'Erro ao deletar deployment do Kubernetes'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao deletar deployment: {e}")
            return Response({'error': f'Erro ao deletar deployment: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def standby(self, request, pk=None):
        """Move deployment para standby e deleta do Kubernetes."""
        try:
            deployment = RoboDockerizado.objects.get(nome=pk, tipo='deployment')
            
            # Deletar deployment do Kubernetes via API nativa
            success = self.deployment_service.delete(pk)
            
            # Atualizar banco
            deployment.status = 'standby'
            deployment.ativo = False
            deployment.inativado_em = timezone.now()
            deployment.save()
            
            if success:
                return Response({
                    'message': 'Deployment movido para standby e removido do Kubernetes.',
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'message': 'Deployment movido para standby no banco, mas falhou ao remover do Kubernetes.',
                }, status=status.HTTP_200_OK)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'Deployment não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao mover deployment para standby: {e}")
            return Response({'error': f'Erro ao mover deployment para standby: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Ativa deployment do standby (recria no Kubernetes)."""
        try:
            deployment = RoboDockerizado.objects.get(nome=pk, tipo='deployment')
            
            # Recriar deployment via API nativa
            docker_image = f"{deployment.docker_repository}:{deployment.docker_tag}" if deployment.docker_repository else deployment.docker_tag
            
            result = self.deployment_service.create(
                name=deployment.nome,
                image=docker_image,
                replicas=deployment.replicas,
                memory_limit=deployment.memory_limit,
                labels={'app': deployment.nome}
            )
            
            if not result:
                return Response(
                    {'error': 'Erro ao recriar deployment no Kubernetes'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Atualizar banco
            deployment.status = 'active'
            deployment.ativo = True
            deployment.inativado_em = None
            deployment.save()
            
            return Response({'message': 'Deployment ativado e reaplicado no Kubernetes com sucesso'}, status=status.HTTP_200_OK)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'Deployment não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao ativar deployment: {e}")
            return Response({'error': f'Erro ao ativar deployment: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def scale(self, request, pk=None):
        """Escala um deployment."""
        replicas = request.data.get('replicas')
        
        if replicas is None:
            return Response({'error': 'Campo replicas é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            replicas = int(replicas)
        except ValueError:
            return Response({'error': 'replicas deve ser um número'}, status=status.HTTP_400_BAD_REQUEST)
        
        success = self.deployment_service.scale(pk, replicas)
        
        if success:
            # Atualizar banco
            try:
                deployment = RoboDockerizado.objects.get(nome=pk, tipo='deployment')
                deployment.replicas = replicas
                deployment.save()
            except RoboDockerizado.DoesNotExist:
                pass
            
            return Response({'message': f'Deployment escalado para {replicas} réplicas'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao escalar deployment'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
