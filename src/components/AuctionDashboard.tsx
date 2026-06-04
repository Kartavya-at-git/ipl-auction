import { useState, useEffect, useRef } from 'react';
import type { Room, Player, Team } from '../types';
import { ref, runTransaction, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { getNextBid } from '../utils/bidding';
import { formatCurrency } from '../utils/helpers';
import { Gavel, Timer, CheckCircle, XCircle, SkipForward, Pause, Play, Users, History, AlertTriangle, ListFilter } from 'lucide-react';
import type { Bid } from '../types';

interface AuctionDashboardProps {
  room: Room;
  currentPlayer: Player;
  players: Player[];
  teams: Team[];
  recentBids: Bid[];
  isHost: boolean;
  currentUserUid: string;
  serverTimeOffset: number;
}

const AuctionDashboard = ({ room, currentPlayer, players, teams, recentBids, isHost, currentUserUid, serverTimeOffset }: AuctionDashboardProps) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'status' | 'set'>('status');
  const timerEndProcessed = useRef<number | null>(null);

  const userTeam = teams.find(t => t.ownerUid === currentUserUid);
  const nextBidAmount = currentPlayer.highestBidderTeamId 
    ? getNextBid(currentPlayer.currentBid) 
    : currentPlayer.basePrice;
  const highestBidderTeam = teams.find(t => t.id === currentPlayer.highestBidderTeamId);
  const currentSetPlayers = players.filter(p => p.category === currentPlayer.category);

  // Squad Limits
  const userTeamPlayers = userTeam ? players.filter(p => p.teamId === userTeam.id) : [];
  const userOsCount = userTeamPlayers.filter(p => p.country?.toLowerCase() !== 'india').length;
  const isOverOSLimit = currentPlayer.country?.toLowerCase() !== 'india' && userOsCount >= 8;
  const isOverSquadLimit = userTeamPlayers.length >= 25;

  // Timer Logic
  useEffect(() => {
    if (room.status !== 'active' || !room.timerEndTime) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now() + serverTimeOffset;
      const end = room.timerEndTime!;
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0 && room.status === 'active') {
        clearInterval(interval);
        if (timerEndProcessed.current !== end) {
          timerEndProcessed.current = end;
          // Auto-trigger transaction on 0
          handleTimerEnd();
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [room.status, room.timerEndTime, serverTimeOffset]);

  const handleTimerEnd = async () => {
    // Both Host and Participants can attempt to execute the timer end to ensure it fires.
    // The RTDB transaction will ensure it only actually updates once.
    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData || !currentData.players || !currentData.players[currentPlayer.id]) return currentData;
        
        const player = currentData.players[currentPlayer.id];
        
        // Anti-glitch: Ensure it's still current
        if (player.status !== 'current') return currentData; // Already processed

        if (player.highestBidderTeamId) {
          // Sold Logic
          player.status = 'sold';
          player.soldPrice = player.currentBid;
          player.teamId = player.highestBidderTeamId;
          
          if (currentData.teams && currentData.teams[player.highestBidderTeamId]) {
            currentData.teams[player.highestBidderTeamId].purseBalance -= player.currentBid;
            currentData.teams[player.highestBidderTeamId].playerCount += 1;
          }
        } else {
          // Unsold Logic
          player.status = 'unsold';
        }
        
        currentData.status = 'paused';
        currentData.timerEndTime = null;
        player.timerEndTime = null;

        return currentData;
      });

      // Auto-advance after delay (handled by host)
      if (isHost) {
        setTimeout(async () => {
          await handleNextPlayer();
        }, 2000);
      }
    } catch (err) {
      console.error("Timer End Transaction failed", err);
    }
  };

  const handlePlaceBid = async () => {
    if (!userTeam) {
      setError('You must belong to a team to bid');
      return;
    }

    if (currentPlayer.highestBidderTeamId === userTeam.id) {
      setError('You are already the highest bidder');
      return;
    }

    if (userTeam.purseBalance < nextBidAmount) {
      setError('Insufficient purse balance');
      return;
    }

    if (isOverSquadLimit) {
      setError('Squad limit of 25 players reached');
      return;
    }

    if (isOverOSLimit) {
      setError('Overseas player limit of 8 reached');
      return;
    }

    if (room.status !== 'active') {
      setError('Auction is paused');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData || !currentData.players || !currentData.players[currentPlayer.id] || !currentData.teams || !currentData.teams[userTeam.id]) {
          return; // Abort
        }

        const player = currentData.players[currentPlayer.id];
        const team = currentData.teams[userTeam.id];

        // 1. Time Check (Anti-glitch)
        const serverTime = Date.now() + serverTimeOffset;
        if (currentData.timerEndTime && serverTime >= currentData.timerEndTime) {
          return; // Too late, timer ended
        }

        if (player.status !== 'current') return;
        if (player.highestBidderTeamId === userTeam.id) return;

        const currentNextBid = player.highestBidderTeamId ? getNextBid(player.currentBid) : player.basePrice;

        // 2. Purse & Squad Check
        if (team.purseBalance < currentNextBid) return;
        if (team.playerCount >= 25) return;

        // 3. Timer Extension (+10 seconds from now)
        const newTimer = serverTime + 10000;

        player.currentBid = currentNextBid;
        player.highestBidderTeamId = userTeam.id;
        
        currentData.timerEndTime = newTimer;
        player.timerEndTime = newTimer;

        if (!player.bidHistory) player.bidHistory = {};
        const bidId = `bid_${serverTime}_${userTeam.id}`;
        player.bidHistory[bidId] = {
          amount: currentNextBid,
          teamId: userTeam.id,
          timestamp: serverTime
        };

        return currentData;
      });
    } catch (err: any) {
      setError(err.message || 'Bid failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSold = async () => {
    // No longer needed as manual button, handled by handleTimerEnd automation,
    // but kept as a force-trigger for the host
    if (!highestBidderTeam) return;
    await handleTimerEnd();
  };

  const handleUnsold = async () => {
    // No longer needed as manual button, handled by handleTimerEnd automation,
    // but kept as a force-trigger for the host
    await handleTimerEnd();
  };

  const handleNextPlayer = async () => {
    const isReAuction = room.status === 're-auction-active';
    const availablePlayers = isReAuction 
      ? players.filter(p => p.status === 'unsold' && p.isNominated)
      : [...players].filter(p => p.status === 'upcoming' || p.status === 'current')
        .sort((a, b) => {
          const setA = a.setNo || 0;
          const setB = b.setNo || 0;
          if (setA !== setB) return setA - setB;
          return a.order - b.order;
        })
        .filter(p => p.id !== currentPlayer.id);
    
    const nextPlayer = availablePlayers[0];

    const updates: any = {};
    
    if (currentPlayer.status === 'current' && !highestBidderTeam) {
       updates[`rooms/${room.id}/players/${currentPlayer.id}/status`] = 'unsold';
    }

    if (!nextPlayer) {
      if (room.status === 'active') {
        updates[`rooms/${room.id}/status`] = 're-auction-setup';
        updates[`rooms/${room.id}/currentPlayerId`] = null;
        updates[`rooms/${room.id}/timerEndTime`] = Date.now() + serverTimeOffset + (5 * 60 * 1000);
      } else {
        updates[`rooms/${room.id}/status`] = 'completed';
        updates[`rooms/${room.id}/currentPlayerId`] = null;
      }
      await update(ref(db), updates);
      return;
    }

    updates[`rooms/${room.id}/currentPlayerId`] = nextPlayer.id;
    updates[`rooms/${room.id}/status`] = room.status === 're-auction-active' ? 're-auction-active' : 'active';
    updates[`rooms/${room.id}/timerEndTime`] = Date.now() + serverTimeOffset + (room.settings.timerDuration * 1000);
    updates[`rooms/${room.id}/auctionNumber`] = room.auctionNumber + 1;
    
    updates[`rooms/${room.id}/players/${nextPlayer.id}/status`] = 'current';
    updates[`rooms/${room.id}/players/${nextPlayer.id}/currentBid`] = nextPlayer.basePrice;

    await update(ref(db), updates);
  };

  const togglePause = async () => {
    const newStatus = room.status === 'active' ? 'paused' : 'active';
    const newTimer = newStatus === 'active' ? Date.now() + serverTimeOffset + (room.settings.timerDuration * 1000) : null;
    
    const updates: any = {};
    updates[`rooms/${room.id}/status`] = newStatus;
    updates[`rooms/${room.id}/timerEndTime`] = newTimer;
    await update(ref(db), updates);
  };

  const handleResetPlayer = async () => {
    if (!isHost || loading) return;
    if (!confirm('Reset this player to CURRENT? (Purse and stats will be reverted)')) return;

    setLoading(true);
    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData || !currentData.players || !currentData.players[currentPlayer.id]) return currentData;
        
        const player = currentData.players[currentPlayer.id];
        
        // Revert Team Purse if sold
        if (player.status === 'sold' && player.teamId && currentData.teams && currentData.teams[player.teamId]) {
          const team = currentData.teams[player.teamId];
          team.purseBalance += (player.soldPrice || 0);
          team.playerCount -= 1;
        }

        // Reset Player
        player.status = 'current';
        player.soldPrice = null;
        player.teamId = null;
        player.highestBidderTeamId = null;
        player.currentBid = 0;
        player.bidHistory = null;
        
        // Reset Room
        currentData.status = 'active';
        currentData.timerEndTime = Date.now() + serverTimeOffset + (room.settings.timerDuration * 1000);
        player.timerEndTime = currentData.timerEndTime;

        return currentData;
      });
    } catch (err) {
      console.error("Reset failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24">
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Main Player Card */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-ipl-navy border-2 border-ipl-gold/30 rounded-2xl overflow-hidden shadow-2xl relative">
            {/* Player Header */}
            <div className="bg-gradient-to-r from-ipl-navy to-ipl-blue p-6 flex items-center justify-between border-b border-ipl-gold/20">
              <div className="space-y-1">
                <div className="text-ipl-gold/60 text-xs font-bold uppercase tracking-widest">{currentPlayer.role || 'Player'} • {currentPlayer.country || 'International'}</div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">{currentPlayer.name}</h2>
              </div>
              <div className="text-right">
                <div className="text-ipl-gold/40 text-[10px] uppercase font-bold mb-1">Base Price</div>
                <div className="text-2xl font-black text-ipl-gold">{formatCurrency(currentPlayer.basePrice)}</div>
              </div>
            </div>

            {/* Auction Status Area */}
            <div className="p-8 grid md:grid-cols-2 gap-8 items-center bg-ipl-bg/20">
              <div className="space-y-6">
                <div className="space-y-1">
                  <div className="text-ipl-gold/40 text-xs font-bold uppercase tracking-wider">Current Bid</div>
                  <div className={`text-6xl font-black italic tracking-tighter ${highestBidderTeam ? 'text-white' : 'text-ipl-gold/20'}`}>
                    {currentPlayer.currentBid ? formatCurrency(currentPlayer.currentBid) : 'NO BID'}
                  </div>
                </div>

                {highestBidderTeam && (
                  <div className="flex items-center gap-3 animate-in zoom-in duration-500">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl text-white shadow-lg animate-bounce" style={{ backgroundColor: highestBidderTeam.color }}>
                      {highestBidderTeam.id}
                    </div>
                    <div>
                      <div className="text-ipl-gold/40 text-[10px] uppercase font-bold">Leading Bidder</div>
                      <div className="text-white font-black uppercase text-lg">{highestBidderTeam.name}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center justify-center space-y-4">
                <div className={`relative w-40 h-40 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-300 ${
                  timeLeft <= 5 ? 'border-red-500 text-red-500 animate-pulse' : 'border-ipl-gold text-ipl-gold'
                }`}>
                  <Timer size={24} className="mb-1" />
                  <div className="text-5xl font-black font-mono">{timeLeft}s</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mt-1">Remaining</div>
                </div>
              </div>
            </div>

            {/* Status Overlay (Sold/Unsold) */}
            {(currentPlayer.status === 'sold' || currentPlayer.status === 'unsold') && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-ipl-navy/60 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
                <div className={`text-8xl font-black italic uppercase tracking-tighter transform -rotate-12 border-8 px-8 py-2 rounded-xl shadow-2xl animate-bounce ${
                  currentPlayer.status === 'sold' ? 'text-green-500 border-green-500' : 'text-red-500 border-red-500'
                }`}>
                  {currentPlayer.status}
                </div>
              </div>
            )}

            {/* Bidding Controls */}
            {!isHost && (
              <div className="p-6 bg-ipl-navy border-t border-ipl-gold/20">
                {error && <div className="mb-4 text-center text-red-400 text-sm font-bold bg-red-400/10 p-2 rounded border border-red-400/20">{error}</div>}
                
                <button
                  onClick={handlePlaceBid}
                  disabled={loading || room.status !== 'active' || userTeam?.purseBalance! < nextBidAmount || currentPlayer.highestBidderTeamId === userTeam?.id}
                  className="w-full group relative overflow-hidden bg-ipl-gold disabled:bg-gray-700 h-20 rounded-xl transition-all active:scale-95 shadow-lg"
                >
                  <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  <div className="relative flex flex-col items-center justify-center">
                    <div className="text-ipl-navy font-black text-2xl flex items-center gap-2 uppercase italic">
                      <Gavel size={24} />
                      {currentPlayer.highestBidderTeamId === userTeam?.id ? 'HIGHEST BIDDER' : `BID ${formatCurrency(nextBidAmount)}`}
                    </div>
                    <div className="text-ipl-navy/60 text-[10px] font-bold uppercase tracking-widest">
                      {userTeam?.name} • Balance: {formatCurrency(userTeam?.purseBalance || 0)}
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Host Action Overlay */}
            {isHost && (
              <div className="p-4 bg-ipl-navy border-t border-ipl-gold/20 grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-4">
                <button 
                  onClick={handleSold}
                  disabled={!highestBidderTeam || loading}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-green-600/10 border border-green-600/30 rounded-xl text-green-500 hover:bg-green-600 hover:text-white transition-all disabled:opacity-20"
                >
                  <CheckCircle size={20} />
                  <span className="text-[10px] font-black uppercase">Sold</span>
                </button>
                <button 
                  onClick={handleUnsold}
                  disabled={!!highestBidderTeam || loading}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-red-600/10 border border-red-600/30 rounded-xl text-red-500 hover:bg-red-600 hover:text-white transition-all disabled:opacity-20"
                >
                  <XCircle size={20} />
                  <span className="text-[10px] font-black uppercase">Unsold</span>
                </button>
                <button 
                  onClick={handleResetPlayer}
                  disabled={currentPlayer.status === 'current' || loading}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white hover:text-ipl-navy transition-all disabled:opacity-20"
                >
                  <History size={20} />
                  <span className="text-[10px] font-black uppercase">Reset</span>
                </button>
                <button 
                  onClick={togglePause}
                  disabled={loading}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-ipl-gold/10 border border-ipl-gold/30 rounded-xl text-ipl-gold hover:bg-ipl-gold hover:text-ipl-navy transition-all"
                >
                  {room.status === 'active' ? <Pause size={20} /> : <Play size={20} />}
                  <span className="text-[10px] font-black uppercase">{room.status === 'active' ? 'Pause' : 'Resume'}</span>
                </button>
                <button 
                  onClick={handleNextPlayer}
                  disabled={(currentPlayer.status === 'current' && !!highestBidderTeam) || loading}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white hover:text-ipl-navy transition-all disabled:opacity-20"
                >
                  <SkipForward size={20} />
                  <span className="text-[10px] font-black uppercase">Next</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Leaderboard & Recent Bids */}
        <div className="lg:col-span-4 space-y-6">
          {/* Sidebar Tabs */}
          <div className="flex bg-ipl-navy border border-ipl-gold/20 rounded-lg overflow-hidden p-1 gap-1">
            <button 
              onClick={() => setSidebarTab('status')}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all ${sidebarTab === 'status' ? 'bg-ipl-gold text-ipl-navy' : 'text-ipl-gold/40 hover:bg-white/5'}`}
            >
              Franchise Status
            </button>
            <button 
              onClick={() => setSidebarTab('set')}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all ${sidebarTab === 'set' ? 'bg-ipl-gold text-ipl-navy' : 'text-ipl-gold/40 hover:bg-white/5'}`}
            >
              Current Set
            </button>
          </div>

          {sidebarTab === 'status' ? (
            <>
              {/* Recent Bids Feed */}
              <div className="bg-ipl-navy border border-ipl-gold/20 rounded-xl p-4 space-y-4 shadow-xl">
                <h3 className="text-sm font-black text-ipl-gold/60 uppercase tracking-widest flex items-center gap-2">
                  <History size={16} />
                  Recent Bids
                </h3>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
                  {recentBids.filter(b => b.playerId === currentPlayer.id).map((bid, index) => {
                    const team = teams.find(t => t.id === bid.teamId);
                    return (
                      <div key={bid.id} className={`flex items-center justify-between p-2 rounded bg-ipl-bg/30 border border-white/5 animate-in slide-in-from-right duration-300`} style={{ opacity: 1 - (index * 0.15) }}>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded text-[8px] flex items-center justify-center font-bold text-white" style={{ backgroundColor: team?.color }}>
                            {team?.id}
                          </div>
                          <span className="text-[10px] font-bold text-white/60">{team?.name.split(' ').pop()}</span>
                        </div>
                        <span className="text-[11px] font-black text-ipl-gold">{formatCurrency(bid.amount)}</span>
                      </div>
                    );
                  })}
                  {recentBids.filter(b => b.playerId === currentPlayer.id).length === 0 && (
                    <div className="text-center py-4 text-[10px] text-white/10 uppercase font-black italic">Waiting for opening bid...</div>
                  )}
                </div>
              </div>

              <div className="bg-ipl-navy border border-ipl-gold/20 rounded-xl p-4 space-y-4 shadow-xl">
                <h3 className="text-sm font-black text-ipl-gold/60 uppercase tracking-widest flex items-center gap-2">
                  <Users size={16} />
                  Franchise Status
                </h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {teams.sort((a, b) => b.purseBalance - a.purseBalance).map((team) => {
                    const teamPlayers = players.filter(p => p.teamId === team.id);
                    const osCount = teamPlayers.filter(p => p.country?.toLowerCase() !== 'india').length;
                    const isOverLimit = osCount > 8;
                    const isLowPurse = team.purseBalance < currentPlayer.basePrice;

                    return (
                      <div key={team.id} className={`flex items-center justify-between p-2 rounded bg-ipl-bg/30 border ${isLowPurse ? 'border-red-500/20 opacity-50' : 'border-ipl-gold/5'}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded text-[10px] flex items-center justify-center font-bold text-white shadow-inner" style={{ backgroundColor: team.color }}>
                            {team.id}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-white/80">{team.name.split(' ').pop()}</span>
                            <div className="flex gap-1">
                              <span className="text-[7px] text-ipl-gold/60 uppercase font-black">{teamPlayers.length} P</span>
                              <span className={`text-[7px] uppercase font-black ${isOverLimit ? 'text-red-500' : 'text-white/30'}`}>
                                {osCount} OS
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-[10px] font-mono font-black ${isLowPurse ? 'text-red-400' : 'text-ipl-gold'}`}>{formatCurrency(team.purseBalance)}</div>
                          {isOverLimit && <AlertTriangle size={8} className="text-red-500 ml-auto" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Current Set View */
            <div className="bg-ipl-navy border border-ipl-gold/20 rounded-xl p-4 space-y-4 shadow-xl flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-ipl-gold/60 uppercase tracking-widest flex items-center gap-2">
                  <ListFilter size={16} />
                  Set: {currentPlayer.category || 'General'}
                </h3>
                <span className="text-[10px] font-bold text-white/20 uppercase bg-white/5 px-2 py-0.5 rounded">
                  {currentSetPlayers.filter(p => p.status === 'sold').length} / {currentSetPlayers.length} Sold
                </span>
              </div>
              
              <div className="space-y-1.5 overflow-y-auto pr-2 custom-scrollbar max-h-[500px]">
                {currentSetPlayers.map((player) => (
                  <div 
                    key={player.id} 
                    className={`flex items-center justify-between p-2 rounded transition-all border ${
                      player.id === currentPlayer.id 
                        ? 'bg-ipl-gold/10 border-ipl-gold shadow-[0_0_10px_rgba(209,171,62,0.1)] scale-[1.02]' 
                        : player.status === 'sold'
                          ? 'bg-green-500/5 border-green-500/20 opacity-60'
                          : player.status === 'unsold'
                            ? 'bg-red-500/5 border-red-500/20 opacity-60'
                            : 'bg-ipl-bg/30 border-white/5'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className={`text-[10px] font-bold truncate ${player.id === currentPlayer.id ? 'text-white' : 'text-white/70'}`}>
                        {player.name}
                      </span>
                      <span className="text-[8px] font-black uppercase text-white/30 tracking-tighter">
                        {player.role} • {player.country}
                      </span>
                    </div>
                    
                    <div className="text-right shrink-0 ml-2">
                      {player.status === 'sold' ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">SOLD</span>
                          <span className="text-[9px] font-mono text-white/60">{formatCurrency(player.soldPrice || 0)}</span>
                        </div>
                      ) : player.status === 'unsold' ? (
                        <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">UNSOLD</span>
                      ) : player.id === currentPlayer.id ? (
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-ipl-gold animate-pulse" />
                          <span className="text-[8px] font-black text-ipl-gold uppercase">CURRENT</span>
                        </div>
                      ) : (
                        <span className="text-[9px] font-mono text-white/20">{formatCurrency(player.basePrice)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-ipl-navy border border-ipl-gold/20 rounded-xl p-4 text-center">
              <div className="text-ipl-gold/40 text-[10px] uppercase font-bold">Sold</div>
              <div className="text-xl font-black text-white">{players.filter(p => p.status === 'sold').length}</div>
            </div>
            <div className="bg-ipl-navy border border-ipl-gold/20 rounded-xl p-4 text-center">
              <div className="text-ipl-gold/40 text-[10px] uppercase font-bold">Upcoming</div>
              <div className="text-xl font-black text-white">{players.filter(p => p.status === 'upcoming').length}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionDashboard;
