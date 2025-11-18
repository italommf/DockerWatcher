import React, { useState, useEffect, useRef } from 'react'
import { Box, Drawer } from '@mui/material'
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
import api from '../../services/api'

const drawerWidth = 280

export default function Layout() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [connectionStatus, setConnectionStatus] = useState({ ssh: false, mysql: false })
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0) // Ref para manter o valor atualizado
  const autoReconnectExhaustedRef = useRef(false) // Flag para indicar que tentativas automáticas esgotaram
  const { enqueueSnackbar } = useSnackbar()
  const { addLog } = useAppLogs()

  useEffect(() => {
    checkConnection()
    // Não verificar automaticamente mais - apenas quando conectado
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Monitorar mudanças no status de conexão
  useEffect(() => {
    const bothConnected = connectionStatus.ssh && connectionStatus.mysql
    
    if (bothConnected) {
      // Se ambos estão conectados, resetar tentativas e parar reconexões
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
        
        // Iniciar verificação periódica normal
        const interval = setInterval(() => {
          checkConnection(true) // Verificação silenciosa
        }, 30000) // Verificar a cada 30s quando conectado
        
        return () => clearInterval(interval)
      }
    } else if (reconnectAttempts === 0 && !isReconnecting && !autoReconnectExhaustedRef.current) {
      // Primeira desconexão detectada - iniciar reconexão automática
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
      // Usar ref para verificar o valor atualizado
      if (reconnectAttemptsRef.current >= 2) {
        // Limite de tentativas automáticas atingido (2 tentativas)
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
      
      // Incrementar tentativas antes de iniciar
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
        // Conectado com sucesso
        reconnectAttemptsRef.current = 0
        setReconnectAttempts(0)
        setIsReconnecting(false)
        addLog('success', 'Reconexão bem-sucedida!')
        enqueueSnackbar('Reconectado com sucesso!', { variant: 'success' })
        
        // Atualizar status de conexão para que as páginas possam recarregar
        setConnectionStatus(newStatus)
        
        // Não recarregar página inteira - deixar as páginas recarregarem seus dados
      } else {
        // Ainda desconectado
        if (manual) {
          addLog('error', 'Falha na reconexão manual')
          enqueueSnackbar('Falha na reconexão. Verifique as configurações.', { variant: 'error' })
          setIsReconnecting(false)
        } else {
          // Tentar novamente após 10 segundos (manter o valor atual de reconnectAttempts)
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
        // Tentar novamente após 10 segundos (manter o valor atual de reconnectAttempts)
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
      
      // Só atualizar se o status mudou e não estamos em processo de reconexão
      // Não atualizar se já esgotamos as tentativas automáticas (para evitar loops)
      if (!isReconnecting && !silent && !autoReconnectExhaustedRef.current) {
        setConnectionStatus(newStatus)
      } else if (silent) {
        // Verificação silenciosa - apenas atualizar se ambos conectados
        if (newStatus.ssh && newStatus.mysql) {
          setConnectionStatus(newStatus)
        }
      } else if (newStatus.ssh && newStatus.mysql) {
        // Se reconectou após esgotar tentativas, atualizar status e resetar flag
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
    if (isReconnecting) {
      return // Já está reconectando
    }
    
    // Limpar timeout anterior se existir
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    reconnectAttemptsRef.current = 0
    autoReconnectExhaustedRef.current = false // Resetar flag para permitir novas tentativas automáticas
    setReconnectAttempts(0) // Resetar tentativas para reconexão manual
    attemptReconnect(true)
  }

  const renderPage = () => {
    const isConnected = connectionStatus.ssh && connectionStatus.mysql
    
    const handleBack = (page) => {
      setCurrentPage(page)
    }
    
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard isConnected={isConnected} onReconnect={handleManualReconnect} />
      case 'jobs':
        return <Jobs isConnected={isConnected} onReconnect={handleManualReconnect} />
      case 'rpas':
        return <RPAs isConnected={isConnected} onReconnect={handleManualReconnect} />
      case 'cronjobs':
        return <Cronjobs isConnected={isConnected} onReconnect={handleManualReconnect} />
      case 'deployments':
        return <Deployments isConnected={isConnected} onReconnect={handleManualReconnect} />
      case 'falhas':
        return <Falhas isConnected={isConnected} onReconnect={handleManualReconnect} />
      case 'configuracoes':
        return <Configuracoes />
      case 'logs':
        return <Logs />
      case 'criar-rpa':
        return <CriarRPA isConnected={isConnected} onReconnect={handleManualReconnect} onBack={handleBack} />
      case 'criar-cronjob':
        return <CriarCronjob isConnected={isConnected} onReconnect={handleManualReconnect} onBack={handleBack} />
      case 'criar-deployment':
        return <CriarDeployment isConnected={isConnected} onReconnect={handleManualReconnect} onBack={handleBack} />
      default:
        return <Dashboard isConnected={isConnected} onReconnect={handleManualReconnect} />
    }
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: 'rgba(30, 41, 59, 0.3)',
            backdropFilter: 'blur(20px)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
            borderRadius: 0,
            borderLeft: 'none',
            top: 0,
            height: '100vh',
          },
        }}
      >
        <Sidebar
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          connectionStatus={connectionStatus}
          onReconnect={handleManualReconnect}
          isReconnecting={isReconnecting}
          reconnectAttempts={reconnectAttempts}
        />
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          p: 3,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {renderPage()}
      </Box>
    </Box>
  )
}
