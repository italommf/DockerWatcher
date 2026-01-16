import { useEffect, useRef, useState, useCallback } from 'react';
import type { DashboardData } from '../types';

interface UseSSEOptions {
    url: string;
    onMessage?: (data: DashboardData) => void;
    onError?: (error: Event) => void;
    reconnectDelay?: number;
}

export function useSSE({ url, onMessage, onError, reconnectDelay = 3000 }: UseSSEOptions) {
    const [data, setData] = useState<DashboardData | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);
    
    // Usar refs para onMessage e onError para evitar recriações desnecessárias de connect
    const onMessageRef = useRef(onMessage);
    const onErrorRef = useRef(onError);
    
    // Atualizar refs quando as funções mudarem
    useEffect(() => {
        onMessageRef.current = onMessage;
        onErrorRef.current = onError;
    }, [onMessage, onError]);

    const connect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        try {
            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;

            let hasReceivedData = false;

            eventSource.onopen = () => {
                setConnected(true);
                setError(null);
                console.log('[SSE] Connected to', url);
            };

            eventSource.onmessage = (event) => {
                try {
                    hasReceivedData = true;
                    const parsed = JSON.parse(event.data);
                    
                    // Ignorar heartbeat de conexão
                    if (parsed.type === 'connected') {
                        console.log('[SSE] Connection confirmed');
                        return;
                    }
                    
                    setData(parsed);
                    onMessageRef.current?.(parsed);
                } catch (e) {
                    console.error('[SSE] Parse error:', e);
                }
            };

            eventSource.onerror = (event) => {
                const eventSource = eventSourceRef.current;
                
                // Se ainda não recebeu dados e está em estado CONNECTING, pode ser erro de conexão inicial
                if (!hasReceivedData && eventSource?.readyState === EventSource.CONNECTING) {
                    console.warn('[SSE] Initial connection failed, will retry...');
                } else if (eventSource?.readyState === EventSource.CLOSED) {
                    console.log('[SSE] Connection closed');
                } else {
                    console.error('[SSE] Connection error:', event);
                }
                
                setConnected(false);
                setError('Connection lost');
                onErrorRef.current?.(event);

                // Reconnect after delay
                if (eventSource) {
                    eventSource.close();
                }
                eventSourceRef.current = null;
                
                reconnectTimeoutRef.current = window.setTimeout(() => {
                    console.log('[SSE] Reconnecting...');
                    connect();
                }, reconnectDelay);
            };
        } catch (e) {
            setError('Failed to connect');
            console.error('[SSE] Connection error:', e);
            // Tentar reconectar mesmo em caso de erro de criação
            reconnectTimeoutRef.current = window.setTimeout(() => {
                console.log('[SSE] Retrying connection...');
                connect();
            }, reconnectDelay);
        }
    }, [url, reconnectDelay]);

    useEffect(() => {
        // Conectar imediatamente ao montar
        connect();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };
    }, [connect]);

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        setConnected(false);
    }, []);

    return { data, connected, error, reconnect: connect, disconnect };
}
