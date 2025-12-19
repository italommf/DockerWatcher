import paramiko
import logging
import threading
from typing import Optional, Tuple
from contextlib import contextmanager
from config.ssh_config import get_ssh_config

logger = logging.getLogger(__name__)

class SSHService:
    """Serviço para gerenciar conexões SSH e executar comandos remotos."""
    
    def __init__(self, auto_connect: bool = False):
        self.config = get_ssh_config()
        self._client: Optional[paramiko.SSHClient] = None
        self._sftp: Optional[paramiko.SFTPClient] = None
        self._lock = threading.RLock()  # RLock para permitir reentrância
        # Conectar automaticamente se solicitado (usado na inicialização)
        if auto_connect:
            try:
                self._ensure_client()
            except Exception as e:
                logger.warning(f"Não foi possível conectar SSH na inicialização: {e}")
    
    def reload_config(self):
        """Recarrega as configurações SSH do arquivo e fecha conexões antigas."""
        with self._lock:
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
            logger.info("Configurações SSH recarregadas, conexões antigas fechadas")
    
    def _ensure_client(self) -> paramiko.SSHClient:
        """Garante que existe uma conexão SSH ativa, cria ou reconecta se necessário."""
        # Verificação rápida sem lock primeiro
        if self._client is not None:
            try:
                # Verificar se o transporte ainda está ativo (sem lock para ser rápido)
                transport = self._client.get_transport()
                if transport and transport.is_active():
                    return self._client
            except:
                pass
        
        # Se chegou aqui, precisa verificar/criar com lock
        with self._lock:
            # Verificar novamente dentro do lock (double-check pattern)
            if self._client is not None:
                try:
                    transport = self._client.get_transport()
                    if transport and transport.is_active():
                        return self._client
                    else:
                        # Conexão morreu, fechar e recriar
                        try:
                            self._client.close()
                        except:
                            pass
                        self._client = None
                except:
                    # Erro ao verificar, assumir que está morta
                    self._client = None
            
            # Criar nova conexão
            logger.info("Criando nova conexão SSH persistente...")
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            try:
                if self.config['use_key'] and self.config.get('key_path'):
                    # Conectar usando chave SSH
                    key_path = self.config['key_path']
                    client.connect(
                        hostname=self.config['host'],
                        port=self.config['port'],
                        username=self.config['username'],
                        key_filename=key_path,
                        look_for_keys=False,  # Não procurar chaves padrão
                        allow_agent=False,  # Não usar agente SSH
                        timeout=10
                    )
                elif self.config.get('password'):
                    # Conectar usando senha
                    client.connect(
                        hostname=self.config['host'],
                        port=self.config['port'],
                        username=self.config['username'],
                        password=self.config['password'],
                        look_for_keys=False,  # Não procurar chaves padrão
                        allow_agent=False,  # Não usar agente SSH
                        timeout=10
                    )
                else:
                    raise ValueError("É necessário fornecer chave SSH ou senha")
                
                self._client = client
                logger.info("Conexão SSH persistente estabelecida")
                return self._client
            except Exception as e:
                logger.error(f"Erro ao conectar SSH: {e}")
                raise
    
    def _ensure_sftp(self) -> paramiko.SFTPClient:
        """Garante que existe uma conexão SFTP ativa."""
        # Verificação rápida sem lock primeiro
        if self._sftp is not None:
            try:
                # Tentar uma operação simples para verificar se está ativo (sem lock)
                self._sftp.listdir('.')
                return self._sftp
            except:
                pass
        
        # Se chegou aqui, precisa verificar/criar com lock
        with self._lock:
            # Verificar novamente dentro do lock (double-check pattern)
            if self._sftp is not None:
                try:
                    self._sftp.listdir('.')
                    return self._sftp
                except:
                    # SFTP morreu, fechar e recriar
                    try:
                        self._sftp.close()
                    except:
                        pass
                    self._sftp = None
            
            # Criar novo SFTP a partir da conexão SSH persistente
            # _ensure_client já gerencia o lock internamente
            client = self._ensure_client()
            try:
                self._sftp = client.open_sftp()
                logger.debug("Conexão SFTP persistente estabelecida")
                return self._sftp
            except Exception as e:
                logger.error(f"Erro ao criar SFTP: {e}")
                raise
    
    def _create_client(self) -> paramiko.SSHClient:
        """Cria um novo cliente SSH (método legado, mantido para compatibilidade)."""
        return self._ensure_client()
    
    @contextmanager
    def get_connection(self):
        """Context manager para obter conexão SSH (reutiliza conexão persistente)."""
        # Usar conexão persistente, não fechar ao sair
        client = self._ensure_client()
        yield client
        # Não fechar - manter conexão persistente
    
    @contextmanager
    def get_sftp(self):
        """Context manager para obter conexão SFTP (reutiliza conexão persistente)."""
        # Usar SFTP persistente, não fechar ao sair
        sftp = self._ensure_sftp()
        yield sftp
        # Não fechar - manter conexão persistente
    
    def execute_command(self, command: str, timeout: int = 30) -> Tuple[int, str, str]:
        """
        Executa um comando no servidor remoto via SSH.
        Usa conexão persistente com lock para serializar comandos (paramiko não é thread-safe).
        
        Returns:
            Tuple[int, str, str]: (return_code, stdout, stderr)
        """
        # Usar lock durante toda a execução para serializar comandos SSH
        # (paramiko não é thread-safe para múltiplos comandos simultâneos)
        with self._lock:
            try:
                # Obter conexão
                client = self._ensure_client()
                stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
                
                return_code = stdout.channel.recv_exit_status()
                stdout_text = stdout.read().decode('utf-8')
                stderr_text = stderr.read().decode('utf-8')
                
                return return_code, stdout_text, stderr_text
            except Exception as e:
                logger.error(f"Erro ao executar comando SSH: {e}")
                # Se a conexão morreu, limpar e tentar novamente uma vez
                if "not connected" in str(e).lower() or "transport" in str(e).lower():
                    try:
                        if self._client:
                            try:
                                self._client.close()
                            except:
                                pass
                            self._client = None
                        # Tentar novamente
                        client = self._ensure_client()
                        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
                        return_code = stdout.channel.recv_exit_status()
                        stdout_text = stdout.read().decode('utf-8')
                        stderr_text = stderr.read().decode('utf-8')
                        return return_code, stdout_text, stderr_text
                    except Exception as retry_error:
                        logger.error(f"Erro ao tentar novamente: {retry_error}")
                        raise
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

