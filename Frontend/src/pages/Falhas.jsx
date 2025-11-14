import React, { useState, useEffect } from 'react'
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
} from '@mui/material'
import { Close as CloseIcon, Refresh as RefreshIcon, Visibility as VisibilityIcon } from '@mui/icons-material'
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
  const { enqueueSnackbar } = useSnackbar()

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
      const allPods = await api.getPods()
      
      // Filtrar apenas pods que falharam
      const failed = Array.isArray(allPods)
        ? allPods.filter((pod) => {
            const phase = pod.phase || ''
            const status = pod.status || ''
            return (
              phase === 'Failed' ||
              status === 'Failed' ||
              status === 'CrashLoopBackOff' ||
              status === 'Error' ||
              (pod.containers && pod.containers.some((c) => 
                c.state?.terminated?.exitCode !== 0 || 
                c.state?.waiting?.reason === 'CrashLoopBackOff' ||
                c.state?.waiting?.reason === 'Error'
              ))
            )
          })
        : []
      
      setFailedPods(failed)
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
      const logsData = await api.getPodLogs(pod.name, tail)
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
      const logsData = await api.getPodLogs(selectedPod.name, tail)
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
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            backgroundColor: 'rgba(30, 41, 59, 0.3)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
          }}
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Nome</TableCell>
                <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Namespace</TableCell>
                <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Robô</TableCell>
                <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Início</TableCell>
                <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {failedPods.map((pod) => (
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
                    {pod.labels?.nome_robo || pod.labels?.['nome_robo'] || 'N/A'}
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

