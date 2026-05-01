import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { User, Mail, Lock, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { authApi } from '@/lib/api';
import { FallingPattern } from '@/components/ui/falling-pattern';
import DotPattern from '@/components/ui/dot-pattern-1';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup, isLoading, error, clearError } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  // Debounced username availability check
  const checkUsername = useCallback(async (uname: string) => {
    if (uname.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    try {
      const result = await authApi.checkUsername(uname);
      setUsernameStatus(result.available ? 'available' : 'taken');
    } catch {
      setUsernameStatus('idle');
    }
  }, []);

  useEffect(() => {
    if (username.length < 3) { setUsernameStatus('idle'); return; }
    const timer = setTimeout(() => checkUsername(username), 500);
    return () => clearTimeout(timer);
  }, [username, checkUsername]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus === 'taken') return;
    clearError();
    try {
      await signup({ username, email, password, displayName });
      navigate('/setup/face-scan');
    } catch {
      // Error is handled in store
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent-glow/5 rounded-full blur-[120px] pointer-events-none z-0" />
      
      <div className="absolute inset-0 z-0 pointer-events-none">
        <FallingPattern
          className="w-full h-full opacity-60 [mask-image:radial-gradient(ellipse_at_center,transparent,var(--bg-primary))]"
          color="var(--accent-primary)"
          duration={80}
          blurIntensity="0.5rem"
          density={2}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <Card glass className="p-8 relative border border-accent-primary/40 rounded-none bg-bg-elevated/90">
          <DotPattern width={20} height={20} cx={1} cy={1} cr={1.5} className="fill-accent-primary/30" />
          
          <div className="absolute -left-1.5 -top-1.5 h-3 w-3 bg-accent-primary shadow-[0_0_8px_var(--accent-glow)] z-10" />
          <div className="absolute -bottom-1.5 -left-1.5 h-3 w-3 bg-accent-primary shadow-[0_0_8px_var(--accent-glow)] z-10" />
          <div className="absolute -right-1.5 -top-1.5 h-3 w-3 bg-accent-primary shadow-[0_0_8px_var(--accent-glow)] z-10" />
          <div className="absolute -bottom-1.5 -right-1.5 h-3 w-3 bg-accent-primary shadow-[0_0_8px_var(--accent-glow)] z-10" />

          <div className="relative z-20 text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Join NexTalk</h1>
            <p className="text-text-secondary">Create your account to connect deeply.</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm mb-4"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <Input 
              type="text" 
              placeholder="Full Name" 
              icon={<User className="w-4 h-4" />} 
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required 
            />
            
            <div className="relative">
              <Input 
                type="text" 
                placeholder="Username" 
                icon={<span className="font-mono text-text-muted">@</span>}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                required 
              />
              {username.length > 2 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-text-muted animate-spin" />}
                  {usernameStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-success" />}
                  {usernameStatus === 'taken' && <XCircle className="w-4 h-4 text-danger" />}
                </div>
              )}
            </div>
            
            <Input 
              type="email" 
              placeholder="Email address" 
              icon={<Mail className="w-4 h-4" />} 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
            
            <Input 
              type="password" 
              placeholder="Password (min 8 characters)" 
              icon={<Lock className="w-4 h-4" />} 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />

            <Button type="submit" className="w-full mt-4" size="lg" disabled={isLoading || usernameStatus === 'taken'}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : 'Continue'}
            </Button>
          </form>

          <p className="text-center text-sm text-text-secondary mt-6">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-accent-primary hover:text-accent-glow font-medium transition-colors">
              Sign in
            </button>
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
