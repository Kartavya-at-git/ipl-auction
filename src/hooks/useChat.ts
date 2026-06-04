import { useState, useEffect } from 'react';
import { ref, onValue, push, serverTimestamp, query, limitToLast } from 'firebase/database';
import { db } from '../lib/firebase';

export interface ChatMessage {
  id: string;
  text: string;
  senderUid: string;
  senderName: string;
  teamId: string | null;
  teamColor: string | null;
  timestamp: any;
}

export const useChat = (roomId: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;

    const chatRef = query(ref(db, `rooms/${roomId}/messages`), limitToLast(100));

    const unsubscribe = onValue(chatRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const msgList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => a.timestamp - b.timestamp);
        setMessages(msgList);
      } else {
        setMessages([]);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [roomId]);

  const sendMessage = async (text: string, senderUid: string, senderName: string, teamId: string | null, teamColor: string | null) => {
    if (!text.trim()) return;

    const messagesRef = ref(db, `rooms/${roomId}/messages`);
    await push(messagesRef, {
      text,
      senderUid,
      senderName,
      teamId,
      teamColor,
      timestamp: serverTimestamp()
    });
  };

  return { messages, loading, sendMessage };
};
