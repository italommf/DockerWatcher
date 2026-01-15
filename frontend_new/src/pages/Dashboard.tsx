import { useEffect, useState } from 'react';
import {
    Bot,
    Clock,
    Server,
    Activity,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Loader2,
    Zap
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useSSE } from '../hooks/useSSE';
import { getDashboard } from '../services/api';
import type { DashboardData, RobotRunning } from '../types';

interface StatCardProps {
    title: string;
    value: number | string;
    icon: React.ReactNode;
    gradient: string;
    subtitle?: string;
    delay?: number;
}

function StatCard({ title, value, icon, gradient, subtitle, delay = 0 }: StatCardProps) {
    return (
        <div
            className="glass hover-lift rounded-2xl p-6 animate-fadeIn"
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-[var(--color-text-muted)] mb-1">{title}</p>
                    <p className="text-4xl font-bold text-[var(--color-text)] tracking-tight">{value}</p>
                    {subtitle && (
                        <p className="text-xs text-[var(--color-text-subtle)] mt-2">{subtitle}</p>
                    )}
                </div>
                <div className={`p-3.5 rounded-xl ${gradient}`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
        Running: { color: 'bg-emerald-500/20 text-emerald-400', icon: <CheckCircle size={12} /> },
        Pending: { color: 'bg-amber-500/20 text-amber-400', icon: <Loader2 size={12} className="animate-spin" /> },
        Failed: { color: 'bg-red-500/20 text-red-400', icon: <XCircle size={12} /> },
        Error: { color: 'bg-red-500/20 text-red-400', icon: <XCircle size={12} /> },
        Succeeded: { color: 'bg-blue-500/20 text-blue-400', icon: <CheckCircle size={12} /> },
    };

    const config = statusConfig[status] || statusConfig.Pending;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
            {config.icon}
            {status}
        </span>
    );
}

