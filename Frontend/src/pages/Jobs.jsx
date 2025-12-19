import React, { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  IconButton,
  Grid,
  Alert,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Button,
} from '@mui/material'
import {
  Stop as StopIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Refresh as RefreshIcon,
  FilterList as FilterListIcon,
} from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'
import TerminalView from '../components/TerminalView'

// Componente para exibir o card de um Job
const JobCard = ({ job, onStop, onViewLogs }) => {
  const [anchorEl, setAnchorEl] = useState(null)

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleStop = () => {
    handleMenuClose()
    onStop(job)
  }

  const handleLogs = () => {
    handleMenuClose()
    onViewLogs(job)
  }

  // Calculate duration since start
  const calculateDuration = (startTime) => {
    if (!startTime) return 'N/A'
    const start = new Date(startTime)
    if (isNaN(start.getTime())) return 'N/A' // Validate date
    const now = new Date()
    const diffMs = now - start

    // Convert to readable format
    const seconds = Math.floor((diffMs / 1000) % 60)
    const minutes = Math.floor((diffMs / (1000 * 60)) % 60)
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24)
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    let durationStr = ''
    if (days > 0) durationStr += `${days}d `
    if (hours > 0) durationStr += `${hours}h `
    if (minutes > 0) durationStr += `${minutes}m `
    durationStr += `${seconds}s`

    return durationStr
  }

  // Format start time
  const formatStartTime = (startTime) => {
    if (!startTime) return 'N/A'
    const date = new Date(startTime)
    return date.toLocaleString('pt-BR')
  }

  // Get status color
  const getStatusColor = (status) => {
    if (status === 'Running') return '#10B981' // Verde
    if (status === 'Pending') return '#F59E0B' // Amarelo
    if (status === 'Succeeded') return '#3B82F6' // Azul
    if (status === 'Failed' || status === 'Error' || status === 'CrashLoopBackOff') return '#EF4444' // Vermelho
    return '#64748B' // Cinza
  }

  const statusColor = getStatusColor(job.status)
  // const duration = calculateDuration(job.startTime) // Removed, using direct call with job.start_time

  // Extract tag from image if possible (assuming format image:tag)
  const imageTag = job.image ? job.image.split(':').pop() : 'latest'

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'visible',
        backgroundColor: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        transition: 'all 0.3s ease-in-out',
        '&:hover': {
          transform: 'translateY(-5px)',
          boxShadow: `0 12px 20px -5px ${statusColor}40`,
          borderColor: 'rgba(255, 255, 255, 0.3)',
        }
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 15,
          right: 15,
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: statusColor,
          boxShadow: `0 0 8px ${statusColor}`,
          zIndex: 2
        }}
        title={`Status: ${job.status}`}
      />

      <CardContent sx={{ flexGrow: 1, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Title and ID */}
        <Box>
          <Typography variant="h6" component="div" sx={{
            fontSize: '1rem',
            fontWeight: '700',
            lineHeight: 1.3,
            mb: 0.5,
            color: '#F8FAFC',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            pr: 2,
            fontFamily: "'Inter', sans-serif"
          }} title={job.name}>
            {job.name}
          </Typography>
          {/* ID Removed per user request */}
          {/* <Typography variant="caption" sx={{...}}>...</Typography> */}
        </Box>

        {/* Info Grid */}
        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
          {/* Status */}
          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Status</Typography>
              <Chip
                label={job.status}
                size="small"
                sx={{
                  height: '22px',
                  fontSize: '0.7rem',
                  fontWeight: '600',
                  backgroundColor: `${statusColor}15`,
                  color: statusColor,
                  border: `1px solid ${statusColor}30`,
                }}
              />
            </Box>
          </Grid>

          {/* Tag */}
          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Tag / Imagem</Typography>
              <Chip
                label={imageTag}
                size="small"
                sx={{
                  height: '22px',
                  fontSize: '0.7rem',
                  fontWeight: '500',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#E2E8F0',
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  maxWidth: '100%'
                }}
                variant="outlined"
              />
            </Box>
          </Grid>


          {/* Created At */}
          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Criado em</Typography>
              <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                {formatStartTime(job.start_time)}
              </Typography>
            </Box>
          </Grid>

          {/* Lifetime */}
          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Tempo de Vida</Typography>
              <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                {calculateDuration(job.start_time)}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 1, mt: 'auto', pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button
            size="small"
            startIcon={<VisibilityIcon fontSize="small" />}
            onClick={() => onViewLogs(job)}
            sx={{
              flex: 1,
              color: '#60A5FA',
              borderColor: 'rgba(96, 165, 250, 0.3)',
              bgcolor: 'rgba(96, 165, 250, 0.05)',
              fontSize: '0.75rem',
              textTransform: 'none',
              '&:hover': {
                bgcolor: 'rgba(96, 165, 250, 0.15)',
                borderColor: '#60A5FA'
              }
            }}
            variant="outlined"
          >
            Logs
          </Button>
          <Button
            size="small"
            startIcon={<StopIcon fontSize="small" />}
            onClick={() => onStop(job)}
            sx={{
              flex: 1,
              color: '#F87171',
              borderColor: 'rgba(248, 113, 113, 0.3)',
              bgcolor: 'rgba(248, 113, 113, 0.05)',
              fontSize: '0.75rem',
              textTransform: 'none',
              '&:hover': {
                bgcolor: 'rgba(248, 113, 113, 0.15)',
                borderColor: '#F87171'
              }
            }}
            variant="outlined"
          >
            Parar
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}

