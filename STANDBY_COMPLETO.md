# 🎯 STANDBY COMPLETO - RPAs, Deployments e Cronjobs

## ✅ IMPLEMENTADO NO BACKEND

### **1. RPAs - Standby**
**Endpoint:** `POST /api/rpas/{nome}/standby/`

**O que faz:**
1. Busca todos os jobs deste RPA no Kubernetes
2. Deleta todos os jobs encontrados
3. Atualiza no banco:
   - `status = 'standby'`
   - `ativo = False`
   - `inativado_em = timestamp atual`
4. Remove execuções do cache
5. Retorna: `{message, jobs_deletados}`

**Endpoint:** `POST /api/rpas/{nome}/activate/`
- Reativa o RPA (status='active', ativo=True)

---

### **2. Deployments - Standby**
**Endpoint:** `POST /api/deployments/{nome}/standby/`

**O que faz:**
1. Deleta deployment do Kubernetes (remove TODOS os pods)
2. Atualiza no banco:
   - `status = 'standby'`
   - `ativo = False`
   - `inativado_em = timestamp atual`
3. Invalidar cache
4. Retorna: `{message}`

**Endpoint:** `POST /api/deployments/{nome}/activate/`
- Recria deployment no Kubernetes com dados do banco
- Atualiza status='active', ativo=True

---

### **3. Cronjobs - Standby**
**Endpoint:** `POST /api/cronjobs/{nome}/standby/`

**O que faz:**
1. Suspende cronjob no Kubernetes (para de criar jobs novos)
2. Deleta jobs ativos criados por este cronjob
3. Atualiza no banco:
   - `suspended = True`
   - `status = 'standby'`
   - `ativo = False`
   - `inativado_em = timestamp atual`
4. Retorna: `{message, jobs_deletados}`

**Endpoint:** `POST /api/cronjobs/{nome}/activate/`
- Reativa cronjob no Kubernetes
- Atualiza suspended=False, status='active', ativo=True

---

## 📋 PRÓXIMO PASSO - FRONTEND

### **Adicionar Confirmação:**

No frontend, ao clicar em "Standby", mostrar dialog:

```javascript
const handleStandby = async (robotName, type) => {
  const confirm = await showConfirmDialog({
    title: `Colocar ${robotName} em Standby?`,
    message: `Todas as instâncias rodando serão finalizadas imediatamente. Deseja continuar?`,
    confirmText: 'Sim, Finalizar',
    cancelText: 'Cancelar'
  })
  
  if (confirm) {
    try {
      let response
      if (type === 'rpa') {
        response = await api.rpaStandby(robotName)
      } else if (type === 'deployment') {
        response = await api.deploymentStandby(robotName)
      } else if (type === 'cronjob') {
        response = await api.cronjobStandby(robotName)
      }
      
      enqueueSnackbar(response.message, { variant: 'success' })
      refreshData()
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }
}
```

### **Funções API a adicionar (api.js):**

```javascript
// RPAs
async rpaStandby(nomeRpa) {
  const response = await api.post(`/api/rpas/${nomeRpa}/standby/`)
  return response.data
},

async rpaActivate(nomeRpa) {
  const response = await api.post(`/api/rpas/${nomeRpa}/activate/`)
  return response.data
},

// Deployments
async deploymentStandby(nome) {
  const response = await api.post(`/api/deployments/${nome}/standby/`)
  return response.data
},

async deploymentActivate(nome) {
  const response = await api.post(`/api/deployments/${nome}/activate/`)
  return response.data
},

// Cronjobs já têm (verificar se existem)
```

---

## 🎯 COMPORTAMENTO ESPERADO

### **Quando Standby:**
1. ✅ Usuário clica em "Standby"
2. ✅ Dialog de confirmação aparece
3. ✅ Usuário confirma
4. ✅ Backend deleta instâncias do Kubernetes
5. ✅ Backend atualiza banco (status=standby, ativo=False)
6. ✅ Frontend mostra: "RPA em standby. 3 instância(s) finalizada(s)."
7. ✅ Robô **não roda mais** até ser reativado

### **Quando Activate:**
1. ✅ Usuário clica em "Ativar"
2. ✅ Backend atualiza banco (status=active, ativo=True)
3. ✅ Para Deployments: Recria no Kubernetes
4. ✅ Para Cronjobs: Retoma agendamento
5. ✅ Para RPAs: Volta a pegar execuções

---

## ✅ RESULTADO

**RPAs, Deployments e Cronjobs:**
- ✅ Standby funciona (deleta instâncias)
- ✅ Activate funciona (reativa)
- ✅ Dados salvos no banco
- ✅ Sincronizado com Kubernetes
- ✅ Controle total via interface

🎉 **Backend completo! Falta apenas adicionar confirmação no frontend.**
