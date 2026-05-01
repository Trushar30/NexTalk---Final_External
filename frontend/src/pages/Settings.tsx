import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { User, Bell, Shield, Paintbrush, HelpCircle, LogOut, X, AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/useAuthStore';
import { authApi, usersApi } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { PREDEFINED_AVATARS } from '@/constants/avatars';
import { ServiceStatusPanel } from '@/components/ui/ServiceStatusPanel';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  
  const [activeSection, setActiveSection] = useState('account');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'registering' | 'success' | 'error'>('idle');
  const [scanError, setScanError] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

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
    return () => stopCamera();
  }, [stopCamera]);

  const captureAndRegister = async () => {
    if (!videoRef.current || scanStatus !== 'scanning') return;
    
    setScanStatus('registering');
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
      await authApi.registerFace(file);
      
      setScanStatus('success');
      stopCamera();
      setTimeout(() => {
        setIsScanning(false);
      }, 2000);
    } catch (err: any) {
      setScanStatus('error');
      setScanError(err.message || 'Failed to register face. Please try again.');
    }
  };
  
  const menuSections = [
    { title: 'Account', key: 'account', icon: <User className="w-5 h-5" />, items: ['Profile Information', 'Security & Face ID', 'Privacy'] },
    { title: 'System Status', key: 'status', icon: <Activity className="w-5 h-5" />, items: ['Service Health', 'AI Features', 'Infrastructure'] },
    { title: 'Notifications', key: 'notifications', icon: <Bell className="w-5 h-5" />, items: ['Push Notifications', 'Email Preferences', 'Muted Conversations'] },
    { title: 'Appearance', key: 'appearance', icon: <Paintbrush className="w-5 h-5" />, items: ['Theme', 'Mood Ring Colors', 'Chat Wallpaper'] },
    { title: 'Safety & Trust', key: 'safety', icon: <Shield className="w-5 h-5" />, items: ['Blocked Users', 'Content Filters', 'Data Export'] },
    { title: 'Support', key: 'support', icon: <HelpCircle className="w-5 h-5" />, items: ['Help Center', 'Report a Problem', 'About'] },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleUpdateAvatar = async (avatarUrl: string) => {
    try {
      await usersApi.updateProfile({ avatarUrl });
      // In a real app, we'd update the local user state too
      // If useAuthStore has a setUser method, we should call it
      window.location.reload(); // Quick way to sync state for now
    } catch (err) {
      console.error('Failed to update avatar:', err);
    }
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto space-y-8 flex flex-col min-h-full">
        <div>
          <h1 className="text-3xl font-bold font-heading mb-2">Settings</h1>
          <p className="text-text-secondary">Manage your account preferences and app behavior.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4 flex-1">
          {/* Navigation Sidebar (internal to settings) */}
          <div className="space-y-2 lg:col-span-1 border-r border-border-subtle pr-6 hidden md:block">
            {menuSections.map((section) => (
              <button 
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${activeSection === section.key ? 'bg-accent-primary/10 text-accent-glow font-medium' : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'}`}
              >
                {section.icon}
                {section.title}
              </button>
            ))}
          </div>

          {/* Active Settings View */}
          <div className="lg:col-span-2 space-y-6">
            {/* Account Section */}
            {activeSection === 'account' && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <h2 className="text-xl font-bold border-b border-border-subtle pb-2">Account Details</h2>
             
                <Card glass className="p-6 space-y-6">
                  <div className="flex flex-col gap-4 pb-4 border-b border-border-subtle">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium">Profile Avatar</h3>
                        <p className="text-sm text-text-secondary">Select your unique presence</p>
                      </div>
                      <Avatar 
                        src={user?.avatarUrl} 
                        alt={user?.displayName || 'User'} 
                        size="lg" 
                        mood={(user?.currentMood?.toLowerCase() || 'neutral') as any}
                        showMood
                      />
                    </div>
                  
                    <div className="grid grid-cols-8 gap-2 mt-2">
                      {PREDEFINED_AVATARS.map((url, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleUpdateAvatar(url)}
                          className={cn(
                            "relative rounded-full overflow-hidden border-2 transition-all hover:scale-110 w-10 h-10",
                            user?.avatarUrl === url ? "border-accent-primary scale-110 shadow-[0_0_10px_rgba(159,95,241,0.5)]" : "border-transparent opacity-60 hover:opacity-100"
                          )}
                        >
                          <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-4 border-b border-border-subtle">
                    <div>
                      <h3 className="font-medium">Username</h3>
                      <p className="text-sm text-text-secondary">@{user?.username || 'unknown'}</p>
                    </div>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-border-subtle">
                    <div>
                      <h3 className="font-medium">Email</h3>
                      <p className="text-sm text-text-secondary">{user?.email || 'unknown'}</p>
                    </div>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-border-subtle">
                    <div>
                      <h3 className="font-medium">Display Name</h3>
                      <p className="text-sm text-text-secondary">{user?.displayName || 'Unknown'}</p>
                    </div>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-border-subtle">
                    <div>
                      <h3 className="font-medium">Face ID Authentication</h3>
                      <p className="text-sm text-success font-medium">Enabled</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleOpenFaceScan}>Rescan Face</Button>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <div>
                      <h3 className="font-medium text-danger">Delete Account</h3>
                      <p className="text-sm text-text-secondary">Permanently remove your account and data.</p>
                    </div>
                    <Button variant="danger" size="sm">Delete</Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* System Status Section */}
            {activeSection === 'status' && (
              <motion.div
                key="status"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Card glass className="p-6">
                  <ServiceStatusPanel />
                </Card>
              </motion.div>
            )}

            {/* Other sections placeholder */}
            {!['account', 'status'].includes(activeSection) && (
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-6"
              >
                <h2 className="text-xl font-bold border-b border-border-subtle pb-2">
                  {menuSections.find(s => s.key === activeSection)?.title}
                </h2>
                <Card glass className="p-6">
                  <p className="text-text-secondary text-sm">This section is coming soon.</p>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
        
        <div className="pt-8 border-t border-border-subtle mt-auto">
          <Button variant="ghost" className="text-danger hover:text-danger hover:bg-danger/10 gap-2" onClick={handleLogout}>
             <LogOut className="w-5 h-5" />
             Log Out
          </Button>
        </div>
      </div>

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
              className="absolute top-8 right-8 p-3 bg-bg-elevated rounded-full border border-border-subtle hover:bg-bg-secondary transition-colors"
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

                  {(scanStatus === 'idle' || scanStatus === 'scanning' || scanStatus === 'registering') && (
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-accent-primary to-transparent pointer-events-none" />
                  )}
                  
                  {(scanStatus === 'scanning' || scanStatus === 'registering') && (
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
                <h3 className="text-xl font-bold mb-1">Rescan Face ID</h3>
                {scanStatus === 'success' && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-success font-medium">
                    Face updated securely ✓
                  </motion.p>
                )}
                {scanStatus === 'registering' && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-text-muted font-medium animate-pulse">
                    Saving new face print...
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
                  onClick={scanStatus === 'error' ? startCamera : captureAndRegister}
                  variant={scanStatus === 'error' ? 'outline' : 'primary'}
                >
                  {scanStatus === 'error' ? 'Retry Camera' : (scanStatus === 'registering' ? 'Saving...' : 'Capture')}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
