import React, { useState, useEffect } from 'react'
import {
    Box,
    Paper,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Collapse,
    LinearProgress,
    IconButton,
    CircularProgress,
} from '@mui/material'
import {
    KeyboardArrowDown as ExpandMoreIcon,
    KeyboardArrowUp as ExpandLessIcon,
    Storage as StorageIcon,
} from '@mui/icons-material'
import ResourceAreaChart from './ResourceAreaChart'
import api from '../services/api'

// Componente para exibir barra de progresso com cor baseada no percentual
function ResourceProgressBar({ value, label, unit, allocated }) {
    const getColor = (percent) => {
        if (percent >= 90) return '#EF4444' // Vermelho
        if (percent >= 70) return '#F59E0B' // Amarelo
        return '#22C55E' // Verde vibrante
    }

    const color = getColor(value)

    return (
        <Box sx={{ minWidth: 100 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" sx={{ color: '#FFFFFF', fontSize: '0.7rem' }}>
                    {label}
                </Typography>
                <Typography variant="caption" sx={{ color, fontWeight: 600, fontSize: '0.7rem' }}>
                    {value.toFixed(1)}%
                </Typography>
            </Box>
            <LinearProgress
                variant="determinate"
                value={Math.min(value, 100)}
                sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    '& .MuiLinearProgress-bar': {
                        backgroundColor: color,
                        borderRadius: 3,
                    },
                }}
            />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.6rem' }}>
                {allocated} {unit}
            </Typography>
        </Box>
    )
}

// Componente de linha da tabela com expansão
function ContainerRow({ container, expanded, onToggle, resourceHistory }) {
    // Histórico de recursos para este container específico
    const containerHistory = resourceHistory[container.pod_name] || {
        cpu: [],
        memory: []
    }

    return (
        <>
            <TableRow
                hover
                onClick={onToggle}
                sx={{
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
                    '& td': { py: 1.5 },
                    ...(expanded && {
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    })
                }}
            >
                <TableCell sx={{ width: 40, py: 1.5, color: '#FFFFFF' }}>
                    <IconButton size="small" sx={{ color: '#FFFFFF' }}>
                        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ py: 1.5, color: '#FFFFFF' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }}>
                        {container.rpa_name}
                    </Typography>
                </TableCell>
                <TableCell sx={{ py: 1.5 }}>
                    <Chip
                        label={container.image_tag || 'latest'}
                        size="small"
                        sx={{
                            fontSize: '0.75rem',
                            bgcolor: 'rgba(255,255,255,0.9)',
                            color: '#333',
                            fontWeight: 600
                        }}
                    />
                </TableCell>
                <TableCell sx={{ py: 1.5 }}>
                    <Box sx={{ minWidth: 100 }}>
                        <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 600 }}>
                            {container.cpu_raw || `${container.cpu_used_millicores || 0} mCPU`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                            Alocado: {container.cpu_allocated_millicores || 1000} mCPU
                        </Typography>
                    </Box>
                </TableCell>
                <TableCell sx={{ py: 1.5 }}>
                    <Box sx={{ minWidth: 100 }}>
                        <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 600 }}>
                            {container.memory_raw || `${(container.memory_used_mb || 0).toFixed(1)} MB`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                            Alocado: {container.memory_allocated_mb || 512} MB
                        </Typography>
                    </Box>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell colSpan={5} sx={{ py: 0, borderBottom: expanded ? 1 : 0, borderColor: 'rgba(255,255,255,0.1)' }}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 1 }}>
                            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, mb: 2, color: '#FFFFFF' }}>
                                Gráficos de Consumo - {container.rpa_name}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <Box sx={{ flex: 1 }}>
                                    <ResourceAreaChart
                                        title="CPU"
                                        data={containerHistory.cpu}
                                        dataKey="usado"
                                        unit="mCPU"
                                        maxValue={container.cpu_allocated_millicores || 1000}
                                    />
                                </Box>
                                <Box sx={{ flex: 1 }}>
                                    <ResourceAreaChart
                                        title="Memória"
                                        data={containerHistory.memory}
                                        dataKey="usado"
                                        unit="MB"
                                        maxValue={container.memory_allocated_mb || 512}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    )
}

