import { Sidebar } from '@/components/layout/Sidebar';
import { ConversationList } from '@/components/layout/ConversationList';
import { ChatArea } from '@/components/layout/ChatArea';

export default function MessagesScreen() {
  return (
    <div className="flex flex-col md:flex-row h-[100dvh] w-full bg-bg-primary overflow-hidden relative">
      <Sidebar />
      <ConversationList />
      <ChatArea />
    </div>
  );
}
