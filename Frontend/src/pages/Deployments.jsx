import React, { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
} from '@mui/material'
import { Add, Edit, Delete, Search as SearchIcon } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Deployments({ isConnected = true, onReconnect }) {
  const [deployments, setDeployments] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const { enqueueSnackbar } = useSnackbar()

  // Filtrar deployments baseado no termo de pesquisa
  const filteredDeployments = useMemo(() => {
    if (!searchTerm.trim()) {
      return deployments
    }
    const term = searchTerm.toLowerCase()
    return deployments.filter(deployment => 
      deployment.name?.toLowerCase().includes(term) ||
      deployment.apelido?.toLowerCase().includes(term)
    )
  }, [deployments, searchTerm])

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

      {/* Barra de pesquisa */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Pesquisar por nome do deployment ou apelido..."
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
        {filteredDeployments.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="body1" color="text.secondary" align="center">
                  {searchTerm ? 'Nenhum deployment encontrado com o termo pesquisado' : 'Nenhum deployment encontrado'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          filteredDeployments.map((deployment) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={deployment.name}>
              <Card 
                sx={{ 
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  },
                }}
              >
                <CardContent sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Nome */}
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
                      title={deployment.name || 'N/A'}
                    >
                      {deployment.apelido || deployment.name || 'N/A'}
                    </Typography>
                  </Box>

                  {/* Informações compactas */}
                  <Box sx={{ flex: 1, mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>Nome:</strong> {deployment.name || 'N/A'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>Réplicas:</strong> {deployment.ready_replicas || 0}/{deployment.replicas || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      <strong>Disponíveis:</strong> {deployment.available_replicas || 0}
                    </Typography>
                    {deployment.execucoes_pendentes !== undefined && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        <strong>Pendentes:</strong> {deployment.execucoes_pendentes || 0}
                      </Typography>
                    )}
                  </Box>

                  {/* Botões */}
                  <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
                    <Button
                      variant="outlined"
                      size="small"
                      fullWidth
                      startIcon={<Edit />}
                      onClick={() => handleEdit(deployment)}
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
                      onClick={() => handleDelete(deployment)}
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
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>
    </Box>
  )
}
