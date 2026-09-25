import React from 'react';
import { ChatAppShell } from '../../components/chat/ChatAppShell';

interface ChatAppPageProps {
  onNavigate: (route: string) => void;
}

export const ChatAppPage: React.FC<ChatAppPageProps> = ({ onNavigate }) => {
  return <ChatAppShell onNavigate={onNavigate} />;
};

export default ChatAppPage;
