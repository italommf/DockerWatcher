# Generated migration for RPA, Cronjob, and Deployment models

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='RPA',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nome_rpa', models.CharField(max_length=255, unique=True)),
                ('docker_tag', models.CharField(max_length=100)),
                ('qtd_max_instancias', models.IntegerField()),
                ('qtd_ram_maxima', models.IntegerField()),
                ('utiliza_arquivos_externos', models.BooleanField(default=False)),
                ('tempo_maximo_de_vida', models.IntegerField(default=600)),
                ('status', models.CharField(choices=[('active', 'Active'), ('standby', 'Standby')], default='active', max_length=20)),
                ('apelido', models.CharField(blank=True, max_length=255, null=True)),
                ('tags', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'RPA',
                'verbose_name_plural': 'RPAs',
                'db_table': 'rpas',
            },
        ),
        migrations.CreateModel(
            name='Cronjob',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255, unique=True)),
                ('namespace', models.CharField(default='default', max_length=100)),
                ('schedule', models.CharField(max_length=100)),
                ('yaml_content', models.TextField()),
                ('suspended', models.BooleanField(default=False)),
                ('apelido', models.CharField(blank=True, max_length=255, null=True)),
                ('tags', models.JSONField(blank=True, default=list)),
                ('last_schedule_time', models.CharField(blank=True, max_length=100, null=True)),
                ('last_successful_time', models.CharField(blank=True, max_length=100, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Cronjob',
                'verbose_name_plural': 'Cronjobs',
                'db_table': 'cronjobs',
            },
        ),
        migrations.CreateModel(
            name='Deployment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255, unique=True)),
                ('namespace', models.CharField(default='default', max_length=100)),
                ('yaml_content', models.TextField()),
                ('replicas', models.IntegerField(default=1)),
                ('ready_replicas', models.IntegerField(default=0)),
                ('available_replicas', models.IntegerField(default=0)),
                ('apelido', models.CharField(blank=True, max_length=255, null=True)),
                ('tags', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Deployment',
                'verbose_name_plural': 'Deployments',
                'db_table': 'deployments',
            },
        ),
    ]
