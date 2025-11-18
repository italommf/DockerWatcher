import React, { createContext, useContext, useState, useRef, useEffect } from 'react'
import api from '../services/api'

const DashboardCacheContext = createContext()

export const useDashboardCache = () => {
  const context = useContext(DashboardCacheContext)
  if (!context) {
    throw new Error('useDashboardCache deve ser usado dentro de DashboardCacheProvider')
  }
  return context
}

export const DashboardCacheProvider = ({ children }) => {
  // Estados para cache dos dados
  const [cachedData, setCachedData] = useState({
    rpas: [],
    jobsStatus: {},
    cronjobs: [],
    deployments: [],
    robots: [],
    stats: {
      instanciasAtivas: 0,
      execucoesPendentes: 0,
      falhasContainers: 0,
      rpasAtivos: 0,
      cronjobsAtivos: 0,
    },
    vmResources: null,
    resourcesHistory: {
      memoria: [],
      armazenamento: [],
      cpu: [],
    },
  })

  // Refs para intervalos (não são limpos ao desmontar)
  const dataIntervalRef = useRef(null)
  const resourcesIntervalRef = useRef(null)
  const isInitializedRef = useRef(false)
  const dashboardLoadingRef = useRef(false) // Lock para evitar requisições duplicadas do dashboard

  // Função para calcular próxima execução (mesma do Dashboard)
  const calcularProximaExecucao = (schedule) => {
    if (!schedule) return null
    
    try {
      const parts = schedule.trim().split(/\s+/)
      if (parts.length < 5) return null
      
      const now = new Date()
      const [minuto, hora, dia, mes, diaSemana] = parts
      
      let proxima = new Date(now)
      proxima.setSeconds(0)
      proxima.setMilliseconds(0)
      
      if (minuto !== '*' && hora !== '*') {
        const minutoInt = parseInt(minuto) || 0
        const horaInt = parseInt(hora) || 0
        
        proxima.setMinutes(minutoInt)
        proxima.setHours(horaInt)
        
        if (proxima <= now) {
          proxima.setDate(proxima.getDate() + 1)
        }
        
        if (dia !== '*') {
          const diaMes = parseInt(dia)
          if (!isNaN(diaMes)) {
            const hoje = now.getDate()
            if (diaMes >= hoje) {
              proxima.setDate(diaMes)
              if (proxima <= now) {
                proxima.setMonth(proxima.getMonth() + 1)
                const ultimoDiaMes = new Date(proxima.getFullYear(), proxima.getMonth() + 1, 0).getDate()
                proxima.setDate(Math.min(diaMes, ultimoDiaMes))
              }
            } else {
              proxima.setMonth(proxima.getMonth() + 1)
              const ultimoDiaMes = new Date(proxima.getFullYear(), proxima.getMonth() + 1, 0).getDate()
              proxima.setDate(Math.min(diaMes, ultimoDiaMes))
              proxima.setHours(horaInt)
              proxima.setMinutes(minutoInt)
            }
          }
        }
        
        if (proxima <= now) {
          proxima.setDate(proxima.getDate() + 1)
        }
      } else {
        proxima = new Date(now.getTime() + 60 * 60 * 1000)
      }
      
      return proxima
    } catch (e) {
      console.error('Erro ao calcular próxima execução:', e, schedule)
      return null
    }
  }

  // Função para formatar nome
  const formatarNome = (nome) => {
    if (!nome) return nome
    let formatado = nome.replace(/[-_]/g, ' ')
    formatado = formatado.split(' ')
      .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
      .join(' ')
    
    const palavras = formatado.split(' ')
    if (palavras.length >= 2) {
      const primeira = palavras[0].toLowerCase()
      const segunda = palavras[1].toLowerCase()
      
      if ((primeira === 'rpa' && (segunda === 'cronjob' || segunda === 'conjob')) || 
          ((primeira === 'cronjob' || primeira === 'conjob') && segunda === 'rpa')) {
        palavras.splice(0, 2)
        formatado = palavras.join(' ').trim()
      }
    }
    
    return formatado
  }

  // Função para carregar dados do dashboard
  const loadDashboardData = async (isConnected) => {
    if (!isConnected) return
    
    // Evitar requisições duplicadas simultâneas
    if (dashboardLoadingRef.current) {
      console.log('[DASHBOARD] Requisição já em andamento, ignorando duplicata')
      return
    }

    dashboardLoadingRef.current = true
    const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    console.log(`[${requestId}] Iniciando carregamento de dados do dashboard`)
    
    const startTime = Date.now()
    
    try {
      // Fazer requisições com tratamento de erro individual
      // Se uma falhar, as outras continuam funcionando
      const [rpas, jobsStatus, cronjobsData, deployments] = await Promise.allSettled([
        api.getRPAs().catch(err => {
          console.warn(`[${requestId}] Erro ao carregar RPAs:`, err.message || err)
          return [] // Retornar array vazio em caso de erro
        }),
        api.getJobStatus().catch(err => {
          console.warn(`[${requestId}] Erro ao carregar status de jobs:`, err.message || err)
          return {} // Retornar objeto vazio em caso de erro
        }),
        api.getCronjobs().catch(err => {
          console.warn(`[${requestId}] Erro ao carregar cronjobs:`, err.message || err)
          return [] // Retornar array vazio em caso de erro
        }),
        api.getDeployments().catch(err => {
          console.warn(`[${requestId}] Erro ao carregar deployments:`, err.message || err)
          return [] // Retornar array vazio em caso de erro
        }),
      ])
      
      const elapsed = Date.now() - startTime
      console.log(`[${requestId}] Carregamento concluído em ${elapsed}ms`)

      // Extrair valores dos resultados (Promise.allSettled retorna {status, value})
      const rpasData = rpas.status === 'fulfilled' ? rpas.value : []
      const jobsStatusData = jobsStatus.status === 'fulfilled' ? jobsStatus.value : {}
      const cronjobsDataResult = cronjobsData.status === 'fulfilled' ? cronjobsData.value : []
      const deploymentsData = deployments.status === 'fulfilled' ? deployments.value : []
      
      // Processar cronjobs
      const cronjobsAtivos = Array.isArray(cronjobsDataResult)
        ? cronjobsDataResult.filter((cj) => !cj.suspended)
        : []
      
      const cronjobsOrdenados = cronjobsAtivos
        .map(cj => ({
          ...cj,
          proximaExecucao: calcularProximaExecucao(cj.schedule)
        }))
        .filter(cj => cj.proximaExecucao !== null)
        .sort((a, b) => {
          if (!a.proximaExecucao && !b.proximaExecucao) return 0
          if (!a.proximaExecucao) return 1
          if (!b.proximaExecucao) return -1
          return a.proximaExecucao.getTime() - b.proximaExecucao.getTime()
        })

      // Processar dados (mesma lógica do Dashboard)
      let instanciasAtivas = 0
      let execucoesPendentes = 0
      let falhasContainers = 0
      let rpasAtivos = 0
      const rpasRodando = new Set()
      const jobsContabilizados = new Set()
      const robotsList = []

      const cronjobsMap = new Map()
      if (Array.isArray(cronjobsOrdenados)) {
        cronjobsOrdenados.forEach(cj => {
          const nome = cj.name?.toLowerCase()
          if (nome) {
            const nomeBase = nome.replace(/-cronjob$/, '').replace(/^cronjob-/, '')
            cronjobsMap.set(nomeBase, true)
            cronjobsMap.set(nome, true)
          }
        })
      }

      const deploymentsMap = new Map()
      if (Array.isArray(deploymentsData)) {
        deploymentsData.forEach(dep => {
          const nome = dep.name?.toLowerCase()
          if (nome) {
            deploymentsMap.set(nome, true)
          }
        })
      }

      const determinarTipo = (nome) => {
        const nomeLower = nome.toLowerCase()
        if (nomeLower.includes('cronjob')) return 'Cronjob'
        if (cronjobsMap.has(nomeLower)) return 'Cronjob'
        const matchCronjob = nomeLower.match(/rpa-cronjob-(.+?)-(\d+)$/)
        if (matchCronjob) {
          const nomeBaseCronjob = matchCronjob[1]
          if (cronjobsMap.has(nomeBaseCronjob)) return 'Cronjob'
        }
        if (deploymentsMap.has(nomeLower)) return 'Deploy'
        return 'RPA'
      }

      const nomesAdicionados = new Set()

      // Processar jobs rodando
      const jobsStatusKeys = jobsStatusData && typeof jobsStatusData === 'object' ? Object.keys(jobsStatusData) : []
      jobsStatusKeys.forEach((nomeRpaKey) => {
        const status = jobsStatusData[nomeRpaKey]
        // Verificar se status existe e é um objeto válido
        if (!status || typeof status !== 'object') return
        // Verificar se running existe e é maior que 0
        const running = status.running
        if (!running || running <= 0) return
        
        const nomeComparacao = nomeRpaKey.toLowerCase().replace(/[-_]/g, '')
        const rpaExistente = (Array.isArray(rpasData) ? rpasData : []).find(rpa => {
          const nomeRpaComparacao = rpa.nome_rpa?.toLowerCase().replace(/[-_]/g, '')
          return nomeRpaComparacao === nomeComparacao || 
                 rpa.nome_rpa?.toLowerCase() === nomeRpaKey.toLowerCase()
        })
        
        const jaAdicionado = Array.from(nomesAdicionados).some(nome => {
          const nomeComp = nome.toLowerCase().replace(/[-_]/g, '')
          return nomeComp === nomeComparacao
        })
        
        if (!rpaExistente && !jaAdicionado) {
          // Garantir que status é válido antes de acessar propriedades
          if (!status || typeof status !== 'object') return
          
          const tipo = (status.tipo) ? status.tipo : determinarTipo(nomeRpaKey)
          let execucoes = 0
          let dependenteDeExecucoes = true

          if (tipo === 'Cronjob') {
            const cronjobCorrespondente = cronjobsOrdenados?.find(cj => {
              const nomeCjLower = cj.name?.toLowerCase()
              const nomeRpaLower = nomeRpaKey.toLowerCase()
              return nomeCjLower === nomeRpaLower || 
                     nomeCjLower?.includes(nomeRpaLower) ||
                     nomeRpaLower?.includes(nomeCjLower?.replace('rpa-cronjob-', '').replace('-cronjob', ''))
            })
            
            if (cronjobCorrespondente) {
              dependenteDeExecucoes = cronjobCorrespondente.dependente_de_execucoes !== false
              if (dependenteDeExecucoes) {
                execucoes = (status.execucoes_pendentes !== undefined && status.execucoes_pendentes !== null) ? status.execucoes_pendentes : 0
              }
            } else {
              execucoes = (status.execucoes_pendentes !== undefined && status.execucoes_pendentes !== null) ? status.execucoes_pendentes : 0
            }
          } else if (tipo === 'Deploy') {
            const deploymentCorrespondente = deploymentsData?.find(dep => {
              const nomeDepLower = dep.name?.toLowerCase()
              const nomeRpaLower = nomeRpaKey.toLowerCase()
              return nomeDepLower === nomeRpaLower || 
                     nomeDepLower?.includes(nomeRpaLower) ||
                     nomeRpaLower?.includes(nomeDepLower?.replace('deployment-', '').replace('-deployment', ''))
            })
            
            if (deploymentCorrespondente) {
              dependenteDeExecucoes = deploymentCorrespondente.dependente_de_execucoes !== false
              if (dependenteDeExecucoes) {
                execucoes = (status.execucoes_pendentes !== undefined && status.execucoes_pendentes !== null) ? status.execucoes_pendentes : 0
              }
            } else {
              execucoes = (status.execucoes_pendentes !== undefined && status.execucoes_pendentes !== null) ? status.execucoes_pendentes : 0
            }
          } else {
            execucoes = (status.execucoes_pendentes !== undefined && status.execucoes_pendentes !== null) ? status.execucoes_pendentes : 0
          }
          
          nomesAdicionados.add(nomeRpaKey)
          const nomeNormalizado = nomeRpaKey.toLowerCase().replace(/[-_]/g, '')
          if (nomeNormalizado) {
            rpasRodando.add(nomeNormalizado)
            jobsContabilizados.add(nomeNormalizado)
          }
          
          // Garantir que status é válido antes de acessar propriedades
          const runningValue = (status && typeof status === 'object' && status.running) ? status.running : 0
          const errorValue = (status && typeof status === 'object' && status.error) ? status.error : 0
          const failedValue = (status && typeof status === 'object' && status.failed) ? status.failed : 0
          
          instanciasAtivas += runningValue
          falhasContainers += errorValue + failedValue
          
          if (dependenteDeExecucoes && execucoes > 0) {
            execucoesPendentes += execucoes
          }
          
          robotsList.push({
            nome: formatarNome(nomeRpaKey),
            instancias: runningValue,
            status: 'Running',
            statusColor: 'success',
            execucoes: dependenteDeExecucoes ? execucoes : 'Rotina Sem Exec',
            tipo: tipo,
          })
        }
      })

      // Processar RPAs cadastrados
      if (Array.isArray(rpasData)) {
        rpasData.forEach((rpa) => {
          if (!rpa || typeof rpa !== 'object') return
          
          const nomeRpaLower = rpa.nome_rpa?.toLowerCase()
          const status = (jobsStatusData && typeof jobsStatusData === 'object') ? (
            jobsStatusData[nomeRpaLower] || 
            jobsStatusData[rpa.nome_rpa] || 
            jobsStatusData[nomeRpaLower?.replace('_', '-')] ||
            jobsStatusData[nomeRpaLower?.replace('-', '_')] ||
            {}
          ) : {}
          
          // Verificar se status é um objeto válido
          const statusValido = status && typeof status === 'object'
          
          const execucoesRpa = statusValido && status.execucoes_pendentes !== undefined 
            ? status.execucoes_pendentes 
            : (rpa.execucoes_pendentes || 0)
          execucoesPendentes += execucoesRpa
          
          instanciasAtivas += statusValido ? (status.running || 0) : 0
          falhasContainers += statusValido ? ((status.error || 0) + (status.failed || 0)) : 0
          
          if (statusValido && status.running > 0) {
            const nomeNormalizado = nomeRpaLower?.replace(/[-_]/g, '') || rpa.nome_rpa?.toLowerCase().replace(/[-_]/g, '')
            if (nomeNormalizado) {
              rpasRodando.add(nomeNormalizado)
              jobsContabilizados.add(nomeNormalizado)
            }
            
            // Adicionar à lista de robôs se ainda não foi adicionado
            const nomeOriginal = rpa.nome_rpa || ''
            const nomeComparacao = nomeOriginal.toLowerCase().replace(/[-_]/g, '')
            
            const jaExiste = Array.from(nomesAdicionados).some(nome => {
              const nomeComp = nome.toLowerCase().replace(/[-_]/g, '')
              return nomeComp === nomeComparacao
            })
            
            if (!jaExiste) {
              // Garantir que status é válido antes de acessar propriedades
              const tipo = (statusValido && status.tipo) ? status.tipo : 'RPA'
              const runningValue = (statusValido && status.running) ? status.running : 0
              nomesAdicionados.add(nomeOriginal)
              robotsList.push({
                nome: formatarNome(nomeOriginal) || 'N/A',
                instancias: runningValue,
                status: 'Running',
                statusColor: 'success',
                execucoes: execucoesRpa,
                tipo: tipo,
              })
            }
          }
        })
      }

      // Adicionar execuções pendentes de jobs não cadastrados
      jobsStatusKeys.forEach((nomeRpaKey) => {
        const status = jobsStatusData[nomeRpaKey]
        // Verificar se status existe e é um objeto válido
        if (!status || typeof status !== 'object') return
        
        const nomeNormalizado = nomeRpaKey.toLowerCase().replace(/[-_]/g, '')
        
        // Garantir que rpasData é um array antes de usar .find()
        const rpasArray = Array.isArray(rpasData) ? rpasData : []
        const jaContabilizado = jobsContabilizados.has(nomeNormalizado) || 
          rpasArray.find(rpa => {
            if (!rpa || typeof rpa !== 'object') return false
            const nomeRpaComparacao = rpa.nome_rpa?.toLowerCase().replace(/[-_]/g, '')
            return nomeRpaComparacao === nomeNormalizado || 
                   rpa.nome_rpa?.toLowerCase() === nomeRpaKey.toLowerCase()
          })
        
        if (!jaContabilizado) {
          // Garantir que status é válido antes de acessar propriedades
          if (!status || typeof status !== 'object') return
          
          const tipo = (status.tipo) ? status.tipo : determinarTipo(nomeRpaKey)
          let dependenteDeExecucoes = true
          
          if (tipo === 'Cronjob') {
            const cronjobCorrespondente = cronjobsOrdenados?.find(cj => {
              const nomeCjLower = cj.name?.toLowerCase()
              const nomeRpaLower = nomeRpaKey.toLowerCase()
              return nomeCjLower === nomeRpaLower || 
                     nomeCjLower?.includes(nomeRpaLower) ||
                     nomeRpaLower?.includes(nomeCjLower?.replace('rpa-cronjob-', '').replace('-cronjob', ''))
            })
            
            if (cronjobCorrespondente) {
              dependenteDeExecucoes = cronjobCorrespondente.dependente_de_execucoes !== false
            }
          } else if (tipo === 'Deploy') {
            const deploymentCorrespondente = deploymentsData?.find(dep => {
              const nomeDepLower = dep.name?.toLowerCase()
              const nomeRpaLower = nomeRpaKey.toLowerCase()
              return nomeDepLower === nomeRpaLower || 
                     nomeDepLower?.includes(nomeRpaLower) ||
                     nomeRpaLower?.includes(nomeDepLower?.replace('deployment-', '').replace('-deployment', ''))
            })
            
            if (deploymentCorrespondente) {
              dependenteDeExecucoes = deploymentCorrespondente.dependente_de_execucoes !== false
            }
          }
          
          if (dependenteDeExecucoes && status.execucoes_pendentes !== undefined && status.execucoes_pendentes !== null) {
            execucoesPendentes += status.execucoes_pendentes || 0
          }
          
          // Verificar se status tem as propriedades esperadas antes de acessar
          const running = status.running || 0
          const error = status.error || 0
          const failed = status.failed || 0
          
          instanciasAtivas += running
          falhasContainers += error + failed
          
          if (running > 0 && nomeNormalizado) {
            rpasRodando.add(nomeNormalizado)
            jobsContabilizados.add(nomeNormalizado)
          }
        }
      })

      rpasAtivos = rpasRodando.size

      const cronjobsAtivosCount = Array.isArray(cronjobsDataResult)
        ? cronjobsDataResult.filter((cj) => !cj.suspended).length
        : 0

      // Atualizar cache
      setCachedData(prev => ({
        ...prev,
        rpas: rpasData,
        jobsStatus: jobsStatusData,
        cronjobs: cronjobsOrdenados,
        deployments: deploymentsData,
        robots: robotsList,
        stats: {
          instanciasAtivas,
          execucoesPendentes,
          falhasContainers,
          rpasAtivos,
          cronjobsAtivos: cronjobsAtivosCount,
        },
      }))
    } catch (error) {
      const errorId = `DASH-ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      console.error(`[${errorId}] Erro ao carregar dados do dashboard:`, {
        errorId,
        message: error.message,
        stack: error.stack,
        error
      })
      // Em caso de erro, manter dados anteriores do cache para não quebrar a UI
      // O próximo ciclo tentará atualizar novamente
    } finally {
      // Sempre liberar o lock, mesmo em caso de erro
      dashboardLoadingRef.current = false
    }
  }

  // Ref para evitar requisições duplicadas simultâneas
  const vmResourcesLoadingRef = useRef(false)

  // Função para carregar recursos da VM
  const loadVMResources = async (isConnected) => {
    if (!isConnected) return
    
    // Evitar requisições duplicadas simultâneas
    if (vmResourcesLoadingRef.current) {
      console.log('[VM] Requisição já em andamento, ignorando duplicata')
      return
    }

    vmResourcesLoadingRef.current = true
    const requestId = `VM-REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    console.log(`[${requestId}] Carregando recursos da VM`)
    const startTime = Date.now()
    
    try {
      const resources = await api.getVMResources()
      const elapsed = Date.now() - startTime
      console.log(`[${requestId}] Recursos da VM carregados em ${elapsed}ms`)
      
      setCachedData(prev => {
        const now = new Date()
        const newMemoria = [...prev.resourcesHistory.memoria, {
          time: now,
          usado: resources.memoria.usada_gb,
          livre: resources.memoria.livre_gb
        }].slice(-10)
        
        const newArmazenamento = [...prev.resourcesHistory.armazenamento, {
          time: now,
          usado: resources.armazenamento.usado_gb,
          livre: resources.armazenamento.livre_gb
        }].slice(-10)
        
        const newCpu = [...prev.resourcesHistory.cpu, {
          time: now,
          usado: resources.cpu.usado,
          livre: resources.cpu.livre
        }].slice(-10)
        
        return {
          ...prev,
          vmResources: resources,
          resourcesHistory: {
            memoria: newMemoria,
            armazenamento: newArmazenamento,
            cpu: newCpu
          }
        }
      })
    } catch (error) {
      const elapsed = Date.now() - startTime
      console.error(`[${requestId}] Erro ao carregar recursos da VM (${elapsed}ms):`, {
        requestId,
        message: error.message,
        elapsed,
        error
      })
    } finally {
      // Sempre liberar o lock, mesmo em caso de erro
      vmResourcesLoadingRef.current = false
    }
  }

  // Inicializar intervalos quando o provider é montado
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true
      
      // Verificar conexão inicial e iniciar intervalos
      const checkAndStart = async () => {
        try {
          const status = await api.getConnectionStatus()
          const isConnected = status.ssh_connected && status.mysql_connected
          
          if (isConnected) {
            // Carregar dados iniciais
            await loadDashboardData(isConnected)
            await loadVMResources(isConnected)
          }
          
          // Iniciar intervalos mesmo se não estiver conectado (vai tentar reconectar)
          // Reduzir frequência para evitar sobrecarga - cache do backend já atualiza em background
          dataIntervalRef.current = setInterval(async () => {
            const intervalId = `INTERVAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            try {
              const status = await api.getConnectionStatus()
              const isConnected = status.ssh_connected && status.mysql_connected
              if (isConnected) {
                await loadDashboardData(isConnected)
              }
            } catch (error) {
              console.error(`[${intervalId}] Erro ao atualizar dados do dashboard:`, {
                intervalId,
                message: error.message,
                error
              })
            }
          }, 15000) // A cada 15 segundos (cache do backend atualiza a cada 10s)
          
          resourcesIntervalRef.current = setInterval(async () => {
            const intervalId = `VM-INTERVAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            try {
              const status = await api.getConnectionStatus()
              const isConnected = status.ssh_connected && status.mysql_connected
              if (isConnected) {
                await loadVMResources(isConnected)
              }
            } catch (error) {
              console.error(`[${intervalId}] Erro ao atualizar recursos da VM:`, {
                intervalId,
                message: error.message,
                error
              })
            }
          }, 15000) // A cada 15 segundos (cache do backend atualiza a cada 5s)
        } catch (error) {
          console.error('Erro ao verificar conexão inicial:', error)
        }
      }
      
      checkAndStart()
    }

    // Limpar intervalos apenas quando o componente for desmontado completamente
    return () => {
      if (dataIntervalRef.current) {
        clearInterval(dataIntervalRef.current)
        dataIntervalRef.current = null
      }
      if (resourcesIntervalRef.current) {
        clearInterval(resourcesIntervalRef.current)
        resourcesIntervalRef.current = null
      }
      isInitializedRef.current = false
    }
  }, [])

  // Função para forçar atualização manual
  const refreshData = async (isConnected) => {
    if (isConnected) {
      await loadDashboardData(isConnected)
      await loadVMResources(isConnected)
    }
  }

  const value = {
    cachedData,
    refreshData,
    loadDashboardData,
    loadVMResources,
  }

  return (
    <DashboardCacheContext.Provider value={value}>
      {children}
    </DashboardCacheContext.Provider>
  )
}

