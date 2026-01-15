import re

def identify_robot(resource_name, labels, robo_names):
    """
    Identifica a qual robô cadastrado um recurso (Pod/Job/etc) pertence.
    
    Args:
        resource_name: Nome do recurso no K8s
        labels: Dicionário de labels do recurso
        robo_names: Conjunto de nomes (em lowercase) dos robôs cadastrados
        
    Returns:
        nome_robo (str) ou None
    """
    # 1. Tentar pelas labels específicas
    nome_robo = (
        labels.get('nome_robo') or 
        labels.get('nome-robo') or
        labels.get('app') or
        labels.get('job-name')
    )
    
    if nome_robo and nome_robo.lower() in robo_names:
        return nome_robo.lower()
    
    # 2. Tentar por prefixo no nome do recurso
    res_name_lower = resource_name.lower()
    
    # Limpar sufixos comuns de jobs/pods gerados
    # Remove -[random-suffix] ou -manual-[timestamp]
    clean_name = re.sub(r'-(manual-)?\d+$', '', res_name_lower)
    clean_name = re.sub(r'-[a-z0-9]{5,10}$', '', clean_name) # hash do pod
    
    if clean_name in robo_names:
        return clean_name
        
    # Tentar prefixos literais
    for name in robo_names:
        if res_name_lower.startswith(name):
            # Verificar se o próximo caractere é um separador para evitar matches parciais (ex: "bot" combinando com "bot2")
            if len(res_name_lower) == len(name) or res_name_lower[len(name)] in ('-', '_', '.'):
                return name
                
    return None
