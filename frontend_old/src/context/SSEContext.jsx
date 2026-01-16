/**
 * SSE Context Provider - Atualizações em tempo real via Server-Sent Events.
 * Substitui o polling do DashboardCacheContext por streaming real-time.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { getApiUrl } from '../config/apiConfig'

const SSEContext = createContext()

export const useSSEData = () => {
    const context = useContext(SSEContext)
    if (!context) {
        throw new Error('useSSEData must be used within SSEProvider')
    }
    return context
}

export const SSEProvider = ({ children }) => {
    const [dashboardData, setDashboardData] = useState(null)
    const [jobsData, setJobsData] = useState(null)
    const [isConnected, setIsConnected] = useState(false)
    const [error, setError] = useState(null)

    const dashboardSSERef = useRef(null)
    const jobsSSERef = useRef(null)
    const reconnectTimeoutRef = useRef(null)

    // Conectar ao stream do Dashboard
    const connectDashboard = useCallback(() => {
        if (dashboardSSERef.current) {
            dashboardSSERef.current.close()
        }

        const baseUrl = getApiUrl()
        const url = `${baseUrl}/api/stream/dashboard/?interval=2`

        console.log('[SSE] Conectando ao Dashboard stream:', url)

        try {
            const eventSource = new EventSource(url)
            dashboardSSERef.current = eventSource

            eventSource.onopen = () => {
                console.log('[SSE] Dashboard conectado')
                setIsConnected(true)
                setError(null)
            }

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    setDashboardData(data)
                } catch (e) {
                    console.error('[SSE] Erro ao parsear dados:', e)
                }
            }

            eventSource.onerror = (e) => {
                // EventSource error doesn't provide much info in the event itself
                // but we know it's a connection issue.
                setIsConnected(false)
                setError('Conexão SSE suspenda ou backend fora do ar')
                eventSource.close()

                // Reconectar com backoff simples para não inundar o servidor se ele estiver caindo
                const delay = 5000
                console.warn(`[SSE] Dashboard erro. Tentando reconectar em ${delay / 1000}s...`)

                reconnectTimeoutRef.current = setTimeout(() => {
                    connectDashboard()
                }, delay)
            }
        } catch (e) {
            console.error('[SSE] Erro ao criar EventSource:', e)
            setError(e.message)
        }
    }, [])

    // Conectar ao stream de Jobs
    const connectJobs = useCallback(() => {
        if (jobsSSERef.current) {
            jobsSSERef.current.close()
        }

        const baseUrl = getApiUrl()
        const url = `${baseUrl}/api/stream/jobs/?interval=1`

        console.log('[SSE] Conectando ao Jobs stream:', url)

        try {
            const eventSource = new EventSource(url)
            jobsSSERef.current = eventSource

            eventSource.onopen = () => {
                console.log('[SSE] Jobs conectado')
            }

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    setJobsData(data)
                } catch (e) {
                    console.error('[SSE] Erro ao parsear jobs:', e)
                }
            }

            eventSource.onerror = (e) => {
                eventSource.close()
                const delay = 5000
                console.warn(`[SSE] Jobs erro. Tentando reconectar em ${delay / 1000}s...`)
                setTimeout(() => {
                    connectJobs()
                }, delay)
            }
        } catch (e) {
            console.error('[SSE] Erro ao criar Jobs EventSource:', e)
        }
    }, [])

    // Conectar ambos os streams ao montar
    useEffect(() => {
        connectDashboard()
        connectJobs()

        return () => {
            console.log('[SSE] Fechando conexões')
            if (dashboardSSERef.current) {
                dashboardSSERef.current.close()
            }
            if (jobsSSERef.current) {
                jobsSSERef.current.close()
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current)
            }
        }
    }, [connectDashboard, connectJobs])

    // Função para forçar reconexão manual
    const reconnect = useCallback(() => {
        connectDashboard()
        connectJobs()
    }, [connectDashboard, connectJobs])

    const value = {
        // Dados em tempo real
        dashboardData,
        jobsData,

        // Status da conexão
        isConnected,
        error,

        // Ações
        reconnect,

        // Helpers para acessar dados específicos
        pods: dashboardData?.pods || [],
        jobs: dashboardData?.jobs || [],
        cronjobs: dashboardData?.cronjobs || [],
        deployments: dashboardData?.deployments || [],
        stats: dashboardData?.stats || {},
        vmMetrics: dashboardData?.vm_metrics || null,
        podMetrics: dashboardData?.pod_metrics || [],
    }

    return (
        <SSEContext.Provider value={value}>
            {children}
        </SSEContext.Provider>
    )
}

export default SSEContext
