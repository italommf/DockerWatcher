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
    pods: [],
    jobs: [],
    failedPods: [],
    executions: [],
    robots: [],
    stats: {
      instanciasAtivas: 0,
      execucoesPendentes: 0,
      falhasContainers: 0,
      rpasAtivos: 0,
      cronjobsAtivos: 0,
      deploymentsAtivos: 0,
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
      if (parts.length < 5) {
        console.warn('[CALCULAR] Schedule inválido (menos de 5 partes):', schedule)
        return null
      }

      const now = new Date()
      const [minuto, hora, dia, mes, diaSemana] = parts

      // Função auxiliar para parsear valores de cron (intervalos, ranges, listas)
      const parseCronValue = (value, max) => {
        if (value === '*') return { type: 'any' }
        if (value.includes('/')) {
          const [base, step] = value.split('/')
          const stepNum = parseInt(step)
          if (isNaN(stepNum)) return null
          return { type: 'interval', step: stepNum }
        }
        if (value.includes('-')) {
          const [start, end] = value.split('-').map(v => parseInt(v))
          if (isNaN(start) || isNaN(end)) return null
          return { type: 'range', start, end }
        }
        if (value.includes(',')) {
          const values = value.split(',').map(v => parseInt(v)).filter(v => !isNaN(v))
          return values.length > 0 ? { type: 'list', values } : null
        }
        const num = parseInt(value)
        return isNaN(num) ? null : { type: 'single', value: num }
      }

      let proxima = new Date(now)
      proxima.setSeconds(0)
      proxima.setMilliseconds(0)

      const minutoParsed = parseCronValue(minuto, 59)
      const horaParsed = parseCronValue(hora, 23)
      const diaParsed = parseCronValue(dia, 31)

      // Caso simples: valores únicos
      if (minutoParsed?.type === 'single' && horaParsed?.type === 'single') {
        proxima.setMinutes(minutoParsed.value)
        proxima.setHours(horaParsed.value)

        if (proxima <= now) {
          proxima.setDate(proxima.getDate() + 1)
        }

        if (diaParsed?.type === 'single') {
          const diaMes = diaParsed.value
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
            proxima.setHours(horaParsed.value)
            proxima.setMinutes(minutoParsed.value)
          }
        }

        if (proxima <= now) {
          proxima.setDate(proxima.getDate() + 1)
        }

        return proxima
      }

      // Caso com intervalos: */30
      if (minutoParsed?.type === 'interval') {
        const step = minutoParsed.step
        const minutoAtual = now.getMinutes()
        const proximoMinuto = Math.ceil((minutoAtual + 1) / step) * step

        if (proximoMinuto < 60) {
          proxima.setMinutes(proximoMinuto)
          proxima.setHours(now.getHours())
        } else {
          proxima.setMinutes(0)
          proxima.setHours(now.getHours() + 1)
        }

        if (horaParsed?.type === 'range') {
          const horaAtual = proxima.getHours()
          if (horaAtual < horaParsed.start) {
            proxima.setHours(horaParsed.start)
            proxima.setMinutes(0)
          } else if (horaAtual > horaParsed.end) {
            proxima.setDate(proxima.getDate() + 1)
            proxima.setHours(horaParsed.start)
            proxima.setMinutes(0)
          }
        }

        if (proxima <= now) {
          proxima.setMinutes(proxima.getMinutes() + step)
          if (proxima.getMinutes() >= 60) {
            proxima.setHours(proxima.getHours() + 1)
            proxima.setMinutes(proxima.getMinutes() % 60)
          }
        }

        return proxima
      }

      // Caso com lista: 0,30
      if (minutoParsed?.type === 'list') {
        const minutoAtual = now.getMinutes()
        const proximoMinutoValido = minutoParsed.values.find(m => m > minutoAtual) || minutoParsed.values[0]

        if (proximoMinutoValido > minutoAtual) {
          proxima.setMinutes(proximoMinutoValido)
          proxima.setHours(now.getHours())
        } else {
          proxima.setMinutes(minutoParsed.values[0])
          proxima.setHours(now.getHours() + 1)
        }

        if (horaParsed?.type === 'range') {
          const horaAtual = proxima.getHours()
          if (horaAtual < horaParsed.start) {
            proxima.setHours(horaParsed.start)
            proxima.setMinutes(minutoParsed.values[0])
          } else if (horaAtual > horaParsed.end) {
            proxima.setDate(proxima.getDate() + 1)
            proxima.setHours(horaParsed.start)
            proxima.setMinutes(minutoParsed.values[0])
          }
        }

        if (proxima <= now) {
          proxima.setMinutes(minutoParsed.values[0])
          proxima.setHours(proxima.getHours() + 1)
        }

        return proxima
      }

      // Fallback
      console.warn('[CALCULAR] Schedule complexo não totalmente suportado, usando aproximação:', schedule)
      proxima = new Date(now.getTime() + 60 * 60 * 1000)
      return proxima

    } catch (e) {
      console.error('[CALCULAR] Erro ao calcular próxima execução:', e, schedule)
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

    // Throttle: não permitir requisições mais frequentes que 3 segundos, a menos que seja forçado
    const now = Date.now()
    const timeSinceLastLoad = now - lastDashboardLoadRef.current
    if (timeSinceLastLoad < 3000) {
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

  // NOVO: Função otimizada que usa endpoint consolidado (5 chamadas -> 1)
  const loadDashboardDataFast = async (isConnected, force = false) => {
    if (!isConnected) return

    // Throttle: não permitir requisições mais frequentes que 3 segundos, a menos que seja forçado
    const now = Date.now()
    const timeSinceLastLoad = now - lastDashboardLoadRef.current
    if (!force && timeSinceLastLoad < 3000) {
      console.log(`[DASHBOARD-FAST] Throttle ativo - última requisição há ${timeSinceLastLoad}ms, ignorando`)
      return
    }

    // Evitar requisições duplicadas simultâneas
    if (dashboardLoadingRef.current) {
      console.log('[DASHBOARD-FAST] Requisição já em andamento, ignorando duplicata')
      return
    }

    dashboardLoadingRef.current = true
    lastDashboardLoadRef.current = now
    const requestId = `FAST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const startTime = Date.now()

    try {
      console.log(`[${requestId}] Iniciando carregamento via endpoint consolidado`)

      // UMA ÚNICA CHAMADA em vez de 4-5 paralelas
      const dashboardData = await api.getDashboardFull()

      const elapsed = Date.now() - startTime
      console.log(`[${requestId}] Dashboard consolidado carregado em ${elapsed}ms`)

      // Extrair dados da resposta consolidada
      const {
        vm_resources: vmResources,
        stats,
        robots_running: robotsRunning,
        cronjobs_proximos: cronjobsProximos,
        cache_stats: cacheStats
      } = dashboardData

      // Mapear robôs rodando para o formato esperado pelo frontend
      const robotsList = (robotsRunning || []).map(robot => ({
        nome: robot.nome || robot.nome_rpa,
        instancias: robot.instancias || 0,
        status: 'Running',
        statusColor: 'success',
        execucoes: robot.execucoes_pendentes || 0,
        tipo: robot.tipo || 'RPA',
      }))

      // Mapear cronjobs para o formato com proximaExecucao (lista completa)
      // Usar full_data.cronjobs preferencialmente por ser a lista completa
      console.log(`[${requestId}] DEBUG - dashboardData recebido:`, {
        hasFullData: !!dashboardData.full_data,
        hasCronjobsInFullData: !!dashboardData.full_data?.cronjobs,
        cronjobsInFullData: dashboardData.full_data?.cronjobs?.length || 0,
        hasCronjobsProximos: !!dashboardData.cronjobs_proximos,
        cronjobsProximos: dashboardData.cronjobs_proximos?.length || 0,
        fullDataKeys: dashboardData.full_data ? Object.keys(dashboardData.full_data) : []
      })

      const cronjobsList = dashboardData.full_data?.cronjobs || dashboardData.cronjobs_proximos || []
      console.log(`[${requestId}] Cronjobs recebidos do backend: ${cronjobsList.length}`, cronjobsList.map(cj => ({
        name: cj.name,
        schedule: cj.schedule,
        suspended: cj.suspended,
        hasSchedule: !!cj.schedule
      })))

      // NÃO filtrar por proximaExecucao - mostrar TODOS os cronjobs não suspensos
      // Mesmo que não consiga calcular a próxima execução, deve aparecer
      const cronjobsCompleto = cronjobsList
        .filter(cj => !cj.suspended) // Filtrar apenas os não suspensos
        .map(cj => {
          const proximaExecucao = calcularProximaExecucao(cj.schedule)
          return {
            ...cj,
            proximaExecucao: proximaExecucao || new Date(Date.now() + 3600000) // Fallback: 1 hora se não conseguir calcular
          }
        })
        .sort((a, b) => {
          // Ordenar por próxima execução (mais próximo primeiro)
          if (!a.proximaExecucao && !b.proximaExecucao) return 0
          if (!a.proximaExecucao) return 1
          if (!b.proximaExecucao) return -1
          return a.proximaExecucao.getTime() - b.proximaExecucao.getTime()
        })
        .slice(0, 10) // Top 10 próximos

      console.log(`[${requestId}] Processando ${cronjobsCompleto.length} cronjobs válidos para o cache (após filtrar suspensos)`)

      // Atualizar cache com dados consolidados
      setCachedData(prev => {
        const newData = {
          ...prev,
          rpas: dashboardData.full_data?.rpas || prev.rpas,
          cronjobs: cronjobsCompleto.length > 0 ? cronjobsCompleto : prev.cronjobs,
          deployments: dashboardData.full_data?.deployments || prev.deployments,
          pods: dashboardData.pods || prev.pods || [],
          jobs: dashboardData.jobs || prev.jobs || [],
          robots: robotsList.length > 0 ? robotsList : prev.robots,
          vmResources: vmResources || prev.vmResources,
          stats: {
            instanciasAtivas: stats?.instancias_ativas ?? prev.stats?.instanciasAtivas ?? 0,
            execucoesPendentes: stats?.execucoes_pendentes ?? prev.stats?.execucoesPendentes ?? 0,
            falhasContainers: stats?.falhas_containers ?? prev.stats?.falhasContainers ?? 0,
            rpasAtivos: stats?.rpas_ativos ?? prev.stats?.rpasAtivos ?? 0,
            cronjobsAtivos: stats?.cronjobs_ativos ?? prev.stats?.cronjobsAtivos ?? 0,
            deploymentsAtivos: stats?.deployments_ativos ?? prev.stats?.deploymentsAtivos ?? 0,
          },
        }

        // Atualizar histórico de recursos se houver novos dados
        if (vmResources) {
          newData.resourcesHistory = {
            ...prev.resourcesHistory,
            memoria: vmResources.memoria ? [...(prev.resourcesHistory?.memoria || []).slice(-29), {
              time: new Date(),
              usado: vmResources.memoria.usada_gb || 0,
              livre: vmResources.memoria.livre_gb || 0
            }] : prev.resourcesHistory?.memoria || [],
            cpu: vmResources.cpu ? [...(prev.resourcesHistory?.cpu || []).slice(-29), {
              time: new Date(),
              usado: vmResources.cpu.usado || 0,
              livre: vmResources.cpu.livre || 100
            }] : prev.resourcesHistory?.cpu || [],
          }
        }

        return newData
      })

      console.log(`[${requestId}] Cache atualizado via endpoint consolidado`)

    } catch (error) {
      console.error(`[${requestId}] Erro no endpoint consolidado:`, error.message)
      // Se falhar e rpas for null (primeira carga), mudar para [] para tirar loading
      setCachedData(prev => ({
        ...prev,
        rpas: prev.rpas === null ? [] : prev.rpas,
        cronjobs: prev.cronjobs === null ? [] : prev.cronjobs,
        deployments: prev.deployments === null ? [] : prev.deployments,
      }))

      // Tentar fallback se não for um erro de conexão completa
      if (isConnected) {
        await loadDashboardData(isConnected)
      }
    } finally {
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
        const isConnected = status.k8s_connected && status.mysql_connected

        if (isConnected) {
          // Carregar dados iniciais - OTIMIZADO: usa endpoint consolidado
          // USAR force=true para carregar IMEDIATAMENTE ao iniciar
          await loadDashboardDataFast(isConnected, true)
        }

        // REMOVIDO: setInterval de polling agressivo.
        // Agora confiamos apenas no SSE para atualizações em tempo real.
        // E no getConnectionStatus apenas se houver falha de rede detectada.
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
  // OTIMIZADO: Usa endpoint consolidado por padrão (5 chamadas -> 1)
  const refreshData = useCallback(async (isConnected, force = false) => {
    if (isConnected) {
      console.log(`[DASHBOARD CACHE] refreshData chamado (force=${force}) - usando endpoint consolidado`)
      await loadDashboardDataFast(isConnected, force)
    }
  }, []) // Dependências vazias porque as funções já têm suas próprias proteções

  const value = useMemo(() => ({
    cachedData,
    refreshData,
    loadDashboardData,
    loadDashboardDataFast,  // Nova função otimizada
    loadVMResources,
  }), [cachedData, refreshData])

  return (
    <DashboardCacheContext.Provider value={value}>
      {children}
    </DashboardCacheContext.Provider>
  )
}

