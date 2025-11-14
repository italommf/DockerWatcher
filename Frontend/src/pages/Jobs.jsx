import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material'
import { PlayArrow, Stop, Visibility } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Jobs({ isConnected = true, onReconnect }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    if (isConnected) {
      loadJobs()
      const interval = setInterval(() => {
        if (isConnected) loadJobs()
      }, 10000)
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [isConnected])

  const loadJobs = async () => {
    if (!isConnected) return // Não tentar carregar se desconectado
    
    try {
      setLoading(true)
      const [rpas, jobsStatus] = await Promise.all([api.getRPAs(), api.getJobStatus()])

      if (!Array.isArray(rpas)) {
        // Não limpar jobs se houver erro - manter cache
        return
      }

      const jobsData = rpas.map((rpa) => {
        const status = jobsStatus[rpa.nome_rpa] || {}
        let statusLabel = 'Idle'
        let statusColor = 'default'

        if (status.running > 0) {
          statusLabel = 'Running'
          statusColor = 'success'
        } else if (status.pending > 0) {
          statusLabel = 'Pending'
          statusColor = 'warning'
        } else if (status.error > 0 || status.failed > 0) {
          statusLabel = 'Error'
          statusColor = 'error'
        }

        return {
          ...rpa,
          status: statusLabel,
          statusColor,
        }
      })

      setJobs(jobsData)
    } catch (error) {
      console.error('Erro ao carregar jobs:', error)
      // Não limpar jobs em caso de erro - manter cache
      if (isConnected) {
        enqueueSnackbar(`Erro ao carregar jobs: ${error.message}`, { variant: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreateJob = async (rpa) => {
    try {
      enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleStopJob = async (rpa) => {
    try {
      enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleViewLogs = (rpa) => {
    enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
  }

  if (loading && jobs.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography 
          variant="h4" 
          sx={{ 
            fontWeight: 'bold',
            color: '#F8FAFC',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          Jobs e Execuções
        </Typography>
        {!isConnected && onReconnect && (
          <Button variant="outlined" onClick={onReconnect}>
            Reconectar
          </Button>
        )}
      </Box>

      {!isConnected && jobs.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Os dados exibidos são do cache. Reconecte para atualizar.
        </Alert>
      )}

      <Grid container spacing={3}>
        {jobs.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="body1" color="text.secondary" align="center">
                  Nenhum job encontrado
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          jobs.map((job) => (
            <Grid item xs={12} key={job.nome_rpa}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {job.nome_rpa || 'N/A'}
                      </Typography>
                      <Chip label={job.status} color={job.statusColor} size="small" sx={{ mr: 1 }} />
                    </Box>
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Execuções Pendentes: {job.execucoes_pendentes || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Jobs Ativos: {job.jobs_ativos || 0}/{job.qtd_max_instancias || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      RAM: {job.qtd_ram_maxima || 0}MB | Docker Tag: {job.docker_tag || 'latest'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<PlayArrow />}
                      disabled={!job.execucoes_pendentes || job.jobs_ativos >= job.qtd_max_instancias}
                      onClick={() => handleCreateJob(job)}
                    >
                      Criar Job
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Stop />}
                      disabled={!job.jobs_ativos}
                      onClick={() => handleStopJob(job)}
                    >
                      Parar Job
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Visibility />}
                      disabled={!job.jobs_ativos}
                      onClick={() => handleViewLogs(job)}
                    >
                      Ver Logs
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>
    </Box>
  )
}
