import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Grid,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
} from '@mui/material'
import { Add, PlayArrow, Edit, Delete } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Cronjobs({ isConnected = true, onReconnect }) {
  const [cronjobs, setCronjobs] = useState([])
  const [loading, setLoading] = useState(true)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    if (isConnected) {
      loadCronjobs()
      const interval = setInterval(() => {
        if (isConnected) loadCronjobs()
      }, 10000)
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [isConnected])

  const loadCronjobs = async () => {
    if (!isConnected) return // Não tentar carregar se desconectado
    
    try {
      setLoading(true)
      const data = await api.getCronjobs()
      setCronjobs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Erro ao carregar cronjobs:', error)
      // Não limpar cronjobs em caso de erro - manter cache
      if (isConnected) {
        enqueueSnackbar(`Erro ao carregar cronjobs: ${error.message}`, { variant: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRunNow = async (cronjob) => {
    try {
      await api.cronjobRunNow(cronjob.name)
      enqueueSnackbar('Cronjob executado com sucesso', { variant: 'success' })
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleToggleSuspend = async (cronjob) => {
    try {
      if (cronjob.suspended) {
        await api.cronjobActivate(cronjob.name)
        enqueueSnackbar('Cronjob reativado com sucesso', { variant: 'success' })
      } else {
        await api.cronjobStandby(cronjob.name)
        enqueueSnackbar('Cronjob suspenso com sucesso', { variant: 'success' })
      }
      loadCronjobs()
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleEdit = (cronjob) => {
    enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
  }

  const handleDelete = async (cronjob) => {
    if (!window.confirm(`Deseja realmente deletar o cronjob ${cronjob.name}?`)) return

    try {
      await api.deleteCronjob(cronjob.name)
      enqueueSnackbar('Cronjob deletado com sucesso', { variant: 'success' })
      loadCronjobs()
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleAdd = () => {
    enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
  }

  if (loading && cronjobs.length === 0) {
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
          Cronjobs
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!isConnected && onReconnect && (
            <Button variant="outlined" onClick={onReconnect}>
              Reconectar
            </Button>
          )}
          <Button variant="contained" startIcon={<Add />} onClick={handleAdd} disabled={!isConnected}>
            Adicionar Cronjob
          </Button>
        </Box>
      </Box>

      {!isConnected && cronjobs.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Os dados exibidos são do cache. Reconecte para atualizar.
        </Alert>
      )}

      <Grid container spacing={3}>
        {cronjobs.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="body1" color="text.secondary" align="center">
                  Nenhum cronjob encontrado
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          cronjobs.map((cronjob) => (
            <Grid item xs={12} key={cronjob.name}>
              <Card>
                <Box
                  sx={{
                    borderLeft: `4px solid ${cronjob.suspended ? '#F59E0B' : '#10B981'}`,
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box>
                        <Typography variant="h6" gutterBottom>
                          {cronjob.name || 'N/A'}
                        </Typography>
                        <Chip
                          label={cronjob.suspended ? 'Suspenso' : 'Ativo'}
                          color={cronjob.suspended ? 'warning' : 'success'}
                          size="small"
                        />
                      </Box>
                    </Box>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Schedule: {cronjob.schedule || 'N/A'}
                      </Typography>
                      {cronjob.last_schedule_time && (
                        <Typography variant="body2" color="text.secondary">
                          Última execução: {cronjob.last_schedule_time}
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<PlayArrow />}
                        disabled={cronjob.suspended}
                        onClick={() => handleRunNow(cronjob)}
                      >
                        Executar Agora
                      </Button>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={cronjob.suspended}
                            onChange={() => handleToggleSuspend(cronjob)}
                          />
                        }
                        label="Suspender"
                      />
                      <Box sx={{ flexGrow: 1 }} />
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Edit />}
                        onClick={() => handleEdit(cronjob)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        startIcon={<Delete />}
                        onClick={() => handleDelete(cronjob)}
                      >
                        Deletar
                      </Button>
                    </Box>
                  </CardContent>
                </Box>
              </Card>
            </Grid>
          ))
        )}
      </Grid>
    </Box>
  )
}