function TypeBadge({ tipo }: { tipo: string }) {
    const config: Record<string, { gradient: string; icon: React.ReactNode }> = {
        rpa: { gradient: 'bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300', icon: <Bot size={12} /> },
        cronjob: { gradient: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-300', icon: <Clock size={12} /> },
        deployment: { gradient: 'bg-gradient-to-r from-cyan-500/20 to-teal-500/20 text-cyan-300', icon: <Server size={12} /> },
    };

    const c = config[tipo] || config.rpa;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.gradient}`}>
            {c.icon}
            {tipo.toUpperCase()}
        </span>
    );
}

function RobotsTable({ robots }: { robots: RobotRunning[] }) {
    if (robots.length === 0) {
        return (
            <div className="text-center py-16 text-[var(--color-text-muted)]">
                <Activity size={56} className="mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium mb-2">Nenhum robô em execução</p>
                <p className="text-sm">As instâncias aparecerão aqui quando estiverem rodando</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-[var(--glass-border)]">
                        <th className="text-left py-4 px-4 text-sm font-medium text-[var(--color-text-muted)]">Nome</th>
                        <th className="text-left py-4 px-4 text-sm font-medium text-[var(--color-text-muted)]">Tipo</th>
                        <th className="text-center py-4 px-4 text-sm font-medium text-[var(--color-text-muted)]">Instâncias</th>
                        <th className="text-center py-4 px-4 text-sm font-medium text-[var(--color-text-muted)]">Execuções</th>
                        <th className="text-left py-4 px-4 text-sm font-medium text-[var(--color-text-muted)]">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {robots.map((robot, index) => (
                        <tr
                            key={`${robot.nome}-${index}`}
                            className="border-b border-[var(--glass-border)] hover:bg-white/5 
                         transition-colors duration-150 animate-slideIn"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <td className="py-4 px-4">
                                <div>
                                    <p className="font-medium text-[var(--color-text)]">{robot.apelido || robot.nome}</p>
                                    {robot.apelido && (
                                        <p className="text-xs text-[var(--color-text-subtle)]">{robot.nome}</p>
                                    )}
                                </div>
                            </td>
                            <td className="py-4 px-4">
                                <TypeBadge tipo={robot.tipo} />
                            </td>
                            <td className="py-4 px-4 text-center">
                                <span className="text-[var(--color-text)] font-semibold text-lg">{robot.instancias}</span>
                            </td>
                            <td className="py-4 px-4 text-center">
                                <span className="text-[var(--color-text)]">{robot.execucoes}</span>
                            </td>
                            <td className="py-4 px-4">
                                <StatusBadge status={robot.status} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function Dashboard() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    const { data: sseData, connected } = useSSE({
        url: '/api/stream/dashboard/',
        onMessage: (newData) => {
            setData(prev => ({ ...prev, ...newData } as DashboardData));
        },
    });

    useEffect(() => {
        async function loadInitialData() {
            try {
                const dashboardData = await getDashboard();
                setData(dashboardData);
            } catch (error) {
                console.error('Error loading dashboard:', error);
            } finally {
                setLoading(false);
            }
        }
        loadInitialData();
    }, []);

    useEffect(() => {
        if (sseData) {
            setData(prev => ({ ...prev, ...sseData } as DashboardData));
        }
    }, [sseData]);

    const handleRefresh = async () => {
        try {
            const dashboardData = await getDashboard();
            setData(dashboardData);
        } catch (error) {
            console.error('Error refreshing:', error);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 size={48} className="animate-spin text-[var(--color-primary)] mx-auto mb-4" />
                    <p className="text-[var(--color-text-muted)]">Carregando dados...</p>
                </div>
            </div>
        );
    }

    const stats = data?.stats || {
        instancias_ativas: 0,
        execucoes_pendentes: 0,
        falhas_containers: 0,
        rpas_ativos: 0,
        cronjobs_ativos: 0,
        deployments_ativos: 0,
    };

    const totalRobots = (data?.rpas?.length || 0) + (data?.cronjobs?.length || 0) + (data?.deployments?.length || 0);

    return (
        <div className="flex-1 flex flex-col min-h-screen">
            <Header
                title="Dashboard"
                subtitle="Visão geral do sistema"
                connected={connected}
                onRefresh={handleRefresh}
            />

            <main className="flex-1 p-6 space-y-6 overflow-y-auto">
                {/* Stats Cards */}
                <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <StatCard
                        title="Total de Robôs"
                        value={totalRobots}
                        icon={<Bot size={24} className="text-purple-300" />}
                        gradient="bg-gradient-to-br from-purple-500/20 to-blue-500/20"
                        subtitle={`${data?.rpas?.length || 0} RPAs • ${data?.cronjobs?.length || 0} Agendados • ${data?.deployments?.length || 0} 24/7`}
                        delay={0}
                    />
                    <StatCard
                        title="Instâncias Ativas"
                        value={stats.instancias_ativas}
                        icon={<Zap size={24} className="text-emerald-300" />}
                        gradient="bg-gradient-to-br from-emerald-500/20 to-teal-500/20"
                        delay={100}
                    />
                    <StatCard
                        title="Execuções Pendentes"
                        value={stats.execucoes_pendentes}
                        icon={<Clock size={24} className="text-amber-300" />}
                        gradient="bg-gradient-to-br from-amber-500/20 to-orange-500/20"
                        delay={200}
                    />
                    <StatCard
                        title="Falhas"
                        value={stats.falhas_containers}
                        icon={<AlertTriangle size={24} className="text-red-300" />}
                        gradient="bg-gradient-to-br from-red-500/20 to-pink-500/20"
                        delay={300}
                    />
                </section>

                {/* Real-time Connection Indicator */}
                {connected && (
                    <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] animate-fadeIn">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow"></span>
                        Atualizações em tempo real ativas
                    </div>
                )}

                {/* Robots Running Table */}
                <section className="glass rounded-2xl overflow-hidden animate-fadeIn" style={{ animationDelay: '400ms' }}>
                    <div className="p-5 border-b border-[var(--glass-border)]">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                                <Activity size={20} className="text-blue-300" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-[var(--color-text)]">
                                    Robôs em Execução
                                </h3>
                                <p className="text-sm text-[var(--color-text-subtle)]">
                                    Atualizações em tempo real via SSE
                                </p>
                            </div>
                        </div>
                    </div>
                    <RobotsTable robots={data?.robots_running || []} />
                </section>
            </main>
        </div>
    );
}
