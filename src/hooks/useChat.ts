import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
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

    const chatQuery = query(
      collection(db, 'rooms', roomId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(chatQuery, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage)));
      setLoading(false);
    });

    return unsubscribe;
  }, [roomId]);

  const sendMessage = async (text: string, senderUid: string, senderName: string, teamId: string | null, teamColor: string | null) => {
    if (!text.trim()) return;

    await addDoc(collection(db, 'rooms', roomId, 'messages'), {
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
