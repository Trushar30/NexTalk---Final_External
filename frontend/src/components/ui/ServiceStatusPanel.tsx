import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { statusApi, type ServiceStatus as ServiceStatusType, type SystemStatus } from '@/lib/api';
import {
  Activity,
  Server,
  Database,
  Cpu,
  Shield,
  MessageSquare,
  ScanFace,
  SmilePlus,
  Wifi,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
} from 'lucide-react';

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  'Backend API': <Server className="w-4 h-4" />,
  'Database (MongoDB)': <Database className="w-4 h-4" />,
  'Redis (Queue)': <Zap className="w-4 h-4" />,
  'AI Service': <Cpu className="w-4 h-4" />,
  'Toxicity Filter': <Shield className="w-4 h-4" />,
  'Chat Summarizer': <MessageSquare className="w-4 h-4" />,
  'Face Authentication': <ScanFace className="w-4 h-4" />,
  'Emotion Detection': <SmilePlus className="w-4 h-4" />,
  'Real-time (WebSocket)': <Wifi className="w-4 h-4" />,
};

const STATUS_CONFIG = {
  operational: {
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    label: 'Operational',
    icon: CheckCircle2,
  },
  degraded: {
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    label: 'Degraded',
    icon: AlertTriangle,
  },
  down: {
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    label: 'Down',
    icon: XCircle,
  },
};

function StatusDot({ status }: { status: 'operational' | 'degraded' | 'down' }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === 'operational' && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
          style={{ backgroundColor: config.color }}
        />
      )}
      <span
        className="relative inline-flex h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: config.color }}
      />
    </span>
  );
}

function ServiceRow({ service, index }: { service: ServiceStatusType; index: number }) {
  const config = STATUS_CONFIG[service.status];
  const StatusIcon = config.icon;
  const icon = SERVICE_ICONS[service.name] || <Activity className="w-4 h-4" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="flex items-center justify-between py-3 px-4 rounded-xl transition-all hover:bg-white/[0.02] group"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{service.name}</p>
          {service.message && (
            <p className="text-xs text-text-muted truncate">{service.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {service.latencyMs !== null && service.status === 'operational' && (
          <span className="text-xs font-mono text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
            {service.latencyMs}ms
          </span>
        )}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{
            backgroundColor: config.bgColor,
            color: config.color,
            border: `1px solid ${config.borderColor}`,
          }}
        >
          <StatusIcon className="w-3 h-3" />
          {config.label}
        </div>
      </div>
    </motion.div>
  );
}

export function ServiceStatusPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStatus = useCallback(async (showRefreshAnimation = false) => {
    if (showRefreshAnimation) setIsRefreshing(true);
    try {
      const data = await statusApi.check();
      setStatus(data);
      setLastChecked(new Date());
      setError('');
    } catch (e: any) {
      setError('Could not reach server');
    } finally {
      setLoading(false);
      if (showRefreshAnimation) {
        setTimeout(() => setIsRefreshing(false), 600);
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30s
    const interval = setInterval(() => fetchStatus(), 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const operationalCount = status?.services.filter(s => s.status === 'operational').length || 0;
  const totalCount = status?.services.length || 0;
  const downCount = status?.services.filter(s => s.status === 'down').length || 0;

  const overallConfig = status
    ? downCount > 0
      ? STATUS_CONFIG.down
      : STATUS_CONFIG.operational
    : STATUS_CONFIG.degraded;

  // Group: Infrastructure vs AI Features
  const infrastructure = status?.services.filter(s =>
    ['Backend API', 'Database (MongoDB)', 'Redis (Queue)', 'Real-time (WebSocket)'].includes(s.name)
  ) || [];
  const aiFeatures = status?.services.filter(s =>
    ['AI Service', 'Toxicity Filter', 'Chat Summarizer', 'Face Authentication', 'Emotion Detection'].includes(s.name)
  ) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent-glow" />
          <h2 className="text-xl font-bold">System Status</h2>
        </div>
        <button
          onClick={() => fetchStatus(true)}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overall Status Banner */}
      <motion.div
        layout
        className="relative overflow-hidden rounded-2xl p-5"
        style={{
          background: `linear-gradient(135deg, ${overallConfig.bgColor}, rgba(0,0,0,0.2))`,
          border: `1px solid ${overallConfig.borderColor}`,
        }}
      >
        {/* Subtle animated glow */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(circle at 20% 50%, ${overallConfig.color}, transparent 50%)`,
          }}
        />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusDot status={error ? 'down' : (status ? (downCount > 0 ? 'down' : 'operational') : 'degraded')} />
            <div>
              <h3 className="font-semibold text-base" style={{ color: error ? STATUS_CONFIG.down.color : overallConfig.color }}>
                {loading
                  ? 'Checking services...'
                  : error
                  ? 'Service Unreachable'
                  : downCount > 0
                  ? `${downCount} service${downCount > 1 ? 's' : ''} affected`
                  : 'All Systems Operational'}
              </h3>
              {lastChecked && (
                <p className="text-xs text-text-muted mt-0.5">
                  Last checked: {lastChecked.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          {!loading && !error && (
            <div className="text-right">
              <span className="text-2xl font-bold font-mono" style={{ color: overallConfig.color }}>
                {operationalCount}/{totalCount}
              </span>
              <p className="text-xs text-text-muted">services up</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Loading Skeleton */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 px-4 rounded-xl">
                <div className="w-8 h-8 rounded-lg shimmer" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded shimmer" />
                  <div className="h-2.5 w-20 rounded shimmer" />
                </div>
                <div className="h-6 w-24 rounded-full shimmer" />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Service Groups */}
      {!loading && !error && status && (
        <div className="space-y-4">
          {/* Infrastructure */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider px-4 mb-1">
              Infrastructure
            </p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              {infrastructure.map((s, i) => (
                <ServiceRow key={s.name} service={s} index={i} />
              ))}
            </div>
          </div>

          {/* AI Features */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider px-4 mb-1">
              AI Features
            </p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              {aiFeatures.map((s, i) => (
                <ServiceRow key={s.name} service={s} index={i + infrastructure.length} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-8 gap-3"
        >
          <XCircle className="w-10 h-10 text-danger opacity-60" />
          <p className="text-sm text-text-secondary">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchStatus(); }}
            className="text-xs text-accent-glow hover:underline"
          >
            Try again
          </button>
        </motion.div>
      )}

      {/* Auto-refresh indicator */}
      <p className="text-[11px] text-text-muted text-center opacity-50">
        Auto-refreshes every 30 seconds
      </p>
    </div>
  );
}
