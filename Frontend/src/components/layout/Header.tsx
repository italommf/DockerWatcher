import { useState } from 'react';
import {
    Bell,
    RefreshCw,
    Wifi,
    WifiOff
} from 'lucide-react';

interface HeaderProps {
    title: string;
    subtitle?: string;
    connected?: boolean;
    onRefresh?: () => void;
}

export function Header({ title, subtitle, connected = false, onRefresh }: HeaderProps) {
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        await onRefresh?.();
        setTimeout(() => setRefreshing(false), 500);
    };

    return (
        <header className="h-16 glass-low border-b border-[var(--glass-border)]
                       flex items-center justify-between px-6 sticky top-0 z-40 w-full">
            {/* Left: Title */}
            <div>
                <h2 className="text-xl font-semibold text-[var(--color-text)]">{title}</h2>
                {subtitle && (
                    <p className="text-sm text-[var(--color-text-subtle)]">{subtitle}</p>
                )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                {/* Connection Status */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
                        ${connected
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                    {connected ? (
                        <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <Wifi size={12} />
                            <span className="hidden sm:inline">Conectado</span>
                        </>
                    ) : (
                        <>
                            <WifiOff size={12} />
                            <span className="hidden sm:inline">Desconectado</span>
                        </>
                    )}
                </div>

                {/* Refresh */}
                <button
                    onClick={handleRefresh}
                    className="p-2.5 rounded-xl hover:bg-white/5 
                     text-[var(--color-text-muted)] hover:text-[var(--color-text)]
                     transition-all duration-200"
                    title="Atualizar"
                >
                    <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                </button>

                {/* Notifications */}
                <button
                    className="p-2.5 rounded-xl hover:bg-white/5 
                     text-[var(--color-text-muted)] hover:text-[var(--color-text)]
                     transition-all duration-200 relative"
                >
                    <Bell size={18} />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--color-primary)] rounded-full 
                          animate-pulse-glow" />
                </button>
            </div>
        </header>
    );
}
