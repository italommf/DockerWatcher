from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.file_service import FileService
from backend.services.kubernetes_service import KubernetesService
from backend.services.database_service import DatabaseService
from api.serializers.models import (
    RPASerializer, CreateRPASerializer, UpdateRPASerializer
)
import logging

logger = logging.getLogger(__name__)

class RPAViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar RPAs."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.file_service = FileService()
        self.k8s_service = KubernetesService()
        self.db_service = DatabaseService()
    
    def list(self, request):
        """Lista todos os RPAs (ativos e standby)."""
        rpas = []
        
        # RPAs ativos
        lista_json_rpas = self.file_service.obter_json_rpas()
        for rpa_path in lista_json_rpas:
            rpa_data = self.file_service.ler_json_rpa(rpa_path)
            if rpa_data:
                nome_rpa = rpa_data.get('nome_rpa')
                if nome_rpa:
                    # Obter informações adicionais
                    execucoes_pendentes = len(self.db_service.obter_execucoes_por_rpa(nome_rpa))
                    jobs_ativos = self.k8s_service.count_active_jobs(nome_rpa.lower())
                    
                    rpa_data['status'] = 'active'
                    rpa_data['execucoes_pendentes'] = execucoes_pendentes
                    rpa_data['jobs_ativos'] = jobs_ativos
                    rpas.append(rpa_data)
        
        # RPAs em standby
        lista_json_rpas_standby = self.file_service.obter_json_rpas_standby()
        for rpa_path in lista_json_rpas_standby:
            rpa_data = self.file_service.ler_json_rpa(rpa_path)
            if rpa_data:
                nome_rpa = rpa_data.get('nome_rpa')
                if nome_rpa:
                    rpa_data['status'] = 'standby'
                    rpa_data['execucoes_pendentes'] = 0
                    rpa_data['jobs_ativos'] = 0
                    rpas.append(rpa_data)
        
        serializer = RPASerializer(rpas, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um RPA específico."""
        # Tentar encontrar no ativo
        lista_json_rpas = self.file_service.obter_json_rpas()
        for rpa_path in lista_json_rpas:
            rpa_data = self.file_service.ler_json_rpa(rpa_path)
            if rpa_data and rpa_data.get('nome_rpa') == pk:
                nome_rpa = rpa_data.get('nome_rpa')
                execucoes_pendentes = len(self.db_service.obter_execucoes_por_rpa(nome_rpa))
                jobs_ativos = self.k8s_service.count_active_jobs(nome_rpa.lower())
                
                rpa_data['status'] = 'active'
                rpa_data['execucoes_pendentes'] = execucoes_pendentes
                rpa_data['jobs_ativos'] = jobs_ativos
                
                serializer = RPASerializer(rpa_data)
                return Response(serializer.data)
        
        # Tentar encontrar no standby
        lista_json_rpas_standby = self.file_service.obter_json_rpas_standby()
        for rpa_path in lista_json_rpas_standby:
            rpa_data = self.file_service.ler_json_rpa(rpa_path)
            if rpa_data and rpa_data.get('nome_rpa') == pk:
                rpa_data['status'] = 'standby'
                rpa_data['execucoes_pendentes'] = 0
                rpa_data['jobs_ativos'] = 0
                
                serializer = RPASerializer(rpa_data)
                return Response(serializer.data)
        
        return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
    
    def create(self, request):
        """Cria um novo RPA."""
        serializer = CreateRPASerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        dados = serializer.validated_data
        success = self.file_service.escrever_json_rpa(
            nome_rpa=dados['nome_rpa'],
            dados=dados,
            standby=False
        )
        
        if success:
            return Response({'message': 'RPA criado com sucesso'}, status=status.HTTP_201_CREATED)
        else:
            return Response({'error': 'Erro ao criar RPA'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def update(self, request, pk=None):
        """Atualiza um RPA existente."""
        serializer = UpdateRPASerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # Obter dados atuais do RPA
        rpa_path = None
        lista_json_rpas = self.file_service.obter_json_rpas()
        for path in lista_json_rpas:
            rpa_data = self.file_service.ler_json_rpa(path)
            if rpa_data and rpa_data.get('nome_rpa') == pk:
                rpa_path = path
                break
        
        if not rpa_path:
            lista_json_rpas_standby = self.file_service.obter_json_rpas_standby()
            for path in lista_json_rpas_standby:
                rpa_data = self.file_service.ler_json_rpa(path)
                if rpa_data and rpa_data.get('nome_rpa') == pk:
                    rpa_path = path
                    break
        
        if not rpa_path:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        # Atualizar dados
        rpa_data = self.file_service.ler_json_rpa(rpa_path)
        rpa_data.update(serializer.validated_data)
        
        is_standby = 'standby' in rpa_path
        success = self.file_service.escrever_json_rpa(
            nome_rpa=pk,
            dados=rpa_data,
            standby=is_standby
        )
        
        if success:
            return Response({'message': 'RPA atualizado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao atualizar RPA'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um RPA."""
        success = self.file_service.deletar_rpa(pk)
        
        if success:
            return Response({'message': 'RPA deletado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao deletar RPA ou RPA não encontrado'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def standby(self, request, pk=None):
        """Move um RPA para standby."""
        success = self.file_service.mover_rpa_standby(pk)
        
        if success:
            return Response({'message': 'RPA movido para standby com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao mover RPA para standby'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Ativa um RPA do standby."""
        success = self.file_service.mover_rpa_ativar(pk)
        
        if success:
            return Response({'message': 'RPA ativado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao ativar RPA'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

