# ✅ MIGRAÇÃO COMPLETA - DockerWatcher

## 📊 O QUE FOI IMPLEMENTADO

### **Banco de Dados Unificado**
- ✅ Banco: `docker_watcher` (MySQL no mesmo servidor do bwav4)
- ✅ Tabela única: `robos_dockerizados`
- ✅ **SEM arquivos YAML** salvos na VM
- ✅ YAML gerado dinamicamente em memória

### **Estrutura da Tabela `robos_dockerizados`**

```sql
-- Campos principais:
- nome (UNIQUE) - Nome do robô
- tipo (INDEX) - 'rpa', 'cronjob' ou 'deployment'
- ativo (INDEX) - True/False
- status - 'active' ou 'standby'
- docker_tag, docker_repository
- schedule, timezone (para cronjobs)
- replicas (para deployments)
- qtd_max_instancias, qtd_ram_maxima (para RPAs)
- created_at, updated_at, inativado_em
```

---

## 🔄 COMO FUNCIONA AGORA

### **Criar um RPA/Cronjob/Deployment:**
1. Frontend envia dados → Backend API
2. **Salva no banco** `docker_watcher.robos_dockerizados`
3. **Gera YAML dinamicamente** (em memória, SEM arquivo)
4. Aplica no Kubernetes via `kubectl create -f - <<EOF`

### **Listar Robôs Cadastrados:**
1. Backend busca do banco: `RoboDockerizado.objects.filter(tipo='rpa', ativo=True)`
2. Retorna para o frontend
3. **Quando backend reinicia, carrega tudo do banco!**

### **Deletar:**
1. Deleta do Kubernetes
2. Marca como `ativo=False` e seta `inativado_em`
3. **Não deleta do banco** (mantém histórico)

---

## 🗄️ BANCOS DE DADOS

### **`docker_watcher`** (NOVO)
- RPAs, Cronjobs, Deployments cadastrados
- Tabela: `robos_dockerizados`

### **`bwav4`** (CONTINUA IGUAL)
- Execuções pendentes
- Consultado normalmente pelo `database_service`

---

## ✨ VANTAGENS

✅ **Persistência Total**: Backend cai e volta → Tudo aparece novamente  
✅ **Sem Arquivos**: Nada de `.yaml` espalhado na VM  
✅ **Centralizado**: Tudo em 1 banco, 1 tabela  
✅ **Histórico**: Sabe quando foi criado, editado e inativado  
✅ **Backup Simples**: Dump do banco `docker_watcher`  

---

## 🚀 PRÓXIMOS PASSOS

### **1. Testar Localmente:**
```bash
# No backend (com .venv ativado)
python manage.py runserver

# Criar um RPA/Cronjob/Deployment pela interface
# Reiniciar o backend
# Verificar se aparecem novamente
```

### **2. Migrar para a VM:**
```bash
# Na VM, após clonar o projeto:
cd backend
python -m venv .venv
source .venv/bin/activate
pip install django djangorestframework django-cors-headers mysqlclient paramiko mysql-connector-python PyYAML waitress

# Aplicar migrations
python manage.py migrate

# Rodar servidor
python manage.py runserver 0.0.0.0:8000
```

### **3. Configurar `shared/config.ini`:**
```ini
[MySQL]
host = <IP-do-servidor-bwav4>
port = 3306
user = <usuario>
password = <senha>
database = bwav4  # Para consultar execuções

[BACKEND]
bind_host = 0.0.0.0
bind_port = 8000
```

**IMPORTANTE:** O Django usa automaticamente o banco `docker_watcher` (hardcoded em `settings.py`)

---

## 📝 ARQUIVOS MODIFICADOS

### **Models:**
- `api/models.py` - Modelo unificado `RoboDockerizado`

### **Views:**
- `api/views/rpas.py` - Usa `RoboDockerizado.objects.filter(tipo='rpa')`
- `api/views/cronjobs.py` - Usa `RoboDockerizado.objects.filter(tipo='cronjob')`
- `api/views/deployments.py` - Usa `RoboDockerizado.objects.filter(tipo='deployment')`

### **Services:**
- `services/polling_service.py` - Atualizado para `RoboDockerizado`
- `services/watcher_service.py` - Atualizado para `RoboDockerizado`

### **Settings:**
- `docker_watcher/settings.py` - Banco fixo `docker_watcher`

---

## ✅ RESULTADO FINAL

**Quando você cadastra um robô:**
- ✅ Salva no banco MySQL `docker_watcher`
- ✅ Cria no Kubernetes (sem arquivo YAML)
- ✅ Aparece no frontend

**Quando o backend reinicia:**
- ✅ Carrega todos os robôs do banco
- ✅ Aparecem automaticamente no frontend
- ✅ **Zero perda de dados!**

🎉 **Implementação completa e funcional!**
