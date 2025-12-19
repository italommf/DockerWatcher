// Configuração da API - URL do backend
const DEFAULT_API_URL = 'http://127.0.0.1:8000'

// Função para obter URL da API do localStorage ou usar padrão
export function getApiUrl() {
  try {
    const savedUrl = localStorage.getItem('api_base_url')
    if (savedUrl) {
      return savedUrl
    }
  } catch (error) {
    console.warn('Erro ao ler URL da API do localStorage:', error)
  }
  return DEFAULT_API_URL
}

// Função para salvar URL da API
export function setApiUrl(url) {
  try {
    // Validar URL
    try {
      new URL(url)
    } catch (e) {
      throw new Error('URL inválida')
    }
    
    localStorage.setItem('api_base_url', url)
    return true
  } catch (error) {
    console.error('Erro ao salvar URL da API:', error)
    return false
  }
}

// Função para testar conexão com a API
export async function testApiConnection(url) {
  try {
    const response = await fetch(`${url}/api/connection/status/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 segundos de timeout
    })
    
    if (response.ok) {
      return { success: true, message: 'Conexão bem-sucedida' }
    } else {
      return { success: false, message: `Erro HTTP ${response.status}` }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, message: 'Timeout: Backend não está respondendo' }
    }
    if (error.message.includes('Failed to fetch') || error.message.includes('ECONNREFUSED')) {
      return { success: false, message: 'Conexão recusada: Backend não está rodando ou URL incorreta' }
    }
    return { success: false, message: error.message || 'Erro ao conectar ao backend' }
  }
}

