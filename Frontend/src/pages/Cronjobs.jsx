import React, { useState, useEffect, useMemo } from 'react'
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
  TextField,
  InputAdornment,
} from '@mui/material'
import { Add, PlayArrow, Edit, Delete, Search as SearchIcon } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Cronjobs({ isConnected = true, onReconnect }) {
  const [cronjobs, setCronjobs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const { enqueueSnackbar } = useSnackbar()

  // Filtrar cronjobs baseado no termo de pesquisa
  const filteredCronjobs = useMemo(() => {
    if (!searchTerm.trim()) {
      return cronjobs
    }
    const term = searchTerm.toLowerCase()
    return cronjobs.filter(cronjob => 
      cronjob.name?.toLowerCase().includes(term) ||
      cronjob.schedule?.toLowerCase().includes(term) ||
      cronjob.apelido?.toLowerCase().includes(term)
    )
  }, [cronjobs, searchTerm])

  useEffect(() => {
    // Carregar apenas quando a aba for aberta - dados vêm do cache (atualizado a cada 5s em background)
    if (isConnected) {
      loadCronjobs()
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

      {/* Barra de pesquisa */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Pesquisar por nome do cronjob, schedule ou apelido..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#CBD5E1' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              '& fieldset': {
                borderColor: 'rgba(255, 255, 255, 0.1)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(255, 255, 255, 0.2)',
              },
              '&.Mui-focused fieldset': {
                borderColor: 'rgba(99, 102, 241, 0.5)',
              },
            },
            '& .MuiInputBase-input': {
              color: '#F8FAFC',
            },
          }}
        />
      </Box>

      <Grid container spacing={2}>
        {filteredCronjobs.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="body1" color="text.secondary" align="center">
                  {searchTerm ? 'Nenhum cronjob encontrado com o termo pesquisado' : 'Nenhum cronjob encontrado'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          filteredCronjobs.map((cronjob) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={cronjob.name}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderLeft: `4px solid ${cronjob.suspended ? '#F59E0B' : '#10B981'}`,
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  },
                }}
              >
                <CardContent sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Nome e Status */}
                  <Box sx={{ mb: 1.5 }}>
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        mb: 1, 
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: '#F8FAFC',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={cronjob.name || 'N/A'}
                    >
                      {cronjob.apelido || cronjob.name || 'N/A'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip 
                        label={cronjob.suspended ? 'Suspenso' : 'Ativo'} 
                        color={cronjob.suspended ? 'warning' : 'success'} 
                        size="small" 
                        sx={{ fontSize: '0.7rem', height: 20 }}
                      />
                    </Box>
                  </Box>

                  {/* Informações compactas */}
                  <Box sx={{ flex: 1, mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>Nome:</strong> {cronjob.name || 'N/A'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>Schedule:</strong> {cronjob.schedule || 'N/A'}
                    </Typography>
                    {cronjob.last_schedule_time && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        <strong>Última exec:</strong> {new Date(cronjob.last_schedule_time).toLocaleString('pt-BR', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </Typography>
                    )}
                    {cronjob.execucoes_pendentes !== undefined && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        <strong>Pendentes:</strong> {cronjob.execucoes_pendentes || 0}
                      </Typography>
                    )}
                  </Box>

                  {/* Botões */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 'auto' }}>
                    <Button
                      variant="contained"
                      size="small"
                      fullWidth
                      startIcon={<PlayArrow />}
                      disabled={cronjob.suspended}
                      onClick={() => handleRunNow(cronjob)}
                      sx={{ 
                        fontSize: '0.75rem',
                        py: 0.5,
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        color: '#10B981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        '&:hover': {
                          backgroundColor: 'rgba(16, 185, 129, 0.3)',
                        },
                        '&:disabled': {
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          color: 'rgba(255, 255, 255, 0.3)',
                        },
                      }}
                    >
                      Executar Agora
                    </Button>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={cronjob.suspended}
                          onChange={() => handleToggleSuspend(cronjob)}
                          size="small"
                        />
                      }
                      label={<Typography variant="caption">Suspender</Typography>}
                      sx={{ m: 0 }}
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        startIcon={<Edit />}
                        onClick={() => handleEdit(cronjob)}
                        sx={{ 
                          fontSize: '0.75rem',
                          py: 0.5,
                          borderColor: 'rgba(255, 255, 255, 0.2)',
                          color: '#CBD5E1',
                          '&:hover': {
                            borderColor: 'rgba(99, 102, 241, 0.5)',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                          },
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        fullWidth
                        startIcon={<Delete />}
                        onClick={() => handleDelete(cronjob)}
                        sx={{ 
                          fontSize: '0.75rem',
                          py: 0.5,
                          borderColor: 'rgba(239, 68, 68, 0.3)',
                          '&:hover': {
                            borderColor: 'rgba(239, 68, 68, 0.5)',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          },
                        }}
                      >
                        Deletar
                      </Button>
                    </Box>
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
