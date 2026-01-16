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
  const [connectionStatus, setConnectionStatus] = useState({ k8s: false, mysql: false })
  const [isReconnecting, setIsReconnecting] = useState(false)
  const { enqueueSnackbar } = useSnackbar()
  const { addLog } = useAppLogs()

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false)
    }
  }, [isMobile])

  // Connection status loop
  useEffect(() => {
    let timeoutId
    let isMounted = true

    const runLoop = async () => {
      if (!isMounted) return

      try {
        const status = await api.getConnectionStatus()
        let k8sOk = status.k8s_connected || false
        let mysqlOk = status.mysql_connected || false

        setConnectionStatus({ k8s: k8sOk, mysql: mysqlOk })

        if (!k8sOk || !mysqlOk) {
          setIsReconnecting(true)
          try {
            const tasks = []
            const checkConfig = { timeout: 5000 }
            if (!k8sOk) tasks.push(api.testK8sConnection(checkConfig))
            if (!mysqlOk) tasks.push(api.testMysqlConnection(checkConfig))

            const results = await Promise.all(tasks)

            results.forEach(res => {
              if (res.k8s_connected !== undefined) k8sOk = res.k8s_connected
              if (res.mysql_connected !== undefined) mysqlOk = res.mysql_connected
            })
            setConnectionStatus({ k8s: k8sOk, mysql: mysqlOk })

          } catch (err) {
            console.debug('[LAYOUT] Erro na tentativa de conexão:', err.message)
          } finally {
            setIsReconnecting(false)
          }
        }
      } catch (error) {
        setConnectionStatus({ k8s: false, mysql: false })
      }

      if (isMounted) {
        timeoutId = setTimeout(runLoop, 1000)
      }
    }

    runLoop()

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  const handleManualReconnect = async () => {
    if (isReconnecting) return

    setIsReconnecting(true)
    addLog('info', 'Forçando reconexão manual...')

    try {
      await api.reloadServices()

      const [k8sRes, mysqlRes] = await Promise.all([
        api.testK8sConnection(),
        api.testMysqlConnection()
      ])

      const newStatus = {
        k8s: k8sRes.k8s_connected || false,
        mysql: mysqlRes.mysql_connected || false,
      }
      setConnectionStatus(newStatus)

      if (newStatus.k8s && newStatus.mysql) {
        addLog('success', 'Reconexão bem-sucedida!')
        enqueueSnackbar('Reconectado com sucesso!', { variant: 'success' })
      } else {
        const errors = []
        if (!newStatus.k8s) errors.push('Kubernetes')
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

  const refreshConnectionStatus = async () => {
    try {
      const status = await api.getConnectionStatus()
      setConnectionStatus({
        k8s: status.k8s_connected || false,
        mysql: status.mysql_connected || false,
      })
    } catch (e) {
      setConnectionStatus({ k8s: false, mysql: false })
    }
  }

  const renderPage = () => {
    const isConnected = connectionStatus.k8s && connectionStatus.mysql
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
