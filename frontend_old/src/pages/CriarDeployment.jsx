import React, { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Alert,
  FormHelperText,
  FormControlLabel,
  Checkbox,
  Paper,
} from '@mui/material'
import { Save, ArrowBack } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function CriarDeployment({ isConnected = true, onReconnect, onBack }) {
  const [formData, setFormData] = useState({
    name: '',
    replicas: 1,
    nome_robo: '',
    docker_image: '',
    memory_limit: '256Mi',
    dependente_de_execucoes: true,
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const { enqueueSnackbar } = useSnackbar()

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value) || 0 : value),
    })
    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' })
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Nome do Deployment é obrigatório'
    }

    if (formData.replicas < 1) {
      newErrors.replicas = 'Número de réplicas deve ser pelo menos 1'
    }

    if (!formData.nome_robo.trim()) {
      newErrors.nome_robo = 'Nome do robô é obrigatório'
    }

    if (!formData.docker_image.trim()) {
      newErrors.docker_image = 'Docker image é obrigatório (ex: rpaglobal/obtencao_de_empresas:latest)'
    }

    if (!formData.memory_limit.trim()) {
      newErrors.memory_limit = 'Limite de memória é obrigatório (ex: 256Mi)'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isConnected) {
      enqueueSnackbar('Você precisa estar conectado para criar um Deployment', { variant: 'warning' })
      return
    }

    if (!validateForm()) {
      enqueueSnackbar('Por favor, corrija os erros no formulário', { variant: 'error' })
      return
    }

    setLoading(true)
    try {
      await api.createDeployment(formData)
      enqueueSnackbar('Deployment criado com sucesso!', { variant: 'success' })
      // Limpar formulário
      setFormData({
        name: '',
        replicas: 1,
        nome_robo: '',
        docker_image: '',
        memory_limit: '256Mi',
        dependente_de_execucoes: true,
      })
      // Voltar para a página de Deployments após 1 segundo
      setTimeout(() => {
        if (onBack) onBack('deployments')
      }, 1000)
    } catch (error) {
      enqueueSnackbar(`Erro ao criar Deployment: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Reconecte para criar um Deployment.
        </Alert>
        {onReconnect && (
          <Button variant="outlined" onClick={onReconnect}>
            Reconectar
          </Button>
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 10px)', width: '100%', gap: 1, overflow: 'hidden', p: 0 }}>
      {/* Paper wrapper com o estilo "Blue Gradient" do Dashboard (VM Metrics) */}
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
            // Gradiente Azul/Roxo do Dashboard
            background: 'linear-gradient(135deg, #754c99 0%, #8fd0d7 100%)',
            opacity: 0.75,
            zIndex: 0,
          },
          borderRadius: '16px',
          border: '1px solid rgba(117, 76, 153, 0.3)',
          boxShadow: '0 8px 32px rgba(117, 76, 153, 0.15)',
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
              Criar Novo Deployment
            </Typography>
            {onBack && (
              <Button
                variant="outlined"
                startIcon={<ArrowBack />}
                onClick={() => onBack('deployments')}
                sx={{ color: '#fff', borderColor: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
              >
                Voltar
              </Button>
            )}
          </Box>

          <Card sx={{ bgcolor: 'rgba(30, 41, 59, 0.5)', borderRadius: 2, border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Nome do Deployment"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      error={!!errors.name}
                      helperText={errors.name || 'Ex: rpa-deploy-obtencao-de-empresas'}
                      required
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                        '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.5)' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Número de Réplicas"
                      name="replicas"
                      type="number"
                      value={formData.replicas}
                      onChange={handleChange}
                      error={!!errors.replicas}
                      helperText={errors.replicas || 'Número de instâncias do deployment'}
                      required
                      inputProps={{ min: 1 }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                        '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.5)' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Nome do Robô"
                      name="nome_robo"
                      value={formData.nome_robo}
                      onChange={handleChange}
                      error={!!errors.nome_robo}
                      helperText={errors.nome_robo || 'Ex: rpa_obtencao_de_empresas'}
                      required
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                        '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.5)' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Docker Image"
                      name="docker_image"
                      value={formData.docker_image}
                      onChange={handleChange}
                      error={!!errors.docker_image}
                      helperText={errors.docker_image || 'Ex: rpaglobal/obtencao_de_empresas:latest'}
                      required
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                        '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.5)' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Limite de Memória"
                      name="memory_limit"
                      value={formData.memory_limit}
                      onChange={handleChange}
                      error={!!errors.memory_limit}
                      helperText={errors.memory_limit || 'Ex: 256Mi, 512Mi, 1Gi'}
                      required
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                        '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.5)' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.dependente_de_execucoes}
                          onChange={handleChange}
                          name="dependente_de_execucoes"
                          sx={{
                            color: 'rgba(255, 255, 255, 0.7)',
                            '&.Mui-checked': { color: '#10B981' },
                          }}
                        />
                      }
                      label={<Typography sx={{ color: '#fff' }}>Dependente de execuções (buscar execuções pendentes do banco MySQL)</Typography>}
                    />
                    <FormHelperText sx={{ mt: -1, mb: 2, color: 'rgba(255, 255, 255, 0.5)' }}>
                      Se marcado, o sistema buscará execuções pendentes do banco MySQL para este deployment.
                    </FormHelperText>
                  </Grid>

                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      {onBack && (
                        <Button
                          variant="outlined"
                          onClick={() => onBack('deployments')}
                          disabled={loading}
                          sx={{ color: '#fff', borderColor: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                        >
                          Cancelar
                        </Button>
                      )}
                      <Button
                        type="submit"
                        variant="contained"
                        startIcon={<Save />}
                        disabled={loading}
                        sx={{ bgcolor: '#10B981', color: '#fff', '&:hover': { bgcolor: '#059669' } }}
                      >
                        {loading ? 'Criando...' : 'Criar Deployment'}
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </form>
            </CardContent>
          </Card>
        </Box>
      </Paper>
    </Box>
  )
}
