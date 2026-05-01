import { Sidebar } from './Sidebar';
import type { ReactNode } from 'react';

interface AppLayoutProps {
  children: ReactNode;
  /** When true, the main content area will not scroll — useful for full-height workspace views */
  fullHeight?: boolean;
}

export function AppLayout({ children, fullHeight = false }: AppLayoutProps) {
  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-bg-primary overflow-hidden relative">
      <Sidebar />
      <main className={`flex-1 w-full h-full relative ${fullHeight ? 'overflow-hidden flex' : 'overflow-y-auto pb-16 md:pb-0'}`}>
        {children}
      </main>
    </div>
  );
}
