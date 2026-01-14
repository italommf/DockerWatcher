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

export default function Configuracoes({ onConnectionChange }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingK8s, setTestingK8s] = useState(false)
  const [testingMysql, setTestingMysql] = useState(false)
  const [k8sTestResult, setK8sTestResult] = useState(null)
  const [mysqlTestResult, setMysqlTestResult] = useState(null)

  const [mysqlConfig, setMysqlConfig] = useState({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
  })

  const [k8sConfig, setK8sConfig] = useState({
    in_cluster: false,
    kubeconfig_path: '',
    namespace: 'default',
  })

  const [prometheusConfig, setPrometheusConfig] = useState({
    url: 'http://localhost:9090',
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
      const data = await api.getConfig({ timeout: 5000 })

      if (data.mysql) {
        setMysqlConfig({
          host: data.mysql.host || '',
          port: data.mysql.port || 3306,
          user: data.mysql.user || '',
          password: data.mysql.has_password ? 'secret' : '',
          database: data.mysql.database || '',
        })
      }

      if (data.kubernetes) {
        setK8sConfig({
          in_cluster: data.kubernetes.in_cluster || false,
          kubeconfig_path: data.kubernetes.kubeconfig_path || '',
          namespace: data.kubernetes.namespace || 'default',
        })
      }

      if (data.prometheus) {
        setPrometheusConfig({
          url: data.prometheus.url || 'http://localhost:9090',
        })
      }

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

    // Validar MySQL
    if (!mysqlConfig.host) newErrors.mysql_host = 'Host é obrigatório'
    if (!mysqlConfig.port || mysqlConfig.port < 1 || mysqlConfig.port > 65535) {
      newErrors.mysql_port = 'Porta inválida (1-65535)'
    }
    if (!mysqlConfig.user) newErrors.mysql_user = 'User é obrigatório'
    if (!mysqlConfig.database) newErrors.mysql_database = 'Database é obrigatório'

    // Validar K8s
    if (!k8sConfig.in_cluster && !k8sConfig.kubeconfig_path) {
      newErrors.k8s_kubeconfig = 'Caminho do kubeconfig é obrigatório (modo fora do cluster)'
    }

    // Validar Prometheus
    if (!prometheusConfig.url) newErrors.prometheus_url = 'URL do Prometheus é obrigatória'

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
        mysql: mysqlConfig,
        kubernetes: k8sConfig,
        prometheus: prometheusConfig,
      })

      try {
        await api.reloadServices()
      } catch (reloadError) {
        console.warn('Erro ao recarregar serviços:', reloadError)
      }

      enqueueSnackbar('Configurações salvas com sucesso!', { variant: 'success' })
      if (onConnectionChange) onConnectionChange()
    } catch (error) {
      console.error('Erro ao salvar configurações:', error)
      enqueueSnackbar(`Erro ao salvar configurações: ${error.message}`, { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleMysqlChange = (field, value) => {
    setMysqlConfig((prev) => ({ ...prev, [field]: value }))
    if (errors[`mysql_${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[`mysql_${field}`]
        return newErrors
      })
    }
  }

  const handleK8sChange = (field, value) => {
    setK8sConfig((prev) => ({ ...prev, [field]: value }))
    if (errors[`k8s_${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[`k8s_${field}`]
        return newErrors
      })
    }
  }

  const handlePrometheusChange = (field, value) => {
    setPrometheusConfig((prev) => ({ ...prev, [field]: value }))
  }

  const handleTestK8s = async () => {
    try {
      setTestingK8s(true)
      setK8sTestResult(null)

      const result = await api.testK8sConnection()
      setK8sTestResult(result)

      if (result.k8s_connected) {
        enqueueSnackbar('Conexão Kubernetes bem-sucedida!', { variant: 'success' })
        if (onConnectionChange) onConnectionChange()
      } else {
        enqueueSnackbar(`Falha na conexão K8s: ${result.k8s_error || 'Erro desconhecido'}`, { variant: 'error' })
      }
    } catch (error) {
      console.error('Erro ao testar conexão K8s:', error)
      setK8sTestResult({ k8s_connected: false, k8s_error: error.message })
      enqueueSnackbar(`Erro ao testar conexão K8s: ${error.message}`, { variant: 'error' })
    } finally {
      setTestingK8s(false)
    }
  }

  const handleTestMysql = async () => {
    try {
      setTestingMysql(true)
      setMysqlTestResult(null)

      const result = await api.testMysqlConnection()
      setMysqlTestResult(result)

      if (result.mysql_connected) {
        enqueueSnackbar('Conexão MySQL bem-sucedida!', { variant: 'success' })
        if (onConnectionChange) onConnectionChange()
      } else {
        enqueueSnackbar(`Falha na conexão MySQL: ${result.mysql_error || 'Erro desconhecido'}`, { variant: 'error' })
      }
    } catch (error) {
      console.error('Erro ao testar conexão MySQL:', error)
      setMysqlTestResult({ mysql_connected: false, mysql_error: error.message })
      enqueueSnackbar(`Erro ao testar conexão MySQL: ${error.message}`, { variant: 'error' })
    } finally {
      setTestingMysql(false)
    }
  }

  const handleBackendUrlChange = (value) => {
    setBackendConfig((prev) => ({ ...prev, api_url: value }))
    if (errors.backend_url) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors.backend_url
        return newErrors
      })
    }
  }

  const handleTestBackend = async () => {
    try {
      new URL(backendConfig.api_url)
    } catch (e) {
      setErrors((prev) => ({ ...prev, backend_url: 'URL inválida' }))
      return
    }

    try {
      setTestingBackend(true)
      setBackendTestResult(null)

      const result = await testApiConnection(backendConfig.api_url)
      setBackendTestResult(result)

      if (result.success) {
        enqueueSnackbar('Conexão com backend bem-sucedida!', { variant: 'success' })
        if (setApiUrl(backendConfig.api_url)) {
          updateApiUrl()
        }
      } else {
        enqueueSnackbar(`Falha na conexão: ${result.message}`, { variant: 'error' })
      }
    } catch (error) {
      setBackendTestResult({ success: false, message: error.message })
      enqueueSnackbar(`Erro ao testar conexão: ${error.message}`, { variant: 'error' })
    } finally {
      setTestingBackend(false)
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
          position: 'relative',
          overflow: 'hidden',
          bgcolor: '#FFFFFF',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'linear-gradient(135deg, #ee4756 0%, #f7a54c 50%, #fcd335 100%)',
            opacity: 0.75,
            zIndex: 0,
          },
          borderRadius: '16px',
          border: '1px solid rgba(247, 165, 76, 0.3)',
        }}
      >
        <Box sx={{ height: '100%', overflowY: 'auto', p: 3, position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#FFFFFF', textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)' }}>
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

          <Grid container spacing={3}>
            {/* Kubernetes */}
            <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
              <Card sx={cardSx}>
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom sx={{ color: '#F8FAFC', mb: 3 }}>
                    ☸️ Kubernetes
                  </Typography>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={k8sConfig.in_cluster}
                        onChange={(e) => handleK8sChange('in_cluster', e.target.checked)}
                      />
                    }
                    label="Rodar dentro do Cluster (In-Cluster)"
                    sx={{ mb: 2, color: '#CBD5E1' }}
                  />

                  {!k8sConfig.in_cluster && (
                    <TextField
                      fullWidth
                      label="Caminho do Kubeconfig"
                      value={k8sConfig.kubeconfig_path}
                      onChange={(e) => handleK8sChange('kubeconfig_path', e.target.value)}
                      error={!!errors.k8s_kubeconfig}
                      helperText={errors.k8s_kubeconfig || 'Ex: ~/.kube/config'}
                      sx={textFieldSx}
                    />
                  )}

                  <TextField
                    fullWidth
                    label="Namespace Padrão"
                    value={k8sConfig.namespace}
                    onChange={(e) => handleK8sChange('namespace', e.target.value)}
                    sx={textFieldSx}
                  />

                  <Box sx={{ flexGrow: 1 }} />

                  <Button
                    variant="outlined"
                    color={k8sTestResult?.k8s_connected ? 'success' : k8sTestResult?.k8s_connected === false ? 'error' : 'primary'}
                    onClick={handleTestK8s}
                    disabled={testingK8s || saving}
                    fullWidth
                    startIcon={testingK8s ? <CircularProgress size={20} /> : k8sTestResult?.k8s_connected ? <CheckCircleIcon /> : k8sTestResult?.k8s_connected === false ? <ErrorIcon /> : null}
                    sx={{ borderColor: 'rgba(255,255,255,0.5)', color: '#fff' }}
                  >
                    {testingK8s ? 'Testando...' : 'Testar Conexão K8s'}
                  </Button>

                  {k8sTestResult && (
                    <Alert severity={k8sTestResult.k8s_connected ? 'success' : 'error'} sx={{ mt: 2 }}>
                      {k8sTestResult.k8s_connected ? 'Kubernetes conectado!' : k8sTestResult.k8s_error}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* MySQL */}
            <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
              <Card sx={cardSx}>
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom sx={{ color: '#F8FAFC', mb: 3 }}>
                    🗄️ MySQL
                  </Typography>

                  <TextField fullWidth label="Host" value={mysqlConfig.host}
                    onChange={(e) => handleMysqlChange('host', e.target.value)}
                    error={!!errors.mysql_host} helperText={errors.mysql_host} sx={textFieldSx} />

                  <TextField fullWidth label="Porta" type="number" value={mysqlConfig.port}
                    onChange={(e) => handleMysqlChange('port', parseInt(e.target.value) || 3306)}
                    error={!!errors.mysql_port} helperText={errors.mysql_port} sx={textFieldSx} />

                  <TextField fullWidth label="User" value={mysqlConfig.user}
                    onChange={(e) => handleMysqlChange('user', e.target.value)}
                    error={!!errors.mysql_user} helperText={errors.mysql_user} sx={textFieldSx} />

                  <TextField fullWidth label="Senha" type="password" value={mysqlConfig.password}
                    onChange={(e) => handleMysqlChange('password', e.target.value)}
                    helperText={mysqlConfig.password === 'secret' ? 'Senha configurada' : ''} sx={textFieldSx} />

                  <TextField fullWidth label="Database" value={mysqlConfig.database}
                    onChange={(e) => handleMysqlChange('database', e.target.value)}
                    error={!!errors.mysql_database} helperText={errors.mysql_database} sx={textFieldSx} />

                  <Box sx={{ flexGrow: 1 }} />

                  <Button
                    variant="outlined"
                    color={mysqlTestResult?.mysql_connected ? 'success' : mysqlTestResult?.mysql_connected === false ? 'error' : 'primary'}
                    onClick={handleTestMysql}
                    disabled={testingMysql || saving}
                    fullWidth
                    startIcon={testingMysql ? <CircularProgress size={20} /> : mysqlTestResult?.mysql_connected ? <CheckCircleIcon /> : mysqlTestResult?.mysql_connected === false ? <ErrorIcon /> : null}
                    sx={{ borderColor: 'rgba(255,255,255,0.5)', color: '#fff' }}
                  >
                    {testingMysql ? 'Testando...' : 'Testar Conexão MySQL'}
                  </Button>

                  {mysqlTestResult && (
                    <Alert severity={mysqlTestResult.mysql_connected ? 'success' : 'error'} sx={{ mt: 2 }}>
                      {mysqlTestResult.mysql_connected ? 'MySQL conectado!' : mysqlTestResult.mysql_error}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Prometheus */}
            <Grid item xs={12} md={6}>
              <Card sx={cardSx}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ color: '#F8FAFC', mb: 3 }}>
                    📊 Prometheus
                  </Typography>

                  <TextField
                    fullWidth
                    label="URL do Prometheus"
                    value={prometheusConfig.url}
                    onChange={(e) => handlePrometheusChange('url', e.target.value)}
                    error={!!errors.prometheus_url}
                    helperText={errors.prometheus_url || 'Ex: http://prometheus:9090'}
                    sx={textFieldSx}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Backend API */}
            <Grid item xs={12} md={6}>
              <Card sx={cardSx}>
                <CardContent>
                  <Typography variant="h6" gutterBottom sx={{ color: '#F8FAFC', mb: 3 }}>
                    🔌 Backend API
                  </Typography>

                  <TextField
                    fullWidth
                    label="URL do Backend"
                    value={backendConfig.api_url}
                    onChange={(e) => handleBackendUrlChange(e.target.value)}
                    error={!!errors.backend_url}
                    helperText={errors.backend_url || 'Ex: http://192.168.1.100:8001'}
                    sx={textFieldSx}
                  />

                  <Button
                    variant="outlined"
                    color={backendTestResult?.success ? 'success' : backendTestResult?.success === false ? 'error' : 'primary'}
                    onClick={handleTestBackend}
                    disabled={testingBackend}
                    startIcon={testingBackend ? <CircularProgress size={20} /> : backendTestResult?.success ? <CheckCircleIcon /> : backendTestResult?.success === false ? <ErrorIcon /> : null}
                    sx={{ borderColor: 'rgba(255,255,255,0.5)', color: '#fff' }}
                  >
                    {testingBackend ? 'Testando...' : 'Testar Conexão'}
                  </Button>

                  {backendTestResult && (
                    <Alert severity={backendTestResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
                      {backendTestResult.success ? 'Backend conectado!' : backendTestResult.message}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Botão Salvar */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2, borderColor: 'rgba(255, 255, 255, 0.1)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
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
