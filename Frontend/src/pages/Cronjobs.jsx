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
  Paper,
} from '@mui/material'
import { Add, PlayArrow, Edit, Delete, Search as SearchIcon } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

const CronjobCard = ({ cronjob, onRunNow, onToggleSuspend, onEdit, onDelete }) => {
  const statusColor = cronjob.suspended ? '#F59E0B' : '#10B981'

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
        title={`Status: ${cronjob.suspended ? 'Suspenso' : 'Ativo'}`}
      />

      <CardContent sx={{ flexGrow: 1, p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Title */}
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
          }} title={cronjob.name}>
            {cronjob.apelido || cronjob.name}
          </Typography>
          {cronjob.apelido && (
            <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: -0.5 }}>
              {cronjob.name}
            </Typography>
          )}
        </Box>

        {/* Info Grid */}
        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Schedule</Typography>
              <Chip
                label={cronjob.schedule || 'N/A'}
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

          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Última Execução</Typography>
              <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                {cronjob.last_schedule_time ? new Date(cronjob.last_schedule_time).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                }) : 'Nunca'}
              </Typography>
            </Box>
          </Grid>


        </Grid>

        {/* Actions */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 'auto', pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlayArrow fontSize="small" />}
              disabled={cronjob.suspended}
              onClick={() => onRunNow(cronjob)}
              sx={{
                flex: 1,
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                color: '#10B981',
                borderColor: 'rgba(16, 185, 129, 0.3)',
                fontSize: '0.7rem',
                '&:hover': {
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  borderColor: '#10B981',
                },
                '&:disabled': {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: 'rgba(255, 255, 255, 0.3)',
                },
              }}
            >
              Executar
            </Button>
            <FormControlLabel
              control={
                <Switch
                  checked={cronjob.suspended}
                  onChange={() => onToggleSuspend(cronjob)}
                  size="small"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: '#F59E0B' },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#F59E0B' },
                  }}
                />
              }
              label={<Typography variant="caption" sx={{ color: '#fff' }}>Suspender</Typography>}
              sx={{ m: 0 }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<Edit fontSize="small" />}
              onClick={() => onEdit(cronjob)}
              sx={{
                flex: 1,
                color: '#60A5FA',
                borderColor: 'rgba(96, 165, 250, 0.3)',
                bgcolor: 'rgba(96, 165, 250, 0.05)',
                fontSize: '0.75rem',
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(96, 165, 250, 0.15)', borderColor: '#60A5FA' }
              }}
              variant="outlined"
            >
              Editar
            </Button>
            <Button
              size="small"
              startIcon={<Delete fontSize="small" />}
              onClick={() => onDelete(cronjob)}
              sx={{
                flex: 1,
                color: '#F87171',
                borderColor: 'rgba(248, 113, 113, 0.3)',
                bgcolor: 'rgba(248, 113, 113, 0.05)',
                fontSize: '0.75rem',
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(248, 113, 113, 0.15)', borderColor: '#F87171' }
              }}
              variant="outlined"
            >
              Excluir
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export default function Cronjobs({ isConnected = true, onReconnect, onEdit }) {
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
        // Pedir confirmação antes de suspender
        const confirmar = window.confirm(
          `⚠️ ATENÇÃO!\n\n` +
          `Suspender cronjob "${cronjob.name}"?\n\n` +
          `• O cronjob não criará mais jobs agendados\n` +
          `• Todos os jobs ativos serão finalizados IMEDIATAMENTE\n\n` +
          `Deseja continuar?`
        )

        if (!confirmar) {
          return // Cancelou
        }

        const response = await api.cronjobStandby(cronjob.name)
        enqueueSnackbar(response.message || 'Cronjob suspenso com sucesso', { variant: 'success' })
      }
      loadCronjobs()
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleEdit = (cronjob) => {
    if (onEdit) {
      onEdit('editar-cronjob', cronjob.name)
    }
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
    if (onEdit) {
      onEdit('criar-cronjob')
    } else {
      enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
    }
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 10px)', width: '100%', gap: 1, overflow: 'hidden', p: 0 }}>
      {/* Paper wrapper com o estilo "Orange Gradient" do Dashboard (Default Panel) */}
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
            // Gradiente Laranja do Dashboard
            background: 'linear-gradient(135deg, #ee4756 0%, #f7a54c 50%, #fcd335 100%)',
            opacity: 0.75,
            zIndex: 0,
          },
          borderRadius: '16px',
          border: '1px solid rgba(247, 165, 76, 0.3)',
          boxShadow: '0 8px 32px rgba(247, 165, 76, 0.15)',
        }}
      >
        <Box sx={{
          height: '100%',
          overflowY: 'auto',
          p: 3,
          position: 'relative',
          zIndex: 1, // Acima do gradiente
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 'bold',
                color: '#FFFFFF',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              Cronjobs
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {!isConnected && onReconnect && (
                <Button variant="outlined" onClick={onReconnect} sx={{ color: '#fff', borderColor: '#fff' }}>
                  Reconectar
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleAdd}
                disabled={!isConnected}
                sx={{ bgcolor: '#fff', color: '#f7a54c', '&:hover': { bgcolor: '#fff8f0' } }}
              >
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
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                  },
                },
                '& .MuiInputBase-input': {
                  color: '#F8FAFC',
                },
              }}
            />
          </Box>

          <Grid container spacing={2}>
            {loading && cronjobs.length === 0 ? (
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                  <CircularProgress sx={{ color: '#fff' }} />
                </Box>
              </Grid>
            ) : filteredCronjobs.length === 0 ? (
              <Grid item xs={12}>
                <Card sx={{ bgcolor: 'rgba(30, 41, 59, 0.5)', borderRadius: 2 }}>
                  <CardContent>
                    <Typography variant="body1" sx={{ color: '#F8FAFC' }} align="center">
                      {searchTerm ? 'Nenhum cronjob encontrado com o termo pesquisado' : 'Nenhum cronjob encontrado'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : (
              filteredCronjobs.map((cronjob) => (
                <Grid item xs={12} sm={6} md={4} lg={3} xl={3} key={cronjob.name}>
                  <CronjobCard
                    cronjob={cronjob}
                    onRunNow={handleRunNow}
                    onToggleSuspend={handleToggleSuspend}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </Grid>
              ))
            )}
          </Grid>
        </Box>
      </Paper>
    </Box>
  )
}
