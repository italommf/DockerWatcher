import { useEffect, useState, useRef } from 'react';
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
    Server,
    Filter,
    ChevronDown
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { getRPAs, getCronJobs, getDeployments, deleteRPA, standbyRPA, activateRPA, createRPA, updateRPA } from '../services/api';
import type { RPA, CronJob, Deployment } from '../types';
import { useSnackbar } from 'notistack';

// DropdownMenu component (reused from Header pattern)
interface DropdownMenuProps {
    trigger: React.ReactNode;
    children: React.ReactNode;
}

function DropdownMenu({ trigger, children }: DropdownMenuProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <div 
                ref={triggerRef}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(!open);
                }}
            >
                {trigger}
            </div>

            {open && (
                <div 
                    className="absolute right-0 top-full mt-2 
                            rounded-xl shadow-2xl z-50 
                            animate-scaleIn overflow-hidden"
                    style={{
                        backgroundColor: 'rgba(30, 30, 60, 0.95)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        width: triggerRef.current?.offsetWidth || 'auto',
                        minWidth: '192px'
                    }}
                    onClick={(e) => e.stopPropagation()}>
                    {children}
                </div>
            )}
        </div>
    );
}

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
        <div className="flex gap-1 p-1 glass-low rounded-xl relative z-20">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Tab clicked:', tab.id);
                        onChange(tab.id);
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                    }}
                    type="button"
                    style={{ pointerEvents: 'auto', position: 'relative', zIndex: 20 }}
                    className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            transition-all duration-200 cursor-pointer
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
    const { enqueueSnackbar } = useSnackbar();
    const [formData, setFormData] = useState<Partial<RPA>>({
        nome: rpa?.nome || '',
        apelido: rpa?.apelido || '',
        robo_uuid: rpa?.robo_uuid || '',
        docker_repository: rpa?.docker_repository || '',
        docker_tag: rpa?.docker_tag || 'latest',
        qtd_max_instancias: rpa?.qtd_max_instancias || 3,
        qtd_ram_maxima: rpa?.qtd_ram_maxima || 256,
        tempo_maximo_de_vida: rpa?.tempo_maximo_de_vida || 600,
    });
    const [saving, setSaving] = useState(false);
    const [dockerTagOpen, setDockerTagOpen] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validação do repositório Docker
        if (!formData.docker_repository || formData.docker_repository.trim() === '') {
            enqueueSnackbar('O campo Repositório Docker é obrigatório', { variant: 'error' });
            return;
        }
        
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
                                Apelido
                            </label>
                            <input
                                type="text"
                                value={formData.apelido}
                                onChange={(e) => setFormData({ ...formData, apelido: e.target.value })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none
                           placeholder:text-[var(--color-text-subtle)]"
                                placeholder="Apelido do RPA (Exibido na Interface)"
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                Nome
                            </label>
                            <input
                                type="text"
                                value={formData.nome}
                                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none
                           placeholder:text-[var(--color-text-subtle)]"
                                placeholder="Nome do RPA (.env)"
                                required
                            />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                UUID do RPA (.env)
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

                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                Repositório Docker
                            </label>
                            <input
                                type="text"
                                value={formData.docker_repository || ''}
                                onChange={(e) => setFormData({ ...formData, docker_repository: e.target.value })}
                                className="w-full px-4 py-3 glass-low rounded-xl text-[var(--color-text)] 
                           focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none
                           placeholder:text-[var(--color-text-subtle)]"
                                placeholder="usuario/imagem (ex: rpaglobal/meu_rpa)"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                Docker Tag
                            </label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setDockerTagOpen(!dockerTagOpen)}
                                    className="w-full flex items-center justify-between px-4 py-3 glass-low rounded-xl text-sm text-[var(--color-text)]
                                     hover:bg-white/5 transition-all text-left"
                                >
                                    <span>{formData.docker_tag}</span>
                                    <ChevronDown size={16} className="text-[var(--color-text-muted)]" />
                                </button>

                                {dockerTagOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setDockerTagOpen(false)} />
                                        <div className="absolute top-full mt-2 w-full 
                                                rounded-xl shadow-2xl z-50 
                                                animate-scaleIn overflow-hidden"
                                             style={{
                                                 backgroundColor: 'rgba(30, 30, 60, 0.95)',
                                                 backdropFilter: 'blur(20px)',
                                                 border: '1px solid rgba(255, 255, 255, 0.12)'
                                             }}>
                                            <div className="py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({ ...formData, docker_tag: 'latest' });
                                                        setDockerTagOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                                                        ${formData.docker_tag === 'latest'
                                                            ? 'bg-white/10 text-[var(--color-text)]'
                                                            : 'text-[var(--color-text)] hover:bg-white/10'
                                                        }`}
                                                >
                                                    latest
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData({ ...formData, docker_tag: 'exec' });
                                                        setDockerTagOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                                                        ${formData.docker_tag === 'exec'
                                                            ? 'bg-white/10 text-[var(--color-text)]'
                                                            : 'text-[var(--color-text)] hover:bg-white/10'
                                                        }`}
                                                >
                                                    exec
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                                Máx. Instâncias: <span className="text-[var(--color-text)] font-semibold">{formData.qtd_max_instancias}</span>
                            </label>
                            <input
                                type="range"
                                value={formData.qtd_max_instancias}
                                onChange={(e) => setFormData({ ...formData, qtd_max_instancias: Number(e.target.value) })}
                                className="w-full"
                                min={1}
                                max={10}
                                step={1}
                            />
                            <div className="flex justify-between text-xs text-[var(--color-text-subtle)] mt-1">
                                <span>1</span>
                                <span>10</span>
                            </div>
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
                                Tempo de Vida Máximo
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
    const { enqueueSnackbar } = useSnackbar();
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
            enqueueSnackbar('Erro ao carregar RPAs. Tente novamente.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(rpa: RPA) {
        if (confirm('Deseja realmente excluir este RPA?')) {
            try {
                await deleteRPA(rpa.nome);
                enqueueSnackbar('RPA excluído com sucesso!', { variant: 'success' });
                await loadRPAs();
            } catch (error: any) {
                console.error('Error deleting RPA:', error);
                const errorMsg = error.response?.data?.error || 'Erro ao excluir RPA. Tente novamente.';
                enqueueSnackbar(errorMsg, { variant: 'error' });
            }
        }
    }

    async function handleStandby(rpa: RPA) {
        try {
            console.log('Inativando RPA:', rpa);
            if (!rpa.nome || rpa.nome.trim() === '') {
                enqueueSnackbar('Erro: Nome do RPA não encontrado.', { variant: 'error' });
                return;
            }
            const response = await standbyRPA(rpa.nome);
            const message = response?.message || 'RPA movido para standby';
            enqueueSnackbar(message, { variant: 'success' });
            await loadRPAs();
        } catch (error: any) {
            console.error('Error setting standby:', error);
            const errorMsg = error.response?.data?.error || 'Erro ao mover RPA para standby. Tente novamente.';
            enqueueSnackbar(errorMsg, { variant: 'error' });
        }
    }

    async function handleActivate(rpa: RPA) {
        try {
            console.log('Ativando RPA:', rpa);
            if (!rpa.nome || rpa.nome.trim() === '') {
                enqueueSnackbar('Erro: Nome do RPA não encontrado.', { variant: 'error' });
                return;
            }
            await activateRPA(rpa.nome);
            enqueueSnackbar('RPA ativado com sucesso!', { variant: 'success' });
            await loadRPAs();
        } catch (error: any) {
            console.error('Error activating:', error);
            const errorMsg = error.response?.data?.error || 'Erro ao ativar RPA. Tente novamente.';
            enqueueSnackbar(errorMsg, { variant: 'error' });
        }
    }

    async function handleSave(data: Partial<RPA>) {
        try {
            // Converter 'nome' para 'nome_rpa' e garantir tipos corretos
            const payload: any = {
                nome_rpa: data.nome || '',
                docker_repository: data.docker_repository || '',
                docker_tag: data.docker_tag || 'latest',
                robo_uuid: data.robo_uuid || '',
                qtd_max_instancias: Number(data.qtd_max_instancias) || 3,
                qtd_ram_maxima: Number(data.qtd_ram_maxima) || 256,
                tempo_maximo_de_vida: Number(data.tempo_maximo_de_vida) || 600,
                utiliza_arquivos_externos: data.utiliza_arquivos_externos || false,
                apelido: data.apelido || '',
            };
            
            console.log('Payload sendo enviado:', payload);
            
            // Verificar se está editando (tem nome e não está vazio)
            if (editingRPA?.nome && editingRPA.nome.trim() !== '') {
                // Remover nome_rpa do payload no update (nome não pode ser alterado)
                const { nome_rpa, ...updatePayload } = payload;
                console.log('Editando RPA:', editingRPA.nome, 'Payload:', updatePayload);
                await updateRPA(editingRPA.nome, updatePayload);
                enqueueSnackbar('RPA atualizado com sucesso!', { variant: 'success' });
            } else {
                // Validar que tem nome antes de criar
                if (!payload.nome_rpa || payload.nome_rpa.trim() === '') {
                    enqueueSnackbar('O campo Nome é obrigatório para criar um RPA.', { variant: 'error' });
                    return;
                }
                console.log('Criando novo RPA:', payload);
                await createRPA(payload);
                enqueueSnackbar('RPA criado com sucesso!', { variant: 'success' });
            }
            setShowForm(false);
            setEditingRPA(null);
            await loadRPAs();
        } catch (error: any) {
            console.error('Error saving RPA:', error);
            
            // Exibir erros de validação do backend
            if (error.response?.data) {
                const errors = error.response.data;
                
                // Se houver uma mensagem de erro geral, usar ela
                if (errors.error) {
                    enqueueSnackbar(errors.error, { 
                        variant: 'error',
                        autoHideDuration: 5000 
                    });
                } else {
                    // Caso contrário, formatar os erros de campo
                    const errorMessages = Object.entries(errors)
                        .map(([field, messages]: [string, any]) => {
                            const fieldName = field === 'nome_rpa' ? 'Nome' : 
                                             field === 'robo_uuid' ? 'UUID' :
                                             field === 'docker_repository' ? 'Repositório Docker' :
                                             field;
                            const msg = Array.isArray(messages) ? messages.join(', ') : messages;
                            return `${fieldName}: ${msg}`;
                        })
                        .join('\n');
                    
                    enqueueSnackbar(`Erro ao salvar RPA:\n${errorMessages}`, { 
                        variant: 'error',
                        autoHideDuration: 5000 
                    });
                }
            } else {
                enqueueSnackbar('Erro ao salvar RPA. Verifique os campos obrigatórios.', { variant: 'error' });
            }
        }
    }

    const filteredRPAs = rpas.filter(rpa =>
        rpa.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rpa.apelido?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex-1 flex flex-col min-h-screen w-full">
            <Header title="Robôs" subtitle="Gerenciar automações" />

            <main className="flex-1 p-6 space-y-6 overflow-y-auto w-full">
                {/* Tabs */}
                <div className="flex items-center justify-center gap-4 relative z-20">
                    <Tabs active={activeTab} onChange={setActiveTab} />
                </div>

                {/* Search and Actions Bar - Aparece em todas as tabs */}
                <div className="flex items-center gap-3">
                    {/* Search Input - Ocupa toda a área disponível */}
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar..."
                            className="w-full pl-9 pr-4 py-2.5 glass-low rounded-xl text-sm text-[var(--color-text)]
                             focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none
                             placeholder:text-[var(--color-text-subtle)]"
                        />
                    </div>

                    {/* Filter Dropdown Button */}
                    <div className="relative">
                        <DropdownMenu
                            trigger={
                                <button className="flex items-center gap-2 px-4 py-2.5 glass-low rounded-xl text-sm font-medium
                                 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/5
                                 transition-all">
                                    <Filter size={16} />
                                    Filtros
                                </button>
                            }
                        >
                        <div className="py-2">
                            <div className="px-4 py-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase">
                                Status
                            </div>
                            <button className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] 
                                           hover:bg-white/10 transition-colors">
                                Todos
                            </button>
                            <button className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] 
                                           hover:bg-white/10 transition-colors">
                                Ativos
                            </button>
                            <button className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] 
                                           hover:bg-white/10 transition-colors">
                                Standby
                            </button>
                            <hr className="my-2 border-[var(--glass-border)]" />
                            <div className="px-4 py-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase">
                                Ordenar por
                            </div>
                            <button className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] 
                                           hover:bg-white/10 transition-colors">
                                Nome
                            </button>
                            <button className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] 
                                           hover:bg-white/10 transition-colors">
                                Instâncias
                            </button>
                            <button className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] 
                                           hover:bg-white/10 transition-colors">
                                Execuções
                            </button>
                        </div>
                    </DropdownMenu>
                    </div>

                    {/* Botão específico por tab */}
                    {activeTab === 'rpas' && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="flex items-center gap-2 px-4 py-2.5 
                           bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]
                           text-white rounded-xl text-sm font-medium
                           transition-all glow-primary-hover hover:opacity-90 whitespace-nowrap"
                        >
                            <Plus size={16} />
                            Novo RPA
                        </button>
                    )}

                    {activeTab === 'agendados' && (
                        <button
                            onClick={() => {/* TODO: Implementar criação de CronJob */}}
                            className="flex items-center gap-2 px-4 py-2.5 
                           bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]
                           text-white rounded-xl text-sm font-medium
                           transition-all glow-primary-hover hover:opacity-90 whitespace-nowrap"
                        >
                            <Plus size={16} />
                            Novo Agendado
                        </button>
                    )}

                    {activeTab === '24/7' && (
                        <button
                            onClick={() => {/* TODO: Implementar criação de Deployment */}}
                            className="flex items-center gap-2 px-4 py-2.5 
                           bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-secondary)]
                           text-white rounded-xl text-sm font-medium
                           transition-all glow-primary-hover hover:opacity-90 whitespace-nowrap"
                        >
                            <Plus size={16} />
                            Novo 24/7
                        </button>
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
                                onDelete={() => handleDelete(rpa)}
                                onStandby={() => handleStandby(rpa)}
                                onActivate={() => handleActivate(rpa)}
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
