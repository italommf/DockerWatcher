from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.service_manager import (
    get_kubernetes_service,
    get_database_service
)
from api.serializers.models import (
    RPASerializer, CreateRPASerializer, UpdateRPASerializer
)
from api.models import RPA
import logging

logger = logging.getLogger(__name__)

class RPAViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar RPAs (armazenados no banco de dados)."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Usar serviços singleton para evitar reconexões constantes
        self.k8s_service = get_kubernetes_service()
        self.db_service = get_database_service()
    
    def list(self, request):
        """Lista todos os RPAs (ativos e standby) do banco de dados."""
        # Buscar RPAs do banco de dados
        rpas_queryset = RPA.objects.all()
        
        # Coletar todos os nomes de RPA
        nomes_rpas = list(rpas_queryset.values_list('nome_rpa', flat=True))
        
        # Buscar todas as execuções de uma vez (otimização)
        execucoes_por_robo = {}
        if nomes_rpas:
            try:
                execucoes_por_robo = self.db_service.obter_execucoes(nomes_rpas)
            except Exception as e:
                logger.warning(f"Erro ao obter execuções: {e}")
        
        # Buscar todos os jobs de uma vez (otimização)
        jobs_por_rpa = {}
        try:
            all_jobs = self.k8s_service.get_jobs()
            for job in all_jobs:
                labels = job.get('labels', {})
                nome_robo = (labels.get('nome_robo') or 
                            labels.get('nome-robo') or 
                            labels.get('app') or '').lower()
                if nome_robo:
                    if nome_robo not in jobs_por_rpa:
                        jobs_por_rpa[nome_robo] = 0
                    # Contar apenas jobs com pods ativos
                    if job.get('active', 0) > 0:
                        jobs_por_rpa[nome_robo] += job.get('active', 0)
        except Exception as e:
            logger.warning(f"Erro ao obter jobs: {e}")
        
        # Processar RPAs do banco
        rpas = []
        for rpa_obj in rpas_queryset:
            rpa_data = rpa_obj.to_dict()
            
            # Obter execuções pendentes (já buscadas)
            execucoes_pendentes = len(execucoes_por_robo.get(rpa_obj.nome_rpa, []))
            
            # Obter jobs ativos (já buscados)
            jobs_ativos = jobs_por_rpa.get(rpa_obj.nome_rpa.lower(), 0)
            
            # Garantir que tags tenha "Exec"
            tags = rpa_data.get('tags', [])
            if not isinstance(tags, list):
                tags = []
            if 'Exec' not in tags:
                tags.append('Exec')
            
            rpa_data['execucoes_pendentes'] = execucoes_pendentes
            rpa_data['jobs_ativos'] = jobs_ativos
            rpa_data['tags'] = tags
            rpas.append(rpa_data)
        
        serializer = RPASerializer(rpas, many=True)
        return Response(serializer.data)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um RPA específico do banco de dados."""
        try:
            rpa_obj = RPA.objects.get(nome_rpa=pk)
            rpa_data = rpa_obj.to_dict()
            
            # Obter informações adicionais
            execucoes_pendentes = len(self.db_service.obter_execucoes_por_rpa(pk))
            jobs_ativos = self.k8s_service.count_active_jobs(pk.lower())
            
            # Garantir que tags tenha "Exec"
            tags = rpa_data.get('tags', [])
            if not isinstance(tags, list):
                tags = []
            if 'Exec' not in tags:
                tags.append('Exec')
            
            rpa_data['execucoes_pendentes'] = execucoes_pendentes
            rpa_data['jobs_ativos'] = jobs_ativos
            rpa_data['tags'] = tags
            
            serializer = RPASerializer(rpa_data)
            return Response(serializer.data)
        except RPA.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
    
    def create(self, request):
        """Cria um novo RPA no banco de dados."""
        serializer = CreateRPASerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        dados = serializer.validated_data.copy()
        
        # Garantir que tags tenha a tag automática "Exec"
        tags = dados.get('tags', []) or []
        if not isinstance(tags, list):
            tags = []
        if 'Exec' not in tags:
            tags.append('Exec')
        
        try:
            # Criar RPA no banco de dados
            rpa = RPA.objects.create(
                nome_rpa=dados['nome_rpa'],
                docker_tag=dados['docker_tag'],
                qtd_max_instancias=dados['qtd_max_instancias'],
                qtd_ram_maxima=dados['qtd_ram_maxima'],
                utiliza_arquivos_externos=dados.get('utiliza_arquivos_externos', False),
                tempo_maximo_de_vida=dados.get('tempo_maximo_de_vida', 600),
                status='active',
                apelido=dados.get('apelido', ''),
                tags=tags
            )
            
            # Verificar imediatamente se há execuções pendentes para este RPA e criar jobs
            try:
                execucoes = self.db_service.obter_execucoes([rpa.nome_rpa])
                execucoes_do_rpa = execucoes.get(rpa.nome_rpa, [])
                
                if execucoes_do_rpa and len(execucoes_do_rpa) > 0:
                    logger.info(f"RPA {rpa.nome_rpa} criado com {len(execucoes_do_rpa)} execuções pendentes. Criando jobs...")
                    
                    # Criar jobs imediatamente
                    self.k8s_service.create_job(
                        nome_rpa=rpa.nome_rpa,
                        docker_tag=rpa.docker_tag,
                        qtd_ram_maxima=rpa.qtd_ram_maxima,
                        qtd_max_instancias=rpa.qtd_max_instancias,
                        utiliza_arquivos_externos=rpa.utiliza_arquivos_externos,
                        tempo_maximo_de_vida=rpa.tempo_maximo_de_vida
                    )
                    logger.info(f"Job criado com sucesso para RPA {rpa.nome_rpa}")
            except Exception as e:
                # Não falhar a criação do RPA se houver erro ao verificar/criar jobs
                logger.warning(f"Erro ao verificar/criar jobs para RPA recém-criado {rpa.nome_rpa}: {e}")
            
            return Response({'message': 'RPA criado com sucesso'}, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f"Erro ao criar RPA: {e}")
            return Response({'error': f'Erro ao criar RPA: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def update(self, request, pk=None):
        """Atualiza um RPA existente no banco de dados."""
        serializer = UpdateRPASerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            rpa = RPA.objects.get(nome_rpa=pk)
            dados = serializer.validated_data
            
            # Atualizar campos permitidos
            if 'docker_tag' in dados:
                rpa.docker_tag = dados['docker_tag']
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
        except RPA.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao atualizar RPA: {e}")
            return Response({'error': f'Erro ao atualizar RPA: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um RPA do banco de dados."""
        try:
            rpa = RPA.objects.get(nome_rpa=pk)
            rpa.delete()
            return Response({'message': 'RPA deletado com sucesso'}, status=status.HTTP_200_OK)
        except RPA.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao deletar RPA: {e}")
            return Response({'error': f'Erro ao deletar RPA: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def standby(self, request, pk=None):
        """Move um RPA para standby (atualiza status no banco)."""
        try:
            rpa = RPA.objects.get(nome_rpa=pk)
            rpa.status = 'standby'
            rpa.save()
            return Response({'message': 'RPA movido para standby com sucesso'}, status=status.HTTP_200_OK)
        except RPA.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao mover RPA para standby: {e}")
            return Response({'error': f'Erro ao mover RPA para standby: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Ativa um RPA do standby (atualiza status no banco)."""
        try:
            rpa = RPA.objects.get(nome_rpa=pk)
            rpa.status = 'active'
            rpa.save()
            return Response({'message': 'RPA ativado com sucesso'}, status=status.HTTP_200_OK)
        except RPA.DoesNotExist:
            return Response({'error': 'RPA não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Erro ao ativar RPA: {e}")
            return Response({'error': f'Erro ao ativar RPA: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

