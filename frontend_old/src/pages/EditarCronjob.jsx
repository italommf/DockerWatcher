import React, { useState, useEffect } from 'react'
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
  CircularProgress,
  Paper,
} from '@mui/material'
import { Save, ArrowBack } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function EditarCronjob({ isConnected = true, onReconnect, onBack, cronjobName }) {
  const [formData, setFormData] = useState({
    schedule: '',
    timezone: 'America/Sao_Paulo',
    nome_robo: '',
    docker_repository: '',
    docker_tag: 'latest',
    memory_limit: '256Mi',
    ttl_seconds_after_finished: 60,
  })
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [errors, setErrors] = useState({})
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    if (cronjobName) {
      if (isConnected) {
        loadCronjobData()
      } else {
        setLoadingData(false)
      }
    }
  }, [cronjobName, isConnected])

  const loadCronjobData = async () => {
    try {
      setLoadingData(true)
      const data = await api.getCronjob(cronjobName)

      let dockerRepo = ''
      let dockerTag = 'latest'
      if (data.image) {
        const imageParts = data.image.split(':')
        dockerRepo = imageParts[0] || ''
        dockerTag = imageParts[1] || 'latest'
      }

      setFormData({
        schedule: data.schedule || '',
        timezone: data.timezone || 'America/Sao_Paulo',
        nome_robo: data.nome_robo || '',
        docker_repository: dockerRepo,
        docker_tag: dockerTag,
        memory_limit: data.memory_limit || '256Mi',
        ttl_seconds_after_finished: data.ttl_seconds_after_finished || 60,
      })
    } catch (error) {
      if (isConnected) {
        enqueueSnackbar(`Erro ao carregar cronjob: ${error.message}`, { variant: 'error' })
      }
      if (onBack) onBack('cronjobs')
    } finally {
      setLoadingData(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    })
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' })
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.schedule.trim()) {
      newErrors.schedule = 'Schedule é obrigatório (ex: "0 18 1 * *" para executar no dia 1 de cada mês às 18:00)'
    }

    if (!formData.docker_repository.trim()) {
      newErrors.docker_repository = 'Repositório Docker é obrigatório (ex: rpaglobal/att_empresas_b24_cnpjja)'
    }

    if (!formData.docker_tag.trim()) {
      newErrors.docker_tag = 'Tag Docker é obrigatória (ex: latest, exec, prod)'
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
      enqueueSnackbar('Você precisa estar conectado para editar um Cronjob', { variant: 'warning' })
      return
    }

    if (!validateForm()) {
      enqueueSnackbar('Por favor, corrija os erros no formulário', { variant: 'error' })
      return
    }

    setLoading(true)
    try {
      await api.updateCronjob(cronjobName, formData)
      enqueueSnackbar('Cronjob atualizado com sucesso!', { variant: 'success' })
      setTimeout(() => {
        if (onBack) onBack('cronjobs')
      }, 1000)
    } catch (error) {
      enqueueSnackbar(`Erro ao atualizar Cronjob: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected && !loadingData) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Reconecte para editar o Cronjob.
        </Alert>
        {onReconnect && (
          <Button variant="outlined" onClick={onReconnect}>
            Reconectar
          </Button>
        )}
        {onBack && (
          <Button variant="outlined" onClick={() => onBack('cronjobs')} sx={{ ml: 2 }}>
            Voltar
          </Button>
        )}
      </Box>
    )
  }

  if (loadingData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
        <CircularProgress sx={{ color: '#fff' }} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 10px)', width: '100%', gap: 1, overflow: 'hidden', p: 0 }}>
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
          zIndex: 1,
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
              Editar Cronjob: {cronjobName}
            </Typography>
            {onBack && (
              <Button
                variant="outlined"
                startIcon={<ArrowBack />}
                onClick={() => onBack('cronjobs')}
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
                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ bgcolor: 'rgba(2, 136, 209, 0.2)', color: '#fff', '& .MuiAlert-icon': { color: '#29b6f6' } }}>
                      O nome do Cronjob não pode ser alterado. Para mudar o nome, é necessário criar um novo Cronjob.
                    </Alert>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Schedule (Cron)"
                      name="schedule"
                      value={formData.schedule}
                      onChange={handleChange}
                      error={!!errors.schedule}
                      helperText={errors.schedule || 'Formato Cron: minuto hora dia mês dia-semana'}
                      required
                      placeholder="0 18 1 * *"
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
                      label="Timezone"
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleChange}
                      helperText="Ex: America/Sao_Paulo"
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
                      label="Nome do Robô (MySQL) - Opcional"
                      name="nome_robo"
                      value={formData.nome_robo}
                      onChange={handleChange}
                      error={!!errors.nome_robo}
                      helperText={errors.nome_robo || 'Nome do robô no MySQL'}
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
                      label="Repositório Docker"
                      name="docker_repository"
                      value={formData.docker_repository}
                      onChange={handleChange}
                      error={!!errors.docker_repository}
                      helperText={errors.docker_repository || 'Ex: rpaglobal/att_empresas_b24_cnpjja'}
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
                      label="Tag Docker"
                      name="docker_tag"
                      value={formData.docker_tag}
                      onChange={handleChange}
                      error={!!errors.docker_tag}
                      helperText={errors.docker_tag || 'Ex: latest, exec, prod'}
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

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="TTL Seconds After Finished"
                      name="ttl_seconds_after_finished"
                      type="number"
                      value={formData.ttl_seconds_after_finished}
                      onChange={handleChange}
                      helperText="Tempo em segundos para manter o job após finalizar (padrão: 60)"
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
                    <FormHelperText sx={{ color: 'rgba(255,255,255,0.7)' }}>
                      <strong>Nota:</strong> A edição recria o cronjob no Kubernetes com as novas configurações.
                      Jobs já agendados podem ser afetados.
                    </FormHelperText>
                  </Grid>

                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      {onBack && (
                        <Button
                          variant="outlined"
                          onClick={() => onBack('cronjobs')}
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
                        {loading ? 'Salvando...' : 'Salvar Alterações'}
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