export default function ContainerResourcesList() {
    const [containers, setContainers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [expandedRow, setExpandedRow] = useState(null)
    const [resourceHistory, setResourceHistory] = useState({})

    // Carregar dados dos containers
    const loadContainers = async () => {
        try {
            const response = await api.getPodResources()
            if (response && response.pods) {
                setContainers(response.pods)

                // Atualizar histórico de recursos
                setResourceHistory(prev => {
                    const newHistory = { ...prev }
                    const now = new Date()

                    response.pods.forEach(pod => {
                        if (!newHistory[pod.pod_name]) {
                            newHistory[pod.pod_name] = { cpu: [], memory: [] }
                        }

                        // Adicionar novo ponto de dados
                        newHistory[pod.pod_name].cpu.push({
                            time: now,
                            usado: pod.cpu_used_millicores,
                            livre: pod.cpu_allocated_millicores - pod.cpu_used_millicores
                        })

                        newHistory[pod.pod_name].memory.push({
                            time: now,
                            usado: pod.memory_used_mb,
                            livre: pod.memory_allocated_mb - pod.memory_used_mb
                        })

                        // Limitar histórico a 360 pontos (1 hora a cada 10 segundos)
                        const MAX_HISTORY = 360
                        if (newHistory[pod.pod_name].cpu.length > MAX_HISTORY) {
                            newHistory[pod.pod_name].cpu = newHistory[pod.pod_name].cpu.slice(-MAX_HISTORY)
                        }
                        if (newHistory[pod.pod_name].memory.length > MAX_HISTORY) {
                            newHistory[pod.pod_name].memory = newHistory[pod.pod_name].memory.slice(-MAX_HISTORY)
                        }
                    })

                    // Limpar histórico de pods que não existem mais
                    const activePodNames = new Set(response.pods.map(p => p.pod_name))
                    Object.keys(newHistory).forEach(podName => {
                        if (!activePodNames.has(podName)) {
                            delete newHistory[podName]
                        }
                    })

                    return newHistory
                })

                setError(null)
            }
        } catch (err) {
            console.error('Erro ao carregar recursos dos containers:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // Carregar inicialmente e configurar polling
    useEffect(() => {
        loadContainers()

        const interval = setInterval(loadContainers, 10000) // Atualizar a cada 10 segundos

        return () => clearInterval(interval)
    }, [])

    // Toggle expansão de linha
    const handleToggleRow = (podName) => {
        setExpandedRow(prev => prev === podName ? null : podName)
    }

    if (loading && containers.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} sx={{ color: '#FFFFFF' }} />
            </Box>
        )
    }

    if (error && containers.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography sx={{ color: '#EF4444' }} variant="body2">
                    {error}
                </Typography>
            </Box>
        )
    }

    if (containers.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography sx={{ color: '#FFFFFF' }} variant="body2">
                    Nenhum container ativo no momento
                </Typography>
            </Box>
        )
    }

    return (
        <Box>
            <Typography
                variant="h5"
                gutterBottom
                sx={{
                    fontWeight: 'bold',
                    color: '#FFFFFF',
                    textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    mb: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                }}
            >
                <StorageIcon />
                Containers Ativos ({containers.length})
            </Typography>

            <TableContainer
                component={Paper}
                sx={{
                    backgroundColor: 'rgba(30, 41, 59, 0.3)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
                }}
            >
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ width: 40, color: '#FFFFFF', fontWeight: 'bold' }} />
                            <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>RPA</TableCell>
                            <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Docker Tag</TableCell>
                            <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold', width: 130 }}>CPU</TableCell>
                            <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold', width: 130 }}>Memória</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {containers.map((container) => (
                            <ContainerRow
                                key={container.pod_name}
                                container={container}
                                expanded={expandedRow === container.pod_name}
                                onToggle={() => handleToggleRow(container.pod_name)}
                                resourceHistory={resourceHistory}
                            />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    )
}
