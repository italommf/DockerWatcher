from rest_framework import viewsets, status
from rest_framework.response import Response
from backend.services.file_service import FileService
from backend.services.kubernetes_service import KubernetesService
from api.serializers.models import DeploymentSerializer, CreateDeploymentSerializer
import yaml
import logging

logger = logging.getLogger(__name__)

class DeploymentViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar deployments."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.file_service = FileService()
        self.k8s_service = KubernetesService()
    
    def list(self, request):
        """Lista todos os deployments."""
        deployments = self.k8s_service.get_deployments()
        
        serializer = DeploymentSerializer(deployments, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um deployment específico."""
        deployments = self.k8s_service.get_deployments()
        deployment = next((d for d in deployments if d['name'] == pk), None)
        
        if not deployment:
            return Response({'error': 'Deployment não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = DeploymentSerializer(deployment)
        return Response(serializer.data)
    
    def create(self, request):
        """Cria um novo deployment."""
        serializer = CreateDeploymentSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        dados = serializer.validated_data
        nome = dados['name']
        yaml_content = dados['yaml_content']
        
        # Salvar YAML no servidor remoto
        try:
            deployment_data = yaml.safe_load(yaml_content)
            success = self.file_service.escrever_yaml_deployment(nome, deployment_data)
            
            if not success:
                return Response({'error': 'Erro ao salvar arquivo YAML'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Aplicar via kubectl
            from backend.config.ssh_config import get_paths_config
            paths = get_paths_config()
            deployments_path = paths['deployments_path']
            yaml_path = f"{deployments_path}/deployment_{nome}.yaml"
            success = self.k8s_service.apply_deployment(yaml_path)
            
            if success:
                return Response({'message': 'Deployment criado com sucesso'}, status=status.HTTP_201_CREATED)
            else:
                return Response({'error': 'Erro ao aplicar deployment no Kubernetes'}, 
                              status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao criar deployment: {e}")
            return Response({'error': f'Erro ao criar deployment: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def update(self, request, pk=None):
        """Atualiza um deployment existente."""
        yaml_content = request.data.get('yaml_content')
        
        if not yaml_content:
            return Response({'error': 'yaml_content é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            deployment_data = yaml.safe_load(yaml_content)
            success = self.file_service.escrever_yaml_deployment(pk, deployment_data)
            
            if not success:
                return Response({'error': 'Erro ao salvar arquivo YAML'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Aplicar via kubectl
            deployments_path = self.file_service.paths['deployments_path']
            yaml_path = f"{deployments_path}/deployment_{pk}.yaml"
            success = self.k8s_service.apply_deployment(yaml_path)
            
            if success:
                return Response({'message': 'Deployment atualizado com sucesso'}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'Erro ao aplicar deployment no Kubernetes'}, 
                              status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao atualizar deployment: {e}")
            return Response({'error': f'Erro ao atualizar deployment: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um deployment."""
        success = self.k8s_service.delete_deployment(pk)
        
        if success:
            # Tentar deletar arquivo YAML também
            try:
                from backend.config.ssh_config import get_paths_config
                paths = get_paths_config()
                self.file_service.ssh_service.execute_command(
                    f"rm {paths['deployments_path']}/deployment_{pk}.yaml"
                )
            except:
                pass  # Não é crítico se o arquivo não existir
            
            return Response({'message': 'Deployment deletado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao deletar deployment'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

