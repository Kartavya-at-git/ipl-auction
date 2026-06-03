import { useState, useEffect } from 'react';
import type { Room, Player, Team } from '../types';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatCurrency } from '../utils/helpers';
import { Timer, UserPlus, Play, CheckCircle2 } from 'lucide-react';

interface ReAuctionSetupProps {
  room: Room;
  players: Player[];
  teams: Team[];
  isHost: boolean;
  currentUserUid: string;
}

const ReAuctionSetup = ({ room, players, teams, isHost, currentUserUid }: ReAuctionSetupProps) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const unsoldPlayers = players.filter(p => p.status === 'unsold');
  const userTeam = teams.find(t => t.ownerUid === currentUserUid);

  useEffect(() => {
    if (!room.timerEndTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((room.timerEndTime! - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0 && isHost) {
        clearInterval(interval);
        // handleStartReAuction(); // Can auto-start if needed
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room.timerEndTime, isHost]);

  const toggleNomination = async (player: Player) => {
    if (!userTeam) return;

    const playerRef = doc(db, 'rooms', room.id, 'players', player.id);
    await updateDoc(playerRef, {
      isNominated: !player.isNominated
    });
  };

  const handleEndAuction = async () => {
    if (!confirm('Are you sure you want to end the auction permanently?')) return;
    
    await updateDoc(doc(db, 'rooms', room.id), {
      status: 'completed',
      currentPlayerId: null,
      timerEndTime: null
    });
  };

  const handleStartReAuction = async () => {
    const nominatedPlayers = players.filter(p => p.status === 'unsold' && p.isNominated);
    if (nominatedPlayers.length === 0) return;

    await updateDoc(doc(db, 'rooms', room.id), {
      status: 're-auction-active',
      currentPlayerId: nominatedPlayers[0].id,
      timerEndTime: Date.now() + (room.settings.timerDuration * 1000),
      auctionNumber: increment(1)
    });

    await updateDoc(doc(db, 'rooms', room.id, 'players', nominatedPlayers[0].id), {
      status: 'current',
      currentBid: nominatedPlayers[0].basePrice
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="bg-ipl-navy border-2 border-ipl-gold/30 rounded-2xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-ipl-gold/20">
          <div 
            className="h-full bg-ipl-gold transition-all duration-1000" 
            style={{ width: `${(timeLeft / 300) * 100}%` }}
          />
        </div>
        
        <h2 className="text-ipl-gold/60 uppercase tracking-[0.3em] text-sm font-black">Re-Auction Nomination Phase</h2>
        <div className="flex items-center justify-center gap-4">
          <Timer className={`${timeLeft < 30 ? 'text-red-500 animate-pulse' : 'text-ipl-gold'}`} size={32} />
          <div className="text-6xl font-black text-white font-mono">
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
        </div>
        <p className="text-ipl-gold/40 text-sm max-w-md mx-auto">
          Teams have 5 minutes to nominate unsold players to be brought back into the auction.
        </p>

        {isHost && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
            <button
              onClick={handleStartReAuction}
              disabled={players.filter(p => p.status === 'unsold' && p.isNominated).length === 0}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-ipl-gold text-ipl-navy font-black rounded-lg hover:bg-ipl-gold/90 transition-all disabled:opacity-30 disabled:grayscale"
            >
              <Play size={20} fill="currentColor" />
              START RE-AUCTION ({players.filter(p => p.status === 'unsold' && p.isNominated).length})
            </button>
            
            <button
              onClick={handleEndAuction}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-red-600/10 border border-red-600/30 text-red-500 font-black rounded-lg hover:bg-red-600 hover:text-white transition-all"
            >
              END AUCTION PERMANENTLY
            </button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {unsoldPlayers.map((player) => (
          <button
            key={player.id}
            onClick={() => toggleNomination(player)}
            disabled={!userTeam}
            className={`p-4 rounded-xl border transition-all text-left group relative ${
              player.isNominated 
                ? 'bg-ipl-gold/10 border-ipl-gold shadow-lg' 
                : 'bg-ipl-navy border-ipl-gold/10 hover:border-ipl-gold/40'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="text-[10px] font-bold text-ipl-gold/40 uppercase tracking-wider">{player.role}</div>
              {player.isNominated && <CheckCircle2 size={16} className="text-ipl-gold" />}
            </div>
            <div className="text-lg font-black text-white uppercase italic truncate">{player.name}</div>
            <div className="text-sm font-mono text-ipl-gold mt-1">{formatCurrency(player.basePrice)}</div>
            
            {!player.isNominated && userTeam && (
              <div className="absolute inset-0 flex items-center justify-center bg-ipl-navy/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                <div className="flex items-center gap-2 text-ipl-gold font-bold text-sm">
                  <UserPlus size={18} />
                  NOMINATE
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {unsoldPlayers.length === 0 && (
        <div className="text-center py-20 bg-ipl-navy/30 rounded-2xl border-2 border-dashed border-ipl-gold/10">
          <p className="text-ipl-gold/40 font-bold uppercase tracking-widest">All players have been sold!</p>
        </div>
      )}
    </div>
  );
};

export default ReAuctionSetup;
