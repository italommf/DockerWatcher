import axios from 'axios'

const API_BASE_URL = 'http://127.0.0.1:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor para tratar erros
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Timeout na requisição. Verifique se o backend está rodando.')
    }
    if (error.response) {
      throw new Error(error.response.data?.error || error.response.data?.message || 'Erro na requisição')
    }
    if (error.request) {
      throw new Error('Erro de conexão. Verifique se o backend está rodando.')
    }
    throw error
  }
)

export default {
  // Connection
  async getConnectionStatus() {
    const response = await api.get('/api/connection/status/')
    return response.data
  },

  async reloadServices() {
    const response = await api.post('/api/connection/reload/')
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

  // Cronjobs
  async getCronjobs() {
    const response = await api.get('/api/cronjobs/')
    return response.data
  },

  async createCronjob(cronjobData) {
    const response = await api.post('/api/cronjobs/', cronjobData)
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

  // Config
  async getConfig() {
    const response = await api.get('/api/config/')
    return response.data
  },

  async saveConfig(configData) {
    const response = await api.post('/api/config/save/', configData)
    return response.data
  },
}
