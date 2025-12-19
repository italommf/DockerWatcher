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
import {
  Refresh as RefreshIcon,
  AccessTime as AccessTimeIcon,
  SmartToy as SmartToyIcon,
  AllInclusive as AllInclusiveIcon,
  PlayArrow as PlayArrowIcon
} from '@mui/icons-material'
import api from '../services/api'
import { useSnackbar } from 'notistack'
import { useDashboardCache } from '../context/DashboardCacheContext'
import ResourceAreaChart from '../components/ResourceAreaChart'
import ContainerResourcesList from '../components/ContainerResourcesList'

// Função para calcular próxima execução baseada no cron schedule
function calcularProximaExecucao(schedule) {
  if (!schedule) return null

  try {
    // Parsear cron expression (formato: minuto hora dia mês dia-da-semana)
    // Exemplo: "0 18 1 * *" = todo dia 1 às 18:00
    const parts = schedule.trim().split(/\s+/)
    if (parts.length < 5) return null

    const now = new Date()
    const [minuto, hora, dia, mes, diaSemana] = parts

    // Criar data para próxima execução (começar de hoje)
    let proxima = new Date(now)
    proxima.setSeconds(0)
    proxima.setMilliseconds(0)

    // Se minuto e hora são específicos
    if (minuto !== '*' && hora !== '*') {
      const minutoInt = parseInt(minuto) || 0
      const horaInt = parseInt(hora) || 0

      proxima.setMinutes(minutoInt)
      proxima.setHours(horaInt)

      // Se já passou hoje, tentar amanhã
      if (proxima <= now) {
        proxima.setDate(proxima.getDate() + 1)
      }

      // Se dia do mês é específico
      if (dia !== '*') {
        const diaMes = parseInt(dia)
        if (!isNaN(diaMes)) {
          // Ajustar para o dia específico do mês
          const hoje = now.getDate()
          if (diaMes >= hoje) {
            // Se o dia ainda não passou este mês
            proxima.setDate(diaMes)
            if (proxima <= now) {
              // Se já passou, ir para o próximo mês
              proxima.setMonth(proxima.getMonth() + 1)
              // Ajustar para o dia correto (pode precisar ajustar se o mês não tem esse dia)
              const ultimoDiaMes = new Date(proxima.getFullYear(), proxima.getMonth() + 1, 0).getDate()
              proxima.setDate(Math.min(diaMes, ultimoDiaMes))
            }
          } else {
            // Se o dia já passou, ir para o próximo mês
            proxima.setMonth(proxima.getMonth() + 1)
            const ultimoDiaMes = new Date(proxima.getFullYear(), proxima.getMonth() + 1, 0).getDate()
            proxima.setDate(Math.min(diaMes, ultimoDiaMes))
            proxima.setHours(horaInt)
            proxima.setMinutes(minutoInt)
          }
        }
      }

      // Verificar se ainda está no passado (caso de ajustes de mês)
      if (proxima <= now) {
        // Se ainda está no passado, adicionar mais um dia
        proxima.setDate(proxima.getDate() + 1)
      }
    } else {
      // Para schedules mais complexos ou com wildcards, usar uma aproximação
      // Adicionar 1 hora como fallback
      proxima = new Date(now.getTime() + 60 * 60 * 1000)
    }

    return proxima
  } catch (e) {
    console.error('Erro ao calcular próxima execução:', e, schedule)
    return null
  }
}

// Função para formatar contagem regressiva
function formatarContagemRegressiva(dataFutura) {
  if (!dataFutura) return 'N/A'

  const agora = new Date()
  const diff = dataFutura.getTime() - agora.getTime()

  if (diff <= 0) return 'Agora'

  const dias = Math.floor(diff / (1000 * 60 * 60 * 24))
  const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  const partes = []
  if (dias > 0) partes.push(`${dias} ${dias === 1 ? 'dia' : 'dias'}`)
  if (horas > 0) partes.push(`${horas} ${horas === 1 ? 'hora' : 'horas'}`)
  if (minutos > 0) partes.push(`${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`)

  if (partes.length === 0) return 'Menos de 1 minuto'

  if (partes.length === 1) return partes[0]
  if (partes.length === 2) return `${partes[0]} e ${partes[1]}`
  return `${partes[0]}, ${partes[1]} e ${partes[2]}`
}

