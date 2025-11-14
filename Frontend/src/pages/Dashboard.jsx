import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Paper,
  Button,
  Alert,
} from '@mui/material'
import { Refresh as RefreshIcon } from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'

export default function Dashboard({ isConnected = true, onReconnect }) {
  const [stats, setStats] = useState({
    containersAtivos: 0,
    execucoesPendentes: 0,
    falhasContainers: 0,
    rpasAtivos: 0,
    cronjobsAtivos: 0,
  })
  const [robots, setRobots] = useState([])
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const intervalRef = useRef(null)
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    if (isConnected) {
      loadData()
      // Só iniciar intervalo se estiver conectado
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      intervalRef.current = setInterval(() => {
        loadData(true) // Atualizar silenciosamente
      }, 10000) // Atualizar a cada 10s
    } else {
      // Parar intervalo se desconectado e garantir que loading seja desativado
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setLoading(false) // Garantir que o loading seja desativado quando desconectado
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isConnected])

  const loadData = async (silent = false) => {
    // Não tentar carregar se não estiver conectado
    if (!isConnected) {
      if (!silent) {
        setConnectionError(true)
        setLoading(false) // Garantir que o loading seja desativado
      }
      return // Manter dados em cache, não limpar
    }

    try {
      setLoading(true)
      setConnectionError(false)
      const [rpas, jobsStatus, cronjobs] = await Promise.all([
        api.getRPAs(),
        api.getJobStatus(),
        api.getCronjobs(),
      ])

      let containersAtivos = 0
      let execucoesPendentes = 0
      let falhasContainers = 0
      let rpasAtivos = 0

      // Processar RPAs
      const robotsList = []
      if (Array.isArray(rpas)) {
        rpas.forEach((rpa) => {
          if (rpa.status === 'active') {
            rpasAtivos++
          }
          execucoesPendentes += rpa.execucoes_pendentes || 0

          const status = jobsStatus[rpa.nome_rpa?.toLowerCase()] || jobsStatus[rpa.nome_rpa] || {}
          containersAtivos += status.running || 0
          falhasContainers += (status.error || 0) + (status.failed || 0)

          // Determinar status dos containers
          let containerStatus = 'Idle'
          let statusColor = 'default'
          if (status.running > 0) {
            containerStatus = 'Running'
            statusColor = 'success'
          } else if (status.pending > 0) {
            containerStatus = 'Pending'
            statusColor = 'warning'
          } else if (status.error > 0 || status.failed > 0) {
            containerStatus = 'Error'
            statusColor = 'error'
          }

          robotsList.push({
            nome: rpa.nome_rpa || 'N/A',
            instancias: `${rpa.jobs_ativos || 0}/${rpa.qtd_max_instancias || 0}`,
            status: containerStatus,
            statusColor,
            execucoes: rpa.execucoes_pendentes || 0,
            tipo: 'RPA',
          })
        })
      }

      // Processar Cronjobs
      if (Array.isArray(cronjobs)) {
        cronjobs.forEach((cj) => {
          if (!cj.suspended) {
            robotsList.push({
              nome: cj.name || 'N/A',
              instancias: '-',
              status: 'Scheduled',
              statusColor: 'info',
              execucoes: '-',
              tipo: 'Cronjob',
            })
          }
        })
      }

      const cronjobsAtivos = Array.isArray(cronjobs)
        ? cronjobs.filter((cj) => !cj.suspended).length
        : 0

      setStats({
        containersAtivos,
        execucoesPendentes,
        falhasContainers,
        rpasAtivos,
        cronjobsAtivos,
      })
      setRobots(robotsList)
      setConnectionError(false)
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error)
      
      // Verificar se é erro de conexão/timeout
      const isConnectionError = 
        error.message?.includes('Timeout') || 
        error.message?.includes('conexão') ||
        error.message?.includes('network') ||
        error.code === 'ECONNABORTED'
      
      if (isConnectionError) {
        setConnectionError(true)
        
        // Parar atualizações automáticas se houver erro de conexão
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
      
      // Não limpar dados em caso de erro - manter cache
      // setRobots([]) - removido para manter cache
      
      if (!silent) {
        enqueueSnackbar(`Erro ao carregar dados: ${error.message}`, { variant: 'error' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleManualRefresh = async () => {
    if (onReconnect) {
      await onReconnect()
      // Aguardar um pouco e tentar recarregar
      setTimeout(() => {
        if (isConnected) {
          loadData()
        }
      }, 2000)
    } else {
      loadData()
    }
  }

  // Monitorar quando a conexão for restaurada para recarregar dados
  useEffect(() => {
    if (isConnected && connectionError) {
      setConnectionError(false)
      loadData()
      // Reiniciar intervalo
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      intervalRef.current = setInterval(() => {
        loadData(true)
      }, 10000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, connectionError])

  const StatCard = ({ title, value, color }) => (
    <Card sx={{ height: '100%', maxWidth: 250 }}>
      <CardContent sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: '0.875rem' }}>
          {title}
        </Typography>
        <Typography variant="h4" component="div" sx={{ color, fontWeight: 'bold', fontSize: '1.75rem' }}>
          {loading ? '...' : value}
        </Typography>
      </CardContent>
    </Card>
  )

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
            mb: 0,
          }}
        >
          Dashboard
        </Typography>
        {connectionError && !isConnected && (
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleManualRefresh}
            disabled={loading}
          >
            Reconectar
          </Button>
        )}
      </Box>

      {!isConnected && (robots.length > 0 || Object.values(stats).some(v => v > 0)) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Você está desconectado. Os dados exibidos são do cache. Reconecte para atualizar.
        </Alert>
      )}
      
      {connectionError && !isConnected && robots.length === 0 && Object.values(stats).every(v => v === 0) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Não foi possível carregar os dados. Verifique a conexão e clique em "Reconectar".
        </Alert>
      )}
      
      {/* Cards de Estatísticas */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard title="Containers Ativos" value={stats.containersAtivos} color="#6366F1" />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Execuções Pendentes"
            value={stats.execucoesPendentes}
            color="#F59E0B"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard title="Falhas em Containers" value={stats.falhasContainers} color="#EF4444" />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard title="RPAs Ativos" value={stats.rpasAtivos} color="#10B981" />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard title="Cronjobs Agendados" value={stats.cronjobsAtivos} color="#10B981" />
        </Grid>
      </Grid>

      {/* Tabela de Robôs */}
      <Typography 
        variant="h5" 
        gutterBottom 
        sx={{ 
          mb: 2, 
          fontWeight: 'bold',
          color: '#F8FAFC',
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
      >
        Robôs em Execução
      </Typography>
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
              <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Instâncias</TableCell>
              <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Execuções</TableCell>
              <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Tipo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && robots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <CircularProgress sx={{ my: 2 }} />
                </TableCell>
              </TableRow>
            ) : robots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: '#CBD5E1' }}>
                  Nenhum robô encontrado
                </TableCell>
              </TableRow>
            ) : (
              robots.map((robot, index) => (
                <TableRow key={`${robot.nome}-${index}`} sx={{ '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' } }}>
                  <TableCell sx={{ color: '#F8FAFC' }}>{robot.nome}</TableCell>
                  <TableCell sx={{ color: '#CBD5E1' }}>{robot.instancias}</TableCell>
                  <TableCell>
                    <Chip
                      label={robot.status}
                      color={robot.statusColor}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#CBD5E1' }}>{robot.execucoes}</TableCell>
                  <TableCell>
                    <Chip
                      label={robot.tipo}
                      color={robot.tipo === 'RPA' ? 'primary' : 'secondary'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
