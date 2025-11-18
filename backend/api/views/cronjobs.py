from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.service_manager import (
    get_kubernetes_service,
    get_database_service
)
from api.serializers.models import CronjobSerializer, CreateCronjobSerializer
from api.models import Cronjob
import yaml
import logging
import re

logger = logging.getLogger(__name__)

class CronjobViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar cronjobs (armazenados no banco de dados)."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Usar serviços singleton para evitar reconexões constantes
        self.k8s_service = get_kubernetes_service()
        self.db_service = get_database_service()
    
    def list(self, request):
        """Lista todos os cronjobs do banco de dados e Kubernetes."""
        try:
            cronjobs = []
            
            # Buscar cronjobs do banco de dados
            try:
                db_cronjobs = {cj.name: cj for cj in Cronjob.objects.all()}
            except Exception as e:
                logger.error(f"Erro ao buscar cronjobs do banco: {e}")
                db_cronjobs = {}
            
            # Buscar cronjobs do Kubernetes
            try:
                k8s_cronjobs = self.k8s_service.get_cronjobs()
            except Exception as e:
                logger.error(f"Erro ao buscar cronjobs do Kubernetes: {e}")
                k8s_cronjobs = []
            
            # Coletar nomes de cronjobs que são dependentes de execuções
            nomes_para_buscar_execucoes = []
            for cj in k8s_cronjobs:
                try:
                    nome = cj.get('name', '')
                    if not nome:
                        continue
                    db_cj = db_cronjobs.get(nome)
                    if db_cj and getattr(db_cj, 'dependente_de_execucoes', True):
                        # Extrair nome do RPA do nome do cronjob (remover prefixo e sufixos)
                        # Exemplo: rpa-cronjob-painel-de-processos-acessorias -> painel-de-processos-acessorias
                        nome_rpa = nome.replace('rpa-cronjob-', '').replace('-cronjob', '')
                        # Remover hash no final se existir (ex: -29387700)
                        nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                        if nome_rpa:
                            nomes_para_buscar_execucoes.append(nome_rpa)
                except Exception as e:
                    logger.warning(f"Erro ao processar cronjob {cj.get('name', 'unknown')}: {e}")
                    continue
            
            # Buscar execuções em lote
            execucoes_por_robo = {}
            if nomes_para_buscar_execucoes:
                try:
                    execucoes_por_robo = self.db_service.obter_execucoes(nomes_para_buscar_execucoes)
                except Exception as e:
                    logger.warning(f"Erro ao buscar execuções para cronjobs: {e}")
            
            for cj in k8s_cronjobs:
                try:
                    nome = cj.get('name', '')
                    if not nome:
                        continue
                    
                    # Buscar no banco de dados
                    db_cj = db_cronjobs.get(nome)
                    
                    if db_cj:
                        # Usar dados do banco
                        apelido = db_cj.apelido or ''
                        tags = db_cj.tags or []
                        # Usar getattr para evitar erro se o campo não existir (migração não aplicada)
                        dependente_de_execucoes = getattr(db_cj, 'dependente_de_execucoes', True)
                        if not isinstance(tags, list):
                            tags = []
                    else:
                        # Se não existe no banco, usar valores padrão
                        apelido = ''
                        tags = []
                        dependente_de_execucoes = True  # Padrão True para compatibilidade
                    
                    # Adicionar tag automática "Agendado" se não existir
                    if 'Agendado' not in tags:
                        tags.append('Agendado')
                    
                    # Buscar execuções se for dependente
                    execucoes_pendentes = 0
                    if dependente_de_execucoes:
                        try:
                            # Extrair nome do RPA do nome do cronjob
                            nome_rpa = nome.replace('rpa-cronjob-', '').replace('-cronjob', '')
                            nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                            # Tentar buscar execuções
                            execucoes = execucoes_por_robo.get(nome_rpa, [])
                            # Também tentar com variações do nome
                            if not execucoes:
                                for nome_db, execs in execucoes_por_robo.items():
                                    nome_rpa_normalizado = nome_rpa.replace('-', '').replace('_', '').lower()
                                    nome_db_normalizado = nome_db.replace('-', '').replace('_', '').lower()
                                    if nome_rpa_normalizado == nome_db_normalizado:
                                        execucoes = execs
                                        break
                            execucoes_pendentes = len(execucoes)
                        except Exception as e:
                            logger.warning(f"Erro ao buscar execuções para cronjob {nome}: {e}")
                            execucoes_pendentes = 0
                    
                    cj['apelido'] = apelido
                    cj['tags'] = tags
                    cj['dependente_de_execucoes'] = dependente_de_execucoes
                    cj['execucoes_pendentes'] = execucoes_pendentes
                    cronjobs.append(cj)
                except Exception as e:
                    logger.error(f"Erro ao processar cronjob: {e}")
                    continue
            
            serializer = CronjobSerializer(cronjobs, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar cronjobs: {e}", exc_info=True)
            return Response({'error': f'Erro ao listar cronjobs: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um cronjob específico."""
        cronjobs = self.k8s_service.get_cronjobs()
        cronjob = next((c for c in cronjobs if c['name'] == pk), None)
        
        if not cronjob:
            return Response({'error': 'Cronjob não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        # Buscar no banco de dados
        try:
            db_cj = Cronjob.objects.get(name=pk)
            apelido = db_cj.apelido or ''
            tags = db_cj.tags or []
            # Usar getattr para evitar erro se o campo não existir (migração não aplicada)
            dependente_de_execucoes = getattr(db_cj, 'dependente_de_execucoes', True)
            if not isinstance(tags, list):
                tags = []
        except Cronjob.DoesNotExist:
            apelido = ''
            tags = []
            dependente_de_execucoes = True  # Padrão True para compatibilidade
        
        # Adicionar tag automática "Agendado" se não existir
        if 'Agendado' not in tags:
            tags.append('Agendado')
        
        # Buscar execuções se for dependente
        execucoes_pendentes = 0
        if dependente_de_execucoes:
            try:
                # Extrair nome do RPA do nome do cronjob
                nome_rpa = pk.replace('rpa-cronjob-', '').replace('-cronjob', '')
                nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                execucoes = self.db_service.obter_execucoes_por_rpa(nome_rpa)
                execucoes_pendentes = len(execucoes)
            except Exception as e:
                logger.warning(f"Erro ao buscar execuções para cronjob {pk}: {e}")
        
        cronjob['apelido'] = apelido
        cronjob['tags'] = tags
        cronjob['dependente_de_execucoes'] = dependente_de_execucoes
        cronjob['execucoes_pendentes'] = execucoes_pendentes
        
        serializer = CronjobSerializer(cronjob)
        return Response(serializer.data)
    
    def create(self, request):
        """Cria um novo cronjob no banco de dados e Kubernetes."""
        serializer = CreateCronjobSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        dados = serializer.validated_data
        nome = dados['name']
        schedule = dados['schedule']
        timezone = dados.get('timezone', 'America/Sao_Paulo')
        nome_robo = dados['nome_robo']
        docker_image = dados['docker_image']
        memory_limit = dados.get('memory_limit', '256Mi')
        ttl_seconds = dados.get('ttl_seconds_after_finished', 60)
        apelido = dados.get('apelido', '')
        tags = dados.get('tags', []) or []
        dependente_de_execucoes = dados.get('dependente_de_execucoes', True)
        
        # Adicionar tag automática "Agendado" se não existir
        if not isinstance(tags, list):
            tags = []
        if 'Agendado' not in tags:
            tags.append('Agendado')
        
        try:
            # Montar YAML do Cronjob
            yaml_content = f"""apiVersion: batch/v1
kind: CronJob
metadata:
  name: {nome}
spec:
  schedule: "{schedule}"
  timeZone: "{timezone}"
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
              imagePullPolicy: Always
              env:
                - name: NOME_ROBO
                  value: "{nome_robo}"
              resources:
                limits:
                  memory: "{memory_limit}"
          restartPolicy: Never
"""
            
            # Salvar no banco de dados
            # Verificar se o campo dependente_de_execucoes existe no modelo
            create_kwargs = {
                'name': nome,
                'namespace': 'default',
                'schedule': schedule,
                'yaml_content': yaml_content,
                'suspended': False,
                'apelido': apelido,
                'tags': tags
            }
            # Só adicionar dependente_de_execucoes se o campo existir no modelo
            if hasattr(Cronjob, 'dependente_de_execucoes'):
                create_kwargs['dependente_de_execucoes'] = dependente_de_execucoes
            
            cronjob = Cronjob.objects.create(**create_kwargs)
            
            # Aplicar via kubectl usando o YAML diretamente
            # Criar arquivo temporário no servidor remoto
            from backend.services.service_manager import get_file_service
            file_service = get_file_service()
            from backend.config.ssh_config import get_paths_config
            paths = get_paths_config()
            cronjobs_path = paths.get('cronjobs_path', '/tmp')
            yaml_path = f"{cronjobs_path}/cronjob_{nome}.yaml"
            
            # Escrever YAML temporário
            file_service.ssh_service.put_file(None, yaml_path, content=yaml_content.encode('utf-8'))
            success = True
            
            if success:
                # Aplicar no Kubernetes
                success = self.k8s_service.apply_cronjob(yaml_path)
                
                if success:
                    return Response({'message': 'Cronjob criado com sucesso'}, status=status.HTTP_201_CREATED)
                else:
                    # Se falhar ao aplicar, deletar do banco
                    cronjob.delete()
                    return Response({'error': 'Erro ao aplicar cronjob no Kubernetes'}, 
                                  status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                # Se falhar ao escrever arquivo, deletar do banco
                cronjob.delete()
                return Response({'error': 'Erro ao salvar arquivo YAML'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao criar cronjob: {e}")
            return Response({'error': f'Erro ao criar cronjob: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um cronjob do banco de dados e Kubernetes."""
        try:
            # Deletar do Kubernetes primeiro
            success = self.k8s_service.delete_cronjob(pk)
            
            if success:
                # Deletar do banco de dados
                try:
                    cronjob = Cronjob.objects.get(name=pk)
                    cronjob.delete()
                except Cronjob.DoesNotExist:
                    pass  # Já foi deletado ou não existe
                
                # Tentar deletar arquivo YAML também (se existir)
                try:
                    from backend.services.service_manager import get_file_service
                    file_service = get_file_service()
                    from backend.config.ssh_config import get_paths_config
                    paths = get_paths_config()
                    file_service.ssh_service.execute_command(
                        f"rm -f {paths.get('cronjobs_path', '/tmp')}/cronjob_{pk}.yaml"
                    )
                except:
                    pass  # Não é crítico se o arquivo não existir
                
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