// Função para formatar nome: substituir - e _ por espaços e capitalizar palavras
function formatarNome(nome) {
  if (!nome) return nome
  // Substituir hífens e underscores por espaços
  let formatado = nome.replace(/[-_]/g, ' ')
  // Capitalizar primeira letra de cada palavra
  formatado = formatado.split(' ')
    .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
    .join(' ')

  // Remover "RPA" e "CRONJOB"/"CONJOB" se forem as duas primeiras palavras
  const palavras = formatado.split(' ')
  if (palavras.length >= 2) {
    const primeira = palavras[0].toLowerCase()
    const segunda = palavras[1].toLowerCase()

    if ((primeira === 'rpa' && (segunda === 'cronjob' || segunda === 'conjob')) ||
      ((primeira === 'cronjob' || primeira === 'conjob') && segunda === 'rpa')) {
      // Remover as duas primeiras palavras
      palavras.splice(0, 2)
      formatado = palavras.join(' ').trim()
    }
  }

  return formatado
}

// Componente de contagem regressiva
function ContagemRegressiva({ dataFutura }) {
  const [tempoRestante, setTempoRestante] = useState(formatarContagemRegressiva(dataFutura))

  useEffect(() => {
    const interval = setInterval(() => {
      setTempoRestante(formatarContagemRegressiva(dataFutura))
    }, 60000) // Atualizar a cada minuto

    return () => clearInterval(interval)
  }, [dataFutura])

  return <span>{tempoRestante}</span>
}

