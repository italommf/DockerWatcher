import paramiko
import logging
from typing import Optional, Tuple
from contextlib import contextmanager
from backend.config.ssh_config import get_ssh_config

logger = logging.getLogger(__name__)

class SSHService:
    """Serviço para gerenciar conexões SSH e executar comandos remotos."""
    
    def __init__(self):
        self.config = get_ssh_config()
        self._client: Optional[paramiko.SSHClient] = None
        self._sftp: Optional[paramiko.SFTPClient] = None
    
    def reload_config(self):
        """Recarrega as configurações SSH do arquivo."""
        self.config = get_ssh_config()
        # Fechar conexões existentes
        if self._sftp:
            try:
                self._sftp.close()
            except:
                pass
            self._sftp = None
        if self._client:
            try:
                self._client.close()
            except:
                pass
            self._client = None
    
    def _create_client(self) -> paramiko.SSHClient:
        """Cria um novo cliente SSH."""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            if self.config['use_key'] and self.config['key_path']:
                # Conectar usando chave SSH
                key_path = self.config['key_path']
                client.connect(
                    hostname=self.config['host'],
                    port=self.config['port'],
                    username=self.config['username'],
                    key_filename=key_path,
                    timeout=10
                )
            elif self.config['password']:
                # Conectar usando senha
                client.connect(
                    hostname=self.config['host'],
                    port=self.config['port'],
                    username=self.config['username'],
                    password=self.config['password'],
                    timeout=10
                )
            else:
                raise ValueError("É necessário fornecer chave SSH ou senha")
            
            return client
        except Exception as e:
            logger.error(f"Erro ao conectar SSH: {e}")
            raise
    
    @contextmanager
    def get_connection(self):
        """Context manager para obter conexão SSH."""
        client = None
        try:
            client = self._create_client()
            yield client
        finally:
            if client:
                client.close()
    
    @contextmanager
    def get_sftp(self):
        """Context manager para obter conexão SFTP."""
        client = None
        sftp = None
        try:
            client = self._create_client()
            sftp = client.open_sftp()
            yield sftp
        finally:
            if sftp:
                sftp.close()
            if client:
                client.close()
    
    def execute_command(self, command: str, timeout: int = 30) -> Tuple[int, str, str]:
        """
        Executa um comando no servidor remoto via SSH.
        
        Returns:
            Tuple[int, str, str]: (return_code, stdout, stderr)
        """
        try:
            with self.get_connection() as client:
                stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
                
                return_code = stdout.channel.recv_exit_status()
                stdout_text = stdout.read().decode('utf-8')
                stderr_text = stderr.read().decode('utf-8')
                
                return return_code, stdout_text, stderr_text
        except Exception as e:
            logger.error(f"Erro ao executar comando SSH: {e}")
            raise
    
    def test_connection(self) -> bool:
        """Testa a conexão SSH."""
        try:
            with self.get_connection() as client:
                stdin, stdout, stderr = client.exec_command("echo 'OK'", timeout=5)
                result = stdout.read().decode('utf-8').strip()
                return result == "OK"
        except Exception as e:
            logger.error(f"Erro ao testar conexão SSH: {e}")
            return False
    
    def get_file(self, remote_path: str, local_path: str = None) -> Optional[bytes]:
        """
        Baixa um arquivo do servidor remoto via SFTP.
        
        Args:
            remote_path: Caminho do arquivo no servidor remoto
            local_path: Se fornecido, salva o arquivo localmente
        
        Returns:
            Conteúdo do arquivo em bytes se local_path não for fornecido
        """
        try:
            with self.get_sftp() as sftp:
                if local_path:
                    sftp.get(remote_path, local_path)
                    return None
                else:
                    # Ler arquivo para memória
                    with sftp.open(remote_path, 'rb') as remote_file:
                        return remote_file.read()
        except Exception as e:
            logger.error(f"Erro ao baixar arquivo via SFTP: {e}")
            raise
    
    def put_file(self, local_path: str, remote_path: str, content: bytes = None):
        """
        Envia um arquivo para o servidor remoto via SFTP.
        
        Args:
            local_path: Caminho do arquivo local (se content não for fornecido)
            remote_path: Caminho de destino no servidor remoto
            content: Conteúdo do arquivo em bytes (se fornecido, ignora local_path)
        """
        try:
            with self.get_sftp() as sftp:
                # Criar diretório pai se não existir
                remote_dir = '/'.join(remote_path.split('/')[:-1])
                if remote_dir:
                    try:
                        sftp.listdir(remote_dir)
                    except IOError:
                        # Diretório não existe, criar recursivamente
                        self.execute_command(f"mkdir -p {remote_dir}")
                
                if content:
                    # Escrever conteúdo direto
                    with sftp.open(remote_path, 'wb') as remote_file:
                        remote_file.write(content)
                else:
                    # Copiar arquivo local
                    sftp.put(local_path, remote_path)
        except Exception as e:
            logger.error(f"Erro ao enviar arquivo via SFTP: {e}")
            raise
    
    def list_files(self, remote_path: str) -> list:
        """
        Lista arquivos em um diretório remoto via SFTP.
        
        Returns:
            Lista de nomes de arquivos
        """
        try:
            with self.get_sftp() as sftp:
                return sftp.listdir(remote_path)
        except Exception as e:
            logger.error(f"Erro ao listar arquivos via SFTP: {e}")
            raise
    
    def file_exists(self, remote_path: str) -> bool:
        """Verifica se um arquivo existe no servidor remoto."""
        try:
            with self.get_sftp() as sftp:
                sftp.stat(remote_path)
                return True
        except IOError:
            return False
    
    def move_file(self, old_path: str, new_path: str):
        """Move/renomeia um arquivo no servidor remoto."""
        try:
            with self.get_sftp() as sftp:
                # Criar diretório pai se não existir
                remote_dir = '/'.join(new_path.split('/')[:-1])
                if remote_dir:
                    try:
                        sftp.listdir(remote_dir)
                    except IOError:
                        self.execute_command(f"mkdir -p {remote_dir}")
                
                sftp.rename(old_path, new_path)
        except Exception as e:
            logger.error(f"Erro ao mover arquivo via SFTP: {e}")
            raise

