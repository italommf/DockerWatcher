import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Grid,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material'
import { Save as SaveIcon, Refresh as RefreshIcon } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Configuracoes() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sshConfig, setSshConfig] = useState({
    host: '',
    port: 22,
    username: '',
    use_key: false,
    key_path: '',
    password: '',
  })
  const [mysqlConfig, setMysqlConfig] = useState({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
  })
  const [errors, setErrors] = useState({})
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const data = await api.getConfig()
      
      if (data.ssh) {
        setSshConfig({
          host: data.ssh.host || '',
          port: data.ssh.port || 22,
          username: data.ssh.username || '',
          use_key: data.ssh.use_key || false,
          key_path: data.ssh.key_path || '',
          password: '', // Não preencher senha por segurança
        })
      }
      
      if (data.mysql) {
        setMysqlConfig({
          host: data.mysql.host || '',
          port: data.mysql.port || 3306,
          user: data.mysql.user || '',
          password: '', // Não preencher senha por segurança
          database: data.mysql.database || '',
        })
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error)
      enqueueSnackbar(`Erro ao carregar configurações: ${error.message}`, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const validateForm = () => {
    const newErrors = {}

    // Validar SSH
    if (!sshConfig.host) {
      newErrors.ssh_host = 'Host é obrigatório'
    }
    if (!sshConfig.port || sshConfig.port < 1 || sshConfig.port > 65535) {
      newErrors.ssh_port = 'Porta inválida (1-65535)'
    }
    if (!sshConfig.username) {
      newErrors.ssh_username = 'Username é obrigatório'
    }
    if (sshConfig.use_key && !sshConfig.key_path) {
      newErrors.ssh_key_path = 'Caminho da chave é obrigatório quando usar chave SSH'
    }
    if (!sshConfig.use_key && !sshConfig.password) {
      newErrors.ssh_password = 'Senha é obrigatória quando não usar chave SSH'
    }

    // Validar MySQL
    if (!mysqlConfig.host) {
      newErrors.mysql_host = 'Host é obrigatório'
    }
    if (!mysqlConfig.port || mysqlConfig.port < 1 || mysqlConfig.port > 65535) {
      newErrors.mysql_port = 'Porta inválida (1-65535)'
    }
    if (!mysqlConfig.user) {
      newErrors.mysql_user = 'User é obrigatório'
    }
    if (!mysqlConfig.database) {
      newErrors.mysql_database = 'Database é obrigatório'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) {
      enqueueSnackbar('Corrija os erros antes de salvar', { variant: 'error' })
      return
    }

    try {
      setSaving(true)
      await api.saveConfig({
        ssh: sshConfig,
        mysql: mysqlConfig,
      })
      
      // Recarregar serviços no backend com novas configurações
      try {
        await api.reloadServices()
      } catch (reloadError) {
        console.warn('Erro ao recarregar serviços:', reloadError)
        // Continuar mesmo se houver erro ao recarregar
      }
      
      enqueueSnackbar('Configurações salvas com sucesso! Clique em "Reconectar" para aplicar as mudanças.', {
        variant: 'success',
        autoHideDuration: 7000,
      })
    } catch (error) {
      console.error('Erro ao salvar configurações:', error)
      enqueueSnackbar(`Erro ao salvar configurações: ${error.message}`, { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleSshChange = (field, value) => {
    setSshConfig((prev) => ({ ...prev, [field]: value }))
    // Limpar erro do campo
    if (errors[`ssh_${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[`ssh_${field}`]
        return newErrors
      })
    }
  }

  const handleMysqlChange = (field, value) => {
    setMysqlConfig((prev) => ({ ...prev, [field]: value }))
    // Limpar erro do campo
    if (errors[`mysql_${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[`mysql_${field}`]
        return newErrors
      })
    }
  }

  if (loading) {
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
          gutterBottom
          sx={{
            fontWeight: 'bold',
            color: '#F8FAFC',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          Configurações
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadConfig}
          disabled={loading || saving}
        >
          Recarregar
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Após salvar as configurações, clique no botão "Reconectar" na sidebar para aplicar as mudanças.
      </Alert>

      <Grid container spacing={3}>
        {/* Configurações SSH */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#F8FAFC', mb: 3 }}>
                VM Linux Docker (SSH)
              </Typography>

              <TextField
                fullWidth
                label="Host"
                value={sshConfig.host}
                onChange={(e) => handleSshChange('host', e.target.value)}
                error={!!errors.ssh_host}
                helperText={errors.ssh_host}
                sx={{ mb: 2 }}
                variant="outlined"
              />

              <TextField
                fullWidth
                label="Porta"
                type="number"
                value={sshConfig.port}
                onChange={(e) => handleSshChange('port', parseInt(e.target.value) || 22)}
                error={!!errors.ssh_port}
                helperText={errors.ssh_port}
                sx={{ mb: 2 }}
                variant="outlined"
                inputProps={{ min: 1, max: 65535 }}
              />

              <TextField
                fullWidth
                label="Username"
                value={sshConfig.username}
                onChange={(e) => handleSshChange('username', e.target.value)}
                error={!!errors.ssh_username}
                helperText={errors.ssh_username}
                sx={{ mb: 2 }}
                variant="outlined"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={sshConfig.use_key}
                    onChange={(e) => handleSshChange('use_key', e.target.checked)}
                  />
                }
                label="Usar chave SSH"
                sx={{ mb: 2, color: '#CBD5E1' }}
              />

              {sshConfig.use_key ? (
                <TextField
                  fullWidth
                  label="Caminho da Chave SSH"
                  value={sshConfig.key_path}
                  onChange={(e) => handleSshChange('key_path', e.target.value)}
                  error={!!errors.ssh_key_path}
                  helperText={errors.ssh_key_path || 'Caminho completo para o arquivo de chave SSH'}
                  sx={{ mb: 2 }}
                  variant="outlined"
                />
              ) : (
                <TextField
                  fullWidth
                  label="Senha"
                  type="password"
                  value={sshConfig.password}
                  onChange={(e) => handleSshChange('password', e.target.value)}
                  error={!!errors.ssh_password}
                  helperText={errors.ssh_password || 'Deixe em branco para não alterar'}
                  sx={{ mb: 2 }}
                  variant="outlined"
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Configurações MySQL */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#F8FAFC', mb: 3 }}>
                Database BWA (MySQL)
              </Typography>

              <TextField
                fullWidth
                label="Host"
                value={mysqlConfig.host}
                onChange={(e) => handleMysqlChange('host', e.target.value)}
                error={!!errors.mysql_host}
                helperText={errors.mysql_host}
                sx={{ mb: 2 }}
                variant="outlined"
              />

              <TextField
                fullWidth
                label="Porta"
                type="number"
                value={mysqlConfig.port}
                onChange={(e) => handleMysqlChange('port', parseInt(e.target.value) || 3306)}
                error={!!errors.mysql_port}
                helperText={errors.mysql_port}
                sx={{ mb: 2 }}
                variant="outlined"
                inputProps={{ min: 1, max: 65535 }}
              />

              <TextField
                fullWidth
                label="User"
                value={mysqlConfig.user}
                onChange={(e) => handleMysqlChange('user', e.target.value)}
                error={!!errors.mysql_user}
                helperText={errors.mysql_user}
                sx={{ mb: 2 }}
                variant="outlined"
              />

              <TextField
                fullWidth
                label="Senha"
                type="password"
                value={mysqlConfig.password}
                onChange={(e) => handleMysqlChange('password', e.target.value)}
                helperText="Deixe em branco para não alterar"
                sx={{ mb: 2 }}
                variant="outlined"
              />

              <TextField
                fullWidth
                label="Database"
                value={mysqlConfig.database}
                onChange={(e) => handleMysqlChange('database', e.target.value)}
                error={!!errors.mysql_database}
                helperText={errors.mysql_database}
                sx={{ mb: 2 }}
                variant="outlined"
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Botão Salvar */}
        <Grid item xs={12}>
          <Divider sx={{ my: 2, borderColor: 'rgba(255, 255, 255, 0.1)' }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              size="large"
            >
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  )
}

