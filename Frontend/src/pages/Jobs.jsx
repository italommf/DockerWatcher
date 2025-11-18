import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Grid,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton,
  TextField,
} from '@mui/material'
import { PlayArrow, Stop, Visibility, Close, Refresh as RefreshIcon } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Jobs({ isConnected = true, onReconnect }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [logsDialogOpen, setLogsDialogOpen] = useState(false)
  const [selectedPod, setSelectedPod] = useState(null)
  const [logs, setLogs] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [tail, setTail] = useState(100)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    if (isConnected) {
      loadJobs()
      const interval = setInterval(() => {
        if (isConnected) loadJobs()
      }, 10000)
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [isConnected])

  const loadJobs = async () => {
    if (!isConnected) return // Não tentar carregar se desconectado
    
    try {
      setLoading(true)
      // Buscar todos os jobs do Kubernetes que estão ativos
      const allJobs = await api.getJobs()

      if (!Array.isArray(allJobs)) {
        // Não limpar jobs se houver erro - manter cache
        return
      }

      // Filtrar apenas jobs que têm pods ativos (running) - jobs abertos no momento
      const activeJobs = allJobs.filter(job => {
        const active = job.active || 0
        // Mostrar apenas jobs com pods ativos (rodando no momento)
        return active > 0
      })

      const jobsData = activeJobs.map((job) => {
        const labels = job.labels || {}
        const nome_robo = labels.nome_robo || labels['nome-robo'] || labels.app || 'unknown'
        
        let statusLabel = 'Idle'
        let statusColor = 'default'

        if (job.active > 0) {
          statusLabel = 'Running'
          statusColor = 'success'
        } else if (job.failed > 0) {
          statusLabel = 'Failed'
          statusColor = 'error'
        } else {
          statusLabel = 'Completed'
          statusColor = 'default'
        }

        return {
          id: job.name,
          name: job.name,
          nome_rpa: nome_robo,
          namespace: job.namespace || 'default',
          active: job.active || 0,
          failed: job.failed || 0,
          completions: job.completions || 0,
          start_time: job.start_time || '',
          completion_time: job.completion_time || '',
          status: statusLabel,
          statusColor,
        }
      })

      setJobs(jobsData)
    } catch (error) {
      console.error('Erro ao carregar jobs:', error)
      // Não limpar jobs em caso de erro - manter cache
      if (isConnected) {
        enqueueSnackbar(`Erro ao carregar jobs: ${error.message}`, { variant: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreateJob = async (rpa) => {
    try {
      enqueueSnackbar('Funcionalidade em desenvolvimento', { variant: 'info' })
    } catch (error) {
      enqueueSnackbar(`Erro: ${error.message}`, { variant: 'error' })
    }
  }

  // Função para identificar o tipo do job (RPA, Cronjob ou Deployment)
  const identificarTipoJob = (jobName) => {
    const nomeLower = jobName.toLowerCase()
    if (nomeLower.includes('cronjob')) {
      return 'cronjob'
    } else if (nomeLower.includes('deploy') || nomeLower.includes('deployment')) {
      return 'deployment'
    }
    return 'rpa'
  }

  // Função para extrair o nome do RPA/Cronjob/Deployment do nome do job
  const extrairNomeRecurso = (job, tipo) => {
    // Primeiro, tentar usar o nome_robo do job (mais confiável)
    if (job.nome_rpa && job.nome_rpa !== 'unknown') {
      return job.nome_rpa
    }
    
    // Se não tiver nome_robo, tentar extrair do nome do job
    const jobName = job.name
    if (tipo === 'cronjob') {
      // Exemplo: rpa-cronjob-painel-de-processos-acessorias-29387700
      // Remover prefixo e hash
      let nome = jobName.replace(/^rpa-cronjob-/, '').replace(/-cronjob/, '')
      nome = nome.replace(/-\d+$/, '') // Remover hash no final
      return nome
    } else if (tipo === 'deployment') {
      // Exemplo: rpa-deploy-obtencao-de-empresas
      let nome = jobName.replace(/^rpa-deploy-/, '').replace(/-deploy/, '').replace(/-deployment/, '')
      return nome
    } else {
      // RPA: rpa-job-{nome}-{hash} ou job-{nome}
      let nome = jobName.replace(/^rpa-job-/, '').replace(/^job-/, '')
      nome = nome.replace(/-\d+$/, '') // Remover hash no final
      return nome
    }
  }

  const handleStopJob = async (job) => {
    setSelectedJob(job)
    setDialogOpen(true)
  }

  const handleConfirmStop = async (inativarRecurso) => {
    if (!selectedJob) return

    try {
      // Deletar a instância do job
      await api.deleteJob(selectedJob.name)
      
      if (inativarRecurso) {
        // Identificar o tipo e inativar o recurso
        const tipo = identificarTipoJob(selectedJob.name)
        const nomeRecurso = extrairNomeRecurso(selectedJob, tipo)
        
        try {
          if (tipo === 'cronjob') {
            // Para cronjobs, o job criado tem um hash no final
            // Exemplo: rpa-cronjob-painel-de-processos-acessorias-29387700
            // O cronjob é: rpa-cronjob-painel-de-processos-acessorias
            let nomeCronjob = selectedJob.name
            // Remover o hash no final (últimos números após o último hífen)
            nomeCronjob = nomeCronjob.replace(/-\d+$/, '')
            
            try {
              await api.cronjobStandby(nomeCronjob)
              enqueueSnackbar('Instância parada e cronjob inativado com sucesso', { variant: 'success' })
            } catch (error) {
              // Se falhar, tentar com o nome do recurso extraído
              try {
                await api.cronjobStandby(nomeRecurso)
                enqueueSnackbar('Instância parada e cronjob inativado com sucesso', { variant: 'success' })
              } catch (error2) {
                throw error2
              }
            }
          } else if (tipo === 'deployment') {
            // Para deployments, escalar para 0 réplicas (equivalente a inativar)
            // Mas como não há API específica, vamos tentar deletar o deployment
            // ou usar o nome do deployment diretamente
            let nomeDeployment = selectedJob.name
            if (nomeDeployment.includes('deploy') || nomeDeployment.includes('deployment')) {
              // Tentar encontrar o deployment pelo nome
              try {
                await api.deleteDeployment(nomeDeployment)
                enqueueSnackbar('Instância parada e deployment removido com sucesso', { variant: 'success' })
              } catch (error) {
                // Se falhar, tentar com o nome do recurso
                await api.deleteDeployment(nomeRecurso)
                enqueueSnackbar('Instância parada e deployment removido com sucesso', { variant: 'success' })
              }
            } else {
              await api.deleteDeployment(nomeRecurso)
              enqueueSnackbar('Instância parada e deployment removido com sucesso', { variant: 'success' })
            }
          } else {
            // RPA
            await api.rpaStandby(nomeRecurso)
            enqueueSnackbar('Instância parada e RPA inativado com sucesso', { variant: 'success' })
          }
        } catch (error) {
          // Se falhar ao inativar, ainda mostra sucesso na deleção do job
          console.warn(`Erro ao inativar ${tipo}: ${error.message}`)
          enqueueSnackbar('Instância parada, mas houve erro ao inativar o recurso', { variant: 'warning' })
        }
      } else {
        enqueueSnackbar('Instância parada com sucesso', { variant: 'success' })
      }
      
      setDialogOpen(false)
      setSelectedJob(null)
      // Recarregar lista de jobs
      loadJobs()
    } catch (error) {
      enqueueSnackbar(`Erro ao parar job: ${error.message}`, { variant: 'error' })
      setDialogOpen(false)
      setSelectedJob(null)
    }
  }

  const handleViewLogs = async (job) => {
    try {
      // Buscar pods associados ao job
      const allPods = await api.getPods()
      
      if (!Array.isArray(allPods)) {
        enqueueSnackbar('Erro ao buscar pods: formato de resposta inválido', { variant: 'error' })
        return
      }
      
      // Filtrar pods que pertencem a este job
      // Pods de jobs geralmente têm o label job-name ou batch.kubernetes.io/job-name
      const jobPods = allPods.filter(pod => {
        const labels = pod.labels || {}
        const jobName = labels['job-name'] || 
                       labels['job_name'] || 
                       labels['batch.kubernetes.io/job-name']
        
        // Verificar se o nome do job corresponde ao label do pod
        if (jobName === job.name) {
          return true
        }
        
        // Verificar se o nome do pod contém o nome do job (fallback)
        if (pod.name && job.name && pod.name.includes(job.name)) {
          return true
        }
        
        return false
      })
      
      if (jobPods.length === 0) {
        enqueueSnackbar('Nenhum pod encontrado para este job', { variant: 'warning' })
        return
      }
      
      // Se houver múltiplos pods, usar o primeiro ativo ou o mais recente
      // Priorizar pods com status Running ou Pending
      const activePod = jobPods.find(p => p.phase === 'Running' || p.phase === 'Pending')
      const pod = activePod || jobPods[0]
      
      setSelectedPod(pod)
      setLogsDialogOpen(true)
      setLogsLoading(true)
      setLogs('')
      
      try {
        const logsData = await api.getPodLogs(pod.name, tail)
        setLogs(logsData.logs || 'Nenhum log disponível')
      } catch (error) {
        console.error('Erro ao carregar logs:', error)
        setLogs(`Erro ao carregar logs: ${error.message}`)
        enqueueSnackbar(`Erro ao carregar logs: ${error.message}`, { variant: 'error' })
      } finally {
        setLogsLoading(false)
      }
    } catch (error) {
      console.error('Erro ao buscar pods do job:', error)
      enqueueSnackbar(`Erro ao buscar pods: ${error.message}`, { variant: 'error' })
    }
  }

  const handleRefreshLogs = async () => {
    if (!selectedPod) return
    setLogsLoading(true)
    try {
      const logsData = await api.getPodLogs(selectedPod.name, tail)
      setLogs(logsData.logs || 'Nenhum log disponível')
    } catch (error) {
      console.error('Erro ao atualizar logs:', error)
      setLogs(`Erro ao atualizar logs: ${error.message}`)
    } finally {
      setLogsLoading(false)
    }
  }

  const handleCloseLogsDialog = () => {
    setLogsDialogOpen(false)
    setSelectedPod(null)
    setLogs('')
  }

  if (loading && jobs.length === 0) {
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
          sx={{ 
            fontWeight: 'bold',
            color: '#F8FAFC',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          Containers Rodando
        </Typography>
        {!isConnected && onReconnect && (
          <Button variant="outlined" onClick={onReconnect}>
            Reconectar
          </Button>
        )}
      </Box>

      {!isConnected && jobs.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Os dados exibidos são do cache. Reconecte para atualizar.
        </Alert>
      )}

      <Grid container spacing={3}>
        {jobs.length === 0 ? (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="body1" color="text.secondary" align="center">
                  Nenhum job ativo no momento
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ) : (
          jobs.map((job) => (
            <Grid item xs={12} key={job.id || job.name}>
              <Card>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" sx={{ mb: 0.5, fontSize: '1.1rem' }}>
                        {job.name || 'N/A'}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip label={job.status} color={job.statusColor} size="small" />
                        <Typography variant="caption" color="text.secondary">
                          RPA: {job.nome_rpa || 'N/A'}
                        </Typography>
                      </Box>
                    </Box>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<Visibility />}
                      onClick={() => handleViewLogs(job)}
                      sx={{ minWidth: 120 }}
                    >
                      Ver Logs
                    </Button>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        Pods Ativos: {job.active || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        Pods Falhados: {job.failed || 0}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        Completados: {job.completions || 0}
                      </Typography>
                      {job.start_time && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Iniciado: {new Date(job.start_time).toLocaleString('pt-BR')}
                        </Typography>
                      )}
                      {job.completion_time && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Finalizado: {new Date(job.completion_time).toLocaleString('pt-BR')}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        Namespace: {job.namespace || 'default'}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<Stop />}
                      disabled={job.active === 0}
                      onClick={() => handleStopJob(job)}
                      sx={{ minWidth: 120, ml: 2 }}
                    >
                      Parar Instancia Atual
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))
        )}
      </Grid>

      {/* Dialog de confirmação para parar instância */}
      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setSelectedJob(null)
        }}
      >
        <DialogTitle>
          Parar Instância Atual
          <IconButton
            aria-label="close"
            onClick={() => {
              setDialogOpen(false)
              setSelectedJob(null)
            }}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
            }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {selectedJob && (
              <>
                Deseja inativar o{' '}
                {identificarTipoJob(selectedJob.name) === 'cronjob' ? 'cronjob' : 
                 identificarTipoJob(selectedJob.name) === 'deployment' ? 'deployment' : 'robô/RPA'}{' '}
                para que não rode novamente até que seja reativado?
                <br /><br />
                <strong>Não:</strong> Apenas para a instância atual (o recurso continuará ativo e pode rodar novamente).
                <br />
                <strong>Sim:</strong> Para a instância atual E inativa o recurso (não rodará novamente até reativar).
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => handleConfirmStop(false)}
            color="error"
            variant="outlined"
          >
            Não, apenas parar instância
          </Button>
          <Button
            onClick={() => handleConfirmStop(true)}
            color="error"
            variant="contained"
            autoFocus
          >
            Sim, parar e inativar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de Logs */}
      <Dialog
        open={logsDialogOpen}
        onClose={handleCloseLogsDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        }}
      >
        <DialogTitle sx={{ color: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Logs: {selectedPod?.name || 'N/A'}
          </Typography>
          <IconButton onClick={handleCloseLogsDialog} sx={{ color: '#CBD5E1' }}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label="Últimas linhas"
              type="number"
              value={tail}
              onChange={(e) => setTail(parseInt(e.target.value) || 100)}
              size="small"
              sx={{ width: 150 }}
              inputProps={{ min: 10, max: 1000 }}
            />
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleRefreshLogs}
              disabled={logsLoading}
            >
              Atualizar Logs
            </Button>
          </Box>
          {logsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box
              sx={{
                backgroundColor: '#0F172A',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 1,
                p: 2,
                maxHeight: '60vh',
                overflow: 'auto',
              }}
            >
              <Typography
                component="pre"
                sx={{
                  color: '#CBD5E1',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                }}
              >
                {logs || 'Carregando logs...'}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <Button onClick={handleCloseLogsDialog} sx={{ color: '#CBD5E1' }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
