from rest_framework import serializers

class JobSerializer(serializers.Serializer):
    name = serializers.CharField()
    namespace = serializers.CharField()
    labels = serializers.DictField()
    completions = serializers.IntegerField()
    active = serializers.IntegerField()
    failed = serializers.IntegerField()
    start_time = serializers.CharField(required=False, allow_null=True)
    completion_time = serializers.CharField(required=False, allow_null=True)
    status = serializers.CharField(required=False, allow_null=True)
    image = serializers.CharField(required=False, allow_null=True)
    pod_name = serializers.CharField(required=False, allow_null=True)

class PodSerializer(serializers.Serializer):
    name = serializers.CharField()
    namespace = serializers.CharField()
    labels = serializers.DictField()
    phase = serializers.CharField()
    status = serializers.CharField()
    start_time = serializers.CharField(required=False, allow_null=True)
    containers = serializers.ListField()

class PodLogsSerializer(serializers.Serializer):
    logs = serializers.CharField()

class RPASerializer(serializers.Serializer):
    nome_rpa = serializers.CharField()
    docker_tag = serializers.CharField()
    qtd_max_instancias = serializers.IntegerField()
    qtd_ram_maxima = serializers.IntegerField()
    utiliza_arquivos_externos = serializers.BooleanField()
    tempo_maximo_de_vida = serializers.IntegerField()
    status = serializers.CharField()  # 'active' ou 'standby'
    execucoes_pendentes = serializers.IntegerField(required=False)
    jobs_ativos = serializers.IntegerField(required=False)
    apelido = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)

class CreateRPASerializer(serializers.Serializer):
    nome_rpa = serializers.CharField()
    docker_tag = serializers.CharField()
    qtd_max_instancias = serializers.IntegerField()
    qtd_ram_maxima = serializers.IntegerField()
    utiliza_arquivos_externos = serializers.BooleanField(default=False)
    tempo_maximo_de_vida = serializers.IntegerField(default=600)
    apelido = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)

class UpdateRPASerializer(serializers.Serializer):
    docker_tag = serializers.CharField(required=False)
    qtd_max_instancias = serializers.IntegerField(required=False)
    qtd_ram_maxima = serializers.IntegerField(required=False)
    utiliza_arquivos_externos = serializers.BooleanField(required=False)
    tempo_maximo_de_vida = serializers.IntegerField(required=False)
    apelido = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)

class CronjobSerializer(serializers.Serializer):
    name = serializers.CharField()
    namespace = serializers.CharField()
    schedule = serializers.CharField()
    suspended = serializers.BooleanField()
    dependente_de_execucoes = serializers.BooleanField(required=False, default=True)
    execucoes_pendentes = serializers.IntegerField(required=False)
    last_schedule_time = serializers.CharField(required=False, allow_null=True)
    last_successful_time = serializers.CharField(required=False, allow_null=True)
    apelido = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)
    image = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    nome_robo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    memory_limit = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    timezone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    ttl_seconds_after_finished = serializers.IntegerField(required=False)

class CreateCronjobSerializer(serializers.Serializer):
    name = serializers.CharField()
    schedule = serializers.CharField()
    timezone = serializers.CharField(default='America/Sao_Paulo')
    nome_robo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    docker_repository = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    docker_tag = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    docker_image = serializers.CharField(required=False, allow_blank=True, allow_null=True)  # Mantido para compatibilidade
    memory_limit = serializers.CharField(default='256Mi')
    ttl_seconds_after_finished = serializers.IntegerField(default=60, required=False)
    dependente_de_execucoes = serializers.BooleanField(default=True)
    apelido = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)

class UpdateCronjobSerializer(serializers.Serializer):
    schedule = serializers.CharField(required=False)
    timezone = serializers.CharField(required=False)
    nome_robo = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    docker_repository = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    docker_tag = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    docker_image = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    memory_limit = serializers.CharField(required=False)
    ttl_seconds_after_finished = serializers.IntegerField(required=False)

class DeploymentSerializer(serializers.Serializer):
    name = serializers.CharField()
    namespace = serializers.CharField()
    replicas = serializers.IntegerField()
    ready_replicas = serializers.IntegerField()
    available_replicas = serializers.IntegerField()
    dependente_de_execucoes = serializers.BooleanField(required=False, default=True)
    execucoes_pendentes = serializers.IntegerField(required=False)
    apelido = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)

class CreateDeploymentSerializer(serializers.Serializer):
    name = serializers.CharField()
    replicas = serializers.IntegerField(default=1)
    nome_robo = serializers.CharField()
    docker_image = serializers.CharField()
    memory_limit = serializers.CharField(default='256Mi')
    dependente_de_execucoes = serializers.BooleanField(default=True)
    apelido = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False, allow_null=True)

class ExecutionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    nome_do_robo = serializers.CharField()
    status_01 = serializers.IntegerField()
    # Adicione outros campos conforme necessário

class ConnectionStatusSerializer(serializers.Serializer):
    ssh_connected = serializers.BooleanField()
    mysql_connected = serializers.BooleanField()
    ssh_error = serializers.CharField(required=False, allow_null=True)
    mysql_error = serializers.CharField(required=False, allow_null=True)

