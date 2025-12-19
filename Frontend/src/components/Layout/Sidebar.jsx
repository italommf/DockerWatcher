import React, { useState, useEffect } from 'react'
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, Typography, Collapse, IconButton, Tooltip, useTheme, Paper, Button, CircularProgress } from '@mui/material'
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  SmartToy as RobotIcon,
  Schedule as ScheduleIcon,
  RocketLaunch as RocketIcon,
  Cloud as CloudIcon,
  Error as ErrorIcon,
  SettingsApplications as SettingsApplicationsIcon,
  Description as DescriptionIcon,
  Add as AddIcon,
  ExpandLess,
  ExpandMore,
  ChevronLeft,
  ChevronRight,
  Circle as CircleIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material'
import WatcherLogo from '../../assets/WatcherLogo.png'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'jobs', label: 'Containers Rodando', icon: <SettingsIcon /> },
  { id: 'falhas', label: 'Falhas', icon: <ErrorIcon /> },
  { id: 'logs', label: 'Logs do App', icon: <DescriptionIcon /> },
]

export default function Sidebar({ currentPage, onPageChange, isCollapsed, toggleSidebar, connectionStatus, onReconnect, isReconnecting }) {
  const theme = useTheme()
  const isCreatePage = currentPage === 'criar-rpa' || currentPage === 'criar-cronjob' || currentPage === 'criar-deployment'
  const isRegisteredPage = currentPage === 'rpas' || currentPage === 'cronjobs' || currentPage === 'deployments'
  // When collapsed, we can't really have "expanded" submenus in the traditional sense, maybe just popovers.
  // For simplicity, when collapsed, clicking a group header could expand the sidebar OR just navigate to main.
  // But let's keep the state.
  const [createMenuOpen, setCreateMenuOpen] = useState(isCreatePage)
  const [registeredMenuOpen, setRegisteredMenuOpen] = useState(isRegisteredPage)

  useEffect(() => {
    if (isCreatePage && !isCollapsed) setCreateMenuOpen(true)
  }, [currentPage, isCreatePage, isCollapsed])

  useEffect(() => {
    if (isRegisteredPage && !isCollapsed) setRegisteredMenuOpen(true)
  }, [currentPage, isRegisteredPage, isCollapsed])

  const handleCreateMenuToggle = () => {
    if (isCollapsed) {
      toggleSidebar()
      setCreateMenuOpen(true)
      setRegisteredMenuOpen(false)
    } else {
      if (!createMenuOpen) setRegisteredMenuOpen(false)
      setCreateMenuOpen(!createMenuOpen)
    }
  }

  const handleRegisteredMenuToggle = () => {
    if (isCollapsed) {
      toggleSidebar()
      setRegisteredMenuOpen(true)
      setCreateMenuOpen(false)
    } else {
      if (!registeredMenuOpen) setCreateMenuOpen(false)
      setRegisteredMenuOpen(!registeredMenuOpen)
    }
  }

  const renderNavItem = (id, label, icon, onClick, selected, special = false) => (
    <Tooltip title={isCollapsed ? label : ''} placement="right">
      <ListItemButton
        selected={selected}
        onClick={onClick}
        sx={{
          mx: 1,
          my: 0.5,
          borderRadius: 3,
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          px: isCollapsed ? 1 : 2,
          minHeight: 48,
          transition: 'all 0.2s',
          color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
          bgcolor: selected ? (theme.palette.mode === 'light' ? 'rgba(0, 102, 255, 0.08)' : 'rgba(99, 102, 241, 0.16)') : 'transparent',
          '&:hover': {
            bgcolor: selected
              ? (theme.palette.mode === 'light' ? 'rgba(0, 102, 255, 0.12)' : 'rgba(99, 102, 241, 0.24)')
              : (theme.palette.mode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)'),
          },
        }}
      >
        <ListItemIcon sx={{
          color: 'inherit',
          minWidth: isCollapsed ? 0 : 40,
          mr: isCollapsed ? 0 : 0,
          justifyContent: 'center'
        }}>
          {icon}
        </ListItemIcon>
        {!isCollapsed && (
          <ListItemText
            primary={label}
            primaryTypographyProps={{
              fontWeight: selected ? 600 : 400,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              lineHeight: 1.2
            }}
          />
        )}
        {!isCollapsed && special && (
          <Box component="span" ml={1}>
            {/* Special icon/indicator if needed */}
          </Box>
        )}
      </ListItemButton>
    </Tooltip>
  )

  return (
    <Paper
      elevation={0}
      sx={{
        width: isCollapsed ? 80 : 280,
        minWidth: isCollapsed ? 80 : 280,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        m: '5px',
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'width 0.3s ease, min-width 0.3s ease',
        boxShadow: '0 8px 32px rgba(74, 144, 217, 0.1)',
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)',
        border: '1px solid rgba(74, 144, 217, 0.12)',
        position: 'relative',
      }}
    >
      {/* Header / Brand */}
      <Box sx={{ p: 1, display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', minHeight: 80, overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: isCollapsed ? 'none' : 1,
            width: isCollapsed ? '100%' : 'auto',
            height: '100%',
            mr: isCollapsed ? 0 : 1,
            overflow: 'hidden',
          }}
        >
          <img
            src={WatcherLogo}
            alt="Docker Watcher"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </Box>
        {!isCollapsed && (
          <IconButton onClick={toggleSidebar} size="small">
            <ChevronLeft />
          </IconButton>
        )}
      </Box>

      {/* Toggle button when collapsed (centered) */}
      {isCollapsed && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
          <IconButton onClick={toggleSidebar} size="small">
            <ChevronRight />
          </IconButton>
        </Box>
      )}

      <Divider sx={{ mx: 2, mb: 1 }} />

      <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <List component="nav">
          {menuItems.map(item => (
            <React.Fragment key={item.id}>
              {renderNavItem(item.id, item.label, item.icon, () => onPageChange(item.id), currentPage === item.id)}
            </React.Fragment>
          ))}

          <Divider sx={{ my: 1, mx: 2 }} />

          {/* Robôs Cadastrados Group */}
          {renderNavItem(
            'group-registered',
            'Robôs Cadastrados',
            <RobotIcon />,
            handleRegisteredMenuToggle,
            isRegisteredPage,
            registeredMenuOpen
          )}

          <Collapse in={registeredMenuOpen && !isCollapsed} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {renderNavItem('rpas', 'RPAs', <CircleIcon sx={{ fontSize: 8 }} />, () => onPageChange('rpas'), currentPage === 'rpas')}
              {renderNavItem('cronjobs', 'Cronjobs', <CircleIcon sx={{ fontSize: 8 }} />, () => onPageChange('cronjobs'), currentPage === 'cronjobs')}
              {renderNavItem('deployments', 'Deployments', <CircleIcon sx={{ fontSize: 8 }} />, () => onPageChange('deployments'), currentPage === 'deployments')}
            </List>
          </Collapse>

          {/* Adicionar Robô Group */}
          {renderNavItem(
            'group-new',
            'Adicionar Robô',
            <AddIcon />,
            handleCreateMenuToggle,
            isCreatePage,
            createMenuOpen
          )}

          <Collapse in={createMenuOpen && !isCollapsed} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {renderNavItem('criar-rpa', 'Novo RPA', <CircleIcon sx={{ fontSize: 8 }} />, () => onPageChange('criar-rpa'), currentPage === 'criar-rpa')}
              {renderNavItem('criar-cronjob', 'Novo Cronjob', <CircleIcon sx={{ fontSize: 8 }} />, () => onPageChange('criar-cronjob'), currentPage === 'criar-cronjob')}
              {renderNavItem('criar-deployment', 'Novo Deployment', <CircleIcon sx={{ fontSize: 8 }} />, () => onPageChange('criar-deployment'), currentPage === 'criar-deployment')}
            </List>
          </Collapse>

        </List>
      </Box>

      <Box sx={{ p: 2 }}>
        {renderNavItem('configuracoes', 'Configurações', <SettingsApplicationsIcon />, () => onPageChange('configuracoes'), currentPage === 'configuracoes')}

        <Divider sx={{ my: 1 }} />

        {/* Connection Status Section */}
        <Box sx={{
          mt: 2,
          px: isCollapsed ? 0 : 2,
        }}>
          {!isCollapsed ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircleIcon sx={{ fontSize: 10, color: connectionStatus?.mysql ? 'success.main' : 'error.main' }} />
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.8rem' }}>
                    BWAv4
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircleIcon sx={{ fontSize: 10, color: connectionStatus?.ssh ? 'success.main' : 'error.main' }} />
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.8rem' }}>
                    SSH Linux
                  </Typography>
                </Box>
              </Box>

              <Tooltip title={isReconnecting ? 'Reconectando...' : 'Reconectar'}>
                <IconButton
                  onClick={onReconnect}
                  disabled={isReconnecting}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(0,0,0,0.02)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' }
                  }}
                >
                  {isReconnecting ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
              <Tooltip title={`Database BWA: ${connectionStatus?.mysql ? 'Conectado' : 'Desconectado'}`} placement="right">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  <CircleIcon sx={{ fontSize: 8, color: connectionStatus?.mysql ? 'success.main' : 'error.main' }} />
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary' }}>DB</Typography>
                </Box>
              </Tooltip>
              <Tooltip title={`SSH Linux: ${connectionStatus?.ssh ? 'Conectado' : 'Desconectado'}`} placement="right">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  <CircleIcon sx={{ fontSize: 8, color: connectionStatus?.ssh ? 'success.main' : 'error.main' }} />
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary' }}>VM</Typography>
                </Box>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Box>

    </Paper>
  )
}