// Componente de gráfico de linha com área preenchida
function LineChart({ title, data, maxValue, unit = 'GB' }) {
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const width = 800
  const height = 180
  const padding = 30

  if (!data || data.length === 0) {
    return (
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 1.5 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ color: '#F8FAFC', fontSize: '0.875rem', mb: 1 }}>
            {title}
          </Typography>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" sx={{ color: '#CBD5E1', fontSize: '0.75rem' }}>
              Aguardando dados...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    )
  }

  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  // Normalizar dados para o gráfico
  // O gráfico mostra a porcentagem de recurso usado (0% na base, 100% no topo)
  const normalizedData = data.map((point, index) => {
    const divisor = data.length > 1 ? data.length - 1 : 1
    const x = padding + (index / divisor) * chartWidth

    // Calcular porcentagem de recurso usado (0 a 100%)
    const porcentagemUsado = maxValue > 0
      ? Math.max(0, Math.min(100, ((point.usado || 0) / maxValue) * 100))
      : 0

    // Converter porcentagem para posição Y (0% na base, 100% no topo)
    // y = padding + chartHeight quando porcentagem = 0%
    // y = padding quando porcentagem = 100%
    const y = padding + chartHeight - (porcentagemUsado / 100) * chartHeight

    return {
      x,
      y,
      value: point.usado || 0,
      livre: point.livre || 0,
      porcentagemUsado,
      originalData: point
    }
  })

  // Calcular posições Y para as linhas de limite (80% e 90%)
  const y80 = padding + chartHeight - (80 / 100) * chartHeight
  const y90 = padding + chartHeight - (90 / 100) * chartHeight

  // Função para determinar a cor baseada na porcentagem de uso
  const getColorForPercentage = (percentage) => {
    if (percentage === undefined || percentage === null || isNaN(percentage)) {
      return '#10B981' // Verde padrão
    }
    if (percentage >= 90) return '#EF4444' // Vermelho
    if (percentage >= 80) return '#F59E0B' // Amarelo
    return '#10B981' // Verde
  }

  // Função para determinar o limite Y baseado na porcentagem
  const getLimitYForPercentage = (percentage) => {
    if (percentage >= 90) return y90 // Vermelho: até linha de 90%
    if (percentage >= 80) return y80 // Amarelo: até linha de 80%
    return padding + chartHeight // Verde: até a base
  }

  // Função para criar curvas suaves (parábolas) entre pontos
  // Os pontos serão os máximos/mínimos das curvas
  const createSmoothPath = (points) => {
    if (points.length === 0) return ''
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`
    }

    // Sempre usar curvas, mesmo com apenas 2 pontos
    let path = `M ${points[0].x} ${points[0].y}`

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]

      // Calcular pontos de controle para criar curvas suaves
      // que passem por p1 e p2 como extremos
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y

      // Calcular pontos de controle para criar curvas suaves
      // Para que os pontos sejam extremos, usar uma abordagem diferente:
      // criar curvas que naturalmente passem pelos pontos como máximos/mínimos

      if (points.length === 2) {
        // Apenas 2 pontos: criar uma curva suave usando ponto médio como controle
        const midX = (p1.x + p2.x) / 2
        // Usar o ponto médio como ponto de controle para criar uma parábola
        // onde p1 e p2 são os extremos
        const controlY = Math.min(p1.y, p2.y) - Math.abs(dy) * 0.5
        path += ` Q ${midX} ${controlY}, ${p2.x} ${p2.y}`
        continue
      }

      // Para 3 ou mais pontos, usar curvas cúbicas
      let cp1x, cp1y, cp2x, cp2y
      const curveFactor = 0.5

      if (i === 0) {
        // Primeira curva
        const p3 = points[i + 2] || p2
        const nextDx = (p3.x - p2.x) || dx
        cp1x = p1.x + dx * curveFactor
        // Ajustar Y para criar curva visível, mas manter p1 como extremo
        cp1y = p1.y + dy * 0.3
        cp2x = p2.x - nextDx * curveFactor
        cp2y = p2.y - dy * 0.3
      } else if (i === points.length - 2) {
        // Última curva
        const p0 = points[i - 1]
        const prevDx = p1.x - p0.x
        const prevDy = p1.y - p0.y
        cp1x = p1.x + prevDx * curveFactor
        cp1y = p1.y + prevDy * 0.3
        cp2x = p2.x - dx * curveFactor
        cp2y = p2.y - dy * 0.3
      } else {
        // Curvas intermediárias
        const p0 = points[i - 1]
        const p3 = points[i + 2]
        const prevDx = p1.x - p0.x
        const prevDy = p1.y - p0.y
        const nextDx = p3.x - p2.x
        const nextDy = p3.y - p2.y

        // Calcular pontos de controle que criem curvas suaves
        // mas garantam que p1 e p2 sejam extremos
        cp1x = p1.x + prevDx * curveFactor
        cp1y = p1.y + prevDy * 0.3

        cp2x = p2.x - nextDx * curveFactor
        cp2y = p2.y - nextDy * 0.3
      }

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
    }

    return path
  }

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 1.5 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ color: '#F8FAFC', fontSize: '0.875rem', mb: 1 }}>
          {title}
        </Typography>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', position: 'relative', minHeight: height }}>
          {/* Label 100% no topo */}
          {normalizedData.length > 0 && (
            <Typography
              sx={{
                position: 'absolute',
                top: -4,
                left: 0,
                color: '#CBD5E1',
                fontSize: '1rem',
                fontWeight: 600,
                zIndex: 10,
                lineHeight: 1,
              }}
            >
              {unit === '%' ? '100%' : maxValue.toFixed(2) + ' ' + unit}
            </Typography>
          )}
          {normalizedData.length > 0 ? (
            <Box
              sx={{ position: 'relative', width: '100%', height: '100%', minHeight: height, mt: 3, mb: 3 }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const mouseX = e.clientX - rect.left
                const mouseY = e.clientY - rect.top

                // Calcular qual ponto está mais próximo do mouse
                const svgWidth = rect.width
                const svgHeight = rect.height
                const chartWidth = svgWidth - padding * 2
                const chartHeight = svgHeight - padding * 2

                // Converter coordenadas do mouse para coordenadas do gráfico
                const graphX = ((mouseX - padding) / chartWidth) * (width - padding * 2)
                const graphY = ((mouseY - padding) / chartHeight) * (height - padding * 2)

                // Encontrar o ponto mais próximo
                let closestIndex = 0
                let minDistance = Infinity

                normalizedData.forEach((point, index) => {
                  const distance = Math.sqrt(
                    Math.pow(point.x - graphX, 2) + Math.pow(point.y - graphY, 2)
                  )
                  if (distance < minDistance) {
                    minDistance = distance
                    closestIndex = index
                  }
                })

                // Se estiver próximo o suficiente (dentro da área do gráfico)
                if (mouseX >= padding && mouseX <= svgWidth - padding &&
                  mouseY >= padding && mouseY <= svgHeight - padding) {
                  setHoveredPoint(closestIndex)
                  setTooltipPosition({ x: mouseX, y: mouseY })
                } else {
                  setHoveredPoint(null)
                }
              }}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                style={{ display: 'block' }}
              >
                {/* Linhas pontilhadas horizontais para marcar as zonas */}
                <line
                  x1={padding}
                  y1={y80}
                  x2={width - padding}
                  y2={y80}
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity={0.7}
                />
                <line
                  x1={padding}
                  y1={y90}
                  x2={width - padding}
                  y2={y90}
                  stroke="#EF4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  opacity={0.7}
                />

                {/* Área preenchida e linhas com cores baseadas na porcentagem */}
                {normalizedData.length > 0 && (() => {
                  // Criar segmentos baseados na cor de cada ponto
                  const segments = []
                  let currentSegment = {
                    points: [],
                    color: null,
                    limitY: null
                  }

                  normalizedData.forEach((point, index) => {
                    const color = getColorForPercentage(point.porcentagemUsado)
                    const limitY = getLimitYForPercentage(point.porcentagemUsado)

                    if (currentSegment.color === null) {
                      currentSegment.color = color
                      currentSegment.limitY = limitY
                      currentSegment.points.push(point)
                    } else if (currentSegment.color === color && currentSegment.limitY === limitY) {
                      currentSegment.points.push(point)
                    } else {
                      // Mudou de cor/limite - finalizar segmento atual
                      // Adicionar ponto de transição para conectar
                      if (currentSegment.points.length > 0) {
                        currentSegment.points.push(point) // Ponto de transição
                        segments.push({ ...currentSegment })
                        currentSegment.points.pop() // Remover para não duplicar
                      }
                      // Começar novo segmento com ponto de transição
                      currentSegment = {
                        points: index > 0 ? [normalizedData[index - 1], point] : [point],
                        color: color,
                        limitY: limitY
                      }
                    }
                  })

                  // Adicionar último segmento
                  if (currentSegment.points.length > 0) {
                    segments.push(currentSegment)
                  }

                  return (
                    <>
                      {/* Áreas preenchidas por segmento */}
                      {segments.map((segment, segIndex) => {
                        if (segment.points.length === 0) return null

                        const linePathSeg = createSmoothPath(segment.points)
                        const firstPoint = segment.points[0]
                        const lastPoint = segment.points[segment.points.length - 1]

                        // Área vai da linha até o limite correspondente
                        const areaPath = `${linePathSeg} L ${lastPoint.x} ${segment.limitY} L ${firstPoint.x} ${segment.limitY} Z`

                        return (
                          <path
                            key={`area-${segIndex}`}
                            d={areaPath}
                            fill={segment.color}
                            fillOpacity={0.3}
                          />
                        )
                      })}

                      {/* Linhas por segmento */}
                      {segments.map((segment, segIndex) => {
                        if (segment.points.length === 0) return null

                        const linePathSeg = createSmoothPath(segment.points)

                        return (
                          <path
                            key={`line-${segIndex}`}
                            d={linePathSeg}
                            fill="none"
                            stroke={segment.color}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )
                      })}

                      {/* Pontos com cores baseadas na porcentagem */}
                      {normalizedData.map((point, index) => {
                        if (!point || point.porcentagemUsado === undefined) return null
                        const pointColor = getColorForPercentage(point.porcentagemUsado)
                        return (
                          <circle
                            key={index}
                            cx={point.x}
                            cy={point.y}
                            r="3"
                            fill={pointColor}
                          />
                        )
                      })}
                    </>
                  )
                })()}
                {/* Eixos */}
                <line
                  x1={padding}
                  y1={padding + chartHeight}
                  x2={width - padding}
                  y2={padding + chartHeight}
                  stroke="#CBD5E1"
                  strokeWidth="1"
                  opacity={0.5}
                />
                <line
                  x1={padding}
                  y1={padding}
                  x2={padding}
                  y2={padding + chartHeight}
                  stroke="#CBD5E1"
                  strokeWidth="1"
                  opacity={0.5}
                />
                {/* Labels dos eixos - removidos do SVG para ficarem fora */}
              </svg>
              {/* Tooltip */}
              {hoveredPoint !== null && normalizedData[hoveredPoint] && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: tooltipPosition.y - 30,
                    left: tooltipPosition.x,
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    color: '#F8FAFC',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    zIndex: 1000,
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    pointerEvents: 'none',
                  }}
                >
                  {normalizedData[hoveredPoint].porcentagemUsado.toFixed(1)}%
                </Box>
              )}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#CBD5E1', fontSize: '0.75rem' }}>
              Coletando dados...
            </Typography>
          )}
          {/* Label 0% na base */}
          {normalizedData.length > 0 && (
            <Typography
              sx={{
                position: 'absolute',
                bottom: -4,
                left: 0,
                color: '#CBD5E1',
                fontSize: '1rem',
                fontWeight: 600,
                zIndex: 10,
                lineHeight: 1,
              }}
            >
              0{unit === '%' ? '%' : ' ' + unit}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

export default function Dashboard({ isConnected = true, onReconnect }) {
  // Usar cache do contexto
  const { cachedData, refreshData } = useDashboardCache()

  // Estados locais apenas para UI
  const [loading, setLoading] = useState(false)
  const [connectionError, setConnectionError] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState('left')

  // Usar dados do cache
  const stats = cachedData.stats
  const robots = cachedData.robots
  const cronjobs = cachedData.cronjobs
  const vmResources = cachedData.vmResources || {
    memoria: { total_gb: 0, livre_gb: 0, usada_gb: 0 },
    armazenamento: { total_gb: 0, livre_gb: 0, usado_gb: 0 },
    cpu: { usado: 0, livre: 100 }
  }
  const resourcesHistory = cachedData.resourcesHistory

  const countdownIntervalRef = useRef(null)
  const { enqueueSnackbar } = useSnackbar()
  // Manter referência aos valores anteriores para não mostrar "..." durante atualizações
  const previousStatsRef = useRef({
    instanciasAtivas: 0,
    execucoesPendentes: 0,
    falhasContainers: 0,
    rpasAtivos: 0,
    cronjobsAtivos: 0,
  })

  // Atualizar referência quando stats mudarem
  useEffect(() => {
    previousStatsRef.current = stats
  }, [stats])

  // Carregar dados iniciais quando conectar (apenas uma vez)
  const hasLoadedRef = useRef(false)
  useEffect(() => {
    if (isConnected && !hasLoadedRef.current) {
      // Forçar atualização inicial ao conectar (apenas uma vez)
      console.log('[DASHBOARD] Carregando dados iniciais')
      refreshData(isConnected)
      hasLoadedRef.current = true
      setLoading(false)
      setConnectionError(false)
    } else if (isConnected) {
      setLoading(false)
      setConnectionError(false)
    } else {
      setLoading(false)
      setConnectionError(true)
      hasLoadedRef.current = false // Reset para próxima conexão
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]) // Remover refreshData das dependências para evitar loops

  // Função para forçar atualização manual (usa o cache do contexto)
  const loadData = async (silent = false) => {
    if (!isConnected) {
      if (!silent) {
        setConnectionError(true)
      }
      return
    }

    try {
      if (!silent) {
        setLoading(true)
      }
      setConnectionError(false)

      // Usar refreshData do contexto que já atualiza o cache
      await refreshData(isConnected)
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error)

      const isConnectionError =
        error.message?.includes('Timeout') ||
        error.message?.includes('conexão') ||
        error.message?.includes('network') ||
        error.code === 'ECONNABORTED'

      if (isConnectionError) {
        setConnectionError(true)
      }

      if (!silent) {
        enqueueSnackbar(`Erro ao carregar dados: ${error.message}`, { variant: 'error' })
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  const handleManualRefresh = async () => {
    if (onReconnect) {
      await onReconnect()
      // Aguardar um pouco e tentar recarregar
      setTimeout(() => {
        if (isConnected) {
          refreshData(isConnected)
        }
      }, 2000)
    } else {
      refreshData(isConnected)
    }
  }

  // Monitorar quando a conexão for restaurada para recarregar dados
  useEffect(() => {
    if (isConnected && connectionError) {
      setConnectionError(false)
      refreshData(isConnected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, connectionError])

  // Listener para eventos do backend (desabilitado - sem reinicialização automática)
  // useEffect removido - não há mais reinicialização automática

  const StatCard = ({ title, value, color }) => (
    <Card sx={{ height: '100%', maxWidth: 250 }}>
      <CardContent sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: '0.875rem' }}>
          {title}
        </Typography>
        <Typography variant="h4" component="div" sx={{ color, fontWeight: 'bold', fontSize: '1.75rem' }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  )

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 10px)', width: '100%', gap: 1, overflow: 'hidden', p: 0 }}>
      {/* Esquerda - Painel Principal (Dashboard) */}
      <Paper
        elevation={0}
        sx={{
          flex: expandedPanel === 'left' ? 1 : '0 0 60px',
          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease, border 0.5s ease, box-shadow 0.5s ease',
          position: 'relative',
          overflow: 'hidden',
          // Fundo branco com gradiente sobreposto
          bgcolor: '#FFFFFF',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, #ee4756 0%, #f7a54c 50%, #fcd335 100%)',
            opacity: expandedPanel === 'left' ? 0.75 : 1,
            transition: 'opacity 0.5s ease',
            zIndex: 0,
          },
          borderRadius: '16px',
          cursor: expandedPanel === 'left' ? 'default' : 'pointer',
          border: expandedPanel === 'left'
            ? '1px solid rgba(247, 165, 76, 0.3)'
            : '1px solid rgba(238, 71, 86, 0.4)',
          boxShadow: expandedPanel === 'left'
            ? '0 8px 32px rgba(247, 165, 76, 0.15)'
            : '0 8px 32px rgba(238, 71, 86, 0.3)',
        }}
        onClick={() => expandedPanel !== 'left' && setExpandedPanel('left')}
      >
        {expandedPanel !== 'left' && (
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-90deg)',
            zIndex: 10
          }}>
            <Typography variant="h6" sx={{ whiteSpace: 'nowrap', fontWeight: 'bold', letterSpacing: 2, color: '#000000' }}>
              ROBÔS EM ANDAMENTO
            </Typography>
          </Box>
        )}
        <Box sx={{
          height: '100%',
          overflowY: 'auto',
          p: 3,
          opacity: expandedPanel === 'left' ? 1 : 0,
          pointerEvents: expandedPanel === 'left' ? 'auto' : 'none',
          transition: 'opacity 0.3s',
          minWidth: '800px', // Garante que o layout interno não quebre ao colapsar
          position: 'relative',
          zIndex: 1, // Acima do gradiente
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography
              variant="h4"
              gutterBottom
              sx={{
                fontWeight: 'bold',
                color: '#FFFFFF',
                textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                mb: 0,
              }}
            >
              Robôs em Andamento
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
              <StatCard title="Instâncias Ativas" value={stats.instanciasAtivas} color="#6366F1" />
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



          <Typography
            variant="h5"
            gutterBottom
            sx={{
              mt: 4,
              mb: 2,
              fontWeight: 'bold',
              color: '#FFFFFF',
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
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Nome</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Instâncias</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Execuções</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Tipo</TableCell>
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
                    <TableCell colSpan={5} align="center" sx={{ color: '#FFFFFF' }}>
                      Nenhum container rodando no momento
                    </TableCell>
                  </TableRow>
                ) : (
                  robots.map((robot, index) => (
                    <TableRow
                      key={`${robot.nome}-${index}`}
                      sx={{
                        '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
                        '& td': { py: 1.5 } // Altura vertical consistente
                      }}
                    >
                      <TableCell sx={{ color: '#FFFFFF', py: 1.5 }}>{robot.nome}</TableCell>
                      <TableCell sx={{ color: '#FFFFFF', py: 1.5 }}>{robot.instancias}</TableCell>
                      <TableCell sx={{ py: 1.5 }}>
                        <Chip
                          label={robot.status}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            bgcolor: robot.statusColor === 'success' ? '#22C55E' :
                              robot.statusColor === 'error' ? '#EF4444' : '#6B7280',
                            color: '#FFFFFF',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: '#FFFFFF', py: 1.5 }}>
                        {robot.execucoes === 'Rotina Sem Exec' ? (
                          <Chip
                            label="Rotina Sem Exec"
                            size="small"
                            sx={{
                              bgcolor: 'rgba(255,255,255,0.9)',
                              color: '#333',
                              fontWeight: 500
                            }}
                          />
                        ) : (
                          robot.execucoes
                        )}
                      </TableCell>
                      <TableCell sx={{ py: 1.5 }}>
                        {robot.tipo === 'Cronjob' ? (
                          <Chip
                            icon={<AccessTimeIcon />}
                            label="Agendado"
                            color="warning"
                            size="small"
                            sx={{ minWidth: 100, justifyContent: 'center', fontWeight: 600 }}
                          />
                        ) : robot.tipo === 'Deploy' ? (
                          <Chip
                            icon={<AllInclusiveIcon />}
                            label="Deploy"
                            color="info"
                            size="small"
                            sx={{ minWidth: 100, justifyContent: 'center', fontWeight: 600 }}
                          />
                        ) : (
                          <Chip
                            icon={<SmartToyIcon />}
                            label="RPA"
                            color="primary"
                            size="small"
                            sx={{ minWidth: 100, justifyContent: 'center', fontWeight: 600 }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Painel de Cronjobs */}
          <Typography
            variant="h5"
            gutterBottom
            sx={{
              mt: 4,
              mb: 2,
              fontWeight: 'bold',
              color: '#F8FAFC',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            Próximos Cronjobs
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
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Nome</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Agendamento</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Inicia Em</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Última Execução</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cronjobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: '#FFFFFF' }}>
                      Nenhum cronjob agendado
                    </TableCell>
                  </TableRow>
                ) : (
                  cronjobs.map((cronjob) => {
                    const proximaExecucao = cronjob.proximaExecucao
                    const horarioFormatado = proximaExecucao
                      ? proximaExecucao.toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                      : 'N/A'

                    const ultimaExecucao = cronjob.last_successful_time || cronjob.last_schedule_time
                    const ultimaFormatada = ultimaExecucao
                      ? new Date(ultimaExecucao).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                      : 'Nunca executado'

                    return (
                      <TableRow
                        key={cronjob.name}
                        sx={{
                          '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
                          '& td': { py: 1.5 } // Mesma altura vertical que a tabela de robôs
                        }}
                      >
                        <TableCell sx={{ color: '#FFFFFF', py: 1.5 }}>
                          {formatarNome(cronjob.name) || 'N/A'}
                        </TableCell>
                        <TableCell sx={{ color: '#FFFFFF', py: 1.5 }}>
                          {horarioFormatado}
                        </TableCell>
                        <TableCell sx={{ color: '#FFFFFF', py: 1.5 }}>
                          {proximaExecucao ? (
                            <ContagemRegressiva dataFutura={proximaExecucao} />
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell sx={{ color: '#FFFFFF', py: 1.5 }}>
                          {ultimaFormatada}
                        </TableCell>
                        <TableCell sx={{ py: 1.5, verticalAlign: 'middle' }}>
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<PlayArrowIcon sx={{ fontSize: '1rem' }} />}
                            onClick={async () => {
                              try {
                                await api.cronjobRunNow(cronjob.name)
                                enqueueSnackbar('Cronjob executado com sucesso', { variant: 'success' })
                                // Recarregar dados após alguns segundos
                                setTimeout(() => {
                                  loadData(true)
                                }, 2000)
                              } catch (error) {
                                enqueueSnackbar(`Erro ao executar cronjob: ${error.message}`, { variant: 'error' })
                              }
                            }}
                            sx={{
                              minWidth: 120,
                              py: 0.25,
                              px: 1.5,
                              height: 28,
                              fontSize: '0.75rem',
                              lineHeight: 1.2,
                              background: 'linear-gradient(90deg, #754c99 0%, #8fd0d7 100%)',
                              color: '#FFFFFF',
                              fontWeight: 600,
                              border: 'none',
                              '&:hover': {
                                background: 'linear-gradient(90deg, #5f3d7a 0%, #7dc0c7 100%)',
                              }
                            }}
                          >
                            Iniciar
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Paper>

      {/* Direita - Painel Secundário */}
      <Paper
        elevation={0}
        sx={{
          flex: expandedPanel === 'right' ? 1 : '0 0 60px',
          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease, border 0.5s ease, box-shadow 0.5s ease',
          position: 'relative',
          overflow: 'hidden',
          // Fundo branco com gradiente sobreposto
          bgcolor: '#FFFFFF',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(135deg, #754c99 0%, #8fd0d7 100%)',
            opacity: expandedPanel === 'right' ? 0.75 : 1,
            transition: 'opacity 0.5s ease',
            zIndex: 0,
          },
          borderRadius: '16px',
          cursor: expandedPanel === 'right' ? 'default' : 'pointer',
          border: expandedPanel === 'right'
            ? '1px solid rgba(117, 76, 153, 0.3)'
            : '1px solid rgba(117, 76, 153, 0.4)',
          boxShadow: expandedPanel === 'right'
            ? '0 8px 32px rgba(117, 76, 153, 0.15)'
            : '0 8px 32px rgba(117, 76, 153, 0.3)',
        }}
        onClick={() => expandedPanel !== 'right' && setExpandedPanel('right')}
      >
        {expandedPanel !== 'right' && (
          <Box sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-90deg)',
            zIndex: 10
          }}>
            <Typography variant="h6" sx={{ whiteSpace: 'nowrap', fontWeight: 'bold', letterSpacing: 2, color: '#000000' }}>
              MÉTRICAS DA VM / DOCKER
            </Typography>
          </Box>
        )}
        <Box sx={{
          height: '100%',
          overflowY: 'auto',
          p: 3,
          opacity: expandedPanel === 'right' ? 1 : 0,
          pointerEvents: expandedPanel === 'right' ? 'auto' : 'none',
          transition: 'opacity 0.3s',
          minWidth: expandedPanel === 'right' ? 'auto' : '800px',
          position: 'relative',
          zIndex: 1, // Acima do gradiente
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
              Métricas Linux Docker
            </Typography>
          </Box>

          {/* Gráficos de Consumo de Recursos */}
          <Typography
            variant="h5"
            gutterBottom
            sx={{
              mt: 2,
              mb: 2,
              fontWeight: 'bold',
              color: 'text.primary',
            }}
          >
            Consumo de Recursos da VM
          </Typography>

          <Grid container spacing={2}>
            {/* CPU Chart - Full Width */}
            <Grid item xs={12}>
              <ResourceAreaChart
                title="Processamento (CPU)"
                data={resourcesHistory.cpu}
                dataKey="usado"
                unit="%"
                maxValue={100}
                color="#0066FF"
              />
            </Grid>
            {/* Memory and Storage Charts - Half Width each */}
            <Grid item xs={12} md={6}>
              <ResourceAreaChart
                title="Memória RAM"
                data={resourcesHistory.memoria}
                dataKey="usado"
                maxValue={vmResources.memoria.total_gb || 100}
                unit="GB"
                color="#0066FF"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <ResourceAreaChart
                title="Armazenamento"
                data={resourcesHistory.armazenamento}
                dataKey="usado"
                maxValue={vmResources.armazenamento.total_gb || 100}
                unit="GB"
                color="#0066FF"
              />
            </Grid>
          </Grid>

          {/* Lista de Containers Ativos */}
          <Box sx={{ mt: 3 }}>
            <ContainerResourcesList />
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
