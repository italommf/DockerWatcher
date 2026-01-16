const { app, BrowserWindow } = require('electron')
const path = require('path')

// Detectar se está em modo desenvolvimento
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development'

let mainWindow = null

// Função para verificar se o servidor está pronto
function waitForServer(url, maxAttempts = 60, delay = 500) {
  return new Promise((resolve, reject) => {
    const http = require('http')
    const urlObj = new URL(url)
    let attempts = 0

    function check() {
      attempts++
      const req = http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve(true)
        } else {
          if (attempts >= maxAttempts) {
            reject(new Error(`Servidor retornou status ${res.statusCode}`))
          } else {
            setTimeout(check, delay)
          }
        }
      })

      req.on('error', (error) => {
        if (attempts >= maxAttempts) {
          reject(new Error(`Servidor não disponível após ${maxAttempts} tentativas: ${error.message}`))
        } else {
          setTimeout(check, delay)
        }
      })

      req.setTimeout(2000, () => {
        req.destroy()
        if (attempts >= maxAttempts) {
          reject(new Error(`Timeout ao conectar ao servidor`))
        } else {
          setTimeout(check, delay)
        }
      })
    }

    check()
  })
}

// Função para criar a janela principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0F172A',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Permitir carregar localhost em dev
    },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'default',
    show: false,
  })

  // Carregar a aplicação
  const startURL = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '..', 'renderer-dist', 'index.html')}`

  // Aguardar servidor estar pronto em dev
  if (isDev) {
    console.log('Aguardando servidor React em', startURL)
    waitForServer(startURL, 60, 500)
      .then(() => {
        console.log('✓ Servidor React está pronto, carregando página...')
        mainWindow.loadURL(startURL)
      })
      .catch((error) => {
        console.error('✗ Erro ao aguardar servidor:', error.message)
        console.log('⚠ Tentando carregar mesmo assim...')
        console.log('⚠ Certifique-se de que o React está rodando: npm run dev:react')
        // Mostrar janela mesmo assim para ver erros
        mainWindow.show()
        mainWindow.loadURL(startURL)
      })
  } else {
    mainWindow.loadURL(startURL)
  }

  // Tratamento de erros de carregamento
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('✗ Erro ao carregar página:')
    console.error('  Código:', errorCode)
    console.error('  Descrição:', errorDescription)
    console.error('  URL:', validatedURL)

    if (isDev) {
      // Tentar recarregar após 3 segundos
      console.log('⏳ Tentando recarregar em 3 segundos...')
      setTimeout(() => {
        console.log('🔄 Recarregando...')
        mainWindow.loadURL(startURL)
      }, 3000)
    } else {
      // Em produção, mostrar mensagem de erro
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial; color: white; background: #0F172A;"><h1>Erro ao carregar aplicação</h1></div>';
      `)
    }
  })

  // Log de erros do console
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) { // Error ou Warning
      console.log(`[Console ${level}] ${message}`)
    }
  })

  // Mostrar janela quando estiver pronta
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()

    // Abrir DevTools apenas em modo de desenvolvimento
    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Log quando carregar com sucesso
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✓ Página carregada com sucesso!')
  })

  // Log de erros não capturados do React
  mainWindow.webContents.on('unresponsive', () => {
    console.error('⚠ Página não está respondendo')
  })

  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('✗ Página travou/caiu')
  })
}

// Backend não é mais iniciado localmente - deve estar rodando em um servidor remoto
// O usuário configura a URL do backend na interface de Configurações

// Aguardar até que o app esteja pronto
app.whenReady().then(() => {
  console.log('🚀 Iniciando aplicação...')
  console.log('💡 Backend deve estar rodando em um servidor remoto')
  console.log('💡 Configure a URL do backend em Configurações')

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Tratamento de erros
process.on('uncaughtException', (error) => {
  console.error('Erro não capturado:', error)
})
