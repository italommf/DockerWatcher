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
import { Add, Edit, Delete, Search as SearchIcon } from '@mui/icons-material'
import { useSnackbar } from 'notistack'
import api from '../services/api'
import { useDashboardCache } from '../context/DashboardCacheContext'

export default function RPAs({ isConnected = true, onReconnect }) {
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
        await api.rpaStandby(rpa.nome_rpa)
        enqueueSnackbar('RPA movido para standby', { variant: 'success' })
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
    enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
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
    enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
  }

  if (loading && rpas.length === 0) {
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
          RPAs (Robôs baseados em execuções)
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!isConnected && onReconnect && (
            <Button variant="outlined" onClick={onReconnect}>
              Reconectar
            </Button>
          )}
          <Button variant="contained" startIcon={<Add />} onClick={handleAdd} disabled={!isConnected}>
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
        {!Array.isArray(filteredRPAs) || filteredRPAs.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="body1" color="text.secondary" align="center">
                  {searchTerm ? 'Nenhum RPA encontrado com o termo pesquisado' : 'Nenhum RPA encontrado'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          filteredRPAs.map((rpa) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={rpa.nome_rpa}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderLeft: `4px solid ${rpa.status === 'standby' ? '#F59E0B' : '#10B981'}`,
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
                      title={rpa.nome_rpa || 'N/A'}
                    >
                      {rpa.apelido || rpa.nome_rpa || 'N/A'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip 
                        label={rpa.status === 'standby' ? 'Standby' : 'Ativo'} 
                        color={rpa.status === 'standby' ? 'warning' : 'success'} 
                        size="small" 
                        sx={{ fontSize: '0.7rem', height: 20 }}
                      />
                    </Box>
                  </Box>

                  {/* Informações compactas */}
                  <Box sx={{ flex: 1, mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>RPA:</strong> {rpa.nome_rpa || 'N/A'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>Docker:</strong> {rpa.docker_tag || 'latest'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>RAM:</strong> {rpa.qtd_ram_maxima || 0}MB
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>Instâncias:</strong> {rpa.jobs_ativos || 0}/{rpa.qtd_max_instancias || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      <strong>Pendentes:</strong> {rpa.execucoes_pendentes || 0}
                    </Typography>
                  </Box>

                  {/* Botões */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 'auto' }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={rpa.status === 'standby'}
                          onChange={() => handleToggleStandby(rpa)}
                          size="small"
                        />
                      }
                      label={<Typography variant="caption">Standby</Typography>}
                      sx={{ m: 0 }}
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        startIcon={<Edit />}
                        onClick={() => handleEdit(rpa)}
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
                        onClick={() => handleDelete(rpa)}
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
