import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Camera, Mail, Lock, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { FallingPattern } from '@/components/ui/falling-pattern';
import DotPattern from '@/components/ui/dot-pattern-1';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginWithFace, isLoading, error, clearError } = useAuthStore();
  const [loginMethod, setLoginMethod] = useState<'password' | 'face'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  // Camera State
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'verifying' | 'success' | 'error'>('idle');
  const [scanError, setScanError] = useState('');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = async () => {
    clearError();
    if (!email) {
      setScanError('Please enter your email first to use Face ID');
      setScanStatus('error');
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not available (Insecure context or unsupported browser)');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setScanStatus('scanning');
      setScanError('');
    } catch (err: any) {
      console.error(err);
      setScanStatus('error');
      setScanError(err.message || 'Could not access camera. Please allow permissions.');
    }
  };

  const handleOpenFaceScan = () => {
    setIsScanning(true);
    setScanStatus('idle');
    setScanError('');
    startCamera();
  };

  const handleCloseFaceScan = () => {
    stopCamera();
    setIsScanning(false);
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => stopCamera();
  }, [stopCamera]);

  const captureAndLogin = async () => {
    if (!videoRef.current || scanStatus !== 'scanning') return;
    
    setScanStatus('verifying');
    setScanError('');

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Could not capture frame');

      const file = new File([blob], 'face.jpg', { type: 'image/jpeg' });
      
      const result = await loginWithFace(email, file);
      
      if (result.verified) {
        setScanStatus('success');
        stopCamera();
        setTimeout(() => {
          setIsScanning(false);
          navigate('/messages');
        }, 1500);
      } else {
        throw new Error('Face not recognized');
      }
    } catch (err: any) {
      setScanStatus('error');
      setScanError(err.message || 'Face login failed. Try again or use password.');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      navigate('/messages');
    } catch {
      // Error is handled in store
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative */}
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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md z-10"
      >
        <Card glass className="flex flex-col gap-6 p-8 relative border border-accent-primary/40 rounded-none bg-bg-elevated/90">
          <DotPattern width={20} height={20} cx={1} cy={1} cr={1.5} className="fill-accent-primary/30" />
          
          <div className="absolute -left-1.5 -top-1.5 h-3 w-3 bg-accent-primary shadow-[0_0_8px_var(--accent-glow)]" />
          <div className="absolute -bottom-1.5 -left-1.5 h-3 w-3 bg-accent-primary shadow-[0_0_8px_var(--accent-glow)]" />
          <div className="absolute -right-1.5 -top-1.5 h-3 w-3 bg-accent-primary shadow-[0_0_8px_var(--accent-glow)]" />
          <div className="absolute -bottom-1.5 -right-1.5 h-3 w-3 bg-accent-primary shadow-[0_0_8px_var(--accent-glow)]" />

          <div className="relative z-20 text-center space-y-2">
            <div className="w-12 h-12 bg-accent-primary rounded-xl mx-auto flex items-center justify-center mb-4">
              <span className="text-white font-heading font-bold text-xl">N</span>
            </div>
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-text-secondary text-sm">Enter your details to sign in to NexTalk</p>
          </div>

          {error && !isScanning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Login Method Tabs */}
          <div className="flex p-1 bg-bg-secondary rounded-lg mb-2">
            <button
              type="button"
              onClick={() => { setLoginMethod('password'); clearError(); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${loginMethod === 'password' ? 'bg-bg-elevated shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => { setLoginMethod('face'); clearError(); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${loginMethod === 'face' ? 'bg-bg-elevated shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Face ID
            </button>
          </div>

          {loginMethod === 'password' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Input 
                  type="email" 
                  placeholder="Email address" 
                  icon={<Mail className="w-4 h-4" />} 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
              <div className="space-y-2">
                <Input 
                  type="password" 
                  placeholder="Password" 
                  icon={<Lock className="w-4 h-4" />} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
              </div>

              <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Input 
                  type="email" 
                  placeholder="Email address" 
                  icon={<Mail className="w-4 h-4" />} 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
              {!email && (
                <p className="text-xs text-text-muted text-center px-4">
                  Enter your email address to use Face ID login
                </p>
              )}
              <Button 
                variant="glass" 
                className={`w-full h-12 relative overflow-hidden group ${!email ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleOpenFaceScan}
                disabled={!email}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-accent-primary/0 via-accent-primary/10 to-accent-primary/0 translate-x-[-100%] group-hover:animate-shimmerWave" />
                <Camera className="w-5 h-5 mr-2 text-accent-glow" />
                Scan Face to Sign In
              </Button>
            </div>
          )}

          <p className="text-center text-sm text-text-secondary mt-2">
            Don't have an account?{' '}
            <button onClick={() => navigate('/signup')} className="text-accent-primary hover:text-accent-glow font-medium transition-colors">
              Sign up
            </button>
          </p>
        </Card>
      </motion.div>

      {/* Face Scan Modal */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg-primary/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
          >
            <button 
              onClick={handleCloseFaceScan}
              className="absolute top-8 right-8 p-3 bg-bg-secondary rounded-full border border-border-subtle hover:bg-bg-tertiary transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="text-center flex flex-col items-center max-w-sm w-full">
              
              {scanStatus === 'error' && (
                <div className="mb-6 flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm text-left w-full">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{scanError}</span>
                </div>
              )}

              <div className="relative w-64 h-80 mx-auto mb-8">
                {/* Camera Feed Context */}
                <div className="absolute inset-0 bg-bg-secondary rounded-[2rem] border border-border-subtle overflow-hidden relative">
                  
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className={`w-full h-full object-cover ${(scanStatus === 'success' || scanStatus === 'error') ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                  />

                  {(scanStatus === 'idle' || scanStatus === 'scanning' || scanStatus === 'verifying') && (
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-accent-primary to-transparent pointer-events-none" />
                  )}
                  
                  {(scanStatus === 'scanning' || scanStatus === 'verifying') && (
                    <motion.div 
                      className="absolute left-0 right-0 h-1 bg-accent-glow shadow-[0_0_15px_rgba(159,95,241,1)]"
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                  
                  {scanStatus === 'success' && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute inset-0 flex items-center justify-center bg-bg-secondary/80 backdrop-blur-sm"
                    >
                      <CheckCircle2 className="w-20 h-20 text-success drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                    </motion.div>
                  )}

                  {scanStatus === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary/80 backdrop-blur-sm">
                      <AlertCircle className="w-20 h-20 text-danger drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
                    </div>
                  )}
                </div>

                {/* Setup Frame Brackets */}
                <div className="absolute -top-4 -left-4 w-12 h-12 border-t-4 border-l-4 border-accent-primary rounded-tl-2xl transition-colors" />
                <div className="absolute -top-4 -right-4 w-12 h-12 border-t-4 border-r-4 border-accent-primary rounded-tr-2xl transition-colors" />
                <div className="absolute -bottom-4 -left-4 w-12 h-12 border-b-4 border-l-4 border-accent-primary rounded-bl-2xl transition-colors" />
                <div className="absolute -bottom-4 -right-4 w-12 h-12 border-b-4 border-r-4 border-accent-primary rounded-br-2xl transition-colors" />
              </div>

              <div className="h-12 mb-4">
                <h3 className="text-xl font-bold mb-1">Scanning Face ID</h3>
                {scanStatus === 'success' && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-success font-medium">
                    Verified securely ✓
                  </motion.p>
                )}
                {scanStatus === 'verifying' && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-text-muted font-medium animate-pulse">
                    Verifying identity...
                  </motion.p>
                )}
                {scanStatus === 'scanning' && (
                  <p className="text-text-secondary text-sm">Align your face and click capture.</p>
                )}
              </div>

              {scanStatus !== 'success' && (
                <Button 
                  className="w-full max-w-[200px]" 
                  size="lg"
                  disabled={scanStatus !== 'scanning' && scanStatus !== 'error'}
                  onClick={scanStatus === 'error' ? startCamera : captureAndLogin}
                  variant={scanStatus === 'error' ? 'outline' : 'primary'}
                >
                  {scanStatus === 'error' ? 'Retry Camera' : (scanStatus === 'verifying' ? 'Verifying...' : 'Capture Login')}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
