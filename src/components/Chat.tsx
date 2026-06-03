import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { Send, MessageSquare } from 'lucide-react';

interface ChatProps {
  roomId: string;
  currentUserUid: string;
  currentUserName: string;
  userTeamId: string | null;
  userTeamColor: string | null;
}

const Chat = ({ roomId, currentUserUid, currentUserName, userTeamId, userTeamColor }: ChatProps) => {
  const [inputText, setInputText] = useState('');
  const { messages, sendMessage } = useChat(roomId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    await sendMessage(inputText, currentUserUid, currentUserName, userTeamId, userTeamColor);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-[400px] md:h-full bg-ipl-navy border border-ipl-gold/20 rounded-xl overflow-hidden shadow-2xl">
      {/* Chat Header */}
      <div className="p-3 bg-ipl-bg/50 border-b border-ipl-gold/10 flex items-center gap-2">
        <MessageSquare size={16} className="text-ipl-gold" />
        <h3 className="text-xs font-black uppercase tracking-widest text-white/80">Auction Live Chat</h3>
      </div>

      {/* Messages List */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-ipl-bg/20"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.senderUid === currentUserUid ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] font-bold text-white/40">{msg.senderName}</span>
              {msg.teamId && (
                <span 
                  className="text-[8px] px-1 rounded font-bold text-white uppercase"
                  style={{ backgroundColor: msg.teamColor || '#333' }}
                >
                  {msg.teamId}
                </span>
              )}
            </div>
            <div className={`px-3 py-2 rounded-lg text-sm max-w-[85%] break-words ${
              msg.senderUid === currentUserUid 
                ? 'bg-ipl-gold text-ipl-navy font-medium rounded-tr-none' 
                : 'bg-white/5 text-white border border-white/5 rounded-tl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-2">
            <MessageSquare size={32} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-center">No messages yet<br/>Start the banter!</span>
          </div>
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSend} className="p-3 bg-ipl-navy border-t border-ipl-gold/10 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-ipl-bg border border-ipl-gold/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ipl-gold text-white"
        />
        <button
          type="submit"
          className="p-2 bg-ipl-gold text-ipl-navy rounded-lg hover:bg-ipl-gold/90 transition-colors"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default Chat;
