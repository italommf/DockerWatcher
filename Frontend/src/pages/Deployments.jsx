import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material'
import { Add, Edit, Delete } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Deployments({ isConnected = true, onReconnect }) {
  const [deployments, setDeployments] = useState([])
  const [loading, setLoading] = useState(true)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    if (isConnected) {
      loadDeployments()
      const interval = setInterval(() => {
        if (isConnected) loadDeployments()
      }, 10000)
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [isConnected])

  const loadDeployments = async () => {
    if (!isConnected) return // Não tentar carregar se desconectado
    
    try {
      setLoading(true)
      const data = await api.getDeployments()
      setDeployments(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Erro ao carregar deployments:', error)
      // Não limpar deployments em caso de erro - manter cache
      if (isConnected) {
        enqueueSnackbar(`Erro ao carregar deployments: ${error.message}`, { variant: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (deployment) => {
    enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
  }

  const handleDelete = async (deployment) => {
    if (!window.confirm(`Deseja realmente deletar o deployment ${deployment.name}?`)) return

    try {
      await api.deleteDeployment(deployment.name)
      enqueueSnackbar('Deployment deletado com sucesso', { variant: 'success' })
      loadDeployments()
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  const handleAdd = () => {
    enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
  }

  if (loading && deployments.length === 0) {
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
          Deployments
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!isConnected && onReconnect && (
            <Button variant="outlined" onClick={onReconnect}>
              Reconectar
            </Button>
          )}
          <Button variant="contained" startIcon={<Add />} onClick={handleAdd} disabled={!isConnected}>
            Adicionar Deployment
          </Button>
        </Box>
      </Box>

      {!isConnected && deployments.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Os dados exibidos são do cache. Reconecte para atualizar.
        </Alert>
      )}

      <Grid container spacing={3}>
        {deployments.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="body1" color="text.secondary" align="center">
                  Nenhum deployment encontrado
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          deployments.map((deployment) => (
            <Grid item xs={12} key={deployment.name}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Typography variant="h6">{deployment.name || 'N/A'}</Typography>
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Réplicas: {deployment.ready_replicas || 0}/{deployment.replicas || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Disponíveis: {deployment.available_replicas || 0}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Edit />}
                      onClick={() => handleEdit(deployment)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      startIcon={<Delete />}
                      onClick={() => handleDelete(deployment)}
                    >
                      Deletar
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
