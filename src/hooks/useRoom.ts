import { useState, useEffect } from 'react';
import { ref, onValue, get } from 'firebase/database';
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
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  // Server Time Offset Listener
  useEffect(() => {
    const offsetRef = ref(db, '.info/serverTimeOffset');
    const unsubscribe = onValue(offsetRef, (snap) => {
      setServerTimeOffset(snap.val() || 0);
    });
    return () => unsubscribe();
  }, []);

  // 1. Initial Static Data Fetch (Run once)
  useEffect(() => {
    if (!roomId) return;

    const fetchStaticData = async () => {
      const roomRef = ref(db, `rooms/${roomId}`);
      const snap = await get(roomRef);
      if (snap.exists()) {
        const data = snap.val();
        
        if (data.players) {
          const playersArray = Object.keys(data.players).map(key => ({
            id: key,
            ...data.players[key]
          })).sort((a, b) => a.order - b.order) as Player[];
          setPlayers(playersArray);
        }

        if (data.teams) {
          const teamsArray = Object.keys(data.teams).map(key => ({
            id: key,
            ...data.teams[key]
          })) as Team[];
          setTeams(teamsArray);
        }
      }
    };

    fetchStaticData();
  }, [roomId]);

  // 2. Realtime Listeners (Optimized)
  useEffect(() => {
    if (!roomId) return;

    // Room listener
    const roomRef = ref(db, `rooms/${roomId}`);
    const roomUnsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setRoom({
          id: roomId,
          hostId: data.hostId,
          status: data.status,
          currentPlayerId: data.currentPlayerId,
          currentIndex: data.currentIndex || 0,
          timerEndTime: data.timerEndTime,
          auctionNumber: data.auctionNumber,
          settings: data.settings,
          createdAt: data.createdAt
        } as Room);
      }
      setLoading(false);
    });

    // Participants listener
    const participantsRef = ref(db, `rooms/${roomId}/participants`);
    const participantsUnsubscribe = onValue(participantsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setParticipants(Object.values(data) as Participant[]);
      } else {
        setParticipants([]);
      }
    });

    // Teams listener
    const teamsRef = ref(db, `rooms/${roomId}/teams`);
    const teamsUnsubscribe = onValue(teamsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTeams(Object.keys(data).map(key => ({ id: key, ...data[key] })) as Team[]);
      } else {
        setTeams([]);
      }
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

    const playerRef = ref(db, `rooms/${roomId}/players/${room.currentPlayerId}`);
    const playerUnsubscribe = onValue(playerRef, (snapshot) => {
      if (snapshot.exists()) {
        const pData = { id: snapshot.key, ...snapshot.val() } as Player;
        setActivePlayer(pData);
        
        if (pData.bidHistory) {
          const formattedBids: Bid[] = Object.values(pData.bidHistory)
            .map((b: any, i) => ({
              id: `${pData.id}_${i}`,
              amount: b.amount,
              teamId: b.teamId,
              playerId: pData.id,
              timestamp: b.timestamp
            }))
            .sort((a, b) => b.timestamp - a.timestamp);
          setRecentBids(formattedBids);
        } else {
          setRecentBids([]);
        }

        setPlayers(prev => prev.map(p => p.id === pData.id ? pData : p));
      }
    });

    return () => {
      playerUnsubscribe();
    };
  }, [roomId, room?.currentPlayerId]);

  // 4. Setup Phase Player Listener
  useEffect(() => {
    if (!roomId || !room || (room.status !== 'waiting' && room.status !== 'setup')) return;

    const playersRef = ref(db, `rooms/${roomId}/players`);
    const playersUnsubscribe = onValue(playersRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const playersArray = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => a.order - b.order) as Player[];
        setPlayers(playersArray);
      }
    });

    return () => playersUnsubscribe();
  }, [roomId, room?.status]);

  return { room, players, activePlayer, teams, participants, recentBids, loading, serverTimeOffset };
};
