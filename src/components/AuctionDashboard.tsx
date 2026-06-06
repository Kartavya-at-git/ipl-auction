import { useState, useEffect, useRef } from 'react';
import type { Room, Player, Team, Participant } from '../types';
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
  participants: Participant[];
  recentBids: Bid[];
  isHost: boolean;
  currentUserUid: string;
  currentUserRole?: string;
  serverTimeOffset: number;
}

const AuctionDashboard = ({ room, currentPlayer, players, teams, participants, recentBids, isHost, currentUserUid, currentUserRole, serverTimeOffset }: AuctionDashboardProps) => {
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
  const currentSetPlayers = players.filter(p => p.setNo === currentPlayer.setNo);

  // Presence Detection
  const hostParticipant = participants.find(p => p.uid === room.hostId);
  const isHostOffline = hostParticipant && hostParticipant.isOnline === false;

  // Squad Limits
  const userTeamPlayers = userTeam ? players.filter(p => p.teamId === userTeam.id) : [];
  const userOsCount = userTeamPlayers.filter(p => p.country?.toLowerCase() !== 'india').length;
  const isOverOSLimit = currentPlayer.country?.toLowerCase() !== 'india' && userOsCount >= 8;
  const isOverSquadLimit = userTeamPlayers.length >= 25;

  // Timer Logic
  useEffect(() => {
    const isActive = room.status === 'active' || room.status === 're-auction-active';
    if (!isActive || !room.timerEndTime) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now() + serverTimeOffset;
      const end = room.timerEndTime!;
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0 && isActive) {
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

  useEffect(() => {
    const isActive = room.status === 'active' || room.status === 're-auction-active';
    if (!isActive || !room.timerEndTime) return;

    const now = Date.now() + serverTimeOffset;
    const delay = Math.max(0, room.timerEndTime - now + 150);
    const timeout = setTimeout(() => {
      if (timerEndProcessed.current !== room.timerEndTime) {
        timerEndProcessed.current = room.timerEndTime;
        handleTimerEnd();
      }
    }, delay);

    return () => clearTimeout(timeout);
  }, [room.status, room.timerEndTime, serverTimeOffset]);

  const handleTimerEnd = async () => {
    try {
      const result = await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        const currentPlayerId = currentData?.currentPlayerId || currentPlayer.id;
        if (!currentData || !currentData.players || !currentData.players[currentPlayerId]) return currentData;
        
        const player = currentData.players[currentPlayerId];
        if (player.status !== 'current') return currentData;

        if (player.highestBidderTeamId) {
          player.status = 'sold';
          player.soldPrice = player.currentBid;
          player.teamId = player.highestBidderTeamId;
          
          if (currentData.teams && currentData.teams[player.highestBidderTeamId]) {
            currentData.teams[player.highestBidderTeamId].purseBalance -= player.currentBid;
            currentData.teams[player.highestBidderTeamId].playerCount += 1;
          }
        } else {
          player.status = 'unsold';
        }
        
        currentData.status = 'paused';
        currentData.timerEndTime = null;
        player.timerEndTime = null;

        return currentData;
      });

      if (isHost && result.committed) {
        setTimeout(async () => {
          await handleNextPlayer();
        }, 2200);
      }
    } catch (err) {
      console.error("Timer End Transaction failed", err);
    }
  };

  useEffect(() => {
    if (!isHost || room.status !== 'paused') return;
    if (currentPlayer.status !== 'sold' && currentPlayer.status !== 'unsold') return;

    const timeout = setTimeout(async () => {
      await handleNextPlayer();
    }, 2200);

    return () => clearTimeout(timeout);
  }, [isHost, room.status, currentPlayer.status, currentPlayer.id]);

  // Cinematic Sound Effects
  useEffect(() => {
    if (currentPlayer.status === 'sold') {
      const audio = new Audio('/Gavel-sound-effect.mp3');
      audio.volume = 0.6;
      
      // Delay sound to match hammer impact (approx 400ms into the animation)
      const soundTimeout = setTimeout(() => {
        audio.play().catch(e => console.warn("Sound play blocked by browser:", e));
      }, 400);

      return () => {
        clearTimeout(soundTimeout);
        audio.pause();
      };
    }
  }, [currentPlayer.status, currentPlayer.id]);

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

    const isAuctionRunning = room.status === 'active' || room.status === 're-auction-active';
    if (!isAuctionRunning) {
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

        // 3. Timer Extension
        const newTimer = serverTime + (room.settings.timerDuration * 1000);

        player.currentBid = currentNextBid;
        player.highestBidderTeamId = userTeam.id;
        player.passes = null; // IMPORTANT: Clear all passes when a new bid arrives
        
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

  const handlePassPlayer = async () => {
    const isAuctionRunning = room.status === 'active' || room.status === 're-auction-active';
    if (!userTeam || loading || !isAuctionRunning || timeLeft === 0) return;

    setLoading(true);
    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData || !currentData.players || !currentData.players[currentPlayer.id]) return currentData;
        
        const player = currentData.players[currentPlayer.id];
        if (player.status !== 'current') return currentData;

        if (!player.passes) player.passes = {};
        player.passes[userTeam.id] = true;

        // Consensus logic: Only count teams whose owners are actively online
        const activeTeams = Object.values(currentData.teams || {}).filter((t: any) => {
          const participant = currentData.participants ? currentData.participants[t.ownerUid] : null;
          return !!t.ownerUid && participant && participant.isOnline === true;
        }).length;

        // Fallback: If for some reason activeTeams is 0 (all offline), avoid instant skip unless passCount > 0
        const requiredTeams = Math.max(1, activeTeams);
        const passCount = Object.keys(player.passes).length;

        if (!player.highestBidderTeamId) {
          // All active online teams passed -> Unsold
          if (passCount >= requiredTeams) {
            player.status = 'unsold';
            currentData.status = 'paused';
            currentData.timerEndTime = null;
            player.timerEndTime = null;
          }
        } else {
          // Everyone except the highest bidder passed -> Sold
          const isLeaderPassing = !!player.passes[player.highestBidderTeamId];
          const neededPasses = isLeaderPassing ? requiredTeams : Math.max(1, requiredTeams - 1);
          
          if (passCount >= neededPasses) {
            player.status = 'sold';
            player.soldPrice = player.currentBid;
            player.teamId = player.highestBidderTeamId;
            
            if (currentData.teams && currentData.teams[player.highestBidderTeamId]) {
              currentData.teams[player.highestBidderTeamId].purseBalance -= player.currentBid;
              currentData.teams[player.highestBidderTeamId].playerCount += 1;
            }
            
            currentData.status = 'paused';
            currentData.timerEndTime = null;
            player.timerEndTime = null;
          }
        }

        return currentData;
      });
    } catch (err) {
      console.error("Pass failed", err);
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

  const handleNextPlayer = async (fromSetBreak = false) => {
    if (loading || (room.status === 'set-break' && !fromSetBreak)) return;
    setLoading(true);

    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData || !currentData.players) return currentData;

        if (isHost) {
          const hostParticipant = currentData.participants?.[currentData.hostId];
          if (hostParticipant?.isOnline === false) return currentData;
        }

        // Double check status inside transaction if not from set break
        if (!fromSetBreak && currentData.status === 'set-break') return currentData;

        const isReAuction = currentData.isReAuctionPhase;
        const currentPlayerId = currentData.currentPlayerId || currentPlayer.id;
        const curPlayer = currentData.players[currentPlayerId];
        
        // 1. Auto-unsold previous if needed
        if (curPlayer && curPlayer.status === 'current' && !curPlayer.highestBidderTeamId) {
          curPlayer.status = 'unsold';
        }

        // 2. Filter available 'upcoming' players - Map keys to IDs for robustness
        const upcomingPlayers = Object.entries(currentData.players || {})
          .map(([id, player]: [string, any]) => ({ ...player, id }))
          .filter((p: any) => p.status === 'upcoming' && p.id !== currentPlayerId);

        if (upcomingPlayers.length === 0) {
          if (!isReAuction) {
            currentData.status = 're-auction-setup';
            currentData.currentPlayerId = null;
            currentData.timerEndTime = Date.now() + serverTimeOffset + (5 * 60 * 1000);
          } else {
            currentData.status = 'completed';
            currentData.currentPlayerId = null;
          }
          return currentData;
        }

        // 3. "Bag Draw" Logic inside Transaction
        let nextPlayerId: string | null = null;
        const sameSetPlayers = upcomingPlayers.filter((p: any) => p.setNo === (curPlayer?.setNo || 1));

        if (sameSetPlayers.length > 0) {
          const picked: any = sameSetPlayers[Math.floor(Math.random() * sameSetPlayers.length)];
          nextPlayerId = picked.id;
        } else {
          // Current set finished, check for "Pause Before Next Set"
          // Skip check if we are explicitly resuming FROM a set break
          if (currentData.pauseBeforeNextSet && !fromSetBreak) {
            currentData.status = 'set-break';
            currentData.timerEndTime = null;
            return currentData; // Stop here, atomic pause!
          }

          // Move to next set randomly
          const nextSetNos = [...new Set(upcomingPlayers.map((p: any) => p.setNo || 0))].sort((a, b) => a - b);
          const nextSetNo = nextSetNos[0];
          const nextSetPlayers = upcomingPlayers.filter((p: any) => (p.setNo || 0) === nextSetNo);
          const picked: any = nextSetPlayers[Math.floor(Math.random() * nextSetPlayers.length)];
          nextPlayerId = picked.id;
        }

        if (nextPlayerId) {
          const nextEndTime = Date.now() + serverTimeOffset + (room.settings.timerDuration * 1000);
          const nextAuctionNumber = (currentData.auctionNumber || 0) + 1;

          currentData.currentPlayerId = nextPlayerId;
          currentData.status = isReAuction ? 're-auction-active' : 'active';
          currentData.timerEndTime = nextEndTime;
          currentData.auctionNumber = nextAuctionNumber;
          if (!isReAuction) currentData.currentIndex = (currentData.currentIndex || 0) + 1;

          const dbNextPlayer = currentData.players[nextPlayerId];
          dbNextPlayer.status = 'current';
          dbNextPlayer.currentBid = dbNextPlayer.basePrice;
          dbNextPlayer.timerEndTime = nextEndTime;
          dbNextPlayer.auctionedOrder = nextAuctionNumber;
          dbNextPlayer.highestBidderTeamId = null;
          dbNextPlayer.passes = null; // Ensure passes are cleared for the new player
        }

        return currentData;
      });
    } catch (err) {
      console.error("Atomic Next Player failed", err);
    } finally {
      setLoading(false);
    }
  };

  const togglePause = async () => {
    if (loading || (currentPlayer.status !== 'current' && (room.status === 'active' || room.status === 're-auction-active'))) return;
    setLoading(true);
    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData) return currentData;
        
        const isReAuction = currentData.isReAuctionPhase;
        const activeStatus = isReAuction ? 're-auction-active' : 'active';
        const isCurrentlyActive = currentData.status === 'active' || currentData.status === 're-auction-active';
        const newStatus = isCurrentlyActive ? 'paused' : activeStatus;
        
        currentData.status = newStatus;

        if (newStatus === 'paused') {
          currentData.pausedTimeLeft = timeLeft;
          currentData.timerEndTime = null;
        } else {
          // FAIR PLAY KICKSTART: If resuming at less than 5s, reset to full 30s duration
          const storedTime = currentData.pausedTimeLeft;
          const resumeTimeLeft = (storedTime !== undefined && storedTime > 5) ? storedTime : (currentData.settings?.timerDuration || 30);
          
          currentData.timerEndTime = Date.now() + serverTimeOffset + (resumeTimeLeft * 1000);
          currentData.pausedTimeLeft = null;
        }
        
        return currentData;
      });
    } catch (err) {
      console.error("Atomic Toggle Pause failed", err);
    } finally {
      setLoading(false);
    }
  };

  const togglePauseBeforeNextSet = async () => {
    if (!isHost || loading) return;
    setLoading(true);
    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData) return currentData;
        currentData.pauseBeforeNextSet = !currentData.pauseBeforeNextSet;
        return currentData;
      });
    } catch (err) {
      console.error("Atomic Toggle Break failed", err);
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

            {/* Status Overlay (Sold/Unsold) - Extreme Cinematic Mode */}
            {(currentPlayer.status === 'sold' || currentPlayer.status === 'unsold') && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-ipl-navy/90 backdrop-blur-3xl animate-in fade-in duration-700 overflow-hidden rounded-2xl">
                
                {/* Cinematic Watermark (Always in background) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 select-none pointer-events-none opacity-20 animate-in zoom-in duration-1000">
                   <div className={`text-[12rem] md:text-[28rem] font-black italic tracking-tighter leading-none ${
                     currentPlayer.status === 'sold' ? 'text-green-500/30' : 'text-red-500/30'
                   }`}>
                     {currentPlayer.status}
                   </div>
                </div>

                <div className="relative w-full h-full flex items-center justify-center">
                  {currentPlayer.status === 'sold' ? (
                    <div className="relative">
                      {/* Impact FX */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 border-4 border-ipl-gold/40 rounded-full animate-impact" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-ipl-gold/10 rounded-full blur-[120px] animate-spotlight" />
                      
                      {/* Smoke FX */}
                      {[...Array(8)].map((_, i) => (
                        <div 
                          key={`smoke-${i}`}
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-white/10 rounded-full blur-3xl animate-smoke"
                          style={{ animationDelay: `${0.4 + i * 0.1}s`, transform: `translate(${(i-3.5)*40}px, -20px)` }}
                        />
                      ))}

                      {/* Large Cinematic Gavel - Accurate Center Strike */}
                      <div className="animate-gavel-pro z-40 relative pointer-events-none">
                        <div className="relative flex flex-col items-center -rotate-[45deg] translate-y-[-40px] translate-x-[100px] md:translate-x-[140px]">
                          {/* 3D Metallic Head */}
                          <div className="w-40 h-20 md:w-56 md:h-28 bg-gradient-to-br from-[#a67c37] via-[#4a2e19] to-[#2a1a0d] rounded-xl border-4 border-ipl-gold shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative overflow-hidden">
                             <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent translate-x-[-100%] animate-[shimmer_2s_infinite]" />
                             <div className="absolute inset-y-0 left-0 w-3 bg-black/40" />
                             <div className="absolute inset-y-0 right-0 w-3 bg-black/40" />
                             <div className="absolute inset-y-0 left-1/2 w-8 bg-ipl-gold/20 -translate-x-1/2" />
                          </div>
                          {/* Elegant Solid Handle */}
                          <div className="w-5 h-72 md:w-8 md:h-[400px] bg-gradient-to-b from-[#4a2e19] to-black rounded-b-full shadow-2xl border-x border-white/5" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex flex-col items-center animate-in zoom-in duration-500 scale-125 md:scale-150">
                       <XCircle size={240} className="text-red-500/20 animate-pulse" />
                       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-red-500/10 blur-3xl rounded-full" />
                    </div>
                  )}
                </div>

                {/* News Ticker Strip - Single Slim Horizontal Line */}
                {currentPlayer.status === 'sold' && highestBidderTeam && (
                  <div className="absolute bottom-0 left-0 w-full bg-ipl-gold border-t border-white/20 z-50 h-7 md:h-10 overflow-hidden flex items-center">
                    <div className="animate-ticker flex flex-row items-center whitespace-nowrap">
                      {[...Array(12)].map((_, i) => (
                        <div key={i} className="flex items-center text-ipl-navy font-black text-[10px] md:text-sm uppercase italic tracking-widest px-4 shrink-0">
                          <span>{currentPlayer.name}</span>
                          <span className="mx-3 text-white/50 text-[6px]">●</span>
                          <span className="font-mono">{formatCurrency(currentPlayer.soldPrice || 0)}</span>
                          <span className="mx-3 text-white/50 text-[6px]">●</span>
                          <span>{highestBidderTeam.name}</span>
                          <span className="mx-6 text-white/30 font-light">|</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Set Break Overlay */}
            {room.status === 'set-break' && (
              <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-ipl-navy/95 backdrop-blur-3xl rounded-2xl animate-in fade-in duration-500">
                 <AlertTriangle size={64} className="text-ipl-gold mb-4 animate-pulse" />
                 <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter text-center px-4">Auction Paused By Admin</h2>
                 <p className="text-ipl-gold/60 mt-2 font-bold uppercase tracking-widest text-center px-4">Contact Admin for more Info</p>
                 {isHost && (
                   <button 
                     onClick={async () => {
                       await update(ref(db), { [`rooms/${room.id}/pauseBeforeNextSet`]: false });
                       await handleNextPlayer(true); // Explicitly from break
                     }} 
                     className="mt-8 px-8 py-3 bg-ipl-gold text-ipl-navy font-black uppercase rounded-lg hover:bg-ipl-gold/90 shadow-[0_0_20px_rgba(209,171,62,0.3)] transition-all active:scale-95"
                   >
                     Resume Auction (Start Next Set)
                   </button>
                 )}
              </div>
            )}

            {/* Host Offline Overlay */}
            {(room.status === 'active' || room.status === 're-auction-active' || room.status === 'paused') && isHostOffline && (
              <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center bg-ipl-navy/95 backdrop-blur-3xl rounded-2xl animate-in fade-in duration-500">
                 <AlertTriangle size={64} className="text-red-500 mb-4 animate-pulse" />
                 <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter text-center px-4">Auctioneer Disconnected</h2>
                 <p className="text-ipl-gold/60 mt-2 font-bold uppercase tracking-widest text-center px-4">Waiting for host to reconnect...</p>
              </div>
            )}

            {/* Bidding Controls (Hidden for Host and Spectator) */}
            {!isHost && currentUserRole !== 'spectator' && (
              <div className="p-6 bg-ipl-navy border-t border-ipl-gold/20 space-y-4">
                {error && <div className="text-center text-red-400 text-sm font-bold bg-red-400/10 p-2 rounded border border-red-400/20">{error}</div>}
                
                <div className="flex gap-4">
                  <button
                    onClick={handlePlaceBid}
                    disabled={loading || (room.status !== 'active' && room.status !== 're-auction-active') || timeLeft === 0 || userTeam?.purseBalance! < nextBidAmount || currentPlayer.highestBidderTeamId === userTeam?.id || !!(currentPlayer.passes?.[userTeam?.id || ''])}
                    className="flex-[2] group relative overflow-hidden bg-ipl-gold disabled:bg-gray-700 h-20 rounded-xl transition-all active:scale-95 shadow-lg"
                  >
                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                    <div className="relative flex flex-col items-center justify-center">
                      <div className="text-ipl-navy font-black text-2xl flex items-center gap-2 uppercase italic">
                        <Gavel size={24} />
                        {timeLeft === 0 ? 'TIME EXPIRED' : 
                         currentPlayer.passes?.[userTeam?.id || ''] ? 'WAITING FOR RIVAL...' :
                         currentPlayer.highestBidderTeamId === userTeam?.id ? 'HIGHEST BIDDER' : `BID ${formatCurrency(nextBidAmount)}`}
                      </div>
                      <div className="text-ipl-navy/60 text-[10px] font-bold uppercase tracking-widest">
                        {userTeam?.name} • Balance: {formatCurrency(userTeam?.purseBalance || 0)}
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={handlePassPlayer}
                    disabled={loading || (room.status !== 'active' && room.status !== 're-auction-active') || timeLeft === 0 || currentPlayer.highestBidderTeamId === userTeam?.id || !!(currentPlayer.passes?.[userTeam?.id || ''])}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-all disabled:opacity-20 flex flex-col items-center justify-center gap-1"
                  >
                    <XCircle size={24} className={currentPlayer.passes?.[userTeam?.id || ''] ? 'text-green-500' : 'text-red-500'} />
                    <span className="text-[10px] font-black uppercase">{currentPlayer.passes?.[userTeam?.id || ''] ? 'PASSED' : 'No Bid'}</span>
                  </button>
                </div>

                {/* Consensus Progress */}
                {(room.status === 'active' || room.status === 're-auction-active') && (
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black text-white/20 uppercase">Interest Map:</span>
                      <div className="flex -space-x-1.5">
                        {teams.filter(t => !!t.ownerUid).map(t => {
                          const hasPassed = !!(currentPlayer.passes?.[t.id]);
                          const isLeading = currentPlayer.highestBidderTeamId === t.id;
                          return (
                            <div 
                              key={t.id}
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[8px] font-black text-white shadow-sm transition-all duration-500 ${
                                hasPassed ? 'opacity-30 border-red-500 grayscale' : isLeading ? 'border-green-500 scale-110 z-10' : 'border-ipl-gold'
                              }`}
                              style={{ backgroundColor: t.color }}
                            >
                              {t.id}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="text-[9px] font-black text-ipl-gold/40 uppercase tracking-tighter italic animate-pulse">
                      {currentPlayer.highestBidderTeamId ? 'Waiting for Rivals to Pass...' : 'Waiting for Consensus...'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Host Action Overlay */}
            {isHost && (
              <div className="p-4 bg-ipl-navy border-t border-ipl-gold/20 grid grid-cols-3 md:grid-cols-5 gap-2 md:gap-4">
                <button 
                  onClick={handleSold}
                  disabled={!highestBidderTeam || loading || room.status === 'set-break'}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-green-600/10 border border-green-600/30 rounded-xl text-green-500 hover:bg-green-600 hover:text-white transition-all disabled:opacity-20"
                >
                  <CheckCircle size={20} />
                  <span className="text-[10px] font-black uppercase">Sold</span>
                </button>
                <button 
                  onClick={handleUnsold}
                  disabled={!!highestBidderTeam || loading || room.status === 'set-break'}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-red-600/10 border border-red-600/30 rounded-xl text-red-500 hover:bg-red-600 hover:text-white transition-all disabled:opacity-20"
                >
                  <XCircle size={20} />
                  <span className="text-[10px] font-black uppercase">Unsold</span>
                </button>
                <button 
                  onClick={togglePauseBeforeNextSet}
                  disabled={loading || room.status === 'set-break'}
                  className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-all disabled:opacity-20 ${room.pauseBeforeNextSet ? 'bg-ipl-gold text-ipl-navy' : 'bg-white/5 border border-white/10 text-white hover:bg-white hover:text-ipl-navy'}`}
                >
                  <Pause size={20} />
                  <span className="text-[8px] font-black uppercase text-center leading-none mt-1">
                    {room.pauseBeforeNextSet ? 'Will Pause\nNext Set' : 'Pause Next\nSet'}
                  </span>
                </button>
                <button 
                  onClick={togglePause}
                  disabled={loading || room.status === 'set-break'}
                  className="flex flex-col items-center justify-center gap-1 p-3 bg-ipl-gold/10 border border-ipl-gold/30 rounded-xl text-ipl-gold hover:bg-ipl-gold hover:text-ipl-navy transition-all disabled:opacity-20"
                >
                  {room.status === 'active' || room.status === 're-auction-active' ? <Pause size={20} /> : <Play size={20} />}
                  <span className="text-[10px] font-black uppercase">{room.status === 'active' || room.status === 're-auction-active' ? 'Pause' : 'Resume'}</span>
                </button>
                <button 
                  onClick={() => handleNextPlayer()}
                  disabled={(currentPlayer.status === 'current' && !!highestBidderTeam) || loading || room.status === 'set-break'}
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
                  {[...teams].sort((a, b) => b.purseBalance - a.purseBalance).map((team) => {
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
            /* Current Set View (Bag Draw Style) */
            <div className="bg-ipl-navy border border-ipl-gold/20 rounded-xl p-4 space-y-4 shadow-xl flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-ipl-gold/60 uppercase tracking-widest flex items-center gap-2">
                  <ListFilter size={16} />
                  SET {currentPlayer.setNo}: {currentPlayer.category || 'General'}
                </h3>
                <span className="text-[10px] font-bold text-white/20 uppercase bg-white/5 px-2 py-0.5 rounded">
                  {currentSetPlayers.filter(p => p.status === 'sold').length} / {currentSetPlayers.length} Sold
                </span>
              </div>
              
              <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar max-h-[500px]">
                
                {/* ACTIONED Section */}
                <div className="space-y-1.5">
                  <div className="text-[10px] text-white/40 uppercase tracking-widest font-black mb-2 border-b border-white/10 pb-1">
                    Actioned
                  </div>
                  {currentSetPlayers
                    .filter(p => ['current', 'sold', 'unsold'].includes(p.status))
                    .sort((a, b) => (b.auctionedOrder || 0) - (a.auctionedOrder || 0))
                    .map((player) => (
                    <div 
                      key={player.id} 
                      className={`flex items-center justify-between p-2 rounded transition-all border ${
                        player.id === currentPlayer.id 
                          ? 'bg-ipl-gold/10 border-ipl-gold shadow-[0_0_10px_rgba(209,171,62,0.1)] scale-[1.02]' 
                          : player.status === 'sold'
                            ? 'bg-green-500/5 border-green-500/20 opacity-80'
                            : player.status === 'unsold'
                              ? 'bg-red-500/5 border-red-500/20 opacity-80'
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
                        ) : (
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-ipl-gold animate-pulse" />
                            <span className="text-[8px] font-black text-ipl-gold uppercase">CURRENT</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* STILL IN BAG Section */}
                <div className="space-y-1.5 pt-4">
                  <div className="text-[10px] text-white/40 uppercase tracking-widest font-black mb-2 border-b border-white/10 pb-1">
                    Still in Bag
                  </div>
                  {currentSetPlayers.filter(p => p.status === 'upcoming').length === 0 ? (
                     <div className="text-center text-[10px] text-white/20 italic py-4">Set Complete</div>
                  ) : (
                    currentSetPlayers.filter(p => p.status === 'upcoming').map((player) => (
                      <div 
                        key={player.id} 
                        className="flex items-center justify-between p-2 rounded transition-all border bg-ipl-bg/30 border-white/5 opacity-50"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-bold truncate text-white/70">
                            {player.name}
                          </span>
                          <span className="text-[8px] font-black uppercase text-white/30 tracking-tighter">
                            {player.role} • {player.country}
                          </span>
                        </div>
                        
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-[9px] font-mono text-white/20">{formatCurrency(player.basePrice)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

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
