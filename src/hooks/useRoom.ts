import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Room, Player, Team, Participant, Bid } from '../types';

export const useRoom = (roomId: string) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activePlayer, setActivePlayer] = useState<Player | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [recentBids, setRecentBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Initial Static Data Fetch (Run once)
  useEffect(() => {
    if (!roomId) return;

    const fetchStaticData = async () => {
      // Fetch all players once
      const playersSnap = await getDocs(query(collection(db, 'rooms', roomId, 'players'), orderBy('order', 'asc')));
      setPlayers(playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
      
      // Fetch all teams once (Initial state)
      const teamsSnap = await getDocs(collection(db, 'rooms', roomId, 'teams'));
      setTeams(teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
    };

    fetchStaticData();
  }, [roomId]);

  // 2. Realtime Listeners (Optimized)
  useEffect(() => {
    if (!roomId) return;

    // Room listener (Essential for phase changes and currentPlayerId)
    const roomUnsubscribe = onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
      if (snapshot.exists()) {
        const roomData = { id: snapshot.id, ...snapshot.data() } as Room;
        setRoom(roomData);
      }
      setLoading(false);
    });

    // Participants listener (Essential to see who is in)
    const participantsUnsubscribe = onSnapshot(collection(db, 'rooms', roomId, 'participants'), (snapshot) => {
      setParticipants(snapshot.docs.map(doc => ({ ...doc.data() } as Participant)));
    });

    // Teams listener (Essential for team selection and live purse updates)
    const teamsUnsubscribe = onSnapshot(collection(db, 'rooms', roomId, 'teams'), (snapshot) => {
      setTeams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team)));
    });

    return () => {
      roomUnsubscribe();
      participantsUnsubscribe();
      teamsUnsubscribe();
    };
  }, [roomId]);

  // 3. Dedicated Current Player Listener
  useEffect(() => {
    if (!roomId || !room?.currentPlayerId) {
      setActivePlayer(null);
      setRecentBids([]);
      return;
    }

    const playerUnsubscribe = onSnapshot(doc(db, 'rooms', roomId, 'players', room.currentPlayerId), (snapshot) => {
      if (snapshot.exists()) {
        const pData = { id: snapshot.id, ...snapshot.data() } as Player;
        setActivePlayer(pData);
        
        if (pData.bidHistory) {
          const formattedBids: Bid[] = pData.bidHistory
            .map((b, i) => ({
              id: `${pData.id}_${i}`,
              amount: b.amount,
              teamId: b.teamId,
              playerId: pData.id,
              timestamp: b.timestamp
            }))
            .sort((a, b) => b.timestamp - a.timestamp);
          setRecentBids(formattedBids);
        }

        setPlayers(prev => prev.map(p => p.id === pData.id ? pData : p));
      }
    });

    return () => {
      playerUnsubscribe();
    };
  }, [roomId, room?.currentPlayerId]);

  // 4. Setup Phase Player Listener (Instant updates during import)
  useEffect(() => {
    if (!roomId || !room || (room.status !== 'waiting' && room.status !== 'setup')) return;

    const playersQuery = query(collection(db, 'rooms', roomId, 'players'), orderBy('order', 'asc'));
    const playersUnsubscribe = onSnapshot(playersQuery, (snapshot) => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
    });

    return () => playersUnsubscribe();
  }, [roomId, room?.status]);

  return { room, players, activePlayer, teams, participants, recentBids, loading };
};
