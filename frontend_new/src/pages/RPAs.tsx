import { useEffect, useState } from 'react';
import {
    Bot,
    Plus,
    MoreVertical,
    Play,
    Pause,
    Trash2,
    Edit,
    Search,
    Clock,
    Server
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { getRPAs, getCronJobs, getDeployments, deleteRPA, standbyRPA, activateRPA, createRPA, updateRPA } from '../services/api';
import type { RPA, CronJob, Deployment } from '../types';

// Tabs
type TabType = 'rpas' | 'agendados' | '24/7';

interface TabProps {
    active: TabType;
    onChange: (tab: TabType) => void;
}

function Tabs({ active, onChange }: TabProps) {
    const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
        { id: 'rpas', label: 'RPAs', icon: <Bot size={16} /> },
        { id: 'agendados', label: 'Agendados', icon: <Clock size={16} /> },
        { id: '24/7', label: '24/7', icon: <Server size={16} /> },
    ];

    return (
        <div className="flex gap-1 p-1 glass-low rounded-xl">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            transition-all duration-200
            ${active === tab.id
                            ? 'glass-high text-white glow-primary'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/5'
                        }
          `}
                >
                    {tab.icon}
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

interface RPAFormProps {
    rpa?: RPA | null;
    onClose: () => void;
    onSave: (data: Partial<RPA>) => void;
}

function RPAForm({ rpa, onClose, onSave }: RPAFormProps) {
    const [formData, setFormData] = useState<Partial<RPA>>({
        nome: rpa?.nome || '',
        apelido: rpa?.apelido || '',
        robo_uuid: rpa?.robo_uuid || '',
        docker_tag: rpa?.docker_tag || 'latest',
        qtd_max_instancias: rpa?.qtd_max_instancias || 3,
        qtd_ram_maxima: rpa?.qtd_ram_maxima || 256,
        tempo_maximo_de_vida: rpa?.tempo_maximo_de_vida || 600,
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        await onSave(formData);
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
            <div className="glass-high rounded-2xl w-full max-w-lg mx-4 animate-scaleIn overflow-hidden">
                <div className="p-5 border-b border-[var(--glass-border)]">
                    <h3 className="text-xl font-semibold gradient-text">
                        {rpa ? 'Editar RPA' : 'Novo RPA'}
                    </h3>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                Nome Técnico
                            </label>
                            <input
                                type="text"
                                value={formData.nome}
                                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none
                           placeholder:text-[var(--color-text-subtle)]"
                                placeholder="nome_do_rpa"
                                required
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                Apelido
                            </label>
                            <input
                                type="text"
                                value={formData.apelido}
                                onChange={(e) => setFormData({ ...formData, apelido: e.target.value })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none
                           placeholder:text-[var(--color-text-subtle)]"
                                placeholder="Nome amigável do RPA"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                UUID do Robô
                            </label>
                            <input
                                type="text"
                                value={formData.robo_uuid}
                                onChange={(e) => setFormData({ ...formData, robo_uuid: e.target.value })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none
                           font-mono text-sm placeholder:text-[var(--color-text-subtle)]"
                                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                Docker Tag
                            </label>
                            <input
                                type="text"
                                value={formData.docker_tag}
                                onChange={(e) => setFormData({ ...formData, docker_tag: e.target.value })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none"
                                placeholder="latest"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                Máx. Instâncias
                            </label>
                            <input
                                type="number"
                                value={formData.qtd_max_instancias}
                                onChange={(e) => setFormData({ ...formData, qtd_max_instancias: Number(e.target.value) })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none"
                                min={1}
                                max={10}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                RAM Máx. (Mi)
                            </label>
                            <input
                                type="number"
                                value={formData.qtd_ram_maxima}
                                onChange={(e) => setFormData({ ...formData, qtd_ram_maxima: Number(e.target.value) })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none"
                                min={64}
                                max={4096}
                                step={64}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                TTL (segundos)
                            </label>
                            <input
                                type="number"
                                value={formData.tempo_maximo_de_vida}
                                onChange={(e) => setFormData({ ...formData, tempo_maximo_de_vida: Number(e.target.value) })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none"
                                min={60}
                                max={7200}
                                step={60}
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 glass-low rounded-xl
                         text-[var(--color-text-muted)] hover:text-[var(--color-text)]
                         hover:bg-white/5 transition-all font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-4 py-3 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]
                         text-white rounded-xl transition-all font-medium
                         hover:opacity-90 disabled:opacity-50 glow-primary-hover"
                        >
                            {saving ? 'Salvando...' : rpa ? 'Salvar' : 'Criar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// RPA Card Component
function RPACard({ rpa, onEdit, onDelete, onStandby, onActivate }: {
    rpa: RPA;
    onEdit: () => void;
    onDelete: () => void;
    onStandby: () => void;
    onActivate: () => void;
}) {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="glass hover-lift rounded-2xl p-5 group animate-fadeIn">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 
                          text-purple-300 group-hover:scale-110 transition-transform">
                        <Bot size={22} />
                    </div>
                    <div>
                        <h4 className="font-semibold text-[var(--color-text)]">
                            {rpa.apelido || rpa.nome}
                        </h4>
                        {rpa.apelido && (
                            <p className="text-xs text-[var(--color-text-subtle)]">{rpa.nome}</p>
                        )}
                    </div>
                </div>

                <div className="relative">
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="p-2 rounded-lg hover:bg-white/10 text-[var(--color-text-muted)]
                       opacity-0 group-hover:opacity-100 transition-all"
                    >
                        <MoreVertical size={18} />
                    </button>

                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 w-40 glass-high 
                              rounded-xl shadow-2xl z-20 overflow-hidden animate-scaleIn">
                                <button
                                    onClick={() => { onEdit(); setMenuOpen(false); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--color-text)]
                             hover:bg-white/10 transition-colors"
                                >
                                    <Edit size={14} /> Editar
                                </button>
                                {rpa.status === 'active' ? (
                                    <button
                                        onClick={() => { onStandby(); setMenuOpen(false); }}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-amber-400
                               hover:bg-white/10 transition-colors"
                                    >
                                        <Pause size={14} /> Standby
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => { onActivate(); setMenuOpen(false); }}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-emerald-400
                               hover:bg-white/10 transition-colors"
                                    >
                                        <Play size={14} /> Ativar
                                    </button>
                                )}
                                <button
                                    onClick={() => { onDelete(); setMenuOpen(false); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400
                             hover:bg-white/10 transition-colors"
                                >
                                    <Trash2 size={14} /> Excluir
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                    <span className="text-[var(--color-text-subtle)]">Status</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium
            ${rpa.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'}`}>
                        {rpa.status === 'active' ? 'Ativo' : 'Standby'}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-[var(--color-text-subtle)]">Jobs Ativos</span>
                    <span className="text-[var(--color-text)] font-medium">{rpa.jobs_ativos || 0}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-[var(--color-text-subtle)]">Execuções</span>
                    <span className="text-[var(--color-text)] font-medium">{rpa.execucoes_pendentes || 0}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-[var(--color-text-subtle)]">Máx. Instâncias</span>
                    <span className="text-[var(--color-text)] font-medium">{rpa.qtd_max_instancias}</span>
                </div>
            </div>
        </div>
    );
}

