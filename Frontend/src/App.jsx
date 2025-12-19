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
    mode: 'light',
    primary: {
      main: '#4A90D9', // Royal Blue (azul real suave)
      light: '#7BB3EA', // Light Blue
      dark: '#2E6BB5',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#5ECFCF', // Turquoise (turquesa pálido)
      light: '#8EDFDF',
      dark: '#3BAFAF',
    },
    background: {
      default: '#E8F4FC', // Very light sky blue background
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2C3E50',
      secondary: '#5D7285',
    },
    success: {
      main: '#4ECDC4', // Turquesa para sucesso
    },
    warning: {
      main: '#FFB347', // Laranja pastel
    },
    error: {
      main: '#FF6B6B', // Vermelho suave
    },
    divider: 'rgba(74, 144, 217, 0.12)',
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 700,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 4px 24px rgba(74, 144, 217, 0.08)',
          border: '1px solid rgba(74, 144, 217, 0.08)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 12,
          padding: '10px 24px',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(74, 144, 217, 0.2)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #4A90D9 0%, #5ECFCF 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #3B7DC9 0%, #4DBFBF 100%)',
          },
        },
        outlined: {
          borderColor: '#4A90D9',
          color: '#4A90D9',
          '&:hover': {
            backgroundColor: 'rgba(74, 144, 217, 0.08)',
            borderColor: '#3B7DC9',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 4px 24px rgba(74, 144, 217, 0.08)',
          border: '1px solid rgba(74, 144, 217, 0.08)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
        colorSuccess: {
          backgroundColor: 'rgba(78, 205, 196, 0.15)',
          color: '#2A9D8F',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(74, 144, 217, 0.1)',
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      `,
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
          vertical: 'bottom',
          horizontal: 'left',
        }}
        autoHideDuration={5000}
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
