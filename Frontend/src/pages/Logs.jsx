import React, { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material'
import {
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material'
import { useAppLogs } from '../context/AppLogsContext'

export default function Logs() {
  const { logs, clearLogs } = useAppLogs()
  const [selectedLog, setSelectedLog] = useState(null)
  const [filter, setFilter] = useState('all') // 'all', 'info', 'warning', 'error', 'success'

  const getTypeIcon = (type) => {
    switch (type) {
      case 'info':
        return <InfoIcon sx={{ color: '#3B82F6' }} />
      case 'warning':
        return <WarningIcon sx={{ color: '#F59E0B' }} />
      case 'error':
        return <ErrorIcon sx={{ color: '#EF4444' }} />
      case 'success':
        return <CheckCircleIcon sx={{ color: '#10B981' }} />
      default:
        return <InfoIcon />
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'info':
        return 'info'
      case 'warning':
        return 'warning'
      case 'error':
        return 'error'
      case 'success':
        return 'success'
      default:
        return 'default'
    }
  }

  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter((log) => log.type === filter)

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography
          variant="h4"
          gutterBottom
          sx={{
            fontWeight: 'bold',
            color: '#F8FAFC',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          Logs da Aplicação
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            select
            label="Filtrar"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 150 }}
            SelectProps={{
              native: true,
            }}
          >
            <option value="all">Todos</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="success">Success</option>
          </TextField>
          <Button
            variant="outlined"
            startIcon={<DeleteIcon />}
            onClick={clearLogs}
            disabled={logs.length === 0}
          >
            Limpar Logs
          </Button>
        </Box>
      </Box>

      <TableContainer
        component={Paper}
        sx={{
          backgroundColor: 'rgba(30, 41, 59, 0.3)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
          maxHeight: '70vh',
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold', width: 60 }}>Tipo</TableCell>
              <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Data/Hora</TableCell>
              <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold' }}>Mensagem</TableCell>
              <TableCell sx={{ color: '#F8FAFC', fontWeight: 'bold', width: 100 }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ color: '#CBD5E1', py: 4 }}>
                  Nenhum log encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow
                  key={log.id}
                  sx={{
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
                  }}
                >
                  <TableCell>
                    {getTypeIcon(log.type)}
                  </TableCell>
                  <TableCell sx={{ color: '#CBD5E1' }}>
                    {formatTimestamp(log.timestamp)}
                  </TableCell>
                  <TableCell sx={{ color: '#F8FAFC' }}>
                    {log.message}
                  </TableCell>
                  <TableCell>
                    {log.details && (
                      <IconButton
                        size="small"
                        onClick={() => setSelectedLog(log)}
                        sx={{ color: '#6366F1' }}
                        title="Ver detalhes"
                      >
                        <VisibilityIcon />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog de Detalhes */}
      <Dialog
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        }}
      >
        <DialogTitle sx={{ color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 1 }}>
          {selectedLog && getTypeIcon(selectedLog.type)}
          Detalhes do Log
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ color: '#CBD5E1', mb: 1 }}>
              Data/Hora:
            </Typography>
            <Typography variant="body1" sx={{ color: '#F8FAFC' }}>
              {selectedLog && formatTimestamp(selectedLog.timestamp)}
            </Typography>
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ color: '#CBD5E1', mb: 1 }}>
              Tipo:
            </Typography>
            <Chip
              label={selectedLog?.type}
              color={selectedLog ? getTypeColor(selectedLog.type) : 'default'}
              size="small"
            />
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ color: '#CBD5E1', mb: 1 }}>
              Mensagem:
            </Typography>
            <Typography variant="body1" sx={{ color: '#F8FAFC' }}>
              {selectedLog?.message}
            </Typography>
          </Box>
          {selectedLog?.details && (
            <Box>
              <Typography variant="subtitle2" sx={{ color: '#CBD5E1', mb: 1 }}>
                Detalhes:
              </Typography>
              <Box
                sx={{
                  backgroundColor: '#0F172A',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 1,
                  p: 2,
                  maxHeight: '300px',
                  overflow: 'auto',
                }}
              >
                <Typography
                  component="pre"
                  sx={{
                    color: '#CBD5E1',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    margin: 0,
                  }}
                >
                  {typeof selectedLog.details === 'string' 
                    ? selectedLog.details 
                    : JSON.stringify(selectedLog.details, null, 2)}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <Button onClick={() => setSelectedLog(null)} sx={{ color: '#CBD5E1' }}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

