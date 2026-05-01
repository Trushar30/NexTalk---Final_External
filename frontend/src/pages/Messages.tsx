import { Sidebar } from '@/components/layout/Sidebar';
import { ConversationList } from '@/components/layout/ConversationList';
import { ChatArea } from '@/components/layout/ChatArea';

export default function MessagesScreen() {
  return (
    <div className="flex h-screen w-full bg-bg-primary overflow-hidden relative">
      <Sidebar />
      <ConversationList />
      <ChatArea />
    </div>
  );
}
