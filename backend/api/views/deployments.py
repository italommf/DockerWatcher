from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.cache_service import CacheKeys, CacheService
from backend.services.service_manager import get_kubernetes_service
from api.serializers.models import DeploymentSerializer, CreateDeploymentSerializer
from api.models import RoboDockerizado
from django.utils import timezone
import yaml
import logging

logger = logging.getLogger(__name__)

class DeploymentViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar deployments (armazenados no banco de dados)."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Usar serviços singleton para evitar reconexões constantes
        self.k8s_service = get_kubernetes_service()
    
    def list(self, request):
        """Lista todos os deployments do banco de dados."""
        try:
            # Buscar deployments do banco
            deployments_db = RoboDockerizado.objects.filter(tipo='deployment', ativo=True)
            
            # Buscar execuções do cache
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            
            deployments_list = []
            for dep in deployments_db:
                dep_data = dep.to_dict()
                
                # Buscar execuções se for dependente
                execucoes_pendentes = 0
                if dep.dependente_de_execucoes:
                    execucoes_pendentes = self._buscar_execucoes_por_nome(dep.nome, execucoes_por_robo)
                
                dep_data['execucoes_pendentes'] = execucoes_pendentes
                deployments_list.append(dep_data)
            
            serializer = DeploymentSerializer(deployments_list, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar deployments: {e}", exc_info=True)
            return Response({'error': f'Erro ao listar deployments: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um deployment específico."""
        try:
            dep = RoboDockerizado.objects.get(nome=pk, tipo='deployment')
            dep_data = dep.to_dict()
            
            # Buscar execuções
            exec_cache = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            execucoes_pendentes = 0
            if dep.dependente_de_execucoes:
                execucoes_pendentes = self._buscar_execucoes_por_nome(pk, exec_cache)
            
            dep_data['execucoes_pendentes'] = execucoes_pendentes
            
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
        
        # Adicionar tag padrão
        if not isinstance(tags, list):
            tags = []
        if '24/7' not in tags:
            tags.append('24/7')
        
        try:
            # Salvar no banco de dados
            deployment = RoboDockerizado.objects.create(
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
            
            # Gerar YAML dinamicamente (sem salvar em arquivo)
            yaml_content = f"""apiVersion: apps/v1
kind: Deployment
metadata:
  name: {nome}
spec:
  replicas: {replicas}
  selector:
    matchLabels:
      app: {nome}
  template:
    metadata:
      labels:
        app: {nome}
    spec:
      restartPolicy: Always
      imagePullSecrets:
        - name: docker-hub-secret
      containers:
        - name: rpa
          image: {docker_image}
          imagePullPolicy: Always
          env:
            - name: NOME_ROBO
              value: "{nome_robo}"
          resources:
            limits:
              memory: "{memory_limit}"
"""
            
            # Aplicar YAML diretamente via stdin (sem salvar arquivo)
            yaml_dict = yaml.safe_load(yaml_content)
            yaml_formatted = yaml.dump(yaml_dict, default_flow_style=False)
            
            cmd = f"kubectl create -f - <<EOF\n{yaml_formatted}\nEOF"
            return_code, stdout, stderr = self.k8s_service.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao criar deployment: {stderr}")
                deployment.delete()  # Reverter criação no banco
                return Response(
                    {'error': f'Erro ao criar deployment no Kubernetes: {stderr}'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Invalidar cache
            CacheService.update(CacheKeys.DEPLOYMENTS_PROCESSED, None)
            CacheService.update(CacheKeys.DEPLOYMENTS, None)
            
            return Response({'message': 'Deployment criado com sucesso'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Erro ao criar deployment: {e}")
            return Response({'error': f'Erro ao criar deployment: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um deployment do banco e Kubernetes."""
        try:
            # Deletar do Kubernetes
            success = self.k8s_service.delete_deployment(pk)
            
            if success:
                # Deletar do banco
                try:
                    deployment = RoboDockerizado.objects.get(nome=pk, tipo='deployment')
                    deployment.ativo = False
                    deployment.inativado_em = timezone.now()
                    deployment.save()
                except RoboDockerizado.DoesNotExist:
                    pass
                
                # Invalidar cache
                CacheService.update(CacheKeys.DEPLOYMENTS_PROCESSED, None)
                CacheService.update(CacheKeys.DEPLOYMENTS, None)
                
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
            
            # Deletar deployment do Kubernetes
            success = self.k8s_service.delete_deployment(pk)
            
            # Atualizar banco
            deployment.status = 'standby'
            deployment.ativo = False
            deployment.inativado_em = timezone.now()
            deployment.save()
            
            # Invalidar cache
            CacheService.update(CacheKeys.DEPLOYMENTS_PROCESSED, None)
            CacheService.update(CacheKeys.DEPLOYMENTS, None)
            
            if success:
                return Response({
                    'message': f'Deployment movido para standby e removido do Kubernetes.',
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'message': f'Deployment movido para standby no banco, mas falhou ao remover do Kubernetes.',
                }, status=status.HTTP_200_OK)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'Deployment não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao mover deployment para standby: {e}")
            return Response({'error': f'Erro ao mover deployment para standby: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Ativa deployment do standby (reaplica no Kubernetes)."""
        try:
            deployment = RoboDockerizado.objects.get(nome=pk, tipo='deployment')
            
            # Recriar deployment no Kubernetes com dados do banco
            docker_image = f"{deployment.docker_repository}:{deployment.docker_tag}" if deployment.docker_repository else deployment.docker_tag
            
            yaml_content = f"""apiVersion: apps/v1
kind: Deployment
metadata:
  name: {deployment.nome}
spec:
  replicas: {deployment.replicas}
  selector:
    matchLabels:
      app: {deployment.nome}
  template:
    metadata:
      labels:
        app: {deployment.nome}
    spec:
      restartPolicy: Always
      imagePullSecrets:
        - name: docker-hub-secret
      containers:
        - name: rpa
          image: {docker_image}
          imagePullPolicy: Always
          resources:
            limits:
              memory: "{deployment.memory_limit}"
"""
            
            # Aplicar YAML via stdin
            import yaml as yaml_lib
            deployment_dict = yaml_lib.safe_load(yaml_content)
            yaml_formatted = yaml_lib.dump(deployment_dict, default_flow_style=False)
            
            cmd = f"kubectl create -f - <<EOF\n{yaml_formatted}\nEOF"
            return_code, stdout, stderr = self.k8s_service.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao recriar deployment: {stderr}")
                return Response(
                    {'error': f'Erro ao recriar deployment no Kubernetes: {stderr}'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Atualizar banco
            deployment.status = 'active'
            deployment.ativo = True
            deployment.inativado_em = None
            deployment.save()
            
            # Invalidar cache
            CacheService.update(CacheKeys.DEPLOYMENTS_PROCESSED, None)
            CacheService.update(CacheKeys.DEPLOYMENTS, None)
            
            return Response({'message': 'Deployment ativado e reaplicado no Kubernetes com sucesso'}, status=status.HTTP_200_OK)
        except RoboDockerizado.DoesNotExist:
            return Response({'error': 'Deployment não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao ativar deployment: {e}")
            return Response({'error': f'Erro ao ativar deployment: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
