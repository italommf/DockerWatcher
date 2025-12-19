import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react'
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
  const lastDashboardLoadRef = useRef(0) // Timestamp da última requisição do dashboard

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

    // Throttle: não permitir requisições mais frequentes que 5 segundos
    const now = Date.now()
    const timeSinceLastLoad = now - lastDashboardLoadRef.current
    if (timeSinceLastLoad < 5000) {
      console.log(`[DASHBOARD] Throttle ativo - última requisição há ${timeSinceLastLoad}ms, ignorando`)
      return
    }

    // Evitar requisições duplicadas simultâneas
    if (dashboardLoadingRef.current) {
      console.log('[DASHBOARD] Requisição já em andamento, ignorando duplicata')
      return
    }

    dashboardLoadingRef.current = true
    lastDashboardLoadRef.current = now
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
        api.getCronjobsFromKubernetes().catch(err => {
          console.warn(`[${requestId}] Erro ao carregar cronjobs do Kubernetes:`, err.message || err)
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

      // NOVO: Calcular totais globais antecipadamente (Backend já traz tudo unificado)
      const jobsStatusKeys = jobsStatusData && typeof jobsStatusData === 'object' ? Object.keys(jobsStatusData) : []
      jobsStatusKeys.forEach(key => {
        const s = jobsStatusData[key];
        if (s && typeof s === 'object') {
          instanciasAtivas += (s.running || 0);
          falhasContainers += (s.error || 0) + (s.failed || 0);
          execucoesPendentes += (s.execucoes_pendentes || 0);

          if ((s.running || 0) > 0) {
            const nomeNormalizado = key.toLowerCase().replace(/[-_\s]/g, '');
            if (nomeNormalizado) {
              rpasRodando.add(nomeNormalizado);
              jobsContabilizados.add(nomeNormalizado);
            }
          }
        }
      });
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

      console.log('[DASHBOARD_DEBUG] Chaves de status recebidas:', jobsStatusKeys)

      jobsStatusKeys.forEach((nomeRpaKey) => {
        const status = jobsStatusData[nomeRpaKey]
        // Verificar se status existe e é um objeto válido
        if (!status || typeof status !== 'object') return
        // Verificar se running existe e é maior que 0
        const running = status.running
        console.log(`[DASHBOARD_DEBUG] Processando RPA '${nomeRpaKey}': running=${running}`)

        if (!running || running <= 0) return

        console.log(`[DASHBOARD_DEBUG] RPA: ${nomeRpaKey}, Status:`, status)

        const nomeComparacao = nomeRpaKey.toLowerCase().replace(/[-_\s]/g, '')
        const rpaExistente = (Array.isArray(rpasData) ? rpasData : []).find(rpa => {
          const nomeRpaComparacao = rpa.nome_rpa?.toLowerCase().replace(/[-_\s]/g, '')
          return nomeRpaComparacao === nomeComparacao ||
            rpa.nome_rpa?.toLowerCase() === nomeRpaKey.toLowerCase()
        })

        const jaAdicionado = Array.from(nomesAdicionados).some(nome => {
          const nomeComp = nome.toLowerCase().replace(/[-_\s]/g, '')
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
              const nomeCjNorm = cj.name?.toLowerCase().replace(/[-_\s]/g, '')
              const nomeRpaNorm = nomeRpaKey.toLowerCase().replace(/[-_\s]/g, '')
              return nomeCjNorm === nomeRpaNorm ||
                nomeCjNorm?.includes(nomeRpaNorm) ||
                nomeRpaNorm?.includes(nomeCjNorm?.replace('rpacronjob', '').replace('cronjob', ''))
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
              const nomeDepNorm = dep.name?.toLowerCase().replace(/[-_\s]/g, '')
              const nomeRpaNorm = nomeRpaKey.toLowerCase().replace(/[-_\s]/g, '')
              return nomeDepNorm === nomeRpaNorm ||
                nomeDepNorm?.includes(nomeRpaNorm) ||
                nomeRpaNorm?.includes(nomeDepNorm?.replace('deployment', '').replace('deployment', ''))
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

          // Contagem de totais movida para início do arquivo


          robotsList.push({
            nome: status.apelido || formatarNome(nomeRpaKey),  // Usar apelido se disponível
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
          // Contagem de totais movida para início do arquivo


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

              // Usar apelido se disponível, senão usar do backend ou formatar nome
              const displayName = rpa.apelido || (statusValido && status.apelido) || formatarNome(nomeOriginal) || 'N/A'

              robotsList.push({
                nome: displayName,
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

          // Contagem de totais movida para início do arquivo


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
  const lastVMResourcesLoadRef = useRef(0)

  // Função para carregar recursos da VM
  const loadVMResources = async (isConnected) => {
    if (!isConnected) return

    // Throttle: não permitir requisições mais frequentes que 5 segundos
    const now = Date.now()
    const timeSinceLastLoad = now - lastVMResourcesLoadRef.current
    if (timeSinceLastLoad < 5000) {
      console.log(`[VM] Throttle ativo - última requisição há ${timeSinceLastLoad}ms, ignorando`)
      return
    }

    // Evitar requisições duplicadas simultâneas
    if (vmResourcesLoadingRef.current) {
      console.log('[VM] Requisição já em andamento, ignorando duplicata')
      return
    }

    vmResourcesLoadingRef.current = true
    lastVMResourcesLoadRef.current = now
    const requestId = `VM-REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    console.log(`[${requestId}] Carregando recursos da VM`)
    const startTime = Date.now()

    try {
      const resources = await api.getVMResources()
      const elapsed = Date.now() - startTime
      console.log(`[${requestId}] Recursos da VM carregados em ${elapsed}ms`)

      setCachedData(prev => {
        const now = new Date()
        // Manter pontos suficientes para 7 dias de dados (a cada 10 segundos = 60480 pontos)
        // Para economizar memória, limitamos a 60480 pontos (7 dias)
        const MAX_POINTS = 60480

        const newMemoria = [...prev.resourcesHistory.memoria, {
          time: now,
          usado: resources.memoria.usada_gb,
          livre: resources.memoria.livre_gb
        }].slice(-MAX_POINTS)

        const newArmazenamento = [...prev.resourcesHistory.armazenamento, {
          time: now,
          usado: resources.armazenamento.usado_gb,
          livre: resources.armazenamento.livre_gb
        }].slice(-MAX_POINTS)

        const newCpu = [...prev.resourcesHistory.cpu, {
          time: now,
          usado: resources.cpu.usado,
          livre: resources.cpu.livre
        }].slice(-MAX_POINTS)

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
    // Proteção dupla contra inicialização múltipla
    if (isInitializedRef.current) {
      console.log('[DASHBOARD CACHE] Já inicializado, ignorando nova inicialização')
      return
    }

    isInitializedRef.current = true
    console.log('[DASHBOARD CACHE] Inicializando pela primeira vez...')

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
        }, 10000) // A cada 10 segundos (sincronizado com o backend)

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
        }, 10000) // A cada 10 segundos (sincronizado com o backend)
      } catch (error) {
        console.error('Erro ao verificar conexão inicial:', error)
      }
    }

    checkAndStart()

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

  // Função para forçar atualização manual (usar useCallback para evitar re-criação)
  const refreshData = useCallback(async (isConnected) => {
    if (isConnected) {
      console.log('[DASHBOARD CACHE] refreshData chamado manualmente')
      await loadDashboardData(isConnected)
      await loadVMResources(isConnected)
    }
  }, []) // Dependências vazias porque as funções já têm suas próprias proteções

  const value = useMemo(() => ({
    cachedData,
    refreshData,
    loadDashboardData,
    loadVMResources,
  }), [cachedData, refreshData])

  return (
    <DashboardCacheContext.Provider value={value}>
      {children}
    </DashboardCacheContext.Provider>
  )
}

