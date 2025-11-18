from rest_framework import viewsets, status
from rest_framework.response import Response
from backend.services.service_manager import (
    get_kubernetes_service,
    get_database_service
)
from api.serializers.models import DeploymentSerializer, CreateDeploymentSerializer
from api.models import Deployment
import yaml
import logging

logger = logging.getLogger(__name__)

class DeploymentViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar deployments (armazenados no banco de dados)."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Usar serviços singleton para evitar reconexões constantes
        self.k8s_service = get_kubernetes_service()
        self.db_service = get_database_service()
    
    def list(self, request):
        """Lista todos os deployments do banco de dados e Kubernetes."""
        try:
            # Buscar deployments do Kubernetes
            try:
                deployments = self.k8s_service.get_deployments()
            except Exception as e:
                logger.error(f"Erro ao buscar deployments do Kubernetes: {e}")
                deployments = []
            
            # Buscar deployments do banco de dados
            try:
                db_deployments = {dep.name: dep for dep in Deployment.objects.all()}
            except Exception as e:
                logger.error(f"Erro ao buscar deployments do banco: {e}")
                db_deployments = {}
            
            # Coletar nomes de deployments que são dependentes de execuções
            nomes_para_buscar_execucoes = []
            for dep in deployments:
                try:
                    nome = dep.get('name', '')
                    if not nome:
                        continue
                    db_dep = db_deployments.get(nome)
                    if db_dep and getattr(db_dep, 'dependente_de_execucoes', True):
                        # O nome do deployment pode ser o nome do RPA ou ter prefixo
                        # Tentar usar o nome diretamente ou extrair
                        nome_rpa = nome.replace('deployment-', '').replace('-deployment', '')
                        if nome_rpa:
                            nomes_para_buscar_execucoes.append(nome_rpa)
                except Exception as e:
                    logger.warning(f"Erro ao processar deployment {dep.get('name', 'unknown')}: {e}")
                    continue
            
            # Buscar execuções em lote
            execucoes_por_robo = {}
            if nomes_para_buscar_execucoes:
                try:
                    execucoes_por_robo = self.db_service.obter_execucoes(nomes_para_buscar_execucoes)
                except Exception as e:
                    logger.warning(f"Erro ao buscar execuções para deployments: {e}")
            
            for dep in deployments:
                try:
                    nome = dep.get('name', '')
                    if not nome:
                        continue
                    
                    # Buscar no banco de dados
                    db_dep = db_deployments.get(nome)
                    
                    if db_dep:
                        # Usar dados do banco
                        apelido = db_dep.apelido or ''
                        tags = db_dep.tags or []
                        # Usar getattr para evitar erro se o campo não existir (migração não aplicada)
                        dependente_de_execucoes = getattr(db_dep, 'dependente_de_execucoes', True)
                        if not isinstance(tags, list):
                            tags = []
                    else:
                        # Se não existe no banco, usar valores padrão
                        apelido = ''
                        tags = []
                        dependente_de_execucoes = True  # Padrão True para compatibilidade
                    
                    # Adicionar tag automática "24/7" se não existir
                    if '24/7' not in tags:
                        tags.append('24/7')
                    
                    # Buscar execuções se for dependente
                    execucoes_pendentes = 0
                    if dependente_de_execucoes:
                        try:
                            # Tentar usar o nome diretamente ou extrair
                            nome_rpa = nome.replace('deployment-', '').replace('-deployment', '')
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
                            logger.warning(f"Erro ao buscar execuções para deployment {nome}: {e}")
                            execucoes_pendentes = 0
                    
                    dep['apelido'] = apelido
                    dep['tags'] = tags
                    dep['dependente_de_execucoes'] = dependente_de_execucoes
                    dep['execucoes_pendentes'] = execucoes_pendentes
                except Exception as e:
                    logger.error(f"Erro ao processar deployment: {e}")
                    continue
            
            serializer = DeploymentSerializer(deployments, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Erro ao listar deployments: {e}", exc_info=True)
            return Response({'error': f'Erro ao listar deployments: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def retrieve(self, request, pk=None):
        """Obtém detalhes de um deployment específico."""
        deployments = self.k8s_service.get_deployments()
        deployment = next((d for d in deployments if d['name'] == pk), None)
        
        if not deployment:
            return Response({'error': 'Deployment não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        # Buscar no banco de dados
        try:
            db_dep = Deployment.objects.get(name=pk)
            apelido = db_dep.apelido or ''
            tags = db_dep.tags or []
            # Usar getattr para evitar erro se o campo não existir (migração não aplicada)
            dependente_de_execucoes = getattr(db_dep, 'dependente_de_execucoes', True)
            if not isinstance(tags, list):
                tags = []
        except Deployment.DoesNotExist:
            apelido = ''
            tags = []
            dependente_de_execucoes = True  # Padrão True para compatibilidade
        
        # Adicionar tag automática "24/7" se não existir
        if '24/7' not in tags:
            tags.append('24/7')
        
        # Buscar execuções se for dependente
        execucoes_pendentes = 0
        if dependente_de_execucoes:
            try:
                # Tentar usar o nome diretamente ou extrair
                nome_rpa = pk.replace('deployment-', '').replace('-deployment', '')
                execucoes = self.db_service.obter_execucoes_por_rpa(nome_rpa)
                execucoes_pendentes = len(execucoes)
            except Exception as e:
                logger.warning(f"Erro ao buscar execuções para deployment {pk}: {e}")
        
        deployment['apelido'] = apelido
        deployment['tags'] = tags
        deployment['dependente_de_execucoes'] = dependente_de_execucoes
        deployment['execucoes_pendentes'] = execucoes_pendentes
        
        serializer = DeploymentSerializer(deployment)
        return Response(serializer.data)
    
    def create(self, request):
        """Cria um novo deployment no banco de dados e Kubernetes."""
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
        
        # Adicionar tag automática "24/7" se não existir
        if not isinstance(tags, list):
            tags = []
        if '24/7' not in tags:
            tags.append('24/7')
        
        try:
            # Montar YAML do Deployment
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
          livenessProbe:
            exec:
              command:
                - python
"""
            
            # Salvar no banco de dados
            # Verificar se o campo dependente_de_execucoes existe no modelo
            create_kwargs = {
                'name': nome,
                'namespace': 'default',
                'yaml_content': yaml_content,
                'replicas': replicas,
                'ready_replicas': 0,
                'available_replicas': 0,
                'apelido': apelido,
                'tags': tags
            }
            # Só adicionar dependente_de_execucoes se o campo existir no modelo
            if hasattr(Deployment, 'dependente_de_execucoes'):
                create_kwargs['dependente_de_execucoes'] = dependente_de_execucoes
            
            deployment = Deployment.objects.create(**create_kwargs)
            
            # Aplicar via kubectl usando o YAML diretamente
            from backend.services.service_manager import get_file_service
            file_service = get_file_service()
            from backend.config.ssh_config import get_paths_config
            paths = get_paths_config()
            deployments_path = paths.get('deployments_path', '/tmp')
            yaml_path = f"{deployments_path}/deployment_{nome}.yaml"
            
            # Escrever YAML temporário
            file_service.ssh_service.put_file(None, yaml_path, content=yaml_content.encode('utf-8'))
            
            # Aplicar no Kubernetes
            success = self.k8s_service.apply_deployment(yaml_path)
            
            if success:
                return Response({'message': 'Deployment criado com sucesso'}, status=status.HTTP_201_CREATED)
            else:
                # Se falhar ao aplicar, deletar do banco
                deployment.delete()
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
        """Deleta um deployment do banco de dados e Kubernetes."""
        try:
            # Deletar do Kubernetes primeiro
            success = self.k8s_service.delete_deployment(pk)
            
            if success:
                # Deletar do banco de dados
                try:
                    deployment = Deployment.objects.get(name=pk)
                    deployment.delete()
                except Deployment.DoesNotExist:
                    pass  # Já foi deletado ou não existe
                
                # Tentar deletar arquivo YAML também (se existir)
                try:
                    from backend.services.service_manager import get_file_service
                    file_service = get_file_service()
                    from backend.config.ssh_config import get_paths_config
                    paths = get_paths_config()
                    file_service.ssh_service.execute_command(
                        f"rm -f {paths.get('deployments_path', '/tmp')}/deployment_{pk}.yaml"
                    )
                except:
                    pass  # Não é crítico se o arquivo não existir
                
                return Response({'message': 'Deployment deletado com sucesso'}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'Erro ao deletar deployment do Kubernetes'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao deletar deployment: {e}")
            return Response({'error': f'Erro ao deletar deployment: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

