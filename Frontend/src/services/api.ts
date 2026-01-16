import axios from 'axios';
import type { RPA, DashboardData, CronJob, Deployment, Job, Pod, ConnectionStatus, VMResources } from '../types';

const api = axios.create({
    baseURL: '/api',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Dashboard
export const getDashboard = () =>
    api.get<DashboardData>('/dashboard/full/').then(res => res.data);

// RPAs
export const getRPAs = () =>
    api.get<RPA[]>('/rpas/').then(res => res.data);

export const getRPA = (id: number) =>
    api.get<RPA>(`/rpas/${id}/`).then(res => res.data);

export const createRPA = (data: Partial<RPA>) =>
    api.post<RPA>('/rpas/', data).then(res => res.data);

export const updateRPA = (nome: string, data: Partial<RPA>) =>
    api.put<RPA>(`/rpas/${nome}/`, data).then(res => res.data);

export const deleteRPA = (nome: string) =>
    api.delete(`/rpas/${nome}/`).then(res => res.data);

export const standbyRPA = (nome: string) =>
    api.post(`/rpas/${nome}/standby/`).then(res => res.data);

export const activateRPA = (nome: string) =>
    api.post(`/rpas/${nome}/activate/`).then(res => res.data);

// CronJobs
export const getCronJobs = () =>
    api.get<CronJob[]>('/cronjobs/').then(res => res.data);

export const createCronJob = (data: Partial<CronJob>) =>
    api.post<CronJob>('/cronjobs/', data).then(res => res.data);

export const deleteCronJob = (id: number) =>
    api.delete(`/cronjobs/${id}/`).then(res => res.data);

export const runCronJobNow = (id: number) =>
    api.post(`/cronjobs/${id}/run_now/`).then(res => res.data);

// Deployments
export const getDeployments = () =>
    api.get<Deployment[]>('/deployments/').then(res => res.data);

export const createDeployment = (data: Partial<Deployment>) =>
    api.post<Deployment>('/deployments/', data).then(res => res.data);

export const deleteDeployment = (id: number) =>
    api.delete(`/deployments/${id}/`).then(res => res.data);

export const scaleDeployment = (id: number, replicas: number) =>
    api.post(`/deployments/${id}/scale/`, { replicas }).then(res => res.data);

// Jobs
export const getJobs = () =>
    api.get<Job[]>('/jobs/').then(res => res.data);

export const deleteJob = (name: string) =>
    api.delete(`/jobs/${name}/`).then(res => res.data);

// Pods
export const getPods = () =>
    api.get<Pod[]>('/pods/').then(res => res.data);

export const getPodLogs = (name: string, tail: number = 100) =>
    api.get<{ logs: string }>(`/pods/${name}/logs/?tail=${tail}`).then(res => res.data.logs);

export const deletePod = (name: string) =>
    api.delete(`/pods/${name}/`).then(res => res.data);

// Connection
export const getConnectionStatus = () =>
    api.get<ConnectionStatus>('/connection/status/').then(res => res.data);

export const reloadServices = () =>
    api.post('/connection/reload/').then(res => res.data);

// Resources
export const getVMResources = () =>
    api.get<VMResources>('/resources/vm/').then(res => res.data);

export default api;
