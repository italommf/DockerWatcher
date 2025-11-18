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

    try {
      const [rpas, jobsStatus, cronjobsData, deployments] = await Promise.all([
        api.getRPAs(),
        api.getJobStatus(),
        api.getCronjobs(),
        api.getDeployments(),
      ])
      
      // Processar cronjobs
      const cronjobsAtivos = Array.isArray(cronjobsData)
        ? cronjobsData.filter((cj) => !cj.suspended)
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
      if (Array.isArray(deployments)) {
        deployments.forEach(dep => {
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
      Object.keys(jobsStatus).forEach((nomeRpaKey) => {
        const status = jobsStatus[nomeRpaKey]
        if (status.running > 0) {
          const nomeComparacao = nomeRpaKey.toLowerCase().replace(/[-_]/g, '')
          const rpaExistente = rpas.find(rpa => {
            const nomeRpaComparacao = rpa.nome_rpa?.toLowerCase().replace(/[-_]/g, '')
            return nomeRpaComparacao === nomeComparacao || 
                   rpa.nome_rpa?.toLowerCase() === nomeRpaKey.toLowerCase()
          })
          
          const jaAdicionado = Array.from(nomesAdicionados).some(nome => {
            const nomeComp = nome.toLowerCase().replace(/[-_]/g, '')
            return nomeComp === nomeComparacao
          })
          
          if (!rpaExistente && !jaAdicionado) {
            const tipo = status.tipo || determinarTipo(nomeRpaKey)
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
                  execucoes = status.execucoes_pendentes !== undefined ? status.execucoes_pendentes : 0
                }
              } else {
                execucoes = status.execucoes_pendentes !== undefined ? status.execucoes_pendentes : 0
              }
            } else if (tipo === 'Deploy') {
              const deploymentCorrespondente = deployments?.find(dep => {
                const nomeDepLower = dep.name?.toLowerCase()
                const nomeRpaLower = nomeRpaKey.toLowerCase()
                return nomeDepLower === nomeRpaLower || 
                       nomeDepLower?.includes(nomeRpaLower) ||
                       nomeRpaLower?.includes(nomeDepLower?.replace('deployment-', '').replace('-deployment', ''))
              })
              
              if (deploymentCorrespondente) {
                dependenteDeExecucoes = deploymentCorrespondente.dependente_de_execucoes !== false
                if (dependenteDeExecucoes) {
                  execucoes = status.execucoes_pendentes !== undefined ? status.execucoes_pendentes : 0
                }
              } else {
                execucoes = status.execucoes_pendentes !== undefined ? status.execucoes_pendentes : 0
              }
            } else {
              execucoes = status.execucoes_pendentes !== undefined ? status.execucoes_pendentes : 0
            }
            
            nomesAdicionados.add(nomeRpaKey)
            const nomeNormalizado = nomeRpaKey.toLowerCase().replace(/[-_]/g, '')
            if (nomeNormalizado) {
              rpasRodando.add(nomeNormalizado)
              jobsContabilizados.add(nomeNormalizado)
            }
            
            instanciasAtivas += status.running || 0
            falhasContainers += (status.error || 0) + (status.failed || 0)
            
            if (dependenteDeExecucoes && execucoes > 0) {
              execucoesPendentes += execucoes
            }
            
            robotsList.push({
              nome: formatarNome(nomeRpaKey),
              instancias: status.running || 0,
              status: 'Running',
              statusColor: 'success',
              execucoes: dependenteDeExecucoes ? execucoes : 'Rotina Sem Exec',
              tipo: tipo,
            })
          }
        }
      })

      // Processar RPAs cadastrados
      if (Array.isArray(rpas)) {
        rpas.forEach((rpa) => {
          const nomeRpaLower = rpa.nome_rpa?.toLowerCase()
          const status = jobsStatus[nomeRpaLower] || 
                        jobsStatus[rpa.nome_rpa] || 
                        jobsStatus[nomeRpaLower?.replace('_', '-')] ||
                        jobsStatus[nomeRpaLower?.replace('-', '_')] ||
                        {}
          
          const execucoesRpa = status.execucoes_pendentes !== undefined 
            ? status.execucoes_pendentes 
            : (rpa.execucoes_pendentes || 0)
          execucoesPendentes += execucoesRpa
          
          instanciasAtivas += status.running || 0
          falhasContainers += (status.error || 0) + (status.failed || 0)
          
          if (status.running > 0) {
            const nomeNormalizado = nomeRpaLower?.replace(/[-_]/g, '') || rpa.nome_rpa?.toLowerCase().replace(/[-_]/g, '')
            if (nomeNormalizado) {
              rpasRodando.add(nomeNormalizado)
              jobsContabilizados.add(nomeNormalizado)
            }
          }

          if (status.running > 0) {
            const nomeOriginal = rpa.nome_rpa || ''
            const nomeComparacao = nomeOriginal.toLowerCase().replace(/[-_]/g, '')
            
            const jaExiste = Array.from(nomesAdicionados).some(nome => {
              const nomeComp = nome.toLowerCase().replace(/[-_]/g, '')
              return nomeComp === nomeComparacao
            })
            
            if (!jaExiste) {
              const tipo = status.tipo || 'RPA'
              nomesAdicionados.add(nomeOriginal)
              robotsList.push({
                nome: formatarNome(nomeOriginal) || 'N/A',
                instancias: status.running || 0,
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
      Object.keys(jobsStatus).forEach((nomeRpaKey) => {
        const status = jobsStatus[nomeRpaKey]
        const nomeNormalizado = nomeRpaKey.toLowerCase().replace(/[-_]/g, '')
        
        const jaContabilizado = jobsContabilizados.has(nomeNormalizado) || 
          (rpas && rpas.find(rpa => {
            const nomeRpaComparacao = rpa.nome_rpa?.toLowerCase().replace(/[-_]/g, '')
            return nomeRpaComparacao === nomeNormalizado || 
                   rpa.nome_rpa?.toLowerCase() === nomeRpaKey.toLowerCase()
          }))
        
        if (!jaContabilizado) {
          const tipo = status.tipo || determinarTipo(nomeRpaKey)
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
            const deploymentCorrespondente = deployments?.find(dep => {
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
          
          if (dependenteDeExecucoes && status.execucoes_pendentes !== undefined) {
            execucoesPendentes += status.execucoes_pendentes || 0
          }
          
          instanciasAtivas += status.running || 0
          falhasContainers += (status.error || 0) + (status.failed || 0)
          
          if (status.running > 0 && nomeNormalizado) {
            rpasRodando.add(nomeNormalizado)
            jobsContabilizados.add(nomeNormalizado)
          }
        }
      })

      rpasAtivos = rpasRodando.size

      const cronjobsAtivosCount = Array.isArray(cronjobsData)
        ? cronjobsData.filter((cj) => !cj.suspended).length
        : 0

      // Atualizar cache
      setCachedData(prev => ({
        ...prev,
        rpas,
        jobsStatus,
        cronjobs: cronjobsOrdenados,
        deployments,
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
      console.error('Erro ao carregar dados do dashboard:', error)
    }
  }

  // Função para carregar recursos da VM
  const loadVMResources = async (isConnected) => {
    if (!isConnected) return
    
    try {
      const resources = await api.getVMResources()
      
      setCachedData(prev => {
        const now = new Date()
        const newMemoria = [...prev.resourcesHistory.memoria, {
          time: now,
          usado: resources.memoria.usada_gb,
          livre: resources.memoria.livre_gb
        }].slice(-10)
        
        const newArmazenamento = [...prev.resourcesHistory.armazenamento, {
          time: now,
          usado: resources.armazenamento.usada_gb,
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
      console.error('Erro ao carregar recursos da VM:', error)
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
          dataIntervalRef.current = setInterval(async () => {
            try {
              const status = await api.getConnectionStatus()
              const isConnected = status.ssh_connected && status.mysql_connected
              if (isConnected) {
                await loadDashboardData(isConnected)
              }
            } catch (error) {
              console.error('Erro ao atualizar dados do dashboard:', error)
            }
          }, 10000) // A cada 10 segundos
          
          resourcesIntervalRef.current = setInterval(async () => {
            try {
              const status = await api.getConnectionStatus()
              const isConnected = status.ssh_connected && status.mysql_connected
              if (isConnected) {
                await loadVMResources(isConnected)
              }
            } catch (error) {
              console.error('Erro ao atualizar recursos da VM:', error)
            }
          }, 10000) // A cada 10 segundos
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

