import React, { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Paper,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
  Card,
  CardContent,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material'
import { Close as CloseIcon, Refresh as RefreshIcon, Visibility as VisibilityIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Falhas({ isConnected = true, onReconnect }) {
  const [failedPods, setFailedPods] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPod, setSelectedPod] = useState(null)
  const [logs, setLogs] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [tail, setTail] = useState(100)
  const [expandedRobots, setExpandedRobots] = useState({}) // Estado para controlar quais robôs estão expandidos
  const { enqueueSnackbar } = useSnackbar()

  // Função para extrair nome do robô do nome do pod
  const extrairNomeRoboDoPod = (podName) => {
    if (!podName) return 'Desconhecido'
    
    let nomeExtraido = podName
    
    // Remover prefixos: rpa-job- ou rpa-cronjob-
    nomeExtraido = nomeExtraido.replace(/^rpa-(job|cronjob)-/, '')
    
    // Remover sufixos com IDs aleatórios do Kubernetes
    // Padrão 1: -{5chars}-{5chars} (ex: -27ppb-g2gpn) - padrão mais comum de IDs do Kubernetes
    nomeExtraido = nomeExtraido.replace(/-[a-z0-9]{5}-[a-z0-9]{5}$/i, '')
    
    // Padrão 2: sufixos numéricos longos no final (ex: -29387700) - IDs de cronjobs
    nomeExtraido = nomeExtraido.replace(/-\d{6,}$/, '')
    
    // Padrão 3: IDs muito curtos no final (1-3 caracteres) que são claramente IDs
    // Mas apenas se não for parte de um nome válido (verificar se há mais de 3 hífens antes)
    const partes = nomeExtraido.split('-')
    if (partes.length > 1) {
      const ultimaParte = partes[partes.length - 1]
      // Se a última parte é muito curta (1-3 chars) e alfanumérica, provavelmente é um ID
      if (ultimaParte.length <= 3 && /^[a-z0-9]+$/i.test(ultimaParte)) {
        partes.pop()
        nomeExtraido = partes.join('-')
      }
    }
    
    return nomeExtraido || 'Desconhecido'
  }

  // Função para formatar nome: substituir - e _ por espaços e capitalizar palavras
  const formatarNome = (nome) => {
    if (!nome) return nome
    // Substituir hífens e underscores por espaços
    let formatado = nome.replace(/[-_]/g, ' ')
    // Capitalizar primeira letra de cada palavra
    formatado = formatado.split(' ')
      .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
      .join(' ')
    
    // Remover "RPA" e "CRONJOB"/"CONJOB" se forem as duas primeiras palavras
    const palavras = formatado.split(' ')
    if (palavras.length >= 2) {
      const primeira = palavras[0].toLowerCase()
      const segunda = palavras[1].toLowerCase()
      
      if ((primeira === 'rpa' && (segunda === 'cronjob' || segunda === 'conjob')) || 
          ((primeira === 'cronjob' || primeira === 'conjob') && segunda === 'rpa')) {
        // Remover as duas primeiras palavras
        palavras.splice(0, 2)
        formatado = palavras.join(' ').trim()
      }
    }
    
    return formatado
  }

  // Agrupar pods por nome do robô
  const groupedPods = useMemo(() => {
    const grouped = {}
    
    failedPods.forEach((pod) => {
      // Tentar obter o nome do robô de várias fontes possíveis
      let robotName = pod.nome_robo || pod.labels?.nome_robo || pod.labels?.['nome_robo']
      
      // Se não encontrou, extrair do nome do pod
      if (!robotName && pod.name) {
        robotName = extrairNomeRoboDoPod(pod.name)
      }
      
      // Se ainda não encontrou, usar 'Desconhecido'
      robotName = robotName || 'Desconhecido'
      
      // Formatar o nome (capitalizar e substituir hífens por espaços)
      const robotNameFormatado = formatarNome(robotName)
      
      if (!grouped[robotNameFormatado]) {
        grouped[robotNameFormatado] = []
      }
      grouped[robotNameFormatado].push(pod)
    })
    
    // Ordenar pods dentro de cada grupo por data (mais recente primeiro)
    Object.keys(grouped).forEach((robotName) => {
      grouped[robotName].sort((a, b) => {
        const dateA = new Date(a.start_time || a.failed_at || 0)
        const dateB = new Date(b.start_time || b.failed_at || 0)
        return dateB - dateA
      })
    })
    
    return grouped
  }, [failedPods])

  const handleExpandRobot = (robotName) => {
    setExpandedRobots((prev) => ({
      ...prev,
      [robotName]: !prev[robotName],
    }))
  }

  useEffect(() => {
    if (isConnected) {
      loadFailedPods()
      const interval = setInterval(() => {
        if (isConnected) loadFailedPods()
      }, 15000) // Atualizar a cada 15s
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [isConnected])

  const loadFailedPods = async () => {
    if (!isConnected) return // Não tentar carregar se desconectado
    
    try {
      setLoading(true)
      // Buscar pods com falhas do banco de dados
      const failed = await api.getFailedPods()
      
      setFailedPods(Array.isArray(failed) ? failed : [])
    } catch (error) {
      console.error('Erro ao carregar pods falhados:', error)
      // Não limpar failedPods em caso de erro - manter cache
      if (isConnected) {
        enqueueSnackbar(`Erro ao carregar falhas: ${error.message}`, { variant: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleViewLogs = async (pod) => {
    setSelectedPod(pod)
    setDialogOpen(true)
    setLogsLoading(true)
    setLogs('')

    try {
      // Buscar logs do pod com falha do banco de dados
      const logsData = await api.getFailedPodLogs(pod.name, tail)
      setLogs(logsData.logs || 'Nenhum log disponível')
    } catch (error) {
      console.error('Erro ao carregar logs:', error)
      setLogs(`Erro ao carregar logs: ${error.message}`)
      enqueueSnackbar(`Erro ao carregar logs: ${error.message}`, { variant: 'error' })
    } finally {
      setLogsLoading(false)
    }
  }

  const handleRefreshLogs = async () => {
    if (!selectedPod) return
    setLogsLoading(true)
    try {
      // Buscar logs do pod com falha do banco de dados
      const logsData = await api.getFailedPodLogs(selectedPod.name, tail)
      setLogs(logsData.logs || 'Nenhum log disponível')
    } catch (error) {
      console.error('Erro ao atualizar logs:', error)
      setLogs(`Erro ao atualizar logs: ${error.message}`)
    } finally {
      setLogsLoading(false)
    }
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setSelectedPod(null)
    setLogs('')
  }

  const getStatusColor = (status, phase) => {
    if (status === 'Failed' || phase === 'Failed') return 'error'
    if (status === 'CrashLoopBackOff') return 'error'
    if (status === 'Error') return 'error'
    return 'default'
  }

  const getStatusLabel = (status, phase) => {
    if (phase === 'Failed') return 'Failed'
    if (status === 'CrashLoopBackOff') return 'CrashLoopBackOff'
    if (status === 'Error') return 'Error'
    return status || phase || 'Unknown'
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleString('pt-BR')
    } catch {
      return dateString
    }
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
          Falhas em Containers
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!isConnected && onReconnect && (
            <Button variant="outlined" onClick={onReconnect}>
              Reconectar
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadFailedPods}
            disabled={loading || !isConnected}
          >
            Atualizar
          </Button>
        </Box>
      </Box>

      {!isConnected && failedPods.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Os dados exibidos são do cache. Reconecte para atualizar.
        </Alert>
      )}

      {loading && failedPods.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <CircularProgress />
        </Box>
      ) : failedPods.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ color: '#CBD5E1', textAlign: 'center' }}>
              Nenhum container com falha encontrado.
            </Typography>
          </CardContent>
        </Card>
      ) : Object.keys(groupedPods).length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ color: '#CBD5E1', textAlign: 'center' }}>
              Nenhum container com falha encontrado.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Object.keys(groupedPods).map((robotName) => {
            const pods = groupedPods[robotName]
            const isExpanded = expandedRobots[robotName] || false
            
            return (
              <Accordion
                key={robotName}
                expanded={isExpanded}
                onChange={() => handleExpandRobot(robotName)}
                sx={{
                  backgroundColor: 'rgba(30, 41, 59, 0.3)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
                  '&:before': {
                    display: 'none',
                  },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ color: '#F8FAFC' }} />}
                  sx={{
                    '& .MuiAccordionSummary-content': {
                      alignItems: 'center',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                    <Typography
                      variant="h6"
                      sx={{
                        color: '#F8FAFC',
                        fontWeight: 'bold',
                        flex: 1,
                      }}
                    >
                      {robotName}
                    </Typography>
                    <Chip
                      label={`${pods.length} pod${pods.length !== 1 ? 's' : ''} falhado${pods.length !== 1 ? 's' : ''}`}
                      color="error"
                      size="small"
                      sx={{ ml: 'auto' }}
                    />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <TableContainer
                    component={Paper}
                    sx={{
                      backgroundColor: 'transparent',
                      boxShadow: 'none',
                    }}
                  >
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Nome do Pod</TableCell>
                          <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Namespace</TableCell>
                          <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Status</TableCell>
                          <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Início</TableCell>
                          <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Ações</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pods.map((pod) => (
                          <TableRow
                            key={pod.name}
                            sx={{ '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' } }}
                          >
                            <TableCell sx={{ color: '#F8FAFC' }}>{pod.name}</TableCell>
                            <TableCell sx={{ color: '#CBD5E1' }}>{pod.namespace || 'default'}</TableCell>
                            <TableCell>
                              <Chip
                                label={getStatusLabel(pod.status, pod.phase)}
                                color={getStatusColor(pod.status, pod.phase)}
                                size="small"
                              />
                            </TableCell>
                            <TableCell sx={{ color: '#CBD5E1' }}>
                              {formatDate(pod.start_time)}
                            </TableCell>
                            <TableCell>
                              <IconButton
                                size="small"
                                onClick={() => handleViewLogs(pod)}
                                sx={{ color: '#6366F1' }}
                                title="Ver logs"
                              >
                                <VisibilityIcon />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
            )
          })}
        </Box>
      )}

      {/* Dialog de Logs */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
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
            Logs: {selectedPod?.name}
          </Typography>
          <IconButton onClick={handleCloseDialog} sx={{ color: '#CBD5E1' }}>
            <CloseIcon />
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
          <Button onClick={handleCloseDialog} sx={{ color: '#CBD5E1' }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

