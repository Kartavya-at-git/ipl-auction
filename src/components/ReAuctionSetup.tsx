import { useState, useEffect } from 'react';
import type { Room, Player, Team } from '../types';
import { ref, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { formatCurrency } from '../utils/helpers';
import { Timer, UserPlus, Play, CheckCircle2 } from 'lucide-react';

interface ReAuctionSetupProps {
  room: Room;
  players: Player[];
  teams: Team[];
  isHost: boolean;
  currentUserUid: string;
  serverTimeOffset: number;
}

const ReAuctionSetup = ({ room, players, teams, isHost, currentUserUid, serverTimeOffset }: ReAuctionSetupProps) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const unsoldPlayers = players.filter(p => p.status === 'unsold' || p.status === 'nominated');
  const userTeam = teams.find(t => t.ownerUid === currentUserUid);

  useEffect(() => {
    if (!room.timerEndTime) return;

    const interval = setInterval(() => {
      const now = Date.now() + serverTimeOffset;
      const diff = Math.max(0, Math.floor((room.timerEndTime! - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0 && isHost) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room.timerEndTime, isHost, serverTimeOffset]);

  const toggleNomination = async (player: Player) => {
    if (!userTeam) return;

    const currentlyNominatedByMe = !!(player.nominatedBy && player.nominatedBy[userTeam.id]);
    const otherNominators = Object.keys(player.nominatedBy || {}).filter(id => id !== userTeam.id);
    const willHaveNominators = !currentlyNominatedByMe || otherNominators.length > 0;
    
    const updates: any = {};
    updates[`rooms/${room.id}/players/${player.id}/nominatedBy/${userTeam.id}`] = currentlyNominatedByMe ? null : true;
    updates[`rooms/${room.id}/players/${player.id}/isNominated`] = willHaveNominators;
    updates[`rooms/${room.id}/players/${player.id}/status`] = willHaveNominators ? 'nominated' : 'unsold';

    await update(ref(db), updates);
  };

  const handleEndAuction = async () => {
    if (!confirm('Are you sure you want to end the auction permanently?')) return;
    
    const updates: any = {};
    updates[`rooms/${room.id}/status`] = 'completed';
    updates[`rooms/${room.id}/currentPlayerId`] = null;
    updates[`rooms/${room.id}/timerEndTime`] = null;
    await update(ref(db), updates);
  };

  const handleStartReAuction = async () => {
    if (loading || room.status !== 're-auction-setup') return;
    const nominatedPlayers = players.filter(p => p.status === 'nominated');
    if (nominatedPlayers.length === 0) return;

    setLoading(true);
    try {
      // 1. Shuffle nominated players
      const shuffled = [...nominatedPlayers].sort(() => Math.random() - 0.5);
      
      const updates: any = {};
      const batchSize = 8;
      
      // 2. Assign new Set Numbers and Categories (Sets of 8)
      shuffled.forEach((player, index) => {
        const newSetNo = 100 + Math.floor(index / batchSize) + 1;
        updates[`rooms/${room.id}/players/${player.id}/setNo`] = newSetNo;
        updates[`rooms/${room.id}/players/${player.id}/category`] = `Accelerated ${newSetNo}`;
        updates[`rooms/${room.id}/players/${player.id}/status`] = 'upcoming'; // Reset all to upcoming for the new draw
      });

      // 3. Draw the first player from the new Set 1 randomly
      const firstSetPlayers = shuffled.slice(0, batchSize);
      const firstPlayer = firstSetPlayers[Math.floor(Math.random() * firstSetPlayers.length)];

      // 4. Start the Engine
      updates[`rooms/${room.id}/status`] = 're-auction-active';
      updates[`rooms/${room.id}/isReAuctionPhase`] = true;
      updates[`rooms/${room.id}/currentPlayerId`] = firstPlayer.id;
      const nextEndTime = Date.now() + serverTimeOffset + (room.settings.timerDuration * 1000);
      updates[`rooms/${room.id}/timerEndTime`] = nextEndTime;
      updates[`rooms/${room.id}/auctionNumber`] = room.auctionNumber + 1;
      
      updates[`rooms/${room.id}/players/${firstPlayer.id}/status`] = 'current';
      updates[`rooms/${room.id}/players/${firstPlayer.id}/currentBid`] = firstPlayer.basePrice;
      updates[`rooms/${room.id}/players/${firstPlayer.id}/highestBidderTeamId`] = null;
      updates[`rooms/${room.id}/players/${firstPlayer.id}/timerEndTime`] = nextEndTime;
      updates[`rooms/${room.id}/players/${firstPlayer.id}/auctionedOrder`] = room.auctionNumber + 1;

      await update(ref(db), updates);
    } catch (err) {
      console.error("Failed to start re-auction:", err);
    } finally {
      setLoading(false);
    }
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
              disabled={players.filter(p => p.status === 'nominated').length === 0}
              className="flex items-center justify-center gap-2 px-8 py-3 bg-ipl-gold text-ipl-navy font-black rounded-lg hover:bg-ipl-gold/90 transition-all disabled:opacity-30 disabled:grayscale"
            >
              <Play size={20} fill="currentColor" />
              START RE-AUCTION ({players.filter(p => p.status === 'nominated').length})
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
        {unsoldPlayers.map((player) => {
          const isNominatedByMe = !!(userTeam && player.nominatedBy?.[userTeam.id]);
          const nominators = Object.keys(player.nominatedBy || {});

          return (
            <button
              key={player.id}
              onClick={() => toggleNomination(player)}
              disabled={!userTeam || currentUserUid !== userTeam.ownerUid}
              className={`p-4 rounded-xl border transition-all text-left group relative ${
                isNominatedByMe 
                  ? 'bg-ipl-gold/10 border-ipl-gold shadow-lg' 
                  : 'bg-ipl-navy border-ipl-gold/10 hover:border-ipl-gold/40'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-[10px] font-bold text-ipl-gold/40 uppercase tracking-wider">{player.role}</div>
                {isNominatedByMe && <CheckCircle2 size={16} className="text-ipl-gold" />}
              </div>
              <div className="text-lg font-black text-white uppercase italic truncate">{player.name}</div>
              <div className="text-sm font-mono text-ipl-gold mt-1">{formatCurrency(player.basePrice)}</div>
              
              {/* Nominating Teams Logos */}
              {nominators.length > 0 && (
                <div className="mt-4 flex items-center gap-1 border-t border-white/5 pt-3">
                  <div className="text-[8px] font-black text-white/20 uppercase mr-1">Interested:</div>
                  <div className="flex -space-x-1.5">
                    {nominators.map(teamId => {
                      const teamInfo = teams.find(t => t.id === teamId);
                      return (
                        <div 
                          key={teamId} 
                          title={teamInfo?.name}
                          className="w-5 h-5 rounded-full border border-ipl-bg flex items-center justify-center text-[7px] font-black text-white shadow-sm shrink-0" 
                          style={{ backgroundColor: teamInfo?.color || '#333' }}
                        >
                          {teamId}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isNominatedByMe && userTeam && currentUserUid === userTeam.ownerUid && (
                <div className="absolute inset-0 flex items-center justify-center bg-ipl-navy/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                  <div className="flex items-center gap-2 text-ipl-gold font-bold text-sm">
                    <UserPlus size={18} />
                    NOMINATE
                  </div>
                </div>
              )}
            </button>
          );
        })}
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
