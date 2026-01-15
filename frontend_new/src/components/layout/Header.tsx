import { useState, useRef, useEffect } from 'react';
import {
    Bell,
    ChevronDown,
    RefreshCw,
    Wifi,
    WifiOff,
    User
} from 'lucide-react';

interface HeaderProps {
    title: string;
    subtitle?: string;
    connected?: boolean;
    onRefresh?: () => void;
}

interface DropdownMenuProps {
    trigger: React.ReactNode;
    children: React.ReactNode;
}

function DropdownMenu({ trigger, children }: DropdownMenuProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl 
                   hover:bg-white/5 text-[var(--color-text-muted)] 
                   hover:text-[var(--color-text)] transition-all duration-200"
            >
                {trigger}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-48 
                        glass-high rounded-xl shadow-2xl z-50 
                        animate-scaleIn overflow-hidden">
                    {children}
                </div>
            )}
        </div>
    );
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
                       flex items-center justify-between px-6 sticky top-0 z-40">
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

                {/* User Menu */}
                <DropdownMenu
                    trigger={
                        <>
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)]
                              flex items-center justify-center text-white text-sm font-medium">
                                <User size={16} />
                            </div>
                            <ChevronDown size={14} />
                        </>
                    }
                >
                    <div className="py-2">
                        <a href="#" className="block px-4 py-2.5 text-sm text-[var(--color-text)] 
                                   hover:bg-white/10 transition-colors">
                            Perfil
                        </a>
                        <a href="#" className="block px-4 py-2.5 text-sm text-[var(--color-text)] 
                                   hover:bg-white/10 transition-colors">
                            Configurações
                        </a>
                        <hr className="my-2 border-[var(--glass-border)]" />
                        <a href="#" className="block px-4 py-2.5 text-sm text-red-400 
                                   hover:bg-white/10 transition-colors">
                            Sair
                        </a>
                    </div>
                </DropdownMenu>
            </div>
        </header>
    );
}
