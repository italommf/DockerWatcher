from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from backend.services.cache_service import CacheKeys, CacheService
from backend.services.service_manager import get_kubernetes_service
from api.serializers.models import CronjobSerializer, CreateCronjobSerializer
import yaml
import logging
import re

logger = logging.getLogger(__name__)

class CronjobViewSet(viewsets.ViewSet):
    """ViewSet para gerenciar cronjobs (armazenados no Kubernetes/VM)."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Usar serviços singleton para evitar reconexões constantes
        self.k8s_service = get_kubernetes_service()
    
    def list(self, request):
        """Lista todos os cronjobs do Kubernetes (armazenados em cache)."""
        try:
            # Tentar obter do cache processado primeiro (atualizado a cada 5s pelo PollingService)
            cronjobs_cache = CacheService.get_data(CacheKeys.CRONJOBS_PROCESSED)
            if cronjobs_cache:
                # Cache disponível - retornar instantaneamente
                serializer = CronjobSerializer(cronjobs_cache, many=True)
                return Response(serializer.data)
            
            # Fallback: processar agora se cache não estiver disponível (primeira requisição)
            logger.debug("Cache de cronjobs processados não disponível, processando agora...")
            cronjobs = []
            
            # Buscar cronjobs do Kubernetes (sempre do cache - atualizado a cada 5s pelo PollingService)
            try:
                k8s_cronjobs = CacheService.get_data(CacheKeys.CRONJOBS, []) or []
                # Se cache vazio, tentar buscar uma vez (fallback apenas na primeira requisição)
                if not k8s_cronjobs:
                    logger.debug("Cache de cronjobs vazio, buscando do Kubernetes...")
                    k8s_cronjobs = self.k8s_service.get_cronjobs()
                    CacheService.update(CacheKeys.CRONJOBS, k8s_cronjobs)
            except Exception as e:
                logger.error(f"Erro ao buscar cronjobs do Kubernetes: {e}")
                k8s_cronjobs = []
            
            # Buscar execuções em lote
            execucoes_por_robo = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            
            for cj in k8s_cronjobs:
                try:
                    nome = cj.get('name', '')
                    if not nome:
                        continue
                    
                    # Valores padrão (cronjobs são apenas do Kubernetes agora)
                    apelido = ''
                    tags = []
                    dependente_de_execucoes = True  # Padrão True
                    
                    # Adicionar tag automática "Agendado" se não existir
                    if 'Agendado' not in tags:
                        tags.append('Agendado')
                    
                    # Buscar execuções se for dependente
                    execucoes_pendentes = 0
                    if dependente_de_execucoes:
                        nome_rpa = nome.replace('rpa-cronjob-', '').replace('-cronjob', '')
                        nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
                        execucoes_pendentes = self._buscar_execucoes_por_nome(nome_rpa, execucoes_por_robo)
                    
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
        cronjobs = CacheService.get_data(CacheKeys.CRONJOBS, []) or []
        if not cronjobs:
            cronjobs = self.k8s_service.get_cronjobs()
            CacheService.update(CacheKeys.CRONJOBS, cronjobs)
        cronjob = next((c for c in cronjobs if c['name'] == pk), None)
        
        if not cronjob:
            return Response({'error': 'Cronjob não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        
        # Valores padrão (cronjobs são apenas do Kubernetes agora)
        apelido = ''
        tags = []
        dependente_de_execucoes = True  # Padrão True
        
        # Adicionar tag automática "Agendado" se não existir
        if 'Agendado' not in tags:
            tags.append('Agendado')
        
        # Buscar execuções se for dependente
        execucoes_pendentes = 0
        if dependente_de_execucoes:
            nome_rpa = pk.replace('rpa-cronjob-', '').replace('-cronjob', '')
            nome_rpa = re.sub(r'-\d+$', '', nome_rpa)
            exec_cache = CacheService.get_data(CacheKeys.EXECUTIONS, {}) or {}
            execucoes_pendentes = self._buscar_execucoes_por_nome(nome_rpa, exec_cache)
        
        cronjob['apelido'] = apelido
        cronjob['tags'] = tags
        cronjob['dependente_de_execucoes'] = dependente_de_execucoes
        cronjob['execucoes_pendentes'] = execucoes_pendentes
        
        serializer = CronjobSerializer(cronjob)
        return Response(serializer.data)
    
    def create(self, request):
        """Cria um novo cronjob no Kubernetes (VM)."""
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
        
        # Verificar se já existe um cronjob com este nome no Kubernetes
        try:
            k8s_cronjobs = CacheService.get_data(CacheKeys.CRONJOBS, []) or []
            if not k8s_cronjobs:
                k8s_cronjobs = self.k8s_service.get_cronjobs()
                CacheService.update(CacheKeys.CRONJOBS, k8s_cronjobs)
            
            if any(cj.get('name') == nome for cj in k8s_cronjobs):
                return Response(
                    {'error': f'Já existe um cronjob com o nome "{nome}" no Kubernetes. Por favor, escolha outro nome.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            logger.warning(f"Erro ao verificar cronjobs existentes: {e}")
            # Continuar mesmo se houver erro na verificação
        
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
            
            # Criar cronjob diretamente no Kubernetes via kubectl (sem arquivo intermediário)
            # Usar o mesmo método dos jobs comuns: kubectl create -f - <<EOF
            cronjob_dict = yaml.safe_load(yaml_content)
            yaml_formatted = yaml.dump(cronjob_dict, default_flow_style=False)
            
            # Criar cronjob via kubectl usando stdin (mesmo método dos jobs)
            cmd = f"kubectl create -f - <<EOF\n{yaml_formatted}\nEOF"
            return_code, stdout, stderr = self.k8s_service.ssh_service.execute_command(cmd, timeout=30)
            
            if return_code != 0:
                logger.error(f"Erro ao criar cronjob: {stderr}")
                return Response(
                    {'error': f'Erro ao criar cronjob no Kubernetes: {stderr}'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            success = True
            
            if success:
                # Invalidar cache de cronjobs para forçar atualização
                CacheService.update(CacheKeys.CRONJOBS, None)
                CacheService.update(CacheKeys.CRONJOBS_PROCESSED, None)
                return Response({'message': 'Cronjob criado com sucesso no Kubernetes'}, status=status.HTTP_201_CREATED)
            else:
                return Response({'error': 'Erro ao aplicar cronjob no Kubernetes'}, 
                              status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Erro ao criar cronjob: {e}")
            return Response({'error': f'Erro ao criar cronjob: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Deleta um cronjob do Kubernetes."""
        try:
            # Deletar do Kubernetes
            success = self.k8s_service.delete_cronjob(pk)
            
            if success:
                # Invalidar cache de cronjobs processados
                CacheService.update(CacheKeys.CRONJOBS, None)
                CacheService.update(CacheKeys.CRONJOBS_PROCESSED, None)
                
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
            # Invalidar cache de cronjobs processados
            CacheService.update(CacheKeys.CRONJOBS_PROCESSED, None)
            return Response({'message': 'Cronjob suspenso com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao suspender cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Reativa um cronjob."""
        success = self.k8s_service.unsuspend_cronjob(pk)
        
        if success:
            # Invalidar cache de cronjobs processados
            CacheService.update(CacheKeys.CRONJOBS_PROCESSED, None)
            return Response({'message': 'Cronjob reativado com sucesso'}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Erro ao reativar cronjob'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    

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

