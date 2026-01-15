import { useEffect, useRef, useState, useCallback } from 'react';
import type { DashboardData } from '../types';

interface UseSSEOptions {
    url: string;
    onMessage?: (data: DashboardData) => void;
    onError?: (error: Event) => void;
    reconnectDelay?: number;
}

export function useSSE({ url, onMessage, onError, reconnectDelay = 5000 }: UseSSEOptions) {
    const [data, setData] = useState<DashboardData | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<number | null>(null);

    const connect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        try {
            const eventSource = new EventSource(url);
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                setConnected(true);
                setError(null);
                console.log('[SSE] Connected to', url);
            };

            eventSource.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    setData(parsed);
                    onMessage?.(parsed);
                } catch (e) {
                    console.error('[SSE] Parse error:', e);
                }
            };

            eventSource.onerror = (event) => {
                setConnected(false);
                setError('Connection lost');
                onError?.(event);
                console.error('[SSE] Error:', event);

                // Reconnect after delay
                eventSource.close();
                reconnectTimeoutRef.current = window.setTimeout(() => {
                    console.log('[SSE] Reconnecting...');
                    connect();
                }, reconnectDelay);
            };
        } catch (e) {
            setError('Failed to connect');
            console.error('[SSE] Connection error:', e);
        }
    }, [url, onMessage, onError, reconnectDelay]);

    useEffect(() => {
        connect();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
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
