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
  Paper,
} from '@mui/material'
import { Save as SaveIcon, Refresh as RefreshIcon, CheckCircle as CheckCircleIcon, Error as ErrorIcon } from '@mui/icons-material'
import api, { updateApiUrl } from '../services/api'
import { useSnackbar } from 'notistack'
import { getApiUrl, setApiUrl, testApiConnection } from '../config/apiConfig'

export default function Configuracoes() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingSsh, setTestingSsh] = useState(false)
  const [testingMysql, setTestingMysql] = useState(false)
  const [sshTestResult, setSshTestResult] = useState(null)
  const [mysqlTestResult, setMysqlTestResult] = useState(null)
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
  const [backendConfig, setBackendConfig] = useState({
    api_url: getApiUrl(),
  })
  const [testingBackend, setTestingBackend] = useState(false)
  const [backendTestResult, setBackendTestResult] = useState(null)
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
          password: data.ssh.has_password ? 'secret' : '', // Mostrar "secret" se senha existe
        })
      }

      if (data.mysql) {
        setMysqlConfig({
          host: data.mysql.host || '',
          port: data.mysql.port || 3306,
          user: data.mysql.user || '',
          password: data.mysql.has_password ? 'secret' : '', // Mostrar "secret" se senha existe
          database: data.mysql.database || '',
        })
      }

      // Carregar URL do backend do localStorage
      setBackendConfig({
        api_url: getApiUrl(),
      })
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
        autoHideDuration: 5000,
      })
    } catch (error) {
      console.error('Erro ao salvar configurações:', error)
      enqueueSnackbar(`Erro ao salvar configurações: ${error.message}`, { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleSshChange = (field, value) => {
    // Se o campo é password e o valor atual é "secret", limpar ao começar a digitar
    if (field === 'password' && sshConfig.password === 'secret' && value !== 'secret' && value !== '') {
      // Usuário começou a digitar uma nova senha, já está limpo
    }
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
    // Se o campo é password e o valor atual é "secret", limpar ao começar a digitar
    if (field === 'password' && mysqlConfig.password === 'secret' && value !== 'secret' && value !== '') {
      // Usuário começou a digitar uma nova senha, já está limpo
    }
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

  const handleTestSsh = async () => {
    // Primeiro salvar as configurações se houver mudanças
    if (!validateForm()) {
      enqueueSnackbar('Corrija os erros antes de testar', { variant: 'error' })
      return
    }

    try {
      setTestingSsh(true)
      setSshTestResult(null)

      // Salvar configurações antes de testar
      await api.saveConfig({
        ssh: sshConfig,
        mysql: mysqlConfig,
      })

      // Recarregar serviços para aplicar novas configurações
      await api.reloadServices()

      // Testar conexão SSH
      const result = await api.testSshConnection()
      setSshTestResult(result)

      if (result.ssh_connected) {
        enqueueSnackbar('Conexão SSH bem-sucedida!', { variant: 'success' })
      } else {
        enqueueSnackbar(`Falha na conexão SSH: ${result.ssh_error || 'Erro desconhecido'}`, {
          variant: 'error',
          autoHideDuration: 5000,
        })
      }
    } catch (error) {
      console.error('Erro ao testar conexão SSH:', error)
      setSshTestResult({
        ssh_connected: false,
        ssh_error: error.message || 'Erro ao testar conexão',
      })
      enqueueSnackbar(`Erro ao testar conexão SSH: ${error.message}`, { variant: 'error' })
    } finally {
      setTestingSsh(false)
    }
  }

  const handleBackendUrlChange = (value) => {
    setBackendConfig((prev) => ({ ...prev, api_url: value }))
    // Limpar erro do campo
    if (errors.backend_url) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors.backend_url
        return newErrors
      })
    }
  }

  const handleSaveBackendUrl = async () => {
    // Validar URL
    try {
      new URL(backendConfig.api_url)
    } catch (e) {
      setErrors((prev) => ({ ...prev, backend_url: 'URL inválida' }))
      enqueueSnackbar('URL inválida. Use o formato: http://IP:PORTA', { variant: 'error' })
      return
    }

    // Salvar URL
    if (setApiUrl(backendConfig.api_url)) {
      // Atualizar instâncias do axios
      updateApiUrl()
      enqueueSnackbar('URL do backend salva com sucesso!', { variant: 'success' })
    } else {
      enqueueSnackbar('Erro ao salvar URL do backend', { variant: 'error' })
    }
  }

  const handleTestBackend = async () => {
    if (!backendConfig.api_url) {
      enqueueSnackbar('Digite a URL do backend antes de testar', { variant: 'error' })
      return
    }

    // Validar URL
    try {
      new URL(backendConfig.api_url)
    } catch (e) {
      setErrors((prev) => ({ ...prev, backend_url: 'URL inválida' }))
      enqueueSnackbar('URL inválida. Use o formato: http://IP:PORTA', { variant: 'error' })
      return
    }

    try {
      setTestingBackend(true)
      setBackendTestResult(null)

      const result = await testApiConnection(backendConfig.api_url)
      setBackendTestResult(result)

      if (result.success) {
        enqueueSnackbar('Conexão com backend bem-sucedida!', { variant: 'success' })
        // Salvar URL se o teste for bem-sucedido
        if (setApiUrl(backendConfig.api_url)) {
          updateApiUrl()
        }
      } else {
        enqueueSnackbar(`Falha na conexão: ${result.message}`, {
          variant: 'error',
          autoHideDuration: 5000,
        })
      }
    } catch (error) {
      console.error('Erro ao testar conexão com backend:', error)
      setBackendTestResult({
        success: false,
        message: error.message || 'Erro ao testar conexão',
      })
      enqueueSnackbar(`Erro ao testar conexão: ${error.message}`, { variant: 'error' })
    } finally {
      setTestingBackend(false)
    }
  }

  const handleTestMysql = async () => {
    // Primeiro salvar as configurações se houver mudanças
    if (!validateForm()) {
      enqueueSnackbar('Corrija os erros antes de testar', { variant: 'error' })
      return
    }

    try {
      setTestingMysql(true)
      setMysqlTestResult(null)

      // Salvar configurações antes de testar
      await api.saveConfig({
        ssh: sshConfig,
        mysql: mysqlConfig,
      })

      // Recarregar serviços para aplicar novas configurações
      await api.reloadServices()

      // Testar conexão MySQL
      const result = await api.testMysqlConnection()
      setMysqlTestResult(result)

      if (result.mysql_connected) {
        enqueueSnackbar('Conexão MySQL bem-sucedida!', { variant: 'success' })
      } else {
        enqueueSnackbar(`Falha na conexão MySQL: ${result.mysql_error || 'Erro desconhecido'}`, {
          variant: 'error',
          autoHideDuration: 5000,
        })
      }
    } catch (error) {
      console.error('Erro ao testar conexão MySQL:', error)
      setMysqlTestResult({
        mysql_connected: false,
        mysql_error: error.message || 'Erro ao testar conexão',
      })
      enqueueSnackbar(`Erro ao testar conexão MySQL: ${error.message}`, { variant: 'error' })
    } finally {
      setTestingMysql(false)
    }
  }

  const textFieldSx = {
    mb: 2,
    '& .MuiOutlinedInput-root': {
      bgcolor: 'rgba(255,255,255,0.05)',
      color: '#fff',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
      '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
      '&.Mui-focused fieldset': { borderColor: '#fff' }
    },
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#fff' },
    '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.5)' },
    '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.7)' }
  }

  const cardSx = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    bgcolor: 'rgba(30, 41, 59, 0.5)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
    color: '#fff'
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
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
          zIndex: 1,
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography
              variant="h4"
              gutterBottom
              sx={{
                fontWeight: 'bold',
                color: '#FFFFFF',
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
              sx={{ color: '#fff', borderColor: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              Recarregar
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(2, 136, 209, 0.2)', color: '#fff', '& .MuiAlert-icon': { color: '#fff' } }}>
            Após salvar as configurações, clique no botão "Reconectar" na sidebar para aplicar as mudanças.
          </Alert>

          <Grid container spacing={3}>
            {/* Configurações SSH */}
            <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
              <Card sx={cardSx}>
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                    sx={textFieldSx}
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
                    sx={textFieldSx}
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
                    sx={textFieldSx}
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
                      sx={textFieldSx}
                      variant="outlined"
                    />
                  ) : (
                    <TextField
                      fullWidth
                      label="Senha"
                      type="password"
                      value={sshConfig.password}
                      onChange={(e) => {
                        const newValue = e.target.value
                        if (sshConfig.password === 'secret' && newValue.length > 0 && newValue !== 'secret') {
                          handleSshChange('password', newValue.replace('secret', ''))
                        } else {
                          handleSshChange('password', newValue)
                        }
                      }}
                      onFocus={(e) => {
                        if (sshConfig.password === 'secret') {
                          e.target.value = ''
                          handleSshChange('password', '')
                        }
                      }}
                      error={!!errors.ssh_password}
                      helperText={errors.ssh_password || (sshConfig.password === 'secret' ? 'Senha configurada (digite nova senha para alterar)' : 'Deixe em branco para não alterar')}
                      placeholder={sshConfig.password === 'secret' ? '••••••••' : ''}
                      sx={textFieldSx}
                      variant="outlined"
                    />
                  )}

                  <Box sx={{ flexGrow: 1 }} />

                  <Box sx={{ mt: 'auto' }}>
                    <Button
                      variant="outlined"
                      color={sshTestResult?.ssh_connected ? 'success' : sshTestResult?.ssh_connected === false ? 'error' : 'primary'}
                      onClick={handleTestSsh}
                      disabled={testingSsh || saving}
                      fullWidth
                      startIcon={testingSsh ? <CircularProgress size={20} /> : sshTestResult?.ssh_connected ? <CheckCircleIcon /> : sshTestResult?.ssh_connected === false ? <ErrorIcon /> : null}
                      sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.5)', color: '#fff', '&:hover': { borderColor: '#fff' } }}
                    >
                      {testingSsh ? 'Testando...' : 'Testar Conexão SSH'}
                    </Button>

                    {sshTestResult && (
                      <Alert
                        severity={sshTestResult.ssh_connected ? 'success' : 'error'}
                        onClose={() => setSshTestResult(null)}
                      >
                        {sshTestResult.ssh_connected ? (
                          'Conexão SSH bem-sucedida!'
                        ) : (
                          sshTestResult.ssh_error || 'Falha na conexão SSH'
                        )}
                      </Alert>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Configurações MySQL */}
            <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
              <Card sx={cardSx}>
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
                    sx={textFieldSx}
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
                    sx={textFieldSx}
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
                    sx={textFieldSx}
                    variant="outlined"
                  />

                  <TextField
                    fullWidth
                    label="Senha"
                    type="password"
                    value={mysqlConfig.password}
                    onChange={(e) => {
                      const newValue = e.target.value
                      if (mysqlConfig.password === 'secret' && newValue.length > 0 && newValue !== 'secret') {
                        handleMysqlChange('password', newValue.replace('secret', ''))
                      } else {
                        handleMysqlChange('password', newValue)
                      }
                    }}
                    onFocus={(e) => {
                      if (mysqlConfig.password === 'secret') {
                        e.target.value = ''
                        handleMysqlChange('password', '')
                      }
                    }}
                    error={!!errors.mysql_password}
                    helperText={errors.mysql_password || (mysqlConfig.password === 'secret' ? 'Senha configurada (digite nova senha para alterar)' : 'Deixe em branco para não alterar')}
                    placeholder={mysqlConfig.password === 'secret' ? '••••••••' : ''}
                    sx={textFieldSx}
                    variant="outlined"
                  />

                  <TextField
                    fullWidth
                    label="Database"
                    value={mysqlConfig.database}
                    onChange={(e) => handleMysqlChange('database', e.target.value)}
                    error={!!errors.mysql_database}
                    helperText={errors.mysql_database}
                    sx={textFieldSx}
                    variant="outlined"
                  />

                  <Box sx={{ flexGrow: 1 }} />

                  <Box sx={{ mt: 'auto' }}>
                    <Button
                      variant="outlined"
                      color={mysqlTestResult?.mysql_connected ? 'success' : mysqlTestResult?.mysql_connected === false ? 'error' : 'primary'}
                      onClick={handleTestMysql}
                      disabled={testingMysql || saving}
                      fullWidth
                      startIcon={testingMysql ? <CircularProgress size={20} /> : mysqlTestResult?.mysql_connected ? <CheckCircleIcon /> : mysqlTestResult?.mysql_connected === false ? <ErrorIcon /> : null}
                      sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.5)', color: '#fff', '&:hover': { borderColor: '#fff' } }}
                    >
                      {testingMysql ? 'Testando...' : 'Testar Conexão MySQL'}
                    </Button>

                    {mysqlTestResult && (
                      <Alert
                        severity={mysqlTestResult.mysql_connected ? 'success' : 'error'}
                        onClose={() => setMysqlTestResult(null)}
                      >
                        {mysqlTestResult.mysql_connected ? (
                          'Conexão MySQL bem-sucedida!'
                        ) : (
                          mysqlTestResult.mysql_error || 'Falha na conexão MySQL'
                        )}
                      </Alert>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Configurações do Backend */}
            <Grid item xs={12}>
              <Card sx={cardSx}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ color: '#F8FAFC', mb: 3 }}>
                    Backend API
                  </Typography>

                  <TextField
                    fullWidth
                    label="URL do Backend"
                    value={backendConfig.api_url}
                    onChange={(e) => handleBackendUrlChange(e.target.value)}
                    error={!!errors.backend_url}
                    helperText={errors.backend_url || 'Exemplo: http://192.168.1.100:8000'}
                    sx={textFieldSx}
                    variant="outlined"
                    placeholder="http://192.168.1.100:8000"
                  />

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                      variant="outlined"
                      color={backendTestResult?.success ? 'success' : backendTestResult?.success === false ? 'error' : 'primary'}
                      onClick={handleTestBackend}
                      disabled={testingBackend}
                      startIcon={testingBackend ? <CircularProgress size={20} /> : backendTestResult?.success ? <CheckCircleIcon /> : backendTestResult?.success === false ? <ErrorIcon /> : null}
                      sx={{ borderColor: 'rgba(255,255,255,0.5)', color: '#fff', '&:hover': { borderColor: '#fff' } }}
                    >
                      {testingBackend ? 'Testando...' : 'Testar Conexão'}
                    </Button>

                    <Button
                      variant="contained"
                      onClick={handleSaveBackendUrl}
                      disabled={!backendConfig.api_url}
                      sx={{ bgcolor: 'primary.main', color: '#fff' }}
                    >
                      Salvar URL
                    </Button>
                  </Box>

                  {backendTestResult && (
                    <Alert
                      severity={backendTestResult.success ? 'success' : 'error'}
                      onClose={() => setBackendTestResult(null)}
                      sx={{ mt: 2 }}
                    >
                      {backendTestResult.success ? (
                        'Conexão com backend bem-sucedida!'
                      ) : (
                        backendTestResult.message || 'Falha na conexão com backend'
                      )}
                    </Alert>
                  )}
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
                  sx={{ bgcolor: '#4CAF50', '&:hover': { bgcolor: '#45a049' } }}
                >
                  {saving ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Box>
  )
}

