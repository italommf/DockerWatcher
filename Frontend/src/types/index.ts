// API Types

export interface RPA {
    id?: number;
    nome: string;
    nome_rpa?: string;
    apelido: string;
    robo_uuid: string;
    docker_repository?: string;
    docker_tag: string;
    qtd_max_instancias: number;
    qtd_ram_maxima: number;
    tempo_maximo_de_vida: number;
    utiliza_arquivos_externos?: boolean;
    status: 'active' | 'standby';
    execucoes_pendentes?: number;
    jobs_ativos?: number;
    tags?: string[];
}

export interface CronJob {
    id?: number;
    name: string;
    namespace: string;
    schedule: string;
    suspended: boolean;
    dependente_de_execucoes: boolean;
    execucoes_pendentes: number;
    last_schedule_time: string | null;
    last_successful_time: string | null;
    apelido: string;
    tags: string[];
    image: string | null;
    memory_limit: string;
    timezone: string;
    ttl_seconds_after_finished: number;
}

export interface Deployment {
    id?: number;
    name: string;
    namespace: string;
    replicas: number;
    available_replicas: number;
    image: string;
    apelido: string;
    status: 'active' | 'standby';
}

export interface Job {
    name: string;
    namespace: string;
    labels: Record<string, string>;
    completions: number;
    active: number;
    failed: number;
    start_time: string;
    completion_time: string | null;
    status: string;
    image: string;
    pod_name: string;
}

export interface Pod {
    name: string;
    namespace: string;
    phase: string;
    status: string;
    labels: Record<string, string>;
    start_time: string;
    containers: Container[];
    node: string;
    apelido?: string;
}

export interface Container {
    name: string;
    ready: boolean;
    restart_count: number;
    state: ContainerState;
    image: string;
}

export interface ContainerState {
    type: 'running' | 'waiting' | 'terminated';
    started_at?: string;
    reason?: string;
    message?: string;
    exit_code?: number;
    finished_at?: string;
}

export interface DashboardStats {
    instancias_ativas: number;
    execucoes_pendentes: number;
    falhas_containers: number;
    rpas_ativos: number;
    cronjobs_ativos: number;
    deployments_ativos: number;
}

export interface DashboardData {
    pods: Pod[];
    jobs: Job[];
    cronjobs_proximos: CronJob[];
    deployments_ativos: Deployment[];
    robots_running: RobotRunning[];
    stats: DashboardStats;
    rpas: RPA[];
    cronjobs: CronJob[];
    deployments: Deployment[];
    failed_pods: Pod[];
    connection_status: ConnectionStatus;
    vm_resources: VMResources;
}

export interface RobotRunning {
    nome: string;
    apelido: string;
    tipo: 'rpa' | 'cronjob' | 'deployment';
    status: string;
    instancias: number;
    execucoes: number;
}

export interface ConnectionStatus {
    mysql_connected: boolean;
    mysql_error: string | null;
    k8s_connected: boolean;
    k8s_error: string | null;
    prometheus_connected: boolean;
    prometheus_error: string | null;
}

export interface VMResources {
    memoria: {
        total_gb: number;
        usada_gb: number;
        livre_gb: number;
        percentual: number;
    };
    armazenamento: {
        total_gb: number;
        usado_gb: number;
        livre_gb: number;
        percentual: number;
    };
    cpu: {
        total: number;
        usado: number;
        livre: number;
    };
}
