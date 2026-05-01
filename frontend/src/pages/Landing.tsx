import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
// Card removed as it is now unused
import { Shield, Zap, Smile, Lock, Users, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FaultyTerminal from '@/components/ui/FaultyTerminal';
import MagicBento from '@/components/ui/MagicBento';
import CardNav from '@/components/layout/CardNav';
import PixelCard from '@/components/ui/PixelCard';

import { useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Sneak } from '@/components/ui/sneak';

function PhoneMockup() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / width - 0.5);
    y.set(mouseY / height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div 
      className="relative w-72 h-[600px] perspective-[2000px] z-10 mt-8 lg:mt-0" 
      onMouseMove={handleMouseMove} 
      onMouseLeave={handleMouseLeave}
    >
      {/* Dynamic Background Glows */}
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-10 -right-20 w-48 h-48 bg-accent-primary/40 rounded-full blur-[60px] pointer-events-none"
      />
      <motion.div 
        animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent-glow/30 rounded-full blur-[50px] pointer-events-none"
      />

      {/* Floating Badges */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: [-10, 10, -10], opacity: 1 }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -left-12 top-32 bg-bg-elevated/80 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-[0_0_15px_rgba(0,0,0,0.5)] z-20 flex items-center gap-3 pointer-events-none"
        style={{ translateZ: 50 }}
      >
        <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
          <Smile className="text-success w-4 h-4" />
        </div>
        <div className="text-xs font-semibold text-white">Mood: Joy 92%</div>
      </motion.div>

      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: [10, -10, 10], opacity: 1 }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="absolute -right-16 bottom-40 bg-bg-elevated/80 backdrop-blur-md border border-red-500/20 p-3 rounded-2xl shadow-[0_0_15px_rgba(255,0,0,0.2)] z-20 flex items-center gap-3 pointer-events-none"
        style={{ translateZ: 70 }}
      >
        <div className="w-8 h-8 rounded-full bg-danger/20 flex items-center justify-center">
          <Shield className="text-danger w-4 h-4" />
        </div>
        <div className="text-xs font-semibold text-white text-nowrap">Toxicity Blocked</div>
      </motion.div>

      {/* The Phone */}
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative w-full h-full rounded-[3rem] border-4 border-white/10 bg-[#0A0D14] shadow-[0_0_50px_rgba(124,58,237,0.15)] group"
      >
        <div className="absolute inset-0 rounded-[2.8rem] border-[6px] border-[#161922] overflow-hidden bg-black/40">
          <PixelCard variant="nextalk" className="absolute inset-0 w-full h-full">
            {/* Top Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-[#161922] rounded-b-3xl z-20 shadow-sm" />

            {/* Sweep Glare Effect (visible on hover) */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 transform -skew-x-12 translate-x-[-150%] group-hover:translate-x-[150%] z-30 pointer-events-none" />

            {/* Mock Content */}
            <div className="absolute inset-0 p-5 pt-14 flex flex-col gap-5 z-10">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-accent-primary flex items-center justify-center shadow-[0_0_15px_rgba(124,58,237,0.5)] z-10">
                    <span className="font-bold text-white text-lg">A</span>
                  </div>
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-[#161922] z-20" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-28 bg-white/80 rounded" />
                  <div className="h-2.5 w-20 bg-text-muted rounded" />
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-end gap-4 pb-4">
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-r from-accent-primary to-accent-glow p-4 shadow-lg"
                >
                  <div className="h-2.5 w-24 bg-white/90 rounded" />
                </motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-bg-elevated/90 backdrop-blur-sm p-4 border border-white/5"
                >
                  <div className="h-2.5 w-36 bg-white/70 rounded" />
                  <div className="h-2.5 w-28 bg-white/50 rounded mt-3" />
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 }}
                  className="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-r from-accent-primary to-accent-glow p-4 shadow-lg flex items-center gap-2"
                >
                  <Lock className="w-3 h-3 text-white/70" />
                  <div className="h-2 w-16 bg-white/90 rounded" />
                </motion.div>
              </div>

              <div className="h-14 w-full rounded-full bg-bg-elevated/80 backdrop-blur-md border border-white/10 flex items-center px-5 shadow-inner relative overflow-hidden">
                <div className="h-2.5 w-40 bg-text-muted/60 rounded" />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-accent-primary border-[2px] border-black/20" />
                </div>
              </div>
            </div>
          </PixelCard>
        </div>
      </motion.div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  const features = [
    { icon: <Smile className="text-accent-amber" />, title: 'Mood Detection', desc: 'See how your friends are feeling before you type.' },
    { icon: <Shield className="text-danger" />, title: 'Toxic Filter', desc: 'AI-flagged harmful messages protect your peace.' },
    { icon: <Camera className="text-accent-primary" />, title: 'Face Auth', desc: 'Secure local face scanning for login.' },
    { icon: <Lock className="text-accent-glow" />, title: 'One-Time Messages', desc: 'Self-destructing text & media with screenshot alerts.' },
    { icon: <Users className="text-success" />, title: 'Teams', desc: 'Organize your entire graph with simple, Discord-like tags.' },
    { icon: <Zap className="text-yellow-400" />, title: 'E2E Encryption', desc: 'Military-grade security built directly into the UI.' },
  ];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary overflow-x-hidden relative">
      <div className="fixed inset-0 z-0 pointer-events-auto">
        <FaultyTerminal tint="#7C3AED" brightness={0.6} />
        {/* Dark radial gradient overlay to keep center visibility and darken edges for text */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#0D0F14_80%)] pointer-events-none opacity-80" />
      </div>

      <div className="relative z-10">
        {/* Navbar */}
        <CardNav 
          logoElement={(
            <div className="font-heading font-bold text-xl tracking-wide flex items-center gap-2 text-white">
              <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center font-bold">N</div>
              NexTalk
            </div>
          )}
          items={[
            {
              label: "Product",
              bgColor: "#1A1D26", // bg-elevated
              textColor: "#F1F3F9",
              links: [
                { label: "Features", href: "#features" },
                { label: "Face ID Authentication", href: "#face-auth" },
                { label: "E2E Encryption", href: "#security" }
              ]
            },
            {
              label: "Platform",
              bgColor: "#1A1D26",
              textColor: "#F1F3F9",
              links: [
                { label: "Messages", href: "/messages" },
                { label: "Teams & Servers", href: "/teams" },
                { label: "Global Search", href: "/search" }
              ]
            },
            {
              label: "Account",
              bgColor: "#7C3AED", // accent-primary
              textColor: "#ffffff",
              links: [
                { label: "Login to NexTalk", href: "/login" },
                { label: "Create Free Account", href: "/signup" }
              ]
            }
          ]}
          baseColor="rgba(13, 15, 20, 0.7)"
          menuColor="#F1F3F9"
          buttonBgColor="#7C3AED"
          buttonTextColor="#ffffff"
          ctaText="Open Web App"
          onCtaClick={() => navigate('/signup')}
        />

        {/* Hero Section */}
      <main className="pt-40 lg:pt-48 pb-20 px-4 max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-12">
        <div className="flex-1 space-y-8 text-center lg:text-left z-10 w-full rounded-2xl p-6 lg:p-0 backdrop-blur-md lg:backdrop-blur-none bg-black/20 lg:bg-transparent border border-white/5 lg:border-transparent">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl lg:text-7xl font-bold leading-tight drop-shadow-xl"
          >
            Messages that feel <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary to-accent-glow">human.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg lg:text-xl text-text-primary drop-shadow-md max-w-2xl mx-auto lg:mx-0 font-medium"
          >
            A next-generation platform merging the intimacy of Snapchat, the community depth of Discord, and the utility of WhatsApp. Featuring AI mood detection, Face ID, and absolute privacy.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex gap-4 justify-center lg:justify-start"
          >
            <Button size="lg" className="rounded-full shadow-lg shadow-accent-primary/20" onClick={() => navigate('/signup')}>
              Get Started Free
            </Button>
            <Button size="lg" variant="glass" className="rounded-full" onClick={() => navigate('/messages')}>
              See It Live
            </Button>
          </motion.div>

          <div className="pt-8 flex gap-8 justify-center lg:justify-start text-sm font-mono text-text-muted">
            {/* <div className="flex flex-col items-center lg:items-start"><strong className="text-text-primary text-xl">50k+</strong> Users</div>
            <div className="flex flex-col items-center lg:items-start"><strong className="text-text-primary text-xl">1.2M</strong> Messages</div>
            <div className="flex flex-col items-center lg:items-start"><strong className="text-text-primary text-xl">99.9%</strong> Uptime</div> */}
          </div>
        </div>

        <div className="flex-1 flex justify-center perspective-[1000px]">
          <motion.div
            initial={{ rotateY: 15, rotateX: 5 }}
            animate={{ rotateY: [15, 5, 15], rotateX: [5, 10, 5] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          >
            <PhoneMockup />
          </motion.div>
        </div>
      </main>

      {/* Feature Section */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-bg-secondary/50 -skew-y-3 transform origin-top-left z-0" />
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold">The Next Evolution</h2>
            <p className="text-text-secondary">We fixed everything wrong with modern messaging.</p>
          </div>

          <div className="w-full relative z-20">
            <MagicBento 
              items={features.map((f, i) => ({
                title: f.title,
                description: f.desc,
                icon: f.icon,
                label: i < 2 ? "AI Feature" : "Security",
                color: "rgba(13, 15, 20, 0.6)"
              }))} 
              enableStars={true} 
              enableSpotlight={true} 
              enableBorderGlow={true} 
              glowColor="124, 58, 237"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-3xl lg:text-5xl font-bold mb-16">How It Works</h2>
        <div className="flex flex-col md:flex-row gap-8 justify-center relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-border-subtle to-transparent hidden md:block" />

          {[
            { step: 1, title: 'Scan Face', desc: 'Secure local biometric registration without passwords.' },
            { step: 2, title: 'Chat Freely', desc: 'Message anyone with E2E encryption and real emotions.' },
            { step: 3, title: 'Stay Safe', desc: 'AI automatically filters out toxicity and stops screenshots.' }
          ].map((s, i) => (
            <div key={i} className="flex-1 relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-bg-elevated border-2 border-accent-primary flex items-center justify-center text-2xl font-bold mb-6 shadow-[0_0_30px_rgba(124,58,237,0.3)]">
                {s.step}
              </div>
              <h3 className="text-xl font-bold mb-2">{s.title}</h3>
              <p className="text-text-secondary max-w-[250px]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Unique Sneak Footer Section */}
      <section className="relative w-full h-[400px] border-t border-border-subtle bg-bg-secondary flex flex-col items-center justify-end overflow-hidden">
        {/* The 3D text */}
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          <Sneak />
        </div>
        
        {/* Footer content overlaid */}
        <div className="relative z-10 w-full pb-8 pt-12 bg-gradient-to-t from-bg-secondary via-bg-secondary/80 to-transparent flex flex-col items-center justify-center text-text-muted pointer-events-none">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded bg-accent-primary flex items-center justify-center text-white text-[10px] font-bold">N</div>
            <span className="font-heading font-medium text-text-primary text-sm">NexTalk</span>
          </div>
          <p className="text-xs">© 2026 NexTalk Inc. Designed for the future of communication.</p>
        </div>
      </section>
      </div>
    </div>
  );
}
