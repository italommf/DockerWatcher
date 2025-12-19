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
import { Add, Edit, Delete, Search as SearchIcon } from '@mui/icons-material'
import { useSnackbar } from 'notistack'
import api from '../services/api'
import { useDashboardCache } from '../context/DashboardCacheContext'

const RpaCard = ({ rpa, onToggleStandby, onEdit, onDelete }) => {
  const statusColor = rpa.status === 'active' ? '#10B981' : '#F59E0B'

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
        title={`Status: ${rpa.status === 'active' ? 'Ativo' : 'Standby'}`}
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
          }} title={rpa.nome_rpa}>
            {rpa.apelido || rpa.nome_rpa}
          </Typography>
          {rpa.apelido && (
            <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: -0.5 }}>
              {rpa.nome_rpa}
            </Typography>
          )}
        </Box>

        {/* Info Grid */}
        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Docker Tag</Typography>
              <Chip
                label={rpa.docker_tag || 'latest'}
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
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>RAM Máxima</Typography>
              <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                {rpa.qtd_ram_maxima || 0} MB
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Instâncias</Typography>
              <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                {rpa.jobs_ativos || 0} / {rpa.qtd_max_instancias || 0}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Pendentes</Typography>
              <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                {rpa.execucoes_pendentes || 0}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Actions */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 'auto', pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <FormControlLabel
            control={
              <Switch
                checked={rpa.status === 'standby'}
                onChange={() => onToggleStandby(rpa)}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#F59E0B' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#F59E0B' },
                }}
              />
            }
            label={<Typography variant="caption" sx={{ color: '#fff' }}>Modo Standby</Typography>}
            sx={{ m: 0, mb: 1 }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<Edit fontSize="small" />}
              onClick={() => onEdit(rpa)}
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
              onClick={() => onDelete(rpa)}
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

export default function RPAs({ isConnected = true, onReconnect, onEdit }) {
  const [rpas, setRPAs] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const { enqueueSnackbar } = useSnackbar()
  const { cachedData, loadDashboardData } = useDashboardCache()
  const [loading, setLoading] = useState(true)

  // Filtrar RPAs baseado no termo de pesquisa
  const filteredRPAs = useMemo(() => {
    if (!searchTerm.trim()) {
      return rpas
    }
    const term = searchTerm.toLowerCase()
    return rpas.filter(rpa =>
      rpa.nome_rpa?.toLowerCase().includes(term) ||
      rpa.docker_tag?.toLowerCase().includes(term) ||
      rpa.apelido?.toLowerCase().includes(term)
    )
  }, [rpas, searchTerm])

  useEffect(() => {
    // Sempre que o cache for atualizado, refletir instantaneamente
    // Garantir que rpas é sempre um array válido
    const rpasArray = (cachedData?.rpas && Array.isArray(cachedData.rpas)) ? cachedData.rpas : []
    setRPAs(rpasArray)
    if (cachedData?.rpas !== undefined) {
      setLoading(false)
    }
  }, [cachedData?.rpas])

  useEffect(() => {
    if (!isConnected) {
      setLoading(false)
      return
    }

    // Se ainda não temos dados no cache, solicitar atualização (não bloqueia UI)
    if (!cachedData?.rpas || cachedData.rpas.length === 0) {
      loadDashboardData(true).catch((error) => {
        console.error('Erro ao carregar RPAs:', error)
        enqueueSnackbar(`Erro ao carregar RPAs: ${error.message}`, { variant: 'error' })
      })
    }
  }, [isConnected])

  const handleToggleStandby = async (rpa) => {
    // Atualização otimista: atualizar UI imediatamente
    // Garantir que rpas é um array antes de usar .map()
    if (!Array.isArray(rpas)) {
      console.warn('rpas não é um array, não é possível atualizar')
      return
    }

    const novoStatus = rpa.status === 'standby' ? 'active' : 'standby'

    // Se está indo para standby, pedir confirmação
    if (rpa.status !== 'standby') {
      const confirmar = window.confirm(
        `⚠️ ATENÇÃO!\n\n` +
        `Colocar "${rpa.nome_rpa}" em STANDBY?\n\n` +
        `Todas as instâncias rodando serão finalizadas IMEDIATAMENTE.\n\n` +
        `O RPA não executará mais até ser reativado.\n\n` +
        `Deseja continuar?`
      )

      if (!confirmar) {
        return // Cancelou
      }
    }

    const rpasAtualizados = rpas.map(r =>
      r.nome_rpa === rpa.nome_rpa
        ? { ...r, status: novoStatus }
        : r
    )
    setRPAs(rpasAtualizados)

    try {
      if (rpa.status === 'standby') {
        await api.rpaActivate(rpa.nome_rpa)
        enqueueSnackbar('RPA ativado com sucesso', { variant: 'success' })
      } else {
        const response = await api.rpaStandby(rpa.nome_rpa)
        enqueueSnackbar(response.message || 'RPA movido para standby', { variant: 'success' })
      }
      // Cache será atualizado automaticamente pelo PollingService em background
      // Não é necessário aguardar - a UI já foi atualizada otimisticamente
    } catch (error) {
      // Reverter atualização otimista em caso de erro
      // Garantir que rpas é um array antes de reverter
      if (Array.isArray(rpas)) {
        setRPAs(rpas)
      }
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleEdit = (rpa) => {
    if (onEdit) {
      onEdit('editar-rpa', rpa.nome_rpa)
    }
  }

  const handleDelete = async (rpa) => {
    if (!window.confirm(`Deseja realmente deletar o RPA ${rpa.nome_rpa}?`)) return

    try {
      await api.deleteRPA(rpa.nome_rpa)
      enqueueSnackbar('RPA deletado com sucesso', { variant: 'success' })
      await loadDashboardData(true)
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleAdd = () => {
    if (onEdit) {
      onEdit('criar-rpa');
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
              RPAs (Robôs baseados em execuções)
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
                Adicionar RPA
              </Button>
            </Box>
          </Box>

          {!isConnected && rpas.length > 0 && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Você está desconectado. Os dados exibidos são do cache. Reconecte para atualizar.
            </Alert>
          )}

          {/* Barra de pesquisa */}
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              placeholder="Pesquisar por nome do RPA, docker tag ou apelido..."
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
            {loading && rpas.length === 0 ? (
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                  <CircularProgress sx={{ color: '#fff' }} />
                </Box>
              </Grid>
            ) : !Array.isArray(filteredRPAs) || filteredRPAs.length === 0 ? (
              <Grid item xs={12}>
                <Card sx={{ bgcolor: 'rgba(30, 41, 59, 0.5)', borderRadius: 2 }}>
                  <CardContent>
                    <Typography variant="body1" sx={{ color: '#F8FAFC' }} align="center">
                      {searchTerm ? 'Nenhum RPA encontrado com o termo pesquisado' : 'Nenhum RPA encontrado'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : (
              filteredRPAs.map((rpa) => (
                <Grid item xs={12} sm={6} md={4} lg={3} xl={3} key={rpa.nome_rpa}>
                  <RpaCard
                    rpa={rpa}
                    onToggleStandby={handleToggleStandby}
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
