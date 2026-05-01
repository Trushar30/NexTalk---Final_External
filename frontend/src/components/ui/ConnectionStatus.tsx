import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

interface ServiceStatus {
  backend: 'checking' | 'online' | 'offline';
  backendInfo?: { uptime: number; memory: string; env: string };
  ai: 'checking' | 'online' | 'offline';
}

export function ConnectionStatus() {
  const [status, setStatus] = useState<ServiceStatus>({
    backend: 'checking',
    ai: 'checking',
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function checkServices() {
      // Check backend
      try {
        const backendUrl = SOCKET_URL || API_URL.replace('/api', '');
        const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        setStatus((s) => ({
          ...s,
          backend: data.status === 'ok' ? 'online' : 'offline',
          backendInfo: { uptime: data.uptime, memory: data.memory, env: data.env },
        }));
      } catch {
        setStatus((s) => ({ ...s, backend: 'offline' }));
      }

      // Check AI service (via backend proxy)
      try {
        const backendUrl = SOCKET_URL || API_URL.replace('/api', '');
        const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          setStatus((s) => ({ ...s, ai: 'online' }));
        } else {
          setStatus((s) => ({ ...s, ai: 'offline' }));
        }
      } catch {
        setStatus((s) => ({ ...s, ai: 'offline' }));
      }
    }

    checkServices();
    const interval = setInterval(checkServices, 30000); // Re-check every 30s
    return () => clearInterval(interval);
  }, []);

  const dotColor = {
    checking: '#facc15', // yellow
    online: '#22c55e',   // green
    offline: '#ef4444',  // red
  };

  const allOnline = status.backend === 'online';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 99999,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      {/* Pill indicator */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(12px)',
          color: '#fff',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: `0 0 12px ${dotColor[status.backend]}33`,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor[status.backend],
            boxShadow: `0 0 6px ${dotColor[status.backend]}`,
            animation: status.backend === 'checking' ? 'pulse 1.5s infinite' : 'none',
          }}
        />
        <span style={{ opacity: 0.9 }}>
          {status.backend === 'checking' ? 'Connecting...' : allOnline ? 'Backend Connected' : 'Backend Offline'}
        </span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.9)',
            backdropFilter: 'blur(16px)',
            color: '#fff',
            minWidth: 250,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 13 }}>🔌 Service Status</div>

          {/* Backend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor[status.backend] }} />
            <span style={{ flex: 1 }}>Node.js Backend</span>
            <span style={{ opacity: 0.5, fontSize: 11 }}>{status.backend}</span>
          </div>

          {status.backendInfo && (
            <div style={{ marginLeft: 16, marginBottom: 10, opacity: 0.6, fontSize: 11 }}>
              Uptime: {Math.floor(status.backendInfo.uptime / 60)}m • RAM: {status.backendInfo.memory} • {status.backendInfo.env}
            </div>
          )}

          {/* URLs */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 4, fontSize: 11, opacity: 0.5 }}>
            <div>API: {API_URL}</div>
            <div>Socket: {SOCKET_URL}</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
