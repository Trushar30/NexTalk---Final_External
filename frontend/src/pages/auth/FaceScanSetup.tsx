import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { authApi } from '@/lib/api';

export default function FaceScanSetup() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [status, setStatus] = useState<'idle' | 'scanning' | 'registering' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const startCamera = async () => {
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
      setStatus('scanning');
      setErrorMessage('');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage(err.message || 'Could not access camera. Please allow permissions.');
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [stopCamera]);

  const captureAndRegister = async () => {
    if (!videoRef.current || status !== 'scanning') return;
    
    setStatus('registering');
    setErrorMessage('');

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
      await authApi.registerFace(file);
      
      setStatus('success');
      stopCamera();
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to register face. Please try again.');
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    startCamera();
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="text-center z-10 max-w-md w-full">
        <h1 className="text-3xl font-bold mb-2">Face ID Setup</h1>
        <p className="text-text-secondary mb-8">
          Position your face in the frame. Keep still. Good lighting helps.
        </p>

        {status === 'error' && (
          <div className="mb-6 flex items-center gap-2 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm text-left">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
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
              className={`w-full h-full object-cover ${(status === 'success' || status === 'error') ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
            />

            {(status === 'idle' || status === 'scanning' || status === 'registering') && (
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-accent-primary to-transparent pointer-events-none" />
            )}
            
            {(status === 'scanning' || status === 'registering') && (
              <motion.div 
                className="absolute left-0 right-0 h-1 bg-accent-glow shadow-[0_0_15px_rgba(159,95,241,1)]"
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
            )}
            
            {status === 'success' && (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute inset-0 flex items-center justify-center bg-bg-secondary/80 backdrop-blur-sm"
              >
                <CheckCircle2 className="w-20 h-20 text-success drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
              </motion.div>
            )}

            {status === 'error' && (
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

        {/* Progress Indication */}
        <div className="h-8 mb-4">
          {status === 'success' && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-success font-medium">
              Face ID registered ✓
            </motion.p>
          )}
          {status === 'registering' && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-text-muted font-medium animate-pulse">
              Analyzing facial structure...
            </motion.p>
          )}
          {status === 'scanning' && (
            <p className="text-text-secondary text-sm">Align your face and click capture.</p>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <p className="text-xs text-text-muted max-w-[250px] mx-auto">
            Your face data is encrypted and stored locally + securely. It never leaves your device.
          </p>

          <div className="flex gap-2">
            {status !== 'success' && (
              <Button 
                className="flex-1" 
                size="lg"
                disabled={status !== 'scanning' && status !== 'error'}
                onClick={status === 'error' ? handleRetry : captureAndRegister}
                variant={status === 'error' ? 'outline' : 'primary'}
              >
                {status === 'error' ? 'Retry Camera' : (status === 'registering' ? 'Scanning...' : 'Capture Face')}
              </Button>
            )}

            <Button 
              className="flex-1" 
              size="lg" 
              variant={status === 'success' ? 'primary' : 'glass'}
              disabled={status === 'registering'}
              onClick={() => { stopCamera(); navigate('/setup/profile'); }}
            >
              {status === 'success' ? 'Continue' : 'Skip'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
