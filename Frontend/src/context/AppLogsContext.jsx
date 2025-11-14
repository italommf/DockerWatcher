import React, { createContext, useContext, useState, useCallback } from 'react'

const AppLogsContext = createContext()

export const useAppLogs = () => {
  const context = useContext(AppLogsContext)
  if (!context) {
    throw new Error('useAppLogs must be used within AppLogsProvider')
  }
  return context
}

export const AppLogsProvider = ({ children }) => {
  const [logs, setLogs] = useState([])

  const addLog = useCallback((type, message, details = null) => {
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date(),
      type, // 'info', 'warning', 'error', 'success'
      message,
      details,
    }
    
    setLogs((prev) => [logEntry, ...prev].slice(0, 1000)) // Manter últimos 1000 logs
    
    return logEntry
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return (
    <AppLogsContext.Provider value={{ logs, addLog, clearLogs }}>
      {children}
    </AppLogsContext.Provider>
  )
}

