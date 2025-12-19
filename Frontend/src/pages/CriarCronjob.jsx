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

export default function CriarCronjob({ isConnected = true, onReconnect, onBack }) {
  const [formData, setFormData] = useState({
    name: '',
    schedule: '',
    timezone: 'America/Sao_Paulo',
    nome_robo: '',
    docker_repository: '',
    docker_tag: 'latest',
    memory_limit: '256Mi',
    ttl_seconds_after_finished: 60,
    dependente_de_execucoes: true,
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const { enqueueSnackbar } = useSnackbar()

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    })
    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' })
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Nome do Cronjob no Kubernetes é obrigatório'
    }

    if (!formData.schedule.trim()) {
      newErrors.schedule = 'Schedule é obrigatório (ex: "0 18 1 * *" para executar no dia 1 de cada mês às 18:00)'
    }

    // nome_robo é opcional - se vazio, o cronjob não buscará execuções do MySQL

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
      enqueueSnackbar('Você precisa estar conectado para criar um Cronjob', { variant: 'warning' })
      return
    }

    if (!validateForm()) {
      enqueueSnackbar('Por favor, corrija os erros no formulário', { variant: 'error' })
      return
    }

    setLoading(true)
    try {
      await api.createCronjob(formData)
      enqueueSnackbar('Cronjob criado com sucesso!', { variant: 'success' })
      // Limpar formulário
      setFormData({
        name: '',
        schedule: '',
        timezone: 'America/Sao_Paulo',
        nome_robo: '',
        docker_repository: '',
        docker_tag: 'latest',
        memory_limit: '256Mi',
        ttl_seconds_after_finished: 60,
        dependente_de_execucoes: true,
      })
      // Voltar para a página de Cronjobs após 1 segundo
      setTimeout(() => {
        if (onBack) onBack('cronjobs')
      }, 1000)
    } catch (error) {
      enqueueSnackbar(`Erro ao criar Cronjob: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Reconecte para criar um Cronjob.
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
              Criar Novo Cronjob
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
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Nome do Cronjob (Kubernetes)"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      error={!!errors.name}
                      helperText={errors.name || 'Nome único do cronjob no Kubernetes'}
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
                      label="Schedule (Cron)"
                      name="schedule"
                      value={formData.schedule}
                      onChange={handleChange}
                      error={!!errors.schedule}
                      helperText={errors.schedule || 'Ex: "0 18 1 * *" (min hora dia mês dia-semana)'}
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
                      helperText={errors.nome_robo || 'Nome do robô no MySQL (ex: att_empresas_b24_cnpjja)'}
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
                      helperText="Tempo em segundos para manter o job (padrão: 60)"
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
                      Se marcado, o sistema buscará execuções pendentes do banco MySQL para este cronjob (requer Nome do Robô preenchido).
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
                        {loading ? 'Criando...' : 'Criar Cronjob'}
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
