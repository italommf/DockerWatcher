import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar />
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
    </BrowserRouter>
  );
}

export default App;
