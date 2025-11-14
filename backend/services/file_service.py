import json
import yaml
import logging
from typing import List, Dict, Optional
from pathlib import Path
from backend.services.ssh_service import SSHService
from backend.config.ssh_config import get_paths_config

logger = logging.getLogger(__name__)

class FileService:
    """Serviço para gerenciar arquivos remotos via SFTP."""
    
    def __init__(self):
        self.ssh_service = SSHService()
        self.paths_config = get_paths_config()
    
    @property
    def paths(self):
        """Retorna o dicionário de caminhos."""
        return self.paths_config
    
    def obter_json_rpas(self) -> List[str]:
        """
        Obtém lista de caminhos de arquivos JSON de RPA no servidor remoto.
        Retorna apenas arquivos ativos (não em standby).
        """
        rpa_config_path = self.paths_config['rpa_config_path']
        arquivos = []
        
        try:
            files = self.ssh_service.list_files(rpa_config_path)
            
            for arquivo in files:
                if arquivo.endswith(".json") and "example" not in arquivo.lower():
                    # Verificar se não está em standby
                    caminho_completo = f"{rpa_config_path}/{arquivo}"
                    # Não incluir arquivos em subpasta standby
                    if "standby" not in caminho_completo:
                        arquivos.append(caminho_completo)
            
            return arquivos
        except Exception as e:
            logger.error(f"Erro ao listar RPAs: {e}")
            return []
    
    def obter_json_rpas_standby(self) -> List[str]:
        """Obtém lista de RPAs em standby."""
        rpa_config_path = self.paths_config['rpa_config_path']
        standby_path = f"{rpa_config_path}/standby"
        arquivos = []
        
        try:
            if self.ssh_service.file_exists(standby_path):
                files = self.ssh_service.list_files(standby_path)
                
                for arquivo in files:
                    if arquivo.endswith(".json") and "example" not in arquivo.lower():
                        caminho_completo = f"{standby_path}/{arquivo}"
                        arquivos.append(caminho_completo)
            
            return arquivos
        except Exception as e:
            logger.error(f"Erro ao listar RPAs em standby: {e}")
            return []
    
    def ler_json_rpa(self, caminho: str) -> Optional[Dict]:
        """Lê um arquivo JSON de RPA do servidor remoto."""
        try:
            content = self.ssh_service.get_file(caminho)
            if content:
                return json.loads(content.decode('utf-8'))
            return None
        except Exception as e:
            logger.error(f"Erro ao ler JSON RPA {caminho}: {e}")
            return None
    
    def escrever_json_rpa(self, nome_rpa: str, dados: Dict, standby: bool = False) -> bool:
        """
        Escreve um arquivo JSON de RPA no servidor remoto.
        
        Args:
            nome_rpa: Nome do RPA (será usado no nome do arquivo)
            dados: Dicionário com dados do RPA
            standby: Se True, salva em standby
        """
        rpa_config_path = self.paths_config['rpa_config_path']
        
        if standby:
            arquivo_path = f"{rpa_config_path}/standby/rpa_{nome_rpa}.json"
        else:
            arquivo_path = f"{rpa_config_path}/rpa_{nome_rpa}.json"
        
        try:
            content = json.dumps(dados, indent=2, ensure_ascii=False)
            self.ssh_service.put_file(None, arquivo_path, content.encode('utf-8'))
            return True
        except Exception as e:
            logger.error(f"Erro ao escrever JSON RPA {arquivo_path}: {e}")
            return False
    
    def mover_rpa_standby(self, nome_rpa: str) -> bool:
        """Move um RPA para standby."""
        rpa_config_path = self.paths_config['rpa_config_path']
        arquivo_original = f"{rpa_config_path}/rpa_{nome_rpa}.json"
        arquivo_standby = f"{rpa_config_path}/standby/rpa_{nome_rpa}.json"
        
        try:
            if not self.ssh_service.file_exists(arquivo_original):
                logger.warning(f"Arquivo RPA não encontrado: {arquivo_original}")
                return False
            
            self.ssh_service.move_file(arquivo_original, arquivo_standby)
            return True
        except Exception as e:
            logger.error(f"Erro ao mover RPA para standby: {e}")
            return False
    
    def mover_rpa_ativar(self, nome_rpa: str) -> bool:
        """Move um RPA de standby para ativo."""
        rpa_config_path = self.paths_config['rpa_config_path']
        arquivo_standby = f"{rpa_config_path}/standby/rpa_{nome_rpa}.json"
        arquivo_original = f"{rpa_config_path}/rpa_{nome_rpa}.json"
        
        try:
            if not self.ssh_service.file_exists(arquivo_standby):
                logger.warning(f"Arquivo RPA em standby não encontrado: {arquivo_standby}")
                return False
            
            self.ssh_service.move_file(arquivo_standby, arquivo_original)
            return True
        except Exception as e:
            logger.error(f"Erro ao ativar RPA de standby: {e}")
            return False
    
    def deletar_rpa(self, nome_rpa: str) -> bool:
        """Deleta um arquivo RPA (tenta tanto ativo quanto standby)."""
        rpa_config_path = self.paths_config['rpa_config_path']
        arquivo_ativo = f"{rpa_config_path}/rpa_{nome_rpa}.json"
        arquivo_standby = f"{rpa_config_path}/standby/rpa_{nome_rpa}.json"
        
        try:
            deleted = False
            if self.ssh_service.file_exists(arquivo_ativo):
                self.ssh_service.execute_command(f"rm {arquivo_ativo}")
                deleted = True
            
            if self.ssh_service.file_exists(arquivo_standby):
                self.ssh_service.execute_command(f"rm {arquivo_standby}")
                deleted = True
            
            return deleted
        except Exception as e:
            logger.error(f"Erro ao deletar RPA: {e}")
            return False
    
    def obter_yaml_cronjobs(self) -> List[str]:
        """Obtém lista de arquivos YAML de cronjobs no servidor remoto."""
        cronjobs_path = self.paths_config['cronjobs_path']
        arquivos = []
        
        try:
            files = self.ssh_service.list_files(cronjobs_path)
            
            for arquivo in files:
                if arquivo.endswith(".yaml") and "example" not in arquivo.lower():
                    caminho_completo = f"{cronjobs_path}/{arquivo}"
                    # Não incluir arquivos em subpasta standby
                    if "standby" not in caminho_completo:
                        arquivos.append(caminho_completo)
            
            return arquivos
        except Exception as e:
            logger.error(f"Erro ao listar cronjobs: {e}")
            return []
    
    def obter_yaml_cronjobs_standby(self) -> List[str]:
        """Obtém lista de cronjobs em standby."""
        cronjobs_path = self.paths_config['cronjobs_path']
        standby_path = f"{cronjobs_path}/standby"
        arquivos = []
        
        try:
            if self.ssh_service.file_exists(standby_path):
                files = self.ssh_service.list_files(standby_path)
                
                for arquivo in files:
                    if arquivo.endswith(".yaml") and "example" not in arquivo.lower():
                        caminho_completo = f"{standby_path}/{arquivo}"
                        arquivos.append(caminho_completo)
            
            return arquivos
        except Exception as e:
            logger.error(f"Erro ao listar cronjobs em standby: {e}")
            return []
    
    def ler_yaml_cronjob(self, caminho: str) -> Optional[Dict]:
        """Lê um arquivo YAML de cronjob do servidor remoto."""
        try:
            content = self.ssh_service.get_file(caminho)
            if content:
                return yaml.safe_load(content.decode('utf-8'))
            return None
        except Exception as e:
            logger.error(f"Erro ao ler YAML cronjob {caminho}: {e}")
            return None
    
    def escrever_yaml_cronjob(self, nome: str, dados: Dict, standby: bool = False) -> bool:
        """Escreve um arquivo YAML de cronjob no servidor remoto."""
        cronjobs_path = self.paths_config['cronjobs_path']
        
        if standby:
            arquivo_path = f"{cronjobs_path}/standby/cronjob_{nome}.yaml"
        else:
            arquivo_path = f"{cronjobs_path}/cronjob_{nome}.yaml"
        
        try:
            content = yaml.dump(dados, default_flow_style=False, allow_unicode=True)
            self.ssh_service.put_file(None, arquivo_path, content.encode('utf-8'))
            return True
        except Exception as e:
            logger.error(f"Erro ao escrever YAML cronjob {arquivo_path}: {e}")
            return False
    
    def obter_yaml_deployments(self) -> List[str]:
        """Obtém lista de arquivos YAML de deployments no servidor remoto."""
        deployments_path = self.paths_config['deployments_path']
        arquivos = []
        
        try:
            files = self.ssh_service.list_files(deployments_path)
            
            for arquivo in files:
                if arquivo.endswith(".yaml") and "example" not in arquivo.lower():
                    caminho_completo = f"{deployments_path}/{arquivo}"
                    # Não incluir arquivos em subpasta standby
                    if "standby" not in caminho_completo:
                        arquivos.append(caminho_completo)
            
            return arquivos
        except Exception as e:
            logger.error(f"Erro ao listar deployments: {e}")
            return []
    
    def ler_yaml_deployment(self, caminho: str) -> Optional[Dict]:
        """Lê um arquivo YAML de deployment do servidor remoto."""
        try:
            content = self.ssh_service.get_file(caminho)
            if content:
                return yaml.safe_load(content.decode('utf-8'))
            return None
        except Exception as e:
            logger.error(f"Erro ao ler YAML deployment {caminho}: {e}")
            return None
    
    def escrever_yaml_deployment(self, nome: str, dados: Dict) -> bool:
        """Escreve um arquivo YAML de deployment no servidor remoto."""
        deployments_path = self.paths_config['deployments_path']
        arquivo_path = f"{deployments_path}/deployment_{nome}.yaml"
        
        try:
            content = yaml.dump(dados, default_flow_style=False, allow_unicode=True)
            self.ssh_service.put_file(None, arquivo_path, content.encode('utf-8'))
            return True
        except Exception as e:
            logger.error(f"Erro ao escrever YAML deployment {arquivo_path}: {e}")
            return False

