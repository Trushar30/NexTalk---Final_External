import { Sidebar } from './Sidebar';
import type { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
  /** When true, the main content area will not scroll — useful for full-height workspace views */
  fullHeight?: boolean;
}

export function AppLayout({ children, fullHeight = false }: AppLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-bg-primary overflow-hidden relative">
      <Sidebar />
      <main className={`flex-1 w-full h-full relative ${fullHeight ? 'overflow-hidden flex' : 'overflow-y-auto'}`}>
        {children}
      </main>
    </div>
  );
}