// Placeholder for CronJobs tab
function AgendadosTab() {
    return (
        <div className="text-center py-16 text-[var(--color-text-muted)]">
            <Clock size={56} className="mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium mb-2">CronJobs (Agendados)</p>
            <p className="text-sm">Esta funcionalidade será implementada em breve</p>
        </div>
    );
}

// Placeholder for Deployments tab
function DeploymentsTab() {
    return (
        <div className="text-center py-16 text-[var(--color-text-muted)]">
            <Server size={56} className="mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium mb-2">Deployments (24/7)</p>
            <p className="text-sm">Esta funcionalidade será implementada em breve</p>
        </div>
    );
}

export function RPAs() {
    const [activeTab, setActiveTab] = useState<TabType>('rpas');
    const [rpas, setRpas] = useState<RPA[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingRPA, setEditingRPA] = useState<RPA | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (activeTab === 'rpas') {
            loadRPAs();
        }
    }, [activeTab]);

    async function loadRPAs() {
        setLoading(true);
        try {
            const data = await getRPAs();
            setRpas(data);
        } catch (error) {
            console.error('Error loading RPAs:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: number) {
        if (confirm('Deseja realmente excluir este RPA?')) {
            try {
                await deleteRPA(id);
                await loadRPAs();
            } catch (error) {
                console.error('Error deleting RPA:', error);
            }
        }
    }

    async function handleStandby(id: number) {
        try {
            await standbyRPA(id);
            await loadRPAs();
        } catch (error) {
            console.error('Error setting standby:', error);
        }
    }

    async function handleActivate(id: number) {
        try {
            await activateRPA(id);
            await loadRPAs();
        } catch (error) {
            console.error('Error activating:', error);
        }
    }

    async function handleSave(data: Partial<RPA>) {
        try {
            if (editingRPA?.id) {
                await updateRPA(editingRPA.id, data);
            } else {
                await createRPA(data);
            }
            setShowForm(false);
            setEditingRPA(null);
            await loadRPAs();
        } catch (error) {
            console.error('Error saving RPA:', error);
        }
    }

    const filteredRPAs = rpas.filter(rpa =>
        rpa.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rpa.apelido?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex-1 flex flex-col min-h-screen">
            <Header title="Robôs" subtitle="Gerenciar automações" />

            <main className="flex-1 p-6 space-y-6 overflow-y-auto">
                {/* Tabs */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Tabs active={activeTab} onChange={setActiveTab} />

                    {activeTab === 'rpas' && (
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar..."
                                    className="pl-9 pr-4 py-2.5 glass-low rounded-xl text-sm text-[var(--color-text)]
                             focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none
                             placeholder:text-[var(--color-text-subtle)] w-48"
                                />
                            </div>

                            <button
                                onClick={() => setShowForm(true)}
                                className="flex items-center gap-2 px-4 py-2.5 
                           bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]
                           text-white rounded-xl text-sm font-medium
                           transition-all glow-primary-hover hover:opacity-90"
                            >
                                <Plus size={16} />
                                Novo RPA
                            </button>
                        </div>
                    )}
                </div>

                {/* Tab Content */}
                {activeTab === 'rpas' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filteredRPAs.map((rpa) => (
                            <RPACard
                                key={rpa.id}
                                rpa={rpa}
                                onEdit={() => { setEditingRPA(rpa); setShowForm(true); }}
                                onDelete={() => handleDelete(rpa.id!)}
                                onStandby={() => handleStandby(rpa.id!)}
                                onActivate={() => handleActivate(rpa.id!)}
                            />
                        ))}

                        {filteredRPAs.length === 0 && !loading && (
                            <div className="col-span-full text-center py-16 text-[var(--color-text-muted)]">
                                <Bot size={56} className="mx-auto mb-4 opacity-40" />
                                <p className="text-lg font-medium mb-2">Nenhum RPA encontrado</p>
                                <p className="text-sm">Clique em "Novo RPA" para começar</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'agendados' && <AgendadosTab />}
                {activeTab === '24/7' && <DeploymentsTab />}
            </main>

            {showForm && (
                <RPAForm
                    rpa={editingRPA}
                    onClose={() => { setShowForm(false); setEditingRPA(null); }}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
