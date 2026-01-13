import React, { useState, useEffect, useRef } from 'react'
import { Box, useMediaQuery, useTheme } from '@mui/material'
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
  const [isReconnecting, setIsReconnecting] = useState(false)
  const { enqueueSnackbar } = useSnackbar()
  const { addLog } = useAppLogs()

  // Collapse sidebar on mobile automatically
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }, [isMobile])

  // Aggressive connection loop (proactive reconnection)
  useEffect(() => {
    let timeoutId
    let isMounted = true

    const runLoop = async () => {
      if (!isMounted) return

      try {
        // 1. Verificar status atual
        const status = await api.getConnectionStatus()
        let sshOk = status.ssh_connected || false
        let mysqlOk = status.mysql_connected || false

        // Atualizar estado visual
        setConnectionStatus({ ssh: sshOk, mysql: mysqlOk })

        // 2. Se houver qualquer desconexão, inicia tentativa PROATIVA
        if (!sshOk || !mysqlOk) {
          setIsReconnecting(true)
          console.debug('[LAYOUT] Status desconectado. Iniciando tentativa de conexão proativa...')

          try {
            const tasks = []
            // Tentamos conectar no que estiver offline com timeout reduzido (5s)
            const checkConfig = { timeout: 5000 }
            if (!sshOk) tasks.push(api.testSshConnection(checkConfig))
            if (!mysqlOk) tasks.push(api.testMysqlConnection(checkConfig))

            const results = await Promise.all(tasks)

            // Tentar atualizar o status local imediatamente com os resultados do teste
            results.forEach(res => {
              if (res.ssh_connected !== undefined) sshOk = res.ssh_connected
              if (res.mysql_connected !== undefined) mysqlOk = res.mysql_connected
            })
            setConnectionStatus({ ssh: sshOk, mysql: mysqlOk })

          } catch (err) {
            console.debug('[LAYOUT] Erro na tentativa de conexão proativa:', err.message)
          } finally {
            setIsReconnecting(false)
          }
        }
      } catch (error) {
        // Backend offline ou erro de rede (bolinhas vermelhas)
        setConnectionStatus({ ssh: false, mysql: false })
      }

      // Agenda a próxima execução para daqui a exatamente 1 segundo (conforme solicitado)
      if (isMounted) {
        timeoutId = setTimeout(runLoop, 1000)
      }
    }

    runLoop()

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleManualReconnect = async () => {
    if (isReconnecting) return

    setIsReconnecting(true)
    addLog('info', 'Forçando reconexão manual (testando todos os serviços)...')

    try {
      // Primeiro garante que as configs foram recarregadas no backend
      await api.reloadServices()

      // Testa as conexões explicitamente (proativo)
      const [sshRes, mysqlRes] = await Promise.all([
        api.testSshConnection(),
        api.testMysqlConnection()
      ])

      const newStatus = {
        ssh: sshRes.ssh_connected || false,
        mysql: mysqlRes.mysql_connected || false,
      }
      setConnectionStatus(newStatus)

      if (newStatus.ssh && newStatus.mysql) {
        addLog('success', 'Reconexão bem-sucedida!')
        enqueueSnackbar('Reconectado com sucesso!', { variant: 'success' })
      } else {
        const errors = []
        if (!newStatus.ssh) errors.push('SSH')
        if (!newStatus.mysql) errors.push('MySQL')
        enqueueSnackbar(`Falha na conexão: ${errors.join(', ')}`, { variant: 'warning' })
      }
    } catch (error) {
      addLog('error', `Erro ao reconectar: ${error.message}`)
      enqueueSnackbar(`Erro na reconexão: ${error.message}`, { variant: 'error' })
    } finally {
      setIsReconnecting(false)
    }
  }

  // Callback para atualizar status de conexão (usado pela página Configurações)
  const refreshConnectionStatus = async () => {
    try {
      const status = await api.getConnectionStatus()
      setConnectionStatus({
        ssh: status.ssh_connected || false,
        mysql: status.mysql_connected || false,
      })
    } catch (e) {
      setConnectionStatus({ ssh: false, mysql: false })
    }
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
      case 'configuracoes': return <Configuracoes onConnectionChange={refreshConnectionStatus} />
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
      p: 0
    }}>
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
          ml: 0,
          mr: '5px',
          mt: '5px',
          mb: '5px',
          bgcolor: 'background.default',
          borderRadius: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100% - 10px)'
        }}
      >
        <Box sx={{ flexGrow: 1, overflow: 'auto', pr: 0 }}>
          {renderPage()}
        </Box>
      </Box>
    </Box>
  )
}
