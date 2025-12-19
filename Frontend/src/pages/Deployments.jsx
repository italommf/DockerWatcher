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
  Paper,
} from '@mui/material'
import { Add, Delete, Search as SearchIcon, Edit } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

const DeploymentCard = ({ deployment, onDelete, onEdit }) => {
  const isHealthy = deployment.ready_replicas === deployment.replicas
  const statusColor = isHealthy ? '#10B981' : '#F59E0B'

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
        title={`Status: ${isHealthy ? 'Saudável' : 'Atenção'}`}
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
          }} title={deployment.name}>
            {deployment.apelido || deployment.name}
          </Typography>
          {deployment.apelido && (
            <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: -0.5 }}>
              {deployment.name}
            </Typography>
          )}
        </Box>

        {/* Info Grid */}
        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Réplicas</Typography>
              <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                {deployment.ready_replicas || 0} / {deployment.replicas || 0}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={6}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Disponíveis</Typography>
              <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                {deployment.available_replicas || 0}
              </Typography>
            </Box>
          </Grid>

          {deployment.execucoes_pendentes !== undefined && (
            <Grid item xs={6}>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 0.5, fontSize: '0.7rem' }}>Pendentes</Typography>
                <Typography variant="body2" sx={{ color: '#E2E8F0', fontSize: '0.8rem' }}>
                  {deployment.execucoes_pendentes || 0}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 1, mt: 'auto', pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Button
            size="small"
            fullWidth
            startIcon={<Edit fontSize="small" />}
            onClick={() => onEdit(deployment)}
            sx={{
              flex: 1,
              color: '#3B82F6',
              borderColor: 'rgba(59, 130, 246, 0.3)',
              bgcolor: 'rgba(59, 130, 246, 0.05)',
              fontSize: '0.75rem',
              textTransform: 'none',
              '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.15)', borderColor: '#3B82F6' }
            }}
            variant="outlined"
          >
            Editar
          </Button>
          <Button
            size="small"
            fullWidth
            startIcon={<Delete fontSize="small" />}
            onClick={() => onDelete(deployment)}
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
            Deletar
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}


export default function Deployments({ isConnected = true, onReconnect, onEdit }) {
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
      }, 10000) // A cada 10 segundos (sincronizado com o backend)
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

  const handleEdit = (deployment) => {
    if (onEdit) {
      onEdit('editar-deployment', deployment.name)
    }
  }

  const handleAdd = () => {
    if (onEdit) {
      onEdit('criar-deployment')
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
              Deployments
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
            {loading && deployments.length === 0 ? (
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                  <CircularProgress sx={{ color: '#fff' }} />
                </Box>
              </Grid>
            ) : filteredDeployments.length === 0 ? (
              <Grid item xs={12}>
                <Card sx={{ bgcolor: 'rgba(30, 41, 59, 0.5)', borderRadius: 2 }}>
                  <CardContent>
                    <Typography variant="body1" color="text.secondary" align="center" sx={{ color: '#fff' }}>
                      {searchTerm ? 'Nenhum deployment encontrado com o termo pesquisado' : 'Nenhum deployment encontrado'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : (
              filteredDeployments.map((deployment) => (
                <Grid item xs={12} sm={6} md={4} lg={3} xl={3} key={deployment.name}>
                  <DeploymentCard
                    deployment={deployment}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
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
