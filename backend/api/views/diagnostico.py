import logging
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from services.service_manager import get_kubernetes_service, get_ssh_service
from services.cache_service import CacheKeys, CacheService
from api.models import RoboDockerizado

logger = logging.getLogger(__name__)


@api_view(['GET'])
def diagnostico_execucoes(request):
    """
    Endpoint de diagnóstico para verificar a busca de execuções no BWAV4.
    """
    try:
        # 1. Buscar RPAs cadastrados localmente
        rpas_cadastrados = list(RPA.objects.all().values('nome_rpa', 'status', 'apelido'))
        rpas_ativos = list(RPA.objects.filter(status='active').values_list('nome_rpa', flat=True))
        
        # 2. Buscar o que está no cache de execuções
        execucoes_cache = CacheService.get_data(CacheKeys.EXECUTIONS, {})
        
        # 3. Tentar buscar diretamente no banco BWAV4 (se estiver conectado)
        db_service = get_database_service()
        resultado_busca_direta = None
        nomes_encontrados_bwav4 = []
        
        if db_service._initialized and rpas_ativos:
            try:
                # Buscar diretamente as execuções pendentes
                resultado_busca_direta = db_service.obter_execucoes(rpas_ativos)
                
                # Tentar buscar todos os nomes de robôs no BWAV4 para comparação
                conn = db_service._get_connection()
                cursor = conn.cursor(dictionary=True)
                cursor.execute("SELECT DISTINCT nome_do_robo FROM bwav4.robo ORDER BY nome_do_robo")
                nomes_encontrados_bwav4 = [row['nome_do_robo'] for row in cursor.fetchall()]
                cursor.close()
                conn.close()
            except Exception as e:
                logger.error(f"Erro ao buscar dados do BWAV4: {e}")
                resultado_busca_direta = {"erro": str(e)}
        
        # 4. Verificar matches entre nomes cadastrados e nomes no BWAV4
        matches = []
        nao_encontrados = []
        
        for rpa_nome in rpas_ativos:
            # Verificar match exato
            if rpa_nome in nomes_encontrados_bwav4:
                matches.append({
                    "nome_cadastrado": rpa_nome,
                    "nome_bwav4": rpa_nome,
                    "tipo": "exato"
                })
            else:
                # Verificar match case-insensitive
                match_encontrado = False
                for nome_bwav4 in nomes_encontrados_bwav4:
                    if rpa_nome.lower() == nome_bwav4.lower():
                        matches.append({
                            "nome_cadastrado": rpa_nome,
                            "nome_bwav4": nome_bwav4,
                            "tipo": "case-insensitive"
                        })
                        match_encontrado = True
                        break
                    # Verificar match sem hífens/underscores
                    nome_norm_cadastrado = rpa_nome.replace("-", "").replace("_", "").lower()
                    nome_norm_bwav4 = nome_bwav4.replace("-", "").replace("_", "").lower()
                    if nome_norm_cadastrado == nome_norm_bwav4:
                        matches.append({
                            "nome_cadastrado": rpa_nome,
                            "nome_bwav4": nome_bwav4,
                            "tipo": "normalizado"
                        })
                        match_encontrado = True
                        break
                
                if not match_encontrado:
                    nao_encontrados.append(rpa_nome)
        
        # 5. Contar execuções por RPA
        execucoes_por_rpa = {}
        if isinstance(resultado_busca_direta, dict) and "erro" not in resultado_busca_direta:
            for nome_rpa, execucoes in resultado_busca_direta.items():
                execucoes_por_rpa[nome_rpa] = len(execucoes) if isinstance(execucoes, list) else 0
        
        # Montar resposta
        diagnostico = {
            "status": "ok" if db_service._initialized else "mysql_desconectado",
            "mysql_conectado": db_service._initialized,
            "rpas_cadastrados": {
                "total": len(rpas_cadastrados),
                "ativos": len(rpas_ativos),
                "standby": len([r for r in rpas_cadastrados if r['status'] == 'standby']),
                "lista": rpas_cadastrados
            },
            "rpas_ativos_buscados": rpas_ativos,
            "nomes_robos_bwav4": {
                "total": len(nomes_encontrados_bwav4),
                "lista": nomes_encontrados_bwav4
            },
            "matches": {
                "total": len(matches),
                "lista": matches
            },
            "nao_encontrados": {
                "total": len(nao_encontrados),
                "lista": nao_encontrados,
                "dica": "Estes RPAs cadastrados não foram encontrados no banco BWAV4. Verifique se os nomes estão corretos."
            },
            "execucoes_encontradas": {
                "total": sum(execucoes_por_rpa.values()),
                "por_rpa": execucoes_por_rpa
            },
            "cache_execucoes": {
                "total_rpas": len(execucoes_cache) if isinstance(execucoes_cache, dict) else 0,
                "dados": execucoes_cache if isinstance(execucoes_cache, dict) else {}
            }
        }
        
        return Response(diagnostico, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Erro no diagnóstico de execuções: {e}", exc_info=True)
        return Response({
            "erro": str(e),
            "detalhes": "Erro ao executar diagnóstico"
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

