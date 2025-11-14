from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.file_service import FileService
from backend.services.kubernetes_service import KubernetesService
from api.serializers.models import CronjobSerializer, CreateCronjobSerializer
import yaml
import logging

logger = logging.getLogger(__name__)

class CronjobViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar cronjobs."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.file_service = FileService()
        self.k8s_service = KubernetesService()
    
    def list(self, request):
        """Lista todos os cronjobs."""
        cronjobs = []
        
        # Cronjobs do Kubernetes
        k8s_cronjobs = self.k8s_service.get_cronjobs()
        for cj in k8s_cronjobs:
            cronjobs.append(cj)
        
        serializer = CronjobSerializer(cronjobs, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um cronjob específico."""
        cronjobs = self.k8s_service.get_cronjobs()
        cronjob = next((c for c in cronjobs if c['name'] == pk), None)
        
        if not cronjob:
            return Response({'error': 'Cronjob não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = CronjobSerializer(cronjob)
        return Response(serializer.data)
    
    def create(self, request):
        """Cria um novo cronjob."""
        serializer = CreateCronjobSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        dados = serializer.validated_data
        nome = dados['name']
        yaml_content = dados['yaml_content']
        
        # Salvar YAML no servidor remoto
        try:
            cronjob_data = yaml.safe_load(yaml_content)
            success = self.file_service.escrever_yaml_cronjob(nome, cronjob_data, standby=False)
            
            if not success:
                return Response({'error': 'Erro ao salvar arquivo YAML'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Aplicar via kubectl
            from backend.config.ssh_config import get_paths_config
            paths = get_paths_config()
            cronjobs_path = paths['cronjobs_path']
            yaml_path = f"{cronjobs_path}/cronjob_{nome}.yaml"
            success = self.k8s_service.apply_cronjob(yaml_path)
            
            if success:
                return Response({'message': 'Cronjob criado com sucesso'}, status=status.HTTP_201_CREATED)
            else:
                return Response({'error': 'Erro ao aplicar cronjob no Kubernetes'}, 
                              status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao criar cronjob: {e}")
            return Response({'error': f'Erro ao criar cronjob: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um cronjob."""
        # Deletar do Kubernetes
        success = self.k8s_service.delete_cronjob(pk)
        
        if success:
            # Tentar deletar arquivo YAML também
            try:
                from backend.config.ssh_config import get_paths_config
                paths = get_paths_config()
                self.file_service.ssh_service.execute_command(
                    f"rm {paths['cronjobs_path']}/cronjob_{pk}.yaml"
                )
            except:
                pass  # Não é crítico se o arquivo não existir
            
            return Response({'message': 'Cronjob deletado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao deletar cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
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
        """Suspende um cronjob."""
        success = self.k8s_service.suspend_cronjob(pk)
        
        if success:
            return Response({'message': 'Cronjob suspenso com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao suspender cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Reativa um cronjob."""
        success = self.k8s_service.unsuspend_cronjob(pk)
        
        if success:
            return Response({'message': 'Cronjob reativado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao reativar cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

