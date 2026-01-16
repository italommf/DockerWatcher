import React, { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  FormControlLabel,
  Switch,
  Alert,
  Chip,
  InputAdornment,
  IconButton,
  Paper,
} from '@mui/material'
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material'
import { Save, ArrowBack } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function CriarRPA({ isConnected = true, onReconnect, onBack }) {
  const [formData, setFormData] = useState({
    nome_rpa: '',
    docker_tag: '',
    robo_uuid: '',
    qtd_max_instancias: 1,
    qtd_ram_maxima: 512,
    utiliza_arquivos_externos: false,
    tempo_maximo_de_vida: 600,
    apelido: '',
    tags: [],
  })
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const { enqueueSnackbar } = useSnackbar()

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) || 0 : value,
    })
    // Limpar erro do campo quando o usuário começar a digitar
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' })
    }
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      })
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove),
    })
  }

  const handleTagInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.nome_rpa.trim()) {
      newErrors.nome_rpa = 'Nome do RPA é obrigatório'
    }

    if (!formData.docker_tag.trim()) {
      newErrors.docker_tag = 'Docker Tag é obrigatória'
    }

    if (!formData.robo_uuid.trim()) {
      newErrors.robo_uuid = 'UUID do Robô é obrigatório'
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formData.robo_uuid.trim())) {
      newErrors.robo_uuid = 'UUID inválido. Formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    }

    if (formData.qtd_max_instancias < 1) {
      newErrors.qtd_max_instancias = 'Quantidade de instâncias deve ser pelo menos 1'
    }

    if (formData.qtd_ram_maxima < 1) {
      newErrors.qtd_ram_maxima = 'Quantidade de RAM deve ser maior que 0'
    }

    if (formData.tempo_maximo_de_vida < 1) {
      newErrors.tempo_maximo_de_vida = 'Tempo máximo de vida deve ser maior que 0'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isConnected) {
      enqueueSnackbar('Você precisa estar conectado para criar um RPA', { variant: 'warning' })
      return
    }

    if (!validateForm()) {
      enqueueSnackbar('Por favor, corrija os erros no formulário', { variant: 'error' })
      return
    }

    setLoading(true)
    try {
      await api.createRPA(formData)
      enqueueSnackbar('RPA criado com sucesso!', { variant: 'success' })
      // Limpar formulário
      setFormData({
        nome_rpa: '',
        docker_tag: '',
        robo_uuid: '',
        qtd_max_instancias: 1,
        qtd_ram_maxima: 512,
        utiliza_arquivos_externos: false,
        tempo_maximo_de_vida: 600,
        apelido: '',
        tags: [],
      })
      setTagInput('')
      // Voltar para a página de RPAs após 1 segundo
      setTimeout(() => {
        if (onBack) onBack('rpas')
      }, 1000)
    } catch (error) {
      enqueueSnackbar(`Erro ao criar RPA: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Reconecte para criar um RPA.
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
              Criar Novo RPA
            </Typography>
            {onBack && (
              <Button
                variant="outlined"
                startIcon={<ArrowBack />}
                onClick={() => onBack('rpas')}
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
                      label="Nome do RPA (Arquivo .env)"
                      name="nome_rpa"
                      value={formData.nome_rpa}
                      onChange={handleChange}
                      error={!!errors.nome_rpa}
                      helperText={errors.nome_rpa}
                      required
                      placeholder="Nome do RPA (.env)"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Docker Tag (Latest ou Exec)"
                      name="docker_tag"
                      value={formData.docker_tag}
                      onChange={handleChange}
                      error={!!errors.docker_tag}
                      helperText={errors.docker_tag}
                      required
                      placeholder="latest ou exec"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="UUID do Robô (MongoDB ou .env)"
                      name="robo_uuid"
                      value={formData.robo_uuid}
                      onChange={handleChange}
                      error={!!errors.robo_uuid}
                      helperText={errors.robo_uuid || 'UUID do robô no MongoDB para buscar execuções pendentes'}
                      required
                      placeholder="ex: 550e8400-e29b-41d4-a716-446655440000"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Quantidade Máxima de Instâncias"
                      name="qtd_max_instancias"
                      type="number"
                      value={formData.qtd_max_instancias}
                      onChange={handleChange}
                      error={!!errors.qtd_max_instancias}
                      helperText={errors.qtd_max_instancias || 'Número máximo de containers simultâneos'}
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
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Quantidade de RAM Máxima (MB)"
                      name="qtd_ram_maxima"
                      type="number"
                      value={formData.qtd_ram_maxima}
                      onChange={handleChange}
                      error={!!errors.qtd_ram_maxima}
                      helperText={errors.qtd_ram_maxima || 'Quantidade de memória em megabytes'}
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
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Tempo Máximo de Vida (segundos)"
                      name="tempo_maximo_de_vida"
                      type="number"
                      value={formData.tempo_maximo_de_vida}
                      onChange={handleChange}
                      error={!!errors.tempo_maximo_de_vida}
                      helperText={errors.tempo_maximo_de_vida || 'Tempo máximo que o container pode ficar rodando'}
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
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.utiliza_arquivos_externos}
                          onChange={handleChange}
                          name="utiliza_arquivos_externos"
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: '#10B981',
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              backgroundColor: '#10B981',
                            },
                          }}
                        />
                      }
                      label={<Typography sx={{ color: '#fff' }}>Utiliza Arquivos Externos</Typography>}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Apelido"
                      name="apelido"
                      value={formData.apelido}
                      onChange={handleChange}
                      helperText="Nome amigável para identificar o robô"
                      placeholder="ex: Robô de Extração de Dados"
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                      }}
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Tags"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={handleTagInputKeyPress}
                      placeholder="Digite uma tag e pressione Enter ou clique no +"
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={handleAddTag} edge="end" sx={{ color: '#fff' }}>
                              <AddIcon />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      helperText="Adicione tags para categorizar o robô. A tag 'Exec' será adicionada automaticamente."
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#fff',
                          '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.3)' },
                          '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.5)' },
                          '&.Mui-focused fieldset': { borderColor: '#10B981' },
                        },
                        '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .MuiInputLabel-root.Mui-focused': { color: '#10B981' },
                      }}
                    />
                    {formData.tags.length > 0 && (
                      <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {formData.tags.map((tag) => (
                          <Chip
                            key={tag}
                            label={tag}
                            onDelete={() => handleRemoveTag(tag)}
                            deleteIcon={<CloseIcon />}
                            color="success"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    )}
                  </Grid>

                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      {onBack && (
                        <Button
                          variant="outlined"
                          onClick={() => onBack('rpas')}
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
                        {loading ? 'Criando...' : 'Criar RPA'}
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