export default function Jobs({ isConnected = true, onReconnect }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all') // all, running, pending, error
  const [logViewerOpen, setLogViewerOpen] = useState(false)
  const [selectedJobForLogs, setSelectedJobForLogs] = useState(null)

  const { enqueueSnackbar } = useSnackbar()

  // Função para carregar jobs
  const loadJobs = async () => {
    if (!isConnected) return

    try {
      setLoading(true)
      const data = await api.getJobs()
      setJobs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Erro ao carregar jobs:', error)
      if (isConnected) {
        enqueueSnackbar('Erro ao carregar lista de containers', { variant: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  // Efeito para carregar jobs inicial e periodicamente
  useEffect(() => {
    if (isConnected) {
      loadJobs()
      const interval = setInterval(loadJobs, 5000) // Atualiza a cada 5 segundos
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [isConnected])

  // Filtragem de jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Filtro por termo de busca
      const matchesSearch =
        job.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (job.id && job.id.toLowerCase().includes(searchTerm.toLowerCase()))

      // Filtro por status
      let matchesStatus = true
      if (filterStatus !== 'all') {
        if (filterStatus === 'running') matchesStatus = job.status === 'Running'
        else if (filterStatus === 'pending') matchesStatus = job.status === 'Pending'
        else if (filterStatus === 'error') matchesStatus = ['Failed', 'Error', 'CrashLoopBackOff'].includes(job.status)
      }

      return matchesSearch && matchesStatus
    })
  }, [jobs, searchTerm, filterStatus])

  const handleStopJob = async (job) => {
    if (!window.confirm(`Tem certeza que deseja parar o container ${job.name}?`)) {
      return
    }

    try {
      await api.stopJob(job.name)
      enqueueSnackbar(`Solicitado parada do container ${job.name}`, { variant: 'success' })
      // Atualizar lista após um breve delay
      setTimeout(loadJobs, 1000)
    } catch (error) {
      console.error('Erro ao parar job:', error)
      enqueueSnackbar(`Erro ao parar container: ${error.message}`, { variant: 'error' })
    }
  }

  const handleViewLogs = (job) => {
    setSelectedJobForLogs(job)
    setLogViewerOpen(true)
  }

  const handleCloseLogViewer = () => {
    setLogViewerOpen(false)
    setSelectedJobForLogs(null)
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 10px)', width: '100%', gap: 1, overflow: 'hidden', p: 0 }}>
      {/* Paper wrapper com o estilo "Blue Gradient" do Dashboard (VM Metrics) */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          overflow: 'hidden',
          bgcolor: '#FFFFFF',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            // Gradiente Azul/Roxo do Dashboard (VM Metrics)
            background: 'linear-gradient(135deg, #754c99 0%, #8fd0d7 100%)',
            opacity: 0.75, // Ajuste de opacidade para combinar com o design
            zIndex: 0,
          },
          borderRadius: '16px',
          border: '1px solid rgba(117, 76, 153, 0.3)',
          boxShadow: '0 8px 32px rgba(117, 76, 153, 0.15)',
        }}
      >
        <Box sx={{
          height: '100%',
          overflowY: 'auto',
          p: 3,
          position: 'relative',
          zIndex: 1, // Conteúdo acima do gradiente
        }}>
          {/* Header e Controles */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 'bold',
                  color: '#FFFFFF',
                  textShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              >
                Containers Rodando
              </Typography>

              <Box sx={{ display: 'flex', gap: 2 }}>
                {!isConnected && onReconnect && (
                  <Button variant="outlined" onClick={onReconnect} sx={{ color: '#fff', borderColor: '#fff' }}>
                    Reconectar
                  </Button>
                )}
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={loadJobs}
                  disabled={loading}
                  sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}
                >
                  Atualizar
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                placeholder="Buscar por nome ou ID..."
                variant="outlined"
                size="small"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{
                  flexGrow: 1,
                  maxWidth: '500px',
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
                    '&.Mui-focused fieldset': { borderColor: '#fff' }
                  },
                  '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.7)' }
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: 'rgba(255,255,255,0.7)' }} />
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                size="small"
                variant="outlined"
                sx={{
                  minWidth: '150px',
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    '& fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.5)' },
                    '&.Mui-focused fieldset': { borderColor: '#fff' }
                  },
                  '& .MuiSelect-icon': { color: '#fff' }
                }}
                SelectProps={{ native: true }}
              >
                <option value="all" style={{ color: '#000' }}>Todos os Status</option>
                <option value="running" style={{ color: '#000' }}>Rodando</option>
                <option value="pending" style={{ color: '#000' }}>Pendente</option>
                <option value="error" style={{ color: '#000' }}>Erro</option>
              </TextField>
            </Box>
          </Box>

          {!isConnected && jobs.length > 0 && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Você está desconectado. Os dados exibidos são do cache. Reconecte para atualizar.
            </Alert>
          )}

          {loading && jobs.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
              <CircularProgress sx={{ color: '#fff' }} />
            </Box>
          ) : filteredJobs.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                Nenhum container encontrado.
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {filteredJobs.map((job) => (
                <Grid item xs={12} sm={6} md={4} lg={3} xl={3} key={job.id || job.name}>
                  <JobCard
                    job={job}
                    onStop={handleStopJob}
                    onViewLogs={handleViewLogs}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          {/* Terminal View Drawer/Modal */}
          <TerminalView
            open={logViewerOpen}
            onClose={handleCloseLogViewer}
            podName={selectedJobForLogs?.pod_name}
          />
        </Box>
      </Paper>
    </Box>
  )
}
