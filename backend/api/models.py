from django.db import models
import json


class RPA(models.Model):
    """Modelo para armazenar configurações de RPAs no banco de dados."""
    nome_rpa = models.CharField(max_length=255, unique=True)
    docker_tag = models.CharField(max_length=100)
    qtd_max_instancias = models.IntegerField()
    qtd_ram_maxima = models.IntegerField()  # Em MB
    utiliza_arquivos_externos = models.BooleanField(default=False)
    tempo_maximo_de_vida = models.IntegerField(default=600)  # Em segundos
    status = models.CharField(max_length=20, choices=[('active', 'Active'), ('standby', 'Standby')], default='active')
    apelido = models.CharField(max_length=255, blank=True, null=True)
    tags = models.JSONField(default=list, blank=True)  # Lista de tags
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'rpas'
        verbose_name = 'RPA'
        verbose_name_plural = 'RPAs'
    
    def __str__(self):
        return self.nome_rpa
    
    def to_dict(self):
        """Converte o modelo para dicionário compatível com o serializer."""
        return {
            'nome_rpa': self.nome_rpa,
            'docker_tag': self.docker_tag,
            'qtd_max_instancias': self.qtd_max_instancias,
            'qtd_ram_maxima': self.qtd_ram_maxima,
            'utiliza_arquivos_externos': self.utiliza_arquivos_externos,
            'tempo_maximo_de_vida': self.tempo_maximo_de_vida,
            'status': self.status,
            'apelido': self.apelido or '',
            'tags': self.tags or [],
        }


class Cronjob(models.Model):
    """Modelo para armazenar configurações de Cronjobs no banco de dados."""
    name = models.CharField(max_length=255, unique=True)
    namespace = models.CharField(max_length=100, default='default')
    schedule = models.CharField(max_length=100)  # Cron schedule
    yaml_content = models.TextField()  # Conteúdo YAML completo
    suspended = models.BooleanField(default=False)
    dependente_de_execucoes = models.BooleanField(default=True)  # Se True, busca execuções do banco MySQL
    apelido = models.CharField(max_length=255, blank=True, null=True)
    tags = models.JSONField(default=list, blank=True)  # Lista de tags
    last_schedule_time = models.CharField(max_length=100, blank=True, null=True)
    last_successful_time = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'cronjobs'
        verbose_name = 'Cronjob'
        verbose_name_plural = 'Cronjobs'
    
    def __str__(self):
        return self.name


class Deployment(models.Model):
    """Modelo para armazenar configurações de Deployments no banco de dados."""
    name = models.CharField(max_length=255, unique=True)
    namespace = models.CharField(max_length=100, default='default')
    yaml_content = models.TextField()  # Conteúdo YAML completo
    replicas = models.IntegerField(default=1)
    ready_replicas = models.IntegerField(default=0)
    available_replicas = models.IntegerField(default=0)
    dependente_de_execucoes = models.BooleanField(default=True)  # Se True, busca execuções do banco MySQL
    apelido = models.CharField(max_length=255, blank=True, null=True)
    tags = models.JSONField(default=list, blank=True)  # Lista de tags
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'deployments'
        verbose_name = 'Deployment'
        verbose_name_plural = 'Deployments'
    
    def __str__(self):
        return self.name


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

