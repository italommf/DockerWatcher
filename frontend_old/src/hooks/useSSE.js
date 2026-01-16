import { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl } from '../config/apiConfig'

/**
 * Hook para consumir eventos SSE (Server-Sent Events).
 * Providencia atualizações em tempo real do backend.
 * 
 * @param {string} endpoint - Endpoint SSE (ex: '/api/stream/dashboard/')
 * @param {object} options - Opções de configuração
 * @param {boolean} options.enabled - Se deve conectar ao SSE (default: true)
 * @param {number} options.interval - Intervalo em segundos (default: 2)
 * @param {function} options.onMessage - Callback chamado a cada mensagem
 * @param {function} options.onError - Callback chamado em caso de erro
 */
export function useSSE(endpoint, options = {}) {
    const {
        enabled = true,
        interval = 2,
        onMessage,
        onError
    } = options

    const [data, setData] = useState(null)
    const [error, setError] = useState(null)
    const [isConnected, setIsConnected] = useState(false)
    const eventSourceRef = useRef(null)
    const reconnectTimeoutRef = useRef(null)

    const connect = useCallback(() => {
        if (!enabled) return

        // Limpar conexão anterior
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
        }

        const baseUrl = getApiUrl()
        const url = `${baseUrl}${endpoint}?interval=${interval}`

        console.log(`[SSE] Conectando a ${url}`)

        const eventSource = new EventSource(url)
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
            console.log('[SSE] Conexão estabelecida')
            setIsConnected(true)
            setError(null)
        }

        eventSource.onmessage = (event) => {
            try {
                const parsedData = JSON.parse(event.data)
                setData(parsedData)

                if (onMessage) {
                    onMessage(parsedData)
                }
            } catch (e) {
                console.error('[SSE] Erro ao parsear dados:', e)
            }
        }

        eventSource.onerror = (e) => {
            console.error('[SSE] Erro na conexão:', e)
            setIsConnected(false)
            setError('Conexão perdida')

            if (onError) {
                onError(e)
            }

            // Reconectar após 3 segundos
            eventSource.close()
            reconnectTimeoutRef.current = setTimeout(() => {
                console.log('[SSE] Tentando reconectar...')
                connect()
            }, 3000)
        }

    }, [endpoint, enabled, interval, onMessage, onError])

    // Conectar quando enabled mudar
    useEffect(() => {
        if (enabled) {
            connect()
        }

        return () => {
            if (eventSourceRef.current) {
                console.log('[SSE] Fechando conexão')
                eventSourceRef.current.close()
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
            }
        }
    }, [connect, enabled])

    // Função para desconectar manualmente
    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
        }
        setIsConnected(false)
    }, [])

    return {
        data,
        error,
        isConnected,
        disconnect,
        reconnect: connect
    }
}

/**
 * Hook específico para Dashboard SSE.
 */
export function useDashboardSSE(enabled = true) {
    return useSSE('/api/stream/dashboard/', { enabled, interval: 2 })
}

/**
 * Hook específico para Jobs/Containers SSE.
 */
export function useJobsSSE(enabled = true) {
    return useSSE('/api/stream/jobs/', { enabled, interval: 1 })
}

export default useSSE
