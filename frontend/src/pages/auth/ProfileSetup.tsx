import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Camera, Image as ImageIcon } from 'lucide-react';
import { usersApi } from '@/lib/api';

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [currentInterest, setCurrentInterest] = useState('');
  const [privacy, setPrivacy] = useState<'PUBLIC' | 'FRIENDS' | 'PRIVATE'>('FRIENDS');
  const [isSaving, setIsSaving] = useState(false);

  const addInterest = () => {
    if (currentInterest.trim() && !interests.includes(currentInterest.trim())) {
      setInterests([...interests, currentInterest.trim()]);
      setCurrentInterest('');
    }
  };

  const removeInterest = (tag: string) => {
    setInterests(interests.filter(i => i !== tag));
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      await usersApi.updateProfile({ bio, privacyLevel: privacy });
      navigate('/messages');
    } catch (err) {
      console.error('Profile update failed:', err);
      // Still navigate even if update fails — profile can be updated later
      navigate('/messages');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg z-10"
      >
        <div className="mb-8 pl-2">
          <p className="text-accent-primary font-mono text-sm mb-2">STEP 2 OF 2</p>
          <h1 className="text-3xl font-bold">Complete your profile</h1>
        </div>

        <Card glass className="p-8 space-y-8">
          {/* Avatar Upload */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group cursor-pointer">
              <div className="w-24 h-24 rounded-full bg-bg-secondary border border-border-subtle flex items-center justify-center overflow-hidden">
                <ImageIcon className="w-8 h-8 text-text-muted group-hover:hidden" />
                <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
            <p className="text-sm text-text-secondary">Upload a profile picture</p>
          </div>

          <div className="space-y-4">
            {/* Bio */}
            <div>
              <label className="block text-sm font-medium mb-1">Bio</label>
              <textarea 
                className="w-full h-24 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:border-accent-primary focus-visible:ring-1 focus-visible:ring-accent-primary resize-none transition-colors"
                placeholder="Tell us a bit about yourself..."
                maxLength={160}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
              <p className="text-right text-xs text-text-muted mt-1">{bio.length}/160</p>
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium mb-1">Interests</label>
              <div className="flex gap-2">
                <Input 
                  placeholder="E.g. Photography, Coding..." 
                  value={currentInterest}
                  onChange={(e) => setCurrentInterest(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest())}
                />
                <Button variant="secondary" onClick={addInterest}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {interests.map(tag => (
                  <div key={tag} className="flex items-center gap-1 bg-accent-primary/20 text-accent-glow px-3 py-1 rounded-full text-xs font-medium border border-accent-primary/30">
                    {tag}
                    <button onClick={() => removeInterest(tag)} className="hover:text-white transition-colors ml-1">&times;</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Privacy */}
            <div>
              <label className="block text-sm font-medium mb-2">Privacy Settings</label>
              <div className="grid grid-cols-3 gap-2">
                {(['PUBLIC', 'FRIENDS', 'PRIVATE'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPrivacy(p)}
                    className={`py-2 rounded-lg text-sm transition-colors border ${privacy === p ? 'bg-accent-primary/20 border-accent-primary text-accent-glow' : 'bg-bg-elevated border-border-subtle text-text-secondary hover:bg-bg-secondary'}`}
                  >
                    <span className="capitalize">{p.toLowerCase()}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button className="w-full" size="lg" onClick={handleFinish} disabled={isSaving}>
            {isSaving ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : 'Finish Setup'}
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}
