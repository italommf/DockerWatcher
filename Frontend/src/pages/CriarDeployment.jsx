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
      <Box>
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
          Criar Novo Deployment
        </Typography>
        {onBack && (
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => onBack('deployments')}
          >
            Voltar
          </Button>
        )}
      </Box>

      <Card>
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
                />
              </Grid>
              
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.dependente_de_execucoes}
                      onChange={handleChange}
                      name="dependente_de_execucoes"
                    />
                  }
                  label="Dependente de execuções (buscar execuções pendentes do banco MySQL)"
                />
                <FormHelperText sx={{ mt: -1, mb: 2 }}>
                  Se marcado, o sistema buscará execuções pendentes do banco MySQL para este deployment. 
                  Se desmarcado, será exibido "Rotina Sem Exec" no dashboard.
                </FormHelperText>
              </Grid>
              
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                  {onBack && (
                    <Button
                      variant="outlined"
                      onClick={() => onBack('deployments')}
                      disabled={loading}
                    >
                      Cancelar
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={<Save />}
                    disabled={loading}
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
  )
}
