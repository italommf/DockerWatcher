import React, { useState, useMemo } from 'react'
import {
    LineChart,
    Line,
    Area,
    AreaChart,
    CartesianGrid,
    XAxis,
    Tooltip,
    ResponsiveContainer,
    YAxis
} from 'recharts'
import {
    Card,
    CardContent,
    CardHeader,
    Typography,
    Select,
    MenuItem,
    Box,
    useTheme
} from '@mui/material'

export default function ResourceAreaChart({ title, data = [], dataKey = "usado", unit = "GB", color = "#0066FF", maxValue = 100 }) {
    const [timeRange, setTimeRange] = useState("1h")
    const theme = useTheme()

    // Calcular o número máximo de pontos para o período selecionado
    const targetPoints = useMemo(() => {
        const pointsPerMinute = 6
        const pointsPerHour = pointsPerMinute * 60

        switch (timeRange) {
            case "7d": return pointsPerHour * 24 * 7
            case "24h": return pointsPerHour * 24
            case "12h": return pointsPerHour * 12
            case "1h": return pointsPerHour
            case "5m": return pointsPerMinute * 5
            default: return pointsPerHour
        }
    }, [timeRange])

    // Filter data based on selection - mantém apenas os dados do período selecionado
    const filteredData = useMemo(() => {
        if (!data || data.length === 0) return []

        // Se temos menos pontos que o alvo, usar todos
        // Se temos mais, pegar apenas os últimos N pontos
        const pointsToUse = Math.min(data.length, targetPoints)
        const slicedData = data.slice(-pointsToUse)

        return slicedData.map((item, index) => ({
            ...item,
            index: index,
        }))
    }, [data, targetPoints])

    // Downsampling: reduzir pontos para melhorar performance
    // Mantém no máximo ~150 pontos, usando média para agregar valores
    const displayData = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return []

        const MAX_DISPLAY_POINTS = 150

        // Calcular posição relativa baseada no targetPoints (não no tamanho atual)
        // Isso faz os pontos "acumularem" da esquerda para a direita
        if (filteredData.length <= MAX_DISPLAY_POINTS) {
            // Posicionar os pontos proporcionalmente ao espaço total esperado
            return filteredData.map((item, idx) => ({
                ...item,
                // displayIndex vai de 0 até targetPoints, proporcional ao total esperado
                displayIndex: Math.round((idx / Math.max(targetPoints - 1, 1)) * (MAX_DISPLAY_POINTS - 1))
            }))
        }

        // Se temos mais pontos que MAX_DISPLAY_POINTS, fazer downsampling
        const chunkSize = Math.ceil(filteredData.length / MAX_DISPLAY_POINTS)
        const downsampled = []

        for (let i = 0; i < filteredData.length; i += chunkSize) {
            const chunk = filteredData.slice(i, Math.min(i + chunkSize, filteredData.length))

            // Calcular média do chunk
            const avgUsado = chunk.reduce((sum, item) => sum + (item[dataKey] || 0), 0) / chunk.length
            const avgLivre = chunk.reduce((sum, item) => sum + (item.livre || 0), 0) / chunk.length

            downsampled.push({
                ...chunk[Math.floor(chunk.length / 2)],
                [dataKey]: avgUsado,
                livre: avgLivre,
                displayIndex: downsampled.length,
                originalCount: chunk.length
            })
        }

        return downsampled
    }, [filteredData, dataKey, targetPoints])

    // Calcular a cor da linha baseada no valor mais recente
    const strokeColor = useMemo(() => {
        if (!filteredData || filteredData.length === 0) return "#10B981" // Verde padrão

        const lastValue = filteredData[filteredData.length - 1]?.[dataKey] || 0
        const percentage = maxValue > 0 ? (lastValue / maxValue) * 100 : 0

        if (percentage >= 90) return "#EF4444" // Vermelho
        if (percentage >= 70) return "#F59E0B" // Amarelo
        return "#10B981" // Verde
    }, [filteredData, dataKey, maxValue])

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const value = payload[0].value
            const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0
            let tooltipColor = "#10B981"
            if (percentage >= 90) tooltipColor = "#EF4444"
            else if (percentage >= 70) tooltipColor = "#F59E0B"

            return (
                <Box sx={{
                    bgcolor: 'background.paper',
                    p: 1,
                    border: '2px solid',
                    borderColor: tooltipColor,
                    borderRadius: 1,
                    boxShadow: 3
                }}>
                    <Typography variant="body2" sx={{ color: tooltipColor, fontWeight: 600 }}>
                        {`${value.toFixed(2)} ${unit} (${percentage.toFixed(1)}%)`}
                    </Typography>
                </Box>
            )
        }
        return null
    }

    // IDs únicos para os gradientes
    const safeTitle = (title || 'chart').replace(/\s+/g, '-').replace(/[()]/g, '')
    const gradientId = `fill-${safeTitle}`

    // Se não tiver dados, mostrar mensagem
    if (!displayData || displayData.length === 0) {
        return (
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardHeader
                    title={
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {title}
                        </Typography>
                    }
                    sx={{ pb: 0, pt: 1.5, px: 1.5 }}
                />
                <CardContent sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                        Aguardando dados...
                    </Typography>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
                title={
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.2 }}>
                                {title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                Tempo real
                            </Typography>
                        </Box>
                        <Select
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                            variant="outlined"
                            size="small"
                            sx={{
                                height: 24,
                                fontSize: '0.75rem',
                                minWidth: 70,
                                '.MuiSelect-select': { py: 0, px: 1 }
                            }}
                        >
                            <MenuItem value="7d" sx={{ fontSize: '0.75rem' }}>7 dias</MenuItem>
                            <MenuItem value="24h" sx={{ fontSize: '0.75rem' }}>24h</MenuItem>
                            <MenuItem value="12h" sx={{ fontSize: '0.75rem' }}>12h</MenuItem>
                            <MenuItem value="1h" sx={{ fontSize: '0.75rem' }}>1h</MenuItem>
                            <MenuItem value="5m" sx={{ fontSize: '0.75rem' }}>5 min</MenuItem>
                        </Select>
                    </Box>
                }
                sx={{ pb: 0, pt: 1.5, px: 1.5 }}
            />
            <CardContent sx={{ flex: 1, p: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ width: '100%', height: 150 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={displayData}
                            margin={{
                                top: 5,
                                right: 10,
                                left: 0,
                                bottom: 5,
                            }}
                        >
                            <defs>
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={strokeColor} stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                vertical={false}
                                strokeDasharray="3 3"
                                stroke={theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                            />
                            <XAxis
                                dataKey="displayIndex"
                                type="number"
                                domain={[0, 149]}
                                tickLine={false}
                                axisLine={false}
                                tick={false}
                                height={5}
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                domain={[0, maxValue]}
                                tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
                                tickFormatter={(value) => `${Math.round(value)}`}
                                width={35}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ stroke: strokeColor, strokeDasharray: '3 3' }} />
                            <Area
                                type="monotone"
                                dataKey={dataKey}
                                stroke={strokeColor}
                                strokeWidth={1}
                                fill={`url(#${gradientId})`}
                                isAnimationActive={false}
                                activeDot={{ r: 4, fill: strokeColor, stroke: '#fff', strokeWidth: 1 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </Box>
            </CardContent>
        </Card>
    )
}
