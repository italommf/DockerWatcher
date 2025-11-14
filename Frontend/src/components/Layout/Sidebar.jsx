import React from 'react'
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, Typography, Button, CircularProgress } from '@mui/material'
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  SmartToy as RobotIcon,
  Schedule as ScheduleIcon,
  RocketLaunch as RocketIcon,
  Cloud as CloudIcon,
  Error as ErrorIcon,
  SettingsApplications as SettingsApplicationsIcon,
  Refresh as RefreshIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'jobs', label: 'Jobs', icon: <SettingsIcon /> },
  { id: 'rpas', label: 'RPAs', icon: <RobotIcon /> },
  { id: 'cronjobs', label: 'Cronjobs', icon: <ScheduleIcon /> },
  { id: 'deployments', label: 'Deployments', icon: <RocketIcon /> },
  { id: 'falhas', label: 'Falhas', icon: <ErrorIcon /> },
  { id: 'logs', label: 'Logs', icon: <DescriptionIcon /> },
]

export default function Sidebar({ currentPage, onPageChange, connectionStatus, onReconnect, isReconnecting }) {
  return (
    <Box 
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CloudIcon sx={{ fontSize: 40, color: '#6366F1', mb: 1 }} />
        <Typography 
          variant="h6" 
          sx={{ 
            fontWeight: 'bold', 
            color: '#F8FAFC',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          Docker Watcher
        </Typography>
      </Box>

      <Box sx={{ px: 2, mb: 2 }}>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            backgroundColor: 'rgba(30, 41, 59, 0.4)',
            backdropFilter: 'blur(15px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 16px 0 rgba(0, 0, 0, 0.1)',
          }}
        >
          <Typography variant="caption" sx={{ color: '#CBD5E1', mb: 1, display: 'block' }}>
            Status da Conexão
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: connectionStatus.ssh ? '#10B981' : '#EF4444',
                mr: 1,
                boxShadow: connectionStatus.ssh ? '0 0 8px #10B981' : '0 0 8px #EF4444',
              }}
            />
            <Typography variant="body2" sx={{ color: '#F8FAFC' }}>
              VM Linux Docker
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: connectionStatus.mysql ? '#10B981' : '#EF4444',
                mr: 1,
                boxShadow: connectionStatus.mysql ? '0 0 8px #10B981' : '0 0 8px #EF4444',
              }}
            />
            <Typography variant="body2" sx={{ color: '#F8FAFC' }}>
              Database BWA
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={isReconnecting ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={onReconnect}
            disabled={isReconnecting}
            sx={{
              mt: 2,
              width: '100%',
              color: '#CBD5E1',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              '&:hover': {
                borderColor: 'rgba(255, 255, 255, 0.3)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              },
            }}
          >
            Reconectar
          </Button>
        </Box>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', mx: 2 }} />

      <List sx={{ flexGrow: 1, pt: 2 }}>
        {menuItems.map((item) => (
          <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={currentPage === item.id}
              onClick={() => onPageChange(item.id)}
              sx={{
                mx: 1,
                borderRadius: 2,
                backdropFilter: 'blur(10px)',
                '&.Mui-selected': {
                  backgroundColor: 'rgba(99, 102, 241, 0.4)',
                  backdropFilter: 'blur(15px)',
                  color: 'white',
                  boxShadow: '0 4px 16px 0 rgba(99, 102, 241, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  '&:hover': {
                    backgroundColor: 'rgba(99, 102, 241, 0.5)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(10px)',
                },
              }}
            >
              <ListItemIcon sx={{ color: currentPage === item.id ? 'white' : '#CBD5E1', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', mx: 2, mt: 'auto' }} />

      <List sx={{ pb: 2 }}>
        <ListItem disablePadding>
          <ListItemButton
            selected={currentPage === 'configuracoes'}
            onClick={() => onPageChange('configuracoes')}
            sx={{
              mx: 1,
              borderRadius: 2,
              backdropFilter: 'blur(10px)',
              '&.Mui-selected': {
                backgroundColor: 'rgba(99, 102, 241, 0.4)',
                backdropFilter: 'blur(15px)',
                color: 'white',
                boxShadow: '0 4px 16px 0 rgba(99, 102, 241, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                '&:hover': {
                  backgroundColor: 'rgba(99, 102, 241, 0.5)',
                },
              },
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
              },
            }}
          >
            <ListItemIcon sx={{ color: currentPage === 'configuracoes' ? 'white' : '#CBD5E1', minWidth: 40 }}>
              <SettingsApplicationsIcon />
            </ListItemIcon>
            <ListItemText primary="Configurações" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  )
}
