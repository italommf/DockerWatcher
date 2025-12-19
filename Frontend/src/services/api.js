import axios from 'axios'
import { getApiUrl } from '../config/apiConfig'

// Função para criar instâncias do axios com URL atualizada
function createApiInstance(timeout = 30000) {
  const baseURL = getApiUrl()
  return axios.create({
    baseURL,
    timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

// Instâncias do axios (serão recriadas quando a URL mudar)
let api = createApiInstance(30000)
let apiConnection = createApiInstance(20000)

// Função para atualizar a URL da API (útil quando o usuário muda a configuração)
export function updateApiUrl() {
  api = createApiInstance(30000)
  apiConnection = createApiInstance(20000)

  // Reconfigurar interceptors
  api.interceptors.response.use(
    (response) => response,
    errorInterceptor
  )

  apiConnection.interceptors.response.use(
    (response) => response,
    errorInterceptor
  )
}

// Interceptor para tratar erros (sem reinicialização automática)
const errorInterceptor = (error) => {
  // Extrair informações da requisição para depuração
  const method = error.config?.method?.toUpperCase() || 'UNKNOWN'
  const url = error.config?.url || error.config?.baseURL || 'UNKNOWN'
  const fullUrl = error.config?.url ? `${error.config.baseURL}${error.config.url}` : url
  const timeout = error.config?.timeout || 'N/A'

  // Gerar ID único para este erro
  const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  if (error.code === 'ECONNABORTED') {
    const errorMsg = `[${errorId}] TIMEOUT: ${method} ${fullUrl} (timeout: ${timeout}ms) - Backend pode estar lento ou não está respondendo`
    console.error(errorMsg, {
      errorId,
      method,
      url: fullUrl,
      timeout,
      config: error.config
    })
    throw new Error(errorMsg)
  }
  if (error.response) {
    // Erro com resposta do servidor
    const status = error.response.status || 'N/A'
    const errorMessage = error.response.data?.error || error.response.data?.message || 'Erro na requisição'
    const errorMsg = `[${errorId}] HTTP ${status}: ${method} ${fullUrl} - ${errorMessage}`
    console.error(errorMsg, {
      errorId,
      method,
      url: fullUrl,
      status,
      response: error.response.data
    })
    throw new Error(errorMsg)
  }
  if (error.request) {
    // Requisição foi feita mas não houve resposta
    if (error.code === 'ECONNREFUSED') {
      const apiUrl = getApiUrl()
      const errorMsg = `[${errorId}] CONNECTION_REFUSED: ${method} ${fullUrl} - Backend não está rodando em ${apiUrl}`
      console.error(errorMsg, {
        errorId,
        method,
        url: fullUrl,
        code: error.code
      })
      throw new Error(errorMsg)
    }
    const apiUrl = getApiUrl()
    const errorMsg = `[${errorId}] NO_RESPONSE: ${method} ${fullUrl} - Backend não está respondendo em ${apiUrl}`
    console.error(errorMsg, {
      errorId,
      method,
      url: fullUrl,
      code: error.code,
      request: error.request
    })
    throw new Error(errorMsg)
  }
  const errorMsg = `[${errorId}] UNKNOWN_ERROR: ${method} ${fullUrl} - ${error.message || 'Erro desconhecido'}`
  console.error(errorMsg, {
    errorId,
    method,
    url: fullUrl,
    error
  })
  throw new Error(errorMsg)
}

// Configurar interceptors
api.interceptors.response.use(
  (response) => response,
  errorInterceptor
)

apiConnection.interceptors.response.use(
  (response) => response,
  errorInterceptor
)

export default {
  // Connection
  async getConnectionStatus() {
    const response = await api.get('/api/connection/status/')
    return response.data
  },

  async reloadServices() {
    const response = await apiConnection.post('/api/connection/reload/')
    return response.data
  },

  async testSshConnection() {
    const response = await apiConnection.get('/api/connection/ssh/')
    return response.data
  },

  async testMysqlConnection() {
    const response = await apiConnection.get('/api/connection/mysql/')
    return response.data
  },

  // Jobs
  async getJobs(labelSelector = null) {
    const params = labelSelector ? { label_selector: labelSelector } : {}
    const response = await api.get('/api/jobs/', { params })
    return response.data
  },

  async getJobStatus(rpaName = null) {
    const params = rpaName ? { rpa_name: rpaName } : {}
    const response = await api.get('/api/jobs/status/', { params })
    return response.data
  },

  async createJob(jobData) {
    const response = await api.post('/api/jobs/', jobData)
    return response.data
  },

  async deleteJob(jobName) {
    const response = await api.delete(`/api/jobs/${jobName}/`)
    return response.data
  },

  // RPAs
  async getRPAs() {
    const response = await api.get('/api/rpas/')
    return response.data
  },

  async getRPA(nomeRpa) {
    const response = await api.get(`/api/rpas/${nomeRpa}/`)
    return response.data
  },

  async createRPA(rpaData) {
    const response = await api.post('/api/rpas/', rpaData)
    return response.data
  },

  async updateRPA(nomeRpa, rpaData) {
    const response = await api.put(`/api/rpas/${nomeRpa}/`, rpaData)
    return response.data
  },

  async deleteRPA(nomeRpa) {
    const response = await api.delete(`/api/rpas/${nomeRpa}/`)
    return response.data
  },

  async rpaStandby(nomeRpa) {
    const response = await api.post(`/api/rpas/${nomeRpa}/standby/`)
    return response.data
  },

  async rpaActivate(nomeRpa) {
    const response = await api.post(`/api/rpas/${nomeRpa}/activate/`)
    return response.data
  },

  // Executions
  async getExecutions(rpaName = null) {
    const params = rpaName ? { rpa_name: rpaName } : {}
    const response = await api.get('/api/executions/', { params })
    return response.data
  },

  // Pods
  async getPods(rpaName = null) {
    const params = rpaName ? { rpa_name: rpaName } : {}
    const response = await api.get('/api/pods/', { params })
    return response.data
  },

  async getPodLogs(podName, tail = 100) {
    const response = await api.get(`/api/pods/${podName}/logs/`, { params: { tail } })
    return response.data
  },

  async deletePod(podName) {
    const response = await api.delete(`/api/pods/${podName}/`)
    return response.data
  },

  // Jobs
  async stopJob(jobName) {
    const response = await api.delete(`/api/jobs/${jobName}/`)
    return response.data
  },

  // Falhas (Pods com falhas)
  async getFailedPods() {
    const response = await api.get('/api/falhas/')
    return response.data
  },

  async getFailedPodLogs(podName, tail = 100) {
    const response = await api.get(`/api/falhas/${podName}/logs/`, { params: { tail } })
    return response.data
  },

  // Cronjobs
  async getCronjobs() {
    // Busca cronjobs cadastrados no banco (todos, mesmo inativos)
    const response = await api.get('/api/cronjobs/')
    return response.data
  },

  async getCronjobsFromKubernetes() {
    // Busca cronjobs ATIVOS no Kubernetes (para Dashboard)
    const response = await api.get('/api/cronjobs/kubernetes/')
    return response.data
  },

  async createCronjob(cronjobData) {
    const response = await api.post('/api/cronjobs/', cronjobData)
    return response.data
  },

  async updateCronjob(name, cronjobData) {
    const response = await api.put(`/api/cronjobs/${name}/`, cronjobData)
    return response.data
  },

  async getCronjob(name) {
    const response = await api.get(`/api/cronjobs/${name}/`)
    return response.data
  },

  async deleteCronjob(name) {
    const response = await api.delete(`/api/cronjobs/${name}/`)
    return response.data
  },

  async cronjobRunNow(name) {
    const response = await api.post(`/api/cronjobs/${name}/run_now/`)
    return response.data
  },

  async cronjobStandby(name) {
    const response = await api.post(`/api/cronjobs/${name}/standby/`)
    return response.data
  },

  async cronjobActivate(name) {
    const response = await api.post(`/api/cronjobs/${name}/activate/`)
    return response.data
  },

  // Deployments
  async getDeployments() {
    const response = await api.get('/api/deployments/')
    return response.data
  },

  async createDeployment(deploymentData) {
    const response = await api.post('/api/deployments/', deploymentData)
    return response.data
  },

  async updateDeployment(name, deploymentData) {
    const response = await api.put(`/api/deployments/${name}/`, deploymentData)
    return response.data
  },

  async deleteDeployment(name) {
    const response = await api.delete(`/api/deployments/${name}/`)
    return response.data
  },

  async deploymentStandby(name) {
    const response = await api.post(`/api/deployments/${name}/standby/`)
    return response.data
  },

  async deploymentActivate(name) {
    const response = await api.post(`/api/deployments/${name}/activate/`)
    return response.data
  },

  // Config
  async getConfig() {
    const response = await api.get('/api/config/')
    return response.data
  },

  async saveConfig(configData) {
    const response = await api.post('/api/config/save/', configData)
    return response.data
  },

  // Resources
  async getVMResources() {
    const response = await api.get('/api/resources/vm/')
    return response.data
  },

  async getPodResources() {
    const response = await api.get('/api/resources/pods/')
    return response.data
  },
}
