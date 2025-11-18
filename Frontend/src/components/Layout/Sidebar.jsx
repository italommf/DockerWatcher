import React, { useState } from 'react'
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, Typography, Button, CircularProgress, Collapse } from '@mui/material'
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
  Add as AddIcon,
  ExpandLess,
  ExpandMore,
} from '@mui/icons-material'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'jobs', label: 'Containers Rodando', icon: <SettingsIcon /> },
  { id: 'falhas', label: 'Falhas', icon: <ErrorIcon /> },
  { id: 'logs', label: 'Logs do App', icon: <DescriptionIcon /> },
]

export default function Sidebar({ currentPage, onPageChange, connectionStatus, onReconnect, isReconnecting, reconnectAttempts = 0 }) {
  const isCreatePage = currentPage === 'criar-rpa' || currentPage === 'criar-cronjob' || currentPage === 'criar-deployment'
  const isRegisteredPage = currentPage === 'rpas' || currentPage === 'cronjobs' || currentPage === 'deployments'
  const [createMenuOpen, setCreateMenuOpen] = useState(isCreatePage)
  const [registeredMenuOpen, setRegisteredMenuOpen] = useState(isRegisteredPage)

  // Expandir automaticamente se estiver em uma página de criação
  React.useEffect(() => {
    if (isCreatePage) {
      setCreateMenuOpen(true)
    }
  }, [currentPage, isCreatePage])

  // Expandir automaticamente se estiver em uma página de robôs cadastrados
  React.useEffect(() => {
    if (isRegisteredPage) {
      setRegisteredMenuOpen(true)
    }
  }, [currentPage, isRegisteredPage])

  const handleCreateMenuToggle = () => {
    setCreateMenuOpen(!createMenuOpen)
  }

  const handleRegisteredMenuToggle = () => {
    setRegisteredMenuOpen(!registeredMenuOpen)
  }

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
          {isReconnecting && reconnectAttempts > 0 && (
            <Typography 
              variant="caption" 
              sx={{ 
                mt: 1, 
                display: 'block', 
                textAlign: 'center',
                color: '#94A3B8',
                fontSize: '0.75rem',
              }}
            >
              Tentativa automática {reconnectAttempts}/2
            </Typography>
          )}
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

        {/* Menu Robôs Cadastrados - Expansível */}
        <ListItem disablePadding sx={{ mb: 0.5 }}>
          <ListItemButton
            selected={isRegisteredPage}
            onClick={handleRegisteredMenuToggle}
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
            <ListItemIcon sx={{ color: isRegisteredPage ? 'white' : '#CBD5E1', minWidth: 40 }}>
              <RobotIcon />
            </ListItemIcon>
            <ListItemText primary="Robôs Cadastrados" />
            <Box sx={{ color: isRegisteredPage ? 'white' : '#CBD5E1' }}>
              {registeredMenuOpen ? <ExpandLess /> : <ExpandMore />}
            </Box>
          </ListItemButton>
        </ListItem>
        <Collapse in={registeredMenuOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItemButton
              selected={currentPage === 'rpas'}
              onClick={() => onPageChange('rpas')}
              sx={{
                mx: 1,
                ml: 4,
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
              <ListItemIcon sx={{ color: currentPage === 'rpas' ? 'white' : '#CBD5E1', minWidth: 40 }}>
                <RobotIcon />
              </ListItemIcon>
              <ListItemText primary="RPAs" />
            </ListItemButton>
            <ListItemButton
              selected={currentPage === 'cronjobs'}
              onClick={() => onPageChange('cronjobs')}
              sx={{
                mx: 1,
                ml: 4,
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
              <ListItemIcon sx={{ color: currentPage === 'cronjobs' ? 'white' : '#CBD5E1', minWidth: 40 }}>
                <ScheduleIcon />
              </ListItemIcon>
              <ListItemText primary="Cronjobs" />
            </ListItemButton>
            <ListItemButton
              selected={currentPage === 'deployments'}
              onClick={() => onPageChange('deployments')}
              sx={{
                mx: 1,
                ml: 4,
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
              <ListItemIcon sx={{ color: currentPage === 'deployments' ? 'white' : '#CBD5E1', minWidth: 40 }}>
                <RocketIcon />
              </ListItemIcon>
              <ListItemText primary="Deployments" />
            </ListItemButton>
          </List>
        </Collapse>

        {/* Menu Adicionar Robô - Expansível */}
        <ListItem disablePadding sx={{ mb: 0.5 }}>
          <ListItemButton
            selected={isCreatePage}
            onClick={handleCreateMenuToggle}
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
            <ListItemIcon sx={{ color: isCreatePage ? 'white' : '#CBD5E1', minWidth: 40 }}>
              <AddIcon />
            </ListItemIcon>
            <ListItemText primary="Adicionar Robô" />
            <Box sx={{ color: isCreatePage ? 'white' : '#CBD5E1' }}>
              {createMenuOpen ? <ExpandLess /> : <ExpandMore />}
            </Box>
          </ListItemButton>
        </ListItem>
        <Collapse in={createMenuOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            <ListItemButton
              selected={currentPage === 'criar-rpa'}
              onClick={() => onPageChange('criar-rpa')}
              sx={{
                mx: 1,
                ml: 4,
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
              <ListItemIcon sx={{ color: currentPage === 'criar-rpa' ? 'white' : '#CBD5E1', minWidth: 40 }}>
                <RobotIcon />
              </ListItemIcon>
              <ListItemText primary="Novo RPA" />
            </ListItemButton>
            <ListItemButton
              selected={currentPage === 'criar-cronjob'}
              onClick={() => onPageChange('criar-cronjob')}
              sx={{
                mx: 1,
                ml: 4,
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
              <ListItemIcon sx={{ color: currentPage === 'criar-cronjob' ? 'white' : '#CBD5E1', minWidth: 40 }}>
                <ScheduleIcon />
              </ListItemIcon>
              <ListItemText primary="Novo Cronjob" />
            </ListItemButton>
            <ListItemButton
              selected={currentPage === 'criar-deployment'}
              onClick={() => onPageChange('criar-deployment')}
              sx={{
                mx: 1,
                ml: 4,
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
              <ListItemIcon sx={{ color: currentPage === 'criar-deployment' ? 'white' : '#CBD5E1', minWidth: 40 }}>
                <RocketIcon />
              </ListItemIcon>
              <ListItemText primary="Novo Deployment" />
            </ListItemButton>
          </List>
        </Collapse>
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
