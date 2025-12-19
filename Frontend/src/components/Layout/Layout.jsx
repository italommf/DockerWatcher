import React, { useState, useEffect, useRef } from 'react'
import { Box, Button, CircularProgress, Paper, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import { Refresh as RefreshIcon, Circle as CircleIcon } from '@mui/icons-material'
import { useSnackbar } from 'notistack'
import { useAppLogs } from '../../context/AppLogsContext'
import Sidebar from './Sidebar'
import Dashboard from '../../pages/Dashboard'
import Jobs from '../../pages/Jobs'
import RPAs from '../../pages/RPAs'
import Cronjobs from '../../pages/Cronjobs'
import Deployments from '../../pages/Deployments'
import Falhas from '../../pages/Falhas'
import Configuracoes from '../../pages/Configuracoes'
import Logs from '../../pages/Logs'
import CriarRPA from '../../pages/CriarRPA'
import CriarCronjob from '../../pages/CriarCronjob'
import CriarDeployment from '../../pages/CriarDeployment'
import EditarDeployment from '../../pages/EditarDeployment'
import EditarRPA from '../../pages/EditarRPA'
import EditarCronjob from '../../pages/EditarCronjob'
import api from '../../services/api'

export default function Layout() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [editingItem, setEditingItem] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState({ ssh: false, mysql: false })
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const autoReconnectExhaustedRef = useRef(false)
  const { enqueueSnackbar } = useSnackbar()
  const { addLog } = useAppLogs()

  // Collapse sidebar on mobile automatically
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }, [isMobile])

  useEffect(() => {
    checkConnection()
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const bothConnected = connectionStatus.ssh && connectionStatus.mysql

    if (bothConnected) {
      if (reconnectAttempts > 0 || isReconnecting) {
        setReconnectAttempts(0)
        reconnectAttemptsRef.current = 0
        autoReconnectExhaustedRef.current = false
        setIsReconnecting(false)
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
        addLog('success', 'Conexões restabelecidas com sucesso')
        enqueueSnackbar('Conexões restabelecidas com sucesso!', { variant: 'success' })

        const interval = setInterval(() => {
          checkConnection(true)
        }, 30000)

        return () => clearInterval(interval)
      }
    } else if (reconnectAttempts === 0 && !isReconnecting && !autoReconnectExhaustedRef.current) {
      addLog('warning', 'Conexões perdidas. Iniciando tentativas de reconexão...')
      enqueueSnackbar('Conexões perdidas. Tentando reconectar...', {
        variant: 'warning',
      })
      attemptReconnect(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus.ssh, connectionStatus.mysql])

  const attemptReconnect = async (manual = false) => {
    if (!manual) {
      if (reconnectAttemptsRef.current >= 2) {
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
        autoReconnectExhaustedRef.current = true
        setIsReconnecting(false)
        addLog('error', `Falha na reconexão após ${reconnectAttemptsRef.current} tentativas. Use o botão Reconectar para tentar novamente.`)
        enqueueSnackbar('Falha na reconexão. Clique em "Reconectar" para tentar novamente.', {
          variant: 'error',
        })
        return
      }

      reconnectAttemptsRef.current += 1
      const newAttempt = reconnectAttemptsRef.current
      setReconnectAttempts(newAttempt)
      setIsReconnecting(true)
      addLog('info', `Tentativa de reconexão ${newAttempt}/2...`)
    } else {
      setIsReconnecting(true)
      addLog('info', 'Tentativa manual de reconexão...')
    }

    try {
      const status = await api.getConnectionStatus()
      const newStatus = {
        ssh: status.ssh_connected || false,
        mysql: status.mysql_connected || false,
      }

      setConnectionStatus(newStatus)

      if (newStatus.ssh && newStatus.mysql) {
        reconnectAttemptsRef.current = 0
        setReconnectAttempts(0)
        setIsReconnecting(false)
        addLog('success', 'Reconexão bem-sucedida!')
        enqueueSnackbar('Reconectado com sucesso!', { variant: 'success' })
        setConnectionStatus(newStatus)
      } else {
        if (manual) {
          addLog('error', 'Falha na reconexão manual')
          enqueueSnackbar('Falha na reconexão. Verifique as configurações.', { variant: 'error' })
          setIsReconnecting(false)
        } else {
          reconnectTimeoutRef.current = setTimeout(() => {
            attemptReconnect(false)
          }, 10000)
        }
      }
    } catch (error) {
      addLog('error', `Erro ao verificar conexão: ${error.message}`, error.stack)
      if (manual) {
        enqueueSnackbar(`Erro na reconexão: ${error.message}`, { variant: 'error' })
        setIsReconnecting(false)
      } else {
        reconnectTimeoutRef.current = setTimeout(() => {
          attemptReconnect(false)
        }, 10000)
      }
    }
  }

  const checkConnection = async (silent = false) => {
    try {
      const status = await api.getConnectionStatus()
      const newStatus = {
        ssh: status.ssh_connected || false,
        mysql: status.mysql_connected || false,
      }

      if (!isReconnecting && !silent && !autoReconnectExhaustedRef.current) {
        setConnectionStatus(newStatus)
      } else if (silent) {
        if (newStatus.ssh && newStatus.mysql) {
          setConnectionStatus(newStatus)
        }
      } else if (newStatus.ssh && newStatus.mysql) {
        autoReconnectExhaustedRef.current = false
        setConnectionStatus(newStatus)
      }
    } catch (error) {
      if (!silent && !isReconnecting) {
        setConnectionStatus({ ssh: false, mysql: false })
      }
    }
  }

  const handleManualReconnect = () => {
    if (isReconnecting) return

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    reconnectAttemptsRef.current = 0
    autoReconnectExhaustedRef.current = false
    setReconnectAttempts(0)
    attemptReconnect(true)
  }

  const renderPage = () => {
    const isConnected = connectionStatus.ssh && connectionStatus.mysql
    const handleBack = (page) => {
      setCurrentPage(page)
      setEditingItem(null)
    }
    const handleEdit = (page, item) => {
      setCurrentPage(page)
      setEditingItem(item)
    }

    const props = { isConnected, onReconnect: handleManualReconnect }
    const editProps = { ...props, onEdit: handleEdit }
    const backProps = { ...props, onBack: handleBack }

    switch (currentPage) {
      case 'dashboard': return <Dashboard {...props} />
      case 'jobs': return <Jobs {...props} />
      case 'rpas': return <RPAs {...editProps} />
      case 'cronjobs': return <Cronjobs {...editProps} />
      case 'deployments': return <Deployments {...editProps} />
      case 'falhas': return <Falhas {...props} />
      case 'configuracoes': return <Configuracoes />
      case 'logs': return <Logs />
      case 'criar-rpa': return <CriarRPA {...backProps} />
      case 'criar-cronjob': return <CriarCronjob {...backProps} />
      case 'criar-deployment': return <CriarDeployment {...backProps} />
      case 'editar-rpa': return <EditarRPA {...backProps} rpaName={editingItem} />
      case 'editar-cronjob': return <EditarCronjob {...backProps} cronjobName={editingItem} />
      case 'editar-deployment': return <EditarDeployment {...backProps} deploymentName={editingItem} />
      default: return <Dashboard {...props} />
    }
  }

  return (
    <Box sx={{
      display: 'flex',
      height: '100vh',
      bgcolor: 'background.default',
      overflow: 'hidden',
      // Remover o "efeito flutuante" (margem ao redor) para ocupar a tela inteira
      p: 0
    }}>
      {/* Status + Reconectar (canto superior direito) */}
      <Sidebar
        isCollapsed={!sidebarOpen}
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        connectionStatus={connectionStatus}
        onReconnect={handleManualReconnect}
        isReconnecting={isReconnecting}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: 0, // Sidebar já tem margem, não precisa de gap adicional
          mr: '5px', // Mesma margem que o sidebar usa para a esquerda
          mt: '5px', // Mesma margem que o sidebar usa para o topo
          mb: '5px', // Mesma margem para baixo
          bgcolor: 'background.default',
          borderRadius: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100% - 10px)' // Compensar margens top/bottom
        }}
      >
        <Box sx={{ flexGrow: 1, overflow: 'auto', pr: 0 }}>
          {renderPage()}
        </Box>
      </Box>
    </Box>
  )
}
