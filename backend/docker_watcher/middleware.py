"""
Middleware para rastrear requisições lentas e adicionar identificadores únicos.
"""
import time
import logging
import uuid

logger = logging.getLogger(__name__)

class RequestLoggingMiddleware:
    """
    Middleware para logar todas as requisições com identificadores únicos
    e alertar sobre requisições lentas.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        self.slow_request_threshold = 2.0  # 2 segundos
        
    def __call__(self, request):
        # Gerar ID único para esta requisição
        request_id = f"REQ-{uuid.uuid4().hex[:12].upper()}"
        request._request_id = request_id
        
        # Registrar início da requisição
        start_time = time.time()
        method = request.method
        path = request.path
        query_params = request.GET.urlencode()
        full_path = f"{path}?{query_params}" if query_params else path
        
        logger.info(f"[{request_id}] {method} {full_path} - Iniciando")
        
        try:
            # Processar requisição
            response = self.get_response(request)
            
            # Calcular tempo de resposta
            elapsed = time.time() - start_time
            
            # Log de resposta
            status_code = response.status_code
            if elapsed > self.slow_request_threshold:
                logger.warning(
                    f"[{request_id}] {method} {full_path} - "
                    f"REQUISIÇÃO LENTA: {elapsed:.3f}s (threshold: {self.slow_request_threshold}s) - "
                    f"Status: {status_code}"
                )
            else:
                logger.info(
                    f"[{request_id}] {method} {full_path} - "
                    f"Concluída em {elapsed:.3f}s - Status: {status_code}"
                )
            
            # Adicionar header com request ID para depuração
            response['X-Request-ID'] = request_id
            response['X-Response-Time'] = f"{elapsed:.3f}"
            
            return response
            
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(
                f"[{request_id}] {method} {full_path} - "
                f"ERRO após {elapsed:.3f}s: {str(e)}",
                exc_info=True
            )
            raise

