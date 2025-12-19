import logging
import threading
import time
from typing import Dict, List, Optional, Tuple

from mysql.connector import pooling

from config.ssh_config import get_mysql_config

logger = logging.getLogger(__name__)


class DatabaseService:
    """Serviço para gerenciar conexões MySQL usando pool compartilhado."""

    def __init__(self, auto_connect: bool = False):
        self.config = get_mysql_config()
        self._pool: Optional[pooling.MySQLConnectionPool] = None
        self._initialized = False
        self._lock = threading.RLock()
        self._pool_name = f"dockerwatcher_pool_{id(self)}"
        if auto_connect:
            try:
                self._initialize_pool()
            except Exception as e:
                logger.warning(f"Não foi possível iniciar pool MySQL na inicialização: {e}")

    def _initialize_pool(self):
        """Inicializa o pool de conexões."""
        with self._lock:
            try:
                pool_size = int(self.config.get("pool_size", 3))
                if pool_size < 1:
                    pool_size = 1
                self._pool = pooling.MySQLConnectionPool(
                    pool_name=self._pool_name,
                    pool_size=pool_size,
                    pool_reset_session=True,
                    host=self.config["host"],
                    port=self.config["port"],
                    user=self.config["user"],
                    password=self.config["password"],
                    database=self.config["database"],
                    autocommit=False,
                )
                self._initialized = True
                logger.info(
                    "Pool MySQL (%s) criado em %s:%s com %s conexões",
                    self._pool_name,
                    self.config["host"],
                    self.config["port"],
                    pool_size,
                )
            except Exception as e:
                logger.warning(f"Erro ao inicializar pool MySQL: {e}")
                self._pool = None
                self._initialized = False

    def _get_connection(self):
        """Obtém uma conexão do pool, recriando-o se necessário."""
        with self._lock:
            if not self._initialized or self._pool is None:
                self._initialize_pool()
            if not self._initialized or self._pool is None:
                raise Exception("Conexão MySQL não está disponível")
            return self._pool.get_connection()

    def get_connection(self):
        """Exposto para compatibilidade (retorna conexão individual)."""
        return self._get_connection()

    def _run_simple_query(self, query: str) -> bool:
        conn = None
        cursor = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(buffered=True)
            cursor.execute(query)
            cursor.fetchall()
            return True
        except Exception as e:
            logger.error(f"Erro ao executar query simples: {e}")
            return False
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def test_connection(self) -> bool:
        return self._run_simple_query("SELECT 1")

    def test_connection_with_details(self) -> Tuple[bool, str]:
        if not self._initialized or self._pool is None:
            try:
                self._initialize_pool()
                if not self._initialized or self._pool is None:
                    return False, "Conexão MySQL não está inicializada. Verifique as configurações."
            except Exception as e:
                return False, f"Erro ao inicializar conexão MySQL: {str(e)}"

        conn = None
        cursor = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(buffered=True)
            cursor.execute("SELECT 1")
            cursor.fetchall()
            return True, "Conexão MySQL bem-sucedida"
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Erro ao testar conexão MySQL: {e}")
            if "Can't connect to MySQL server" in error_msg or "2003" in error_msg:
                return False, f"Não foi possível conectar ao servidor MySQL ({self.config['host']}:{self.config['port']})."
            if "Access denied" in error_msg or "1045" in error_msg:
                return False, "Acesso negado. Verifique usuário e senha no config.ini"
            if "Unknown database" in error_msg or "1049" in error_msg:
                return False, f"Banco de dados '{self.config['database']}' não encontrado."
            if "Unread result" in error_msg:
                return False, "Erro: resultado não lido encontrado. Conexão será reiniciada automaticamente."
            return False, f"Erro na conexão MySQL: {error_msg}"
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    def _handle_unread_result(self, conn, attempt: int, max_retries: int):
        logger.warning("database_service Erro ao limpar conexão MySQL: Unread result found")
        try:
            if conn:
                conn.close()
        except Exception:
            pass
        if attempt < max_retries - 1:
            time.sleep(0.5)

    def obter_execucoes(self, lista_nomes_rpas: List[str]) -> Dict[str, List[Dict]]:
        if not self._initialized or not lista_nomes_rpas:
            if not self._initialized:
                logger.warning("MySQL não está conectado - retornando execuções vazias")
            return {}

        placeholders = ",".join(["%s"] * len(lista_nomes_rpas))
        query = f"""
            SELECT e.*, r.nome_do_robo
            FROM bwav4.execucao e
            JOIN bwav4.robo r ON e.robo_id = r.id
            WHERE r.nome_do_robo IN ({placeholders})
            AND e.status_01 = 4;
        """

        max_retries = 3
        for attempt in range(max_retries):
            conn = None
            cursor = None
            try:
                conn = self._get_connection()
                cursor = conn.cursor(dictionary=True, buffered=True)
                cursor.execute(query, lista_nomes_rpas)
                resultados = cursor.fetchall()
                execucoes_por_robo: Dict[str, List[Dict]] = {}
                for linha in resultados:
                    nome_robo = linha["nome_do_robo"]
                    execucoes_por_robo.setdefault(nome_robo, []).append(linha)
                return execucoes_por_robo
            except Exception as e:
                error_str = str(e)
                logger.error(
                    "Erro ao obter execuções (tentativa %s/%s): %s",
                    attempt + 1,
                    max_retries,
                    error_str,
                )
                if "Unread result" in error_str or "Unread result found" in error_str:
                    self._handle_unread_result(conn, attempt, max_retries)
                    continue
                if "server has gone away" in error_str.lower():
                    self._initialize_pool()
                    continue
                return {}
            finally:
                if cursor:
                    try:
                        cursor.close()
                    except Exception:
                        pass
                if conn:
                    try:
                        conn.close()
                    except Exception:
                        pass
        return {}

    def obter_execucoes_por_rpa(self, nome_rpa: str) -> List[Dict]:
        return self.obter_execucoes([nome_rpa]).get(nome_rpa, [])

    def reload_config(self):
        with self._lock:
            self._pool = None
            self._initialized = False
            self.config = get_mysql_config()
            self._initialize_pool()
            logger.info("Configurações MySQL recarregadas, pool reinicializado")

