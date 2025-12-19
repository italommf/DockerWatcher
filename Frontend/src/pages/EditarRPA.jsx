import React, { useState, useEffect } from 'react'
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
  CircularProgress,
  Paper,
} from '@mui/material'
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material'
import { Save, ArrowBack } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function EditarRPA({ isConnected = true, onReconnect, onBack, rpaName }) {
  const [formData, setFormData] = useState({
    docker_tag: '',
    qtd_max_instancias: 1,
    qtd_ram_maxima: 512,
    utiliza_arquivos_externos: false,
    tempo_maximo_de_vida: 600,
    apelido: '',
    tags: [],
  })
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [errors, setErrors] = useState({})
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    if (rpaName) {
      if (isConnected) {
        loadRPAData()
      } else {
        setLoadingData(false)
      }
    }
  }, [rpaName, isConnected])

  const loadRPAData = async () => {
    try {
      setLoadingData(true)
      const data = await api.getRPA(rpaName)
      setFormData({
        docker_tag: data.docker_tag || '',
        qtd_max_instancias: data.qtd_max_instancias || 1,
        qtd_ram_maxima: data.qtd_ram_maxima || 512,
        utiliza_arquivos_externos: data.utiliza_arquivos_externos || false,
        tempo_maximo_de_vida: data.tempo_maximo_de_vida || 600,
        apelido: data.apelido || '',
        tags: Array.isArray(data.tags) ? data.tags.filter(t => t !== 'Exec') : [],
      })
    } catch (error) {
      if (isConnected) {
        enqueueSnackbar(`Erro ao carregar RPA: ${error.message}`, { variant: 'error' })
      }
      if (onBack) onBack('rpas')
    } finally {
      setLoadingData(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) || 0 : value,
    })
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

    if (!formData.docker_tag.trim()) {
      newErrors.docker_tag = 'Docker Tag é obrigatória'
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
      enqueueSnackbar('Você precisa estar conectado para editar um RPA', { variant: 'warning' })
      return
    }

    if (!validateForm()) {
      enqueueSnackbar('Por favor, corrija os erros no formulário', { variant: 'error' })
      return
    }

    setLoading(true)
    try {
      await api.updateRPA(rpaName, formData)
      enqueueSnackbar('RPA atualizado com sucesso!', { variant: 'success' })
      setTimeout(() => {
        if (onBack) onBack('rpas')
      }, 1000)
    } catch (error) {
      enqueueSnackbar(`Erro ao atualizar RPA: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (!isConnected && !loadingData) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Reconecte para editar o RPA.
        </Alert>
        {onReconnect && (
          <Button variant="outlined" onClick={onReconnect}>
            Reconectar
          </Button>
        )}
        {onBack && (
          <Button variant="outlined" onClick={() => onBack('rpas')} sx={{ ml: 2 }}>
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
              Editar RPA: {rpaName}
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
                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ bgcolor: 'rgba(2, 136, 209, 0.2)', color: '#fff', '& .MuiAlert-icon': { color: '#29b6f6' } }}>
                      O nome do RPA não pode ser alterado. Para mudar o nome, é necessário criar um novo RPA.
                    </Alert>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Docker Tag"
                      name="docker_tag"
                      value={formData.docker_tag}
                      onChange={handleChange}
                      error={!!errors.docker_tag}
                      helperText={errors.docker_tag}
                      required
                      placeholder="ex: minha-imagem:latest"
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
                            '& .MuiSwitch-track': {
                              backgroundColor: 'rgba(255,255,255,0.3)',
                            }
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


