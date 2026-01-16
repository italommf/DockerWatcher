"""
Utilitários para processar robôs após criação/ativação.
"""
import logging
from typing import Optional

from api.models import RoboDockerizado
from services.executions_api_service import get_executions_api_service
from k8s.jobs import JobService

logger = logging.getLogger(__name__)


def processar_execucoes_apos_criacao(robo: RoboDockerizado) -> dict:
    """
    Processa execuções pendentes após criar/ativar um robô.
    
    Consulta o MongoDB para execuções com status 4 e cria jobs
    respeitando o limite máximo de instâncias.
    
    Args:
        robo: Instância de RoboDockerizado (RPA, Cronjob ou Deployment)
        
    Returns:
        dict com informações sobre o processamento:
        {
            'execucoes_encontradas': int,
            'jobs_criados': int,
            'jobs_ativos_antes': int,
            'limite_maximo': int
        }
    """
    resultado = {
        'execucoes_encontradas': 0,
        'jobs_criados': 0,
        'jobs_ativos_antes': 0,
        'limite_maximo': 0
    }
    
    # Apenas RPAs criam jobs baseados em execuções pendentes
    if robo.tipo != 'rpa':
        logger.debug(f"Robô {robo.nome} é do tipo {robo.tipo}, não processa execuções pendentes")
        return resultado
    
    # Verificar se tem UUID configurado
    if not robo.robo_uuid or robo.robo_uuid.strip() == '':
        logger.debug(f"RPA {robo.nome} não tem robo_uuid configurado, pulando consulta de execuções")
        return resultado
    
    # Verificar se está ativo
    if not robo.ativo or robo.status != 'active':
        logger.debug(f"RPA {robo.nome} não está ativo, pulando processamento de execuções")
        return resultado
    
    # Verificar se tem repositório Docker
    if not robo.docker_repository:
        logger.warning(f"RPA {robo.nome} não tem docker_repository configurado, não é possível criar jobs")
        return resultado
    
    try:
        # Consultar execuções pendentes no MongoDB
        executions_api = get_executions_api_service()
        execucoes = executions_api.obter_execucoes_por_uuid(robo.robo_uuid)
        
        resultado['execucoes_encontradas'] = len(execucoes)
        
        if not execucoes:
            logger.info(f"RPA {robo.nome}: Nenhuma execução pendente encontrada")
            return resultado
        
        logger.info(f"RPA {robo.nome}: {len(execucoes)} execuções pendentes encontradas")
        
        # Contar jobs ativos atuais
        job_service = JobService()
        jobs = job_service.list()
        nome_lower = robo.nome.lower()
        jobs_ativos = sum(1 for j in jobs if j.labels.get('nome_robo', '').lower() == nome_lower and j.active > 0)
        resultado['jobs_ativos_antes'] = jobs_ativos
        
        # Limite máximo de instâncias
        qtd_max = robo.qtd_max_instancias or 1
        resultado['limite_maximo'] = qtd_max
        
        # Calcular quantos jobs podem ser criados
        jobs_para_criar = min(len(execucoes), max(0, qtd_max - jobs_ativos))
        
        if jobs_para_criar <= 0:
            logger.info(f"RPA {robo.nome}: Limite de instâncias atingido ({jobs_ativos}/{qtd_max})")
            return resultado
        
        logger.info(f"RPA {robo.nome}: Criando {jobs_para_criar} job(s) de {len(execucoes)} execuções pendentes")
        
        # Criar jobs
        docker_image = f"{robo.docker_repository}:{robo.docker_tag or 'latest'}"
        jobs_criados_count = 0
        
        for i in range(jobs_para_criar):
            try:
                job = job_service.create(
                    name=f"rpa-job-{robo.nome.replace('_', '-').lower()}",
                    image=docker_image,
                    memory_limit=f"{robo.qtd_ram_maxima or 256}Mi",
                    labels={'nome_robo': nome_lower},
                    env={'NOME_ROBO': nome_lower},
                    active_deadline=robo.tempo_maximo_de_vida or 600
                )
                
                if job:
                    jobs_criados_count += 1
                    logger.info(f"Job criado para RPA {robo.nome}: {job.name}")
                else:
                    logger.warning(f"Falha ao criar job {i+1} para RPA {robo.nome}")
                    
            except Exception as e:
                logger.error(f"Erro ao criar job {i+1} para RPA {robo.nome}: {e}")
                continue
        
        resultado['jobs_criados'] = jobs_criados_count
        
        if jobs_criados_count > 0:
            logger.info(f"RPA {robo.nome}: {jobs_criados_count} job(s) criado(s) com sucesso")
        
    except Exception as e:
        logger.error(f"Erro ao processar execuções para RPA {robo.nome}: {e}", exc_info=True)
    
    return resultado
