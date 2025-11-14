from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.kubernetes_service import KubernetesService
from backend.services.database_service import DatabaseService
from backend.services.file_service import FileService
from api.serializers.models import JobSerializer, PodSerializer, PodLogsSerializer
import logging

logger = logging.getLogger(__name__)

class JobViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar jobs."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.k8s_service = KubernetesService()
        self.db_service = DatabaseService()
        self.file_service = FileService()
    
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
        """Obtém resumo de status dos jobs por RPA."""
        rpa_name = request.query_params.get('rpa_name', None)
        
        if rpa_name:
            label_selector = f"nome_robo={rpa_name.lower()}"
            pods = self.k8s_service.get_pods(label_selector)
        else:
            pods = self.k8s_service.get_pods()
        
        # Agrupar por RPA
        status_by_rpa = {}
        
        for pod in pods:
            nome_robo = pod.get('labels', {}).get('nome_robo', 'unknown')
            phase = pod.get('phase', 'Unknown')
            pod_status = pod.get('status', 'Unknown')
            
            if nome_robo not in status_by_rpa:
                status_by_rpa[nome_robo] = {
                    'running': 0,
                    'pending': 0,
                    'error': 0,
                    'failed': 0,
                    'succeeded': 0
                }
            
            if phase == 'Running' and pod_status == 'Running':
                status_by_rpa[nome_robo]['running'] += 1
            elif phase == 'Pending':
                status_by_rpa[nome_robo]['pending'] += 1
            elif pod_status in ['Error', 'CrashLoopBackOff']:
                status_by_rpa[nome_robo]['error'] += 1
            elif phase == 'Failed':
                status_by_rpa[nome_robo]['failed'] += 1
            elif phase == 'Succeeded':
                status_by_rpa[nome_robo]['succeeded'] += 1
        
        return Response(status_by_rpa)

