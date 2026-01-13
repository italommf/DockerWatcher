"""
Configuração do Gunicorn para DockerWatcher.

Este arquivo configura o Gunicorn para rodar o Django com workers otimizados.

Para rodar:
    gunicorn -c gunicorn.conf.py docker_watcher.wsgi:application
"""
import multiprocessing
import os

# Usar apenas 1 worker para garantir que o cache em memória e os serviços singleton
# sejam compartilhados entre todas as requisições. 
# Usamos threads para lidar com concorrência.
workers = 1
threads = 4

# Worker class - gthread para suportar múltiplas threads em um único process
worker_class = "gthread"

# Bind - escutar em todas as interfaces na porta 8000
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")

# Timeout para workers (segundos)
timeout = 120

# Graceful timeout para shutdown
graceful_timeout = 30

# Keep-alive para conexões persistentes
keepalive = 5

# Número máximo de requisições por worker antes de reiniciar
max_requests = 1000
max_requests_jitter = 50

# Logging
accesslog = "-"  # stdout
errorlog = "-"   # stderr
loglevel = os.getenv("LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)sμs'

# Preload app para compartilhar memória entre workers
preload_app = True


def on_starting(server):
    """Chamado quando o servidor Gunicorn está iniciando."""
    # Marcar que estamos rodando via Gunicorn para que apps.py inicie o PollingService
    os.environ["GUNICORN_RUNNING"] = "1"
    print(f"[Gunicorn] Iniciando servidor com {workers} worker e {threads} threads")


def when_ready(server):
    """Chamado quando o servidor está pronto para receber conexões."""
    print(f"[Gunicorn] Servidor pronto. Workers: {workers}")
    # HeartbeatService é iniciado pelo apps.py para evitar duplicação


def worker_int(worker):
    """Chamado quando um worker é interrompido."""
    pass


def worker_abort(worker):
    """Chamado quando um worker é abortado."""
    pass


def on_exit(server):
    """Chamado quando o servidor Gunicorn está encerrando."""
    print("[Gunicorn] Servidor encerrando...")

