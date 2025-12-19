import React, { useState, useEffect, useRef } from 'react'
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    IconButton,
    CircularProgress,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from '@mui/material'
import {
    Close as CloseIcon,
    Refresh as RefreshIcon,
    ContentCopy as ContentCopyIcon,
    Download as DownloadIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function TerminalView({ open, onClose, podName }) {
    const [logs, setLogs] = useState('')
    const [loading, setLoading] = useState(false)
    const [tail, setTail] = useState(100)
    const logContainerRef = useRef(null)
    const { enqueueSnackbar } = useSnackbar()

    const fetchLogs = async () => {
        if (!podName) return

        setLoading(true)
        try {
            // api.getPodLogs retorna { logs: "string content..." } ou array de linhas
            const data = await api.getPodLogs(podName, tail)

            let logContent = ''
            if (typeof data === 'string') {
                logContent = data
            } else if (data && data.logs) {
                logContent = Array.isArray(data.logs) ? data.logs.join('\n') : data.logs
            } else {
                logContent = JSON.stringify(data, null, 2)
            }

            setLogs(logContent || 'Nenhum log disponível.')
        } catch (error) {
            console.error('Erro ao buscar logs:', error)
            setLogs(`Erro ao buscar logs: ${error.message}`)
            enqueueSnackbar('Erro ao buscar logs', { variant: 'error' })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (open && podName) {
            setLogs('')
            fetchLogs()
        }
    }, [open, podName, tail])

    // Scroll to bottom when logs update
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
        }
    }, [logs])

    const handleCopyLogs = () => {
        navigator.clipboard.writeText(logs)
        enqueueSnackbar('Logs copiados para a área de transferência', { variant: 'info' })
    }

    const handleDownloadLogs = () => {
        const element = document.createElement('a')
        const file = new Blob([logs], { type: 'text/plain' })
        element.href = URL.createObjectURL(file)
        element.download = `${podName}_logs.txt`
        document.body.appendChild(element)
        element.click()
        document.body.removeChild(element)
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            PaperProps={{
                sx: {
                    height: '80vh',
                    bgcolor: '#0F172A',
                    color: '#F8FAFC',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                }
            }}
        >
            <DialogTitle sx={{
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                py: 1.5
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontSize: '1rem', fontFamily: 'monospace' }}>
                        &gt;_ {podName || 'Terminal'}
                    </Typography>
                    {loading && <CircularProgress size={16} sx={{ color: '#F8FAFC' }} />}
                </Box>
                <IconButton onClick={onClose} size="small" sx={{ color: '#94A3B8', '&:hover': { color: '#F8FAFC' } }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <Box sx={{
                p: 1,
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                bgcolor: '#1E293B',
                display: 'flex',
                gap: 1,
                alignItems: 'center'
            }}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel sx={{ color: '#94A3B8' }}>Linhas</InputLabel>
                    <Select
                        value={tail}
                        label="Linhas"
                        onChange={(e) => setTail(e.target.value)}
                        sx={{
                            color: '#F8FAFC',
                            '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255, 255, 255, 0.4)' },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#3B82F6' },
                            '.MuiSvgIcon-root': { color: '#94A3B8' }
                        }}
                    >
                        <MenuItem value={100}>100 linhas</MenuItem>
                        <MenuItem value={500}>500 linhas</MenuItem>
                        <MenuItem value={1000}>1000 linhas</MenuItem>
                        <MenuItem value={5000}>5000 linhas</MenuItem>
                    </Select>
                </FormControl>

                <Button
                    startIcon={<RefreshIcon />}
                    onClick={fetchLogs}
                    size="small"
                    sx={{ color: '#F8FAFC', borderColor: 'rgba(255, 255, 255, 0.2)', '&:hover': { borderColor: '#F8FAFC', bgcolor: 'rgba(255, 255, 255, 0.05)' } }}
                    variant="outlined"
                >
                    Atualizar
                </Button>

                <Box sx={{ flex: 1 }} />

                <Button
                    startIcon={<ContentCopyIcon />}
                    onClick={handleCopyLogs}
                    size="small"
                    sx={{ color: '#94A3B8', '&:hover': { color: '#F8FAFC' } }}
                >
                    Copiar
                </Button>
                <Button
                    startIcon={<DownloadIcon />}
                    onClick={handleDownloadLogs}
                    size="small"
                    sx={{ color: '#94A3B8', '&:hover': { color: '#F8FAFC' } }}
                >
                    Baixar
                </Button>
            </Box>

            <DialogContent sx={{ p: 0, bgcolor: '#000000' }}>
                <Box
                    ref={logContainerRef}
                    sx={{
                        p: 2,
                        height: '100%',
                        overflow: 'auto',
                        fontFamily: "'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace",
                        fontSize: '14px',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        color: '#D1D5DB'
                    }}
                >
                    {loading && !logs ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, color: '#64748B' }}>
                            <CircularProgress size={30} sx={{ color: '#3B82F6' }} />
                            <Typography>Carregando logs do container...</Typography>
                        </Box>
                    ) : (
                        logs
                    )}
                </Box>
            </DialogContent>
        </Dialog>
    )
}
