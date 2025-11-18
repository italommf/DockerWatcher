import logging
import mysql.connector
import threading
from typing import List, Dict, Optional, Tuple
from backend.config.ssh_config import get_mysql_config

logger = logging.getLogger(__name__)

class DatabaseService:
    """Serviço para gerenciar conexão MySQL remota persistente."""
    
    def __init__(self, auto_connect: bool = False):
        self.config = get_mysql_config()
        self.conn = None
        self._initialized = False
        self._lock = threading.RLock()  # RLock para permitir reentrância
        # Conectar automaticamente se solicitado (usado na inicialização)
        if auto_connect:
            try:
                self._initialize_connection()
            except Exception as e:
                logger.warning(f"Não foi possível conectar MySQL na inicialização: {e}")
    
    def _initialize_connection(self):
        """Inicializa a conexão MySQL."""
        try:
            # Fechar conexão existente se houver
            if self.conn and self.conn.is_connected():
                try:
                    self.conn.close()
                except:
                    pass
            
            self.conn = mysql.connector.connect(
                host=self.config['host'],
                port=self.config['port'],
                user=self.config['user'],
                password=self.config['password'],
                database=self.config['database'],
                autocommit=False
            )
            self._initialized = True
            logger.info(f"Conexão MySQL estabelecida em {self.config['host']}:{self.config['port']}")
        except Exception as e:
            logger.warning(f"Erro ao inicializar conexão MySQL (continuando sem conexão): {e}")
            self._initialized = False
            self.conn = None
    
    def _ensure_connection(self):
        """Garante que a conexão está ativa, reconecta se necessário (thread-safe)."""
        with self._lock:
            # Se não foi inicializado, inicializar agora (lazy connection)
            if not self._initialized or not self.conn:
                self._initialize_connection()
            
            # Verificar se a conexão ainda está ativa
            if self.conn and self.conn.is_connected():
                try:
                    # Fazer ping para verificar se a conexão ainda está válida
                    self.conn.ping(reconnect=True, attempts=1, delay=0)
                    return self.conn
                except Exception as e:
                    # Se ping falhar, reconectar
                    logger.warning(f"Conexão MySQL perdeu, reconectando... Erro: {e}")
                    try:
                        if self.conn:
                            self.conn.close()
                    except:
                        pass
                    self._initialize_connection()
            else:
                # Reconectar se não existe ou não está conectada
                self._initialize_connection()
            
            if not self._initialized or not self.conn or not self.conn.is_connected():
                raise Exception("Conexão MySQL não está disponível")
            
            return self.conn
    
    def get_connection(self):
        """Retorna a conexão MySQL persistente."""
        return self._ensure_connection()
    
    def test_connection(self) -> bool:
        """Testa a conexão com o banco de dados."""
        try:
            conn = self._ensure_connection()
            cursor = conn.cursor(buffered=True)
            cursor.execute("SELECT 1")
            cursor.fetchall()  # Consumir todos os resultados
            cursor.close()
            return True
        except Exception as e:
            logger.error(f"Erro ao testar conexão MySQL: {e}")
            return False
    
    def test_connection_with_details(self) -> Tuple[bool, str]:
        """
        Testa a conexão com o banco de dados e retorna detalhes do erro.
        
        Returns:
            Tuple[bool, str]: (conectado, mensagem_erro)
        """
        # Tentar reinicializar se não estiver inicializado
        if not self._initialized or not self.conn:
            try:
                self._initialize_connection()
                if not self._initialized or not self.conn:
                    return False, "Conexão MySQL não está inicializada. Verifique as configurações."
            except Exception as e:
                return False, f"Erro ao inicializar conexão MySQL: {str(e)}"
        
        try:
            conn = self._ensure_connection()
            cursor = conn.cursor(buffered=True)
            cursor.execute("SELECT 1")
            cursor.fetchall()  # Consumir todos os resultados
            cursor.close()
            return True, "Conexão MySQL bem-sucedida"
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Erro ao testar conexão MySQL: {e}")
            
            # Mensagens de erro mais amigáveis
            if "Can't connect to MySQL server" in error_msg or "2003" in error_msg:
                return False, f"Não foi possível conectar ao servidor MySQL ({self.config['host']}:{self.config['port']}). Verifique se o servidor está acessível na rede."
            elif "Access denied" in error_msg or "1045" in error_msg:
                return False, "Acesso negado. Verifique usuário e senha no config.ini"
            elif "Unknown database" in error_msg or "1049" in error_msg:
                return False, f"Banco de dados '{self.config['database']}' não encontrado."
            elif "Conexão MySQL não está disponível" in error_msg:
                return False, "Conexão MySQL não está disponível. Verifique as configurações no config.ini"
            elif "Unread result" in error_msg:
                # Limpar resultados não lidos e tentar novamente
                try:
                    if self.conn and self.conn.is_connected():
                        self.conn.reset_session()
                except:
                    pass
                return False, "Erro: resultado não lido encontrado. Limpando conexão e tente novamente."
            else:
                return False, f"Erro na conexão MySQL: {error_msg}"
    
    def obter_execucoes(self, lista_nomes_rpas: List[str]) -> Dict[str, List[Dict]]:
        """
        Obtém execuções pendentes (status_01=4) para os RPAs fornecidos.
        
        Args:
            lista_nomes_rpas: Lista de nomes de robôs
        
        Returns:
            Dicionário com nome_do_robo como chave e lista de execuções como valor
        """
        if not self._initialized:
            logger.warning("MySQL não está conectado - retornando execuções vazias")
            return {}
        
        if not lista_nomes_rpas:
            return {}
        
        placeholders = ','.join(['%s'] * len(lista_nomes_rpas))
        
        query = f'''
            SELECT e.*, r.nome_do_robo
            FROM bwav4.execucao e
            JOIN bwav4.robo r ON e.robo_id = r.id
            WHERE r.nome_do_robo IN ({placeholders})
            AND e.status_01 = 4;
        '''
        
        cursor = None
        max_retries = 2
        
        for attempt in range(max_retries):
            try:
                conn = self._ensure_connection()
                
                cursor = conn.cursor(dictionary=True, buffered=True)
                cursor.execute(query, lista_nomes_rpas)
                resultados = cursor.fetchall()  # Consumir todos os resultados
                cursor.close()
                cursor = None
                
                execucoes_por_robo = {}
                for linha in resultados:
                    nome_robo = linha['nome_do_robo']
                    if nome_robo not in execucoes_por_robo:
                        execucoes_por_robo[nome_robo] = []
                    execucoes_por_robo[nome_robo].append(linha)
                
                return execucoes_por_robo
            except Exception as e:
                error_str = str(e)
                logger.error(f"Erro ao obter execuções (tentativa {attempt + 1}/{max_retries}): {e}")
                
                # Fechar cursor se ainda estiver aberto
                if cursor:
                    try:
                        cursor.close()
                    except:
                        pass
                    cursor = None
                
                # Se houver erro de "Unread result", limpar a conexão e tentar reconectar
                if "Unread result" in error_str or "Unread result found" in error_str:
                    try:
                        with self._lock:
                            if self.conn and self.conn.is_connected():
                                try:
                                    # Tentar resetar a sessão
                                    self.conn.reset_session()
                                except:
                                    # Se reset falhar, fechar e reconectar
                                    try:
                                        self.conn.close()
                                    except:
                                        pass
                                    self.conn = None
                                    self._initialized = False
                                    self._initialize_connection()
                        # Se não for a última tentativa, continuar o loop
                        if attempt < max_retries - 1:
                            continue
                    except Exception as reset_error:
                        logger.warning(f"Erro ao limpar conexão MySQL: {reset_error}")
                        # Se reset falhar completamente, reconectar
                        try:
                            with self._lock:
                                if self.conn:
                                    try:
                                        self.conn.close()
                                    except:
                                        pass
                                self.conn = None
                                self._initialized = False
                                self._initialize_connection()
                        except:
                            pass
                        if attempt < max_retries - 1:
                            continue
                
                # Se não for erro de "Unread result" ou se já tentou todas as vezes, retornar vazio
                return {}
    
    def obter_execucoes_por_rpa(self, nome_rpa: str) -> List[Dict]:
        """Obtém execuções pendentes para um RPA específico."""
        return self.obter_execucoes([nome_rpa]).get(nome_rpa, [])
    
    def reload_config(self):
        """Recarrega as configurações MySQL e reinicializa a conexão (thread-safe)."""
        with self._lock:
            # Fechar conexão existente
            if self.conn:
                try:
                    if self.conn.is_connected():
                        self.conn.close()
                except:
                    pass
                self.conn = None
            
            self._initialized = False
            
            # Recarregar configurações e reinicializar conexão
            self.config = get_mysql_config()
            self._initialize_connection()
            logger.info("Configurações MySQL recarregadas, conexão reinicializada")

