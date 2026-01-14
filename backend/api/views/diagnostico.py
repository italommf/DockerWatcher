"""
Endpoint de diagnóstico para execuções.
Refatorado - sem cache e SSH.
"""

import logging
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from api.models import RoboDockerizado

from k8s.client import get_k8s_client, K8S_AVAILABLE
from metrics.client import get_prometheus_client, PROMETHEUS_AVAILABLE

logger = logging.getLogger(__name__)


@api_view(['GET'])
def diagnostico_execucoes(request):
    """Diagnóstico do sistema."""
    try:
        # RPAs cadastrados
        rpas_db = RoboDockerizado.objects.filter(tipo='rpa')
        rpas_ativos = rpas_db.filter(ativo=True)
        
        # Status K8s
        k8s_status = "Não disponível"
        if K8S_AVAILABLE:
            try:
                client = get_k8s_client()
                k8s_status = "Conectado" if client.is_available() else "Desconectado"
            except:
                k8s_status = "Erro"
        
        # Status Prometheus
        prom_status = "Não disponível"
        if PROMETHEUS_AVAILABLE:
            try:
                prom = get_prometheus_client()
                prom_status = "Conectado" if prom.is_available() else "Desconectado"
            except:
                prom_status = "Erro"
        
        diagnostico = {
            "status": "ok",
            "kubernetes": k8s_status,
            "prometheus": prom_status,
            "rpas": {
                "total": rpas_db.count(),
                "ativos": rpas_ativos.count(),
            },
            "cronjobs": {
                "total": RoboDockerizado.objects.filter(tipo='cronjob').count(),
            },
            "deployments": {
                "total": RoboDockerizado.objects.filter(tipo='deployment').count(),
            }
        }
        
        return Response(diagnostico, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Erro no diagnóstico: {e}", exc_info=True)
        return Response({"erro": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
