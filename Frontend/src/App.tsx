import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SnackbarProvider, closeSnackbar } from 'notistack';
import { X } from 'lucide-react';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { RPAs } from './pages/RPAs';

// Placeholder page for Heartbeat
function Heartbeat() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center glass rounded-2xl p-12 animate-fadeIn">
        <p className="text-2xl font-semibold gradient-text mb-3">Heartbeat</p>
        <p className="text-[var(--color-text-muted)]">Em desenvolvimento...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <SnackbarProvider 
      maxSnack={3}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      autoHideDuration={3000}
      action={(id) => (
        <button
          onClick={() => closeSnackbar(id)}
          className="ml-2 p-1 rounded hover:bg-white/10 transition-colors
                   text-[var(--color-text-muted)] hover:text-[var(--color-text)]
                   flex items-center justify-center"
          aria-label="Fechar notificação"
        >
          <X size={16} />
        </button>
      )}
    >
      <BrowserRouter>
        <div className="flex min-h-screen w-full">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/rpas" element={<RPAs />} />
              <Route path="/heartbeat" element={<Heartbeat />} />
              {/* Redirect old routes to RPAs page */}
              <Route path="/cronjobs" element={<Navigate to="/rpas" replace />} />
              <Route path="/deployments" element={<Navigate to="/rpas" replace />} />
              <Route path="/settings" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </SnackbarProvider>
  );
}

export default App;
