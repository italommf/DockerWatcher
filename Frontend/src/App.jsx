import React from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { Box } from '@mui/material'
import { SnackbarProvider } from 'notistack'
import { AppLogsProvider } from './context/AppLogsContext'
import { DashboardCacheProvider } from './context/DashboardCacheContext'
import Layout from './components/Layout/Layout'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6366F1', // Indigo
    },
    secondary: {
      main: '#8B5CF6', // Purple
    },
    success: {
      main: '#10B981', // Green
    },
    warning: {
      main: '#F59E0B', // Amber
    },
    error: {
      main: '#EF4444', // Red
    },
    info: {
      main: '#3B82F6', // Blue
    },
    background: {
      default: '#0F172A',
      paper: 'rgba(30, 41, 59, 0.3)',
    },
    text: {
      primary: '#F8FAFC', // Slate 50
      secondary: '#CBD5E1', // Slate 300
    },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(30, 41, 59, 0.3)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 12,
          padding: '10px 24px',
          backdropFilter: 'blur(10px)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(30, 41, 59, 0.3)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
      },
    },
  },
})

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider
        maxSnack={3}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        autoHideDuration={3000}
        dense={false}
        preventDuplicate={true}
      >
        <AppLogsProvider>
          <DashboardCacheProvider>
            <Box 
              sx={{ 
                width: '100vw', 
                height: '100vh', 
                overflow: 'hidden',
                position: 'relative',
                bgcolor: 'background.default',
              }}
            >
              <Layout />
            </Box>
          </DashboardCacheProvider>
        </AppLogsProvider>
      </SnackbarProvider>
    </ThemeProvider>
  )
}

export default App
