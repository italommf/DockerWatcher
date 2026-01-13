"""
HeartbeatService - Envia sinal de vida para monitoramento externo.

Este serviço roda em background e envia um POST a cada 1 minuto
para indicar que o backend está ativo.
"""

import requests
import threading
import logging
import time

logger = logging.getLogger(__name__)


class HeartbeatService:
    """
    Serviço que envia heartbeat periódico para monitoramento externo.
    Roda como uma thread daemon que morre junto com o processo principal.
    """
    
    _instance = None
    _lock = threading.Lock()
    
    # Configurações
    URL = "http://rpa.italommf.com.br:8080/system/f8266a54-05c1-40c3-8ecf-462c33d1154c"
    INTERVALO_SEGUNDOS = 60  # 1 minuto
    
    def __new__(cls):
        """Singleton pattern para garantir apenas uma instância."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._running = False
        self._thread = None
        self._stop_event = threading.Event()
        self._initialized = True
    
    def _enviar_heartbeat(self):
        """Envia um POST para a URL configurada."""
        try:
            response = requests.post(
                self.URL, 
                json={"status": True}, 
                timeout=30
            )
            if response.status_code == 200:
                print(f"[HeartbeatService] OK - Heartbeat enviado com sucesso - Status: {response.status_code}")
                logger.info(f"Heartbeat enviado com sucesso - Status: {response.status_code}")
            else:
                print(f"[HeartbeatService] WARN - Heartbeat retornou status: {response.status_code}")
                logger.warning(f"Heartbeat retornou status: {response.status_code}")
            return response.status_code
        except requests.exceptions.RequestException as e:
            print(f"[HeartbeatService] ERROR - Erro ao enviar heartbeat: {e}")
            logger.error(f"Erro ao enviar heartbeat: {e}")
            return None
    
    def _loop(self):
        """Loop principal que envia heartbeat periodicamente."""
        print(f"[HeartbeatService] Loop iniciado - Intervalo: {self.INTERVALO_SEGUNDOS}s")
        logger.info(f"HeartbeatService loop iniciado - Intervalo: {self.INTERVALO_SEGUNDOS}s")
        
        while not self._stop_event.is_set():
            self._enviar_heartbeat()
            # Usa wait ao invés de sleep para permitir interrupção rápida
            self._stop_event.wait(self.INTERVALO_SEGUNDOS)
        
        logger.info("HeartbeatService loop encerrado")
    
    def start(self):
        """Inicia o serviço de heartbeat em background."""
        if self._running:
            logger.warning("HeartbeatService já está rodando")
            return
        
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._loop,
            name="HeartbeatService",
            daemon=True  # Thread daemon morre quando o processo principal morre
        )
        self._thread.start()
        self._running = True
        print(f"[HeartbeatService] OK - Servico iniciado - URL: {self.URL}")
        logger.info(f"HeartbeatService iniciado - URL: {self.URL}")
    
    def stop(self):
        """Para o serviço de heartbeat."""
        if not self._running:
            return
        
        logger.info("Parando HeartbeatService...")
        self._stop_event.set()
        
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        
        self._running = False
        logger.info("HeartbeatService parado")
    
    def is_running(self):
        """Retorna se o serviço está rodando."""
        return self._running and self._thread and self._thread.is_alive()
