from django.db import models
from django.utils import timezone
import json


class RoboDockerizado(models.Model):
    """Modelo unificado para todos os robôs dockerizados (RPA, Cronjob, Deployment)."""
    
    # Identificação
    nome = models.CharField(max_length=255, unique=True, db_index=True)
    apelido = models.CharField(max_length=255, blank=True, null=True)
    tipo = models.CharField(max_length=20, choices=[
        ('rpa', 'RPA'),
        ('cronjob', 'Cronjob'),
        ('deployment', 'Deployment')
    ], db_index=True)
    
    # Status
    ativo = models.BooleanField(default=True, db_index=True)
    status = models.CharField(max_length=20, default='active')  # active, standby
    
    # Configurações Docker
    docker_tag = models.CharField(max_length=100)
    docker_repository = models.CharField(max_length=255, blank=True, null=True)
    namespace = models.CharField(max_length=100, default='default')
    
    # Configurações de Recursos (RPA e Deployment)
    qtd_max_instancias = models.IntegerField(null=True, blank=True)
    qtd_ram_maxima = models.IntegerField(null=True, blank=True)  # Em MB
    memory_limit = models.CharField(max_length=20, default='256Mi')
    utiliza_arquivos_externos = models.BooleanField(default=False)
    tempo_maximo_de_vida = models.IntegerField(default=600)  # Em segundos
    
    # Configurações de Réplicas (Deployment)
    replicas = models.IntegerField(default=1)
    ready_replicas = models.IntegerField(default=0)
    available_replicas = models.IntegerField(default=0)
    
    # Configurações de Agendamento (Cronjob)
    schedule = models.CharField(max_length=100, blank=True, null=True)  # Cron schedule
    timezone = models.CharField(max_length=50, default='America/Sao_Paulo')
    suspended = models.BooleanField(default=False)
    ttl_seconds_after_finished = models.IntegerField(default=60)
    last_schedule_time = models.CharField(max_length=100, blank=True, null=True)
    last_successful_time = models.CharField(max_length=100, blank=True, null=True)
    
    # Metadados
    dependente_de_execucoes = models.BooleanField(default=True)
    tags = models.JSONField(default=list, blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    inativado_em = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'robos_dockerizados'
        verbose_name = 'Robô Dockerizado'
        verbose_name_plural = 'Robôs Dockerizados'
        indexes = [
            models.Index(fields=['tipo', 'ativo']),
            models.Index(fields=['nome']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.nome} ({self.tipo})"
    
    def to_dict(self):
        """Converte o modelo para dicionário."""
        base_dict = {
            'nome': self.nome,
            'apelido': self.apelido or '',
            'tipo': self.tipo,
            'ativo': self.ativo,
            'status': self.status,
            'docker_tag': self.docker_tag,
            'namespace': self.namespace,
            'tags': self.tags or [],
            'dependente_de_execucoes': self.dependente_de_execucoes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        
        # Campos específicos por tipo
        if self.tipo == 'rpa':
            base_dict.update({
                'nome_rpa': self.nome,  # Compatibilidade
                'qtd_max_instancias': self.qtd_max_instancias,
                'qtd_ram_maxima': self.qtd_ram_maxima,
                'utiliza_arquivos_externos': self.utiliza_arquivos_externos,
                'tempo_maximo_de_vida': self.tempo_maximo_de_vida,
            })
        elif self.tipo == 'cronjob':
            base_dict.update({
                'name': self.nome,  # Compatibilidade
                'schedule': self.schedule,
                'timezone': self.timezone,
                'suspended': self.suspended,
                'ttl_seconds_after_finished': self.ttl_seconds_after_finished,
                'last_schedule_time': self.last_schedule_time,
                'last_successful_time': self.last_successful_time,
                'docker_repository': self.docker_repository,
                'memory_limit': self.memory_limit,
            })
        elif self.tipo == 'deployment':
            base_dict.update({
                'name': self.nome,  # Compatibilidade
                'replicas': self.replicas,
                'ready_replicas': self.ready_replicas,
                'available_replicas': self.available_replicas,
                'docker_repository': self.docker_repository,
                'memory_limit': self.memory_limit,
            })
        
        return base_dict


class FailedPod(models.Model):
    """Modelo para armazenar pods com falhas no banco de dados."""
    name = models.CharField(max_length=255, db_index=True)
    namespace = models.CharField(max_length=100, default='default')
    labels = models.JSONField(default=dict)  # Labels do pod
    phase = models.CharField(max_length=50)  # Phase do pod (Failed, etc)
    status = models.CharField(max_length=100)  # Status detalhado
    start_time = models.CharField(max_length=100, blank=True, null=True)
    containers = models.JSONField(default=list)  # Informações dos containers
    logs = models.TextField(blank=True, null=True)  # Logs do pod
    nome_robo = models.CharField(max_length=255, blank=True, null=True)  # Nome do robô associado
    failed_at = models.DateTimeField(auto_now_add=True)  # Data/hora da falha
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'failed_pods'
        verbose_name = 'Failed Pod'
        verbose_name_plural = 'Failed Pods'
        indexes = [
            models.Index(fields=['failed_at']),  # Índice para queries de limpeza
            models.Index(fields=['name']),  # Índice para busca por nome
        ]
    
    def __str__(self):
        return f"{self.name} (failed at {self.failed_at})"

