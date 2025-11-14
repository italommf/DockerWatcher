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
} from '@mui/material'
import { Add, Edit, Delete } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function RPAs() {
  const [rpas, setRPAs] = useState([])
  const [loading, setLoading] = useState(true)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    loadRPAs()
    const interval = setInterval(loadRPAs, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadRPAs = async () => {
    try {
      setLoading(true)
      const data = await api.getRPAs()
      setRPAs(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Erro ao carregar RPAs:', error)
      enqueueSnackbar(`Erro ao carregar RPAs: ${error.message}`, { variant: 'error' })
      setRPAs([])
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStandby = async (rpa) => {
    try {
      if (rpa.status === 'standby') {
        await api.rpaActivate(rpa.nome_rpa)
        enqueueSnackbar('RPA ativado com sucesso', { variant: 'success' })
      } else {
        await api.rpaStandby(rpa.nome_rpa)
        enqueueSnackbar('RPA movido para standby', { variant: 'success' })
      }
      loadRPAs()
    } catch (error) {
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
      loadRPAs()
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
        <Button variant="contained" startIcon={<Add />} onClick={handleAdd}>
          Adicionar RPA
        </Button>
      </Box>
      <Grid container spacing={3}>
        {rpas.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="body1" color="text.secondary" align="center">
                  Nenhum RPA encontrado
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          rpas.map((rpa) => (
            <Grid item xs={12} key={rpa.nome_rpa}>
              <Card>
                <Box
                  sx={{
                    borderLeft: `4px solid ${rpa.status === 'standby' ? '#F59E0B' : '#10B981'}`,
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box>
                        <Typography variant="h6" gutterBottom>
                          {rpa.nome_rpa || 'N/A'}
                        </Typography>
                        <Chip
                          label={rpa.status === 'standby' ? 'Standby' : 'Ativo'}
                          color={rpa.status === 'standby' ? 'warning' : 'success'}
                          size="small"
                        />
                      </Box>
                    </Box>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="body2" color="text.secondary">
                          Docker Tag:
                        </Typography>
                        <Typography variant="body2">{rpa.docker_tag || 'latest'}</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="body2" color="text.secondary">
                          RAM Máxima:
                        </Typography>
                        <Typography variant="body2">{rpa.qtd_ram_maxima || 0}MB</Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="body2" color="text.secondary">
                          Instâncias Máx:
                        </Typography>
                        <Typography variant="body2">
                          {rpa.jobs_ativos || 0}/{rpa.qtd_max_instancias || 0}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Typography variant="body2" color="text.secondary">
                          Execuções Pendentes:
                        </Typography>
                        <Typography variant="body2">{rpa.execucoes_pendentes || 0}</Typography>
                      </Grid>
                    </Grid>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={rpa.status === 'standby'}
                            onChange={() => handleToggleStandby(rpa)}
                          />
                        }
                        label="Standby"
                      />
                      <Box sx={{ flexGrow: 1 }} />
                      <Button variant="outlined" size="small" startIcon={<Edit />} onClick={() => handleEdit(rpa)}>
                        Editar
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        startIcon={<Delete />}
                        onClick={() => handleDelete(rpa)}
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
