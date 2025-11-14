import logging
from mysql.connector import pooling
from typing import List, Dict, Optional
from backend.config.ssh_config import get_mysql_config

logger = logging.getLogger(__name__)

class DatabaseService:
    """Serviço para gerenciar conexões MySQL remotas."""
    
    def __init__(self):
        self.config = get_mysql_config()
        self.pool = None
        self._initialized = False
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Inicializa o pool de conexões MySQL."""
        try:
            self.pool = pooling.MySQLConnectionPool(
                pool_name="PoolDockerWatcher",
                pool_size=5,
                host=self.config['host'],
                port=self.config['port'],
                user=self.config['user'],
                password=self.config['password'],
                database=self.config['database'],
                autocommit=False
            )
            self._initialized = True
            logger.info("Pool MySQL inicializado com sucesso")
        except Exception as e:
            logger.warning(f"Erro ao inicializar pool MySQL (continuando sem conexão): {e}")
            self._initialized = False
            self.pool = None
    
    def get_connection(self):
        """Obtém uma conexão do pool."""
        if not self._initialized or not self.pool:
            raise Exception("Pool MySQL não está inicializado")
        try:
            return self.pool.get_connection()
        except Exception as e:
            logger.error(f"Erro ao obter conexão MySQL: {e}")
            raise
    
    def test_connection(self) -> bool:
        """Testa a conexão com o banco de dados."""
        if not self._initialized:
            return False
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Erro ao testar conexão MySQL: {e}")
            return False
    
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
        
        try:
            conn = self.get_connection()
            cursor = conn.cursor(dictionary=True)
            cursor.execute(query, lista_nomes_rpas)
            resultados = cursor.fetchall()
            cursor.close()
            conn.close()
            
            execucoes_por_robo = {}
            for linha in resultados:
                nome_robo = linha['nome_do_robo']
                if nome_robo not in execucoes_por_robo:
                    execucoes_por_robo[nome_robo] = []
                execucoes_por_robo[nome_robo].append(linha)
            
            return execucoes_por_robo
        except Exception as e:
            logger.error(f"Erro ao obter execuções: {e}")
            return {}
    
    def obter_execucoes_por_rpa(self, nome_rpa: str) -> List[Dict]:
        """Obtém execuções pendentes para um RPA específico."""
        return self.obter_execucoes([nome_rpa]).get(nome_rpa, [])
    
    def reload_config(self):
        """Recarrega as configurações MySQL e reinicializa o pool."""
        # Fechar pool existente
        if self.pool:
            try:
                # Fechar todas as conexões do pool
                for _ in range(5):  # Tentar fechar até 5 conexões
                    try:
                        conn = self.pool.get_connection()
                        conn.close()
                    except:
                        break
            except:
                pass
            self.pool = None
        
        self._initialized = False
        
        # Recarregar configurações e reinicializar pool
        self.config = get_mysql_config()
        self._initialize_pool()

