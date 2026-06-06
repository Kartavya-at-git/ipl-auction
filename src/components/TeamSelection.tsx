import { useState } from 'react';
import { CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import type { Room, Team, Participant } from '../types';
import { ref, runTransaction, update } from 'firebase/database';
import { db } from '../lib/firebase';

interface TeamSelectionProps {
  room: Room;
  teams: Team[];
  participants: Participant[];
  currentUserUid: string;
  onEnterAuction?: () => void;
}

export const IPL_TEAMS = [
  { id: 'MI', name: 'Mumbai Indians', color: '#004BA0' },
  { id: 'CSK', name: 'Chennai Super Kings', color: '#FFFF00' },
  { id: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24' },
  { id: 'KKR', name: 'Kolkata Knight Riders', color: '#3A225D' },
  { id: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A' },
  { id: 'GT', name: 'Gujarat Titans', color: '#1B2133' },
  { id: 'LSG', name: 'Lucknow Super Giants', color: '#0057E2' },
  { id: 'RR', name: 'Rajasthan Royals', color: '#EA1A85' },
  { id: 'DC', name: 'Delhi Capitals', color: '#00008B' },
  { id: 'PBKS', name: 'Punjab Kings', color: '#DD1F2D' },
];

const TeamSelection = ({ room, teams, participants, currentUserUid, onEnterAuction }: TeamSelectionProps) => {
  const [error, setError] = useState('');
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const userTeam = teams.find(t => t.ownerUid === currentUserUid);

  const selectTeam = async (teamInfo: typeof IPL_TEAMS[0]) => {
    if (selectingId || userTeam) return;

    if (room.status !== 'waiting' && room.status !== 'setup') {
      setError('Cannot select a team after the auction has started.');
      return;
    }
    
    setSelectingId(teamInfo.id);
    setError('');

    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData) return;
        if (!currentData.teams) currentData.teams = {};
        
        // Ensure team is not already taken
        if (currentData.teams[teamInfo.id]) {
          return; // Abort
        }

        currentData.teams[teamInfo.id] = {
          id: teamInfo.id,
          name: teamInfo.name,
          color: teamInfo.color,
          ownerUid: currentUserUid,
          initialPurse: room.settings.initialPurse,
          purseBalance: room.settings.initialPurse,
          playerCount: 0
        };

        if (!currentData.participants) currentData.participants = {};
        if (currentData.participants[currentUserUid]) {
          currentData.participants[currentUserUid].teamId = teamInfo.id;
        }

        return currentData;
      });
      setSelectingId(null);
    } catch (err: any) {
      console.error("Team selection failed:", err);
      setError(err.message || 'Failed to select team. Please try again.');
      setSelectingId(null);
    }
  };

  const handleResetTeam = async () => {
    if (!userTeam || selectingId) return;

    if (room.status !== 'waiting' && room.status !== 'setup') {
      setError('Cannot change teams after the auction has started.');
      return;
    }

    if (userTeam.playerCount > 0) {
      setError('Cannot change teams because you have already drafted players.');
      return;
    }

    setSelectingId(userTeam.id);
    setError('');

    try {
      await runTransaction(ref(db, `rooms/${room.id}`), (currentData) => {
        if (!currentData) return;
        
        // Double-check inside transaction for safety
        if (currentData.status !== 'waiting' && currentData.status !== 'setup') {
           throw new Error('Auction already started');
        }
        if (currentData.teams && currentData.teams[userTeam.id] && currentData.teams[userTeam.id].playerCount > 0) {
           throw new Error('Players already drafted');
        }

        // Remove team ownership
        if (currentData.teams && currentData.teams[userTeam.id]) {
          delete currentData.teams[userTeam.id];
        }

        // Update participant
        if (currentData.participants && currentData.participants[currentUserUid]) {
          currentData.participants[currentUserUid].teamId = null;
        }

        return currentData;
      });
      setSelectingId(null);
    } catch (err: any) {
      console.error("Team reset failed:", err);
      setError(err.message || 'Failed to reset team selection.');
      setSelectingId(null);
    }
  };

  const availableTeams = IPL_TEAMS.filter(it => !teams.some(t => t.id === it.id));

  if (userTeam) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-ipl-navy border border-ipl-gold/20 rounded-2xl text-center space-y-6 shadow-2xl animate-in zoom-in duration-300">
        <div className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center text-3xl font-black text-white shadow-xl" style={{ backgroundColor: userTeam.color }}>
          {userTeam.id}
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white uppercase italic">Franchise Secured!</h2>
          <p className="text-ipl-gold/60 text-sm">You are now the owner of <span className="text-ipl-gold font-bold">{userTeam.name}</span>.</p>
        </div>
        
        <div className="p-4 bg-ipl-bg/50 rounded-xl border border-ipl-gold/10 text-left space-y-2">
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
            <span className="text-white/40">Opening Purse</span>
            <span className="text-ipl-gold">₹{(userTeam.initialPurse / 10000000).toFixed(0)} Cr</span>
          </div>
          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-ipl-gold w-full" />
          </div>
        </div>

        <button
          onClick={() => {
            if (onEnterAuction) {
              onEnterAuction();
            } else {
              window.location.reload();
            }
          }}
          className="w-full py-4 bg-ipl-gold text-ipl-navy font-black rounded-xl hover:bg-ipl-gold/90 transition-all shadow-lg"
        >
          ENTER AUCTION ROOM
        </button>

        <button
          onClick={handleResetTeam}
          disabled={!!selectingId}
          className="w-full py-3 bg-white/5 border border-white/10 text-white/60 font-bold rounded-xl hover:bg-white/10 transition-all text-xs uppercase tracking-widest"
        >
          {selectingId ? 'Resetting...' : 'Choose Another Team'}
        </button>
      </div>
    );
  }

  if (availableTeams.length === 0) {
    const handleContinueAsSpectator = async () => {
      try {
        const updates: any = {};
        updates[`rooms/${room.id}/participants/${currentUserUid}/role`] = 'spectator';
        await update(ref(db), updates);
        
        if (onEnterAuction) {
          onEnterAuction();
        } else {
          window.location.reload();
        }
      } catch (err) {
        console.error("Failed to set spectator role:", err);
      }
    };

    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-ipl-navy border border-red-500/20 rounded-2xl text-center space-y-4">
        <ShieldAlert className="text-red-500 mx-auto" size={48} />
        <h2 className="text-xl font-bold text-white">Auction is Full</h2>
        <p className="text-ipl-gold/40 text-sm">All 10 IPL franchises have been claimed. You can still watch the auction as a spectator.</p>
        <button
          onClick={handleContinueAsSpectator}
          className="w-full mt-4 py-3 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-colors"
        >
          Continue as Spectator
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 mt-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Select Your Franchise</h2>
        <p className="text-ipl-gold/60 text-sm font-bold uppercase tracking-widest">Choose an available team to start bidding</p>
      </div>

      {error && (
        <div className="p-3 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg text-center">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {IPL_TEAMS.map((teamInfo) => {
          const team = teams.find(t => t.id === teamInfo.id);
          const isTaken = !!team;

          return (
            <button
              key={teamInfo.id}
              type="button"
              onClick={() => {
                if (!isTaken) selectTeam(teamInfo);
              }}
              disabled={isTaken || !!selectingId}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all pointer-events-auto ${
                isTaken
                  ? 'bg-gray-900/50 border-gray-800 opacity-50 grayscale cursor-not-allowed'
                  : selectingId === teamInfo.id
                    ? 'bg-ipl-gold/20 border-ipl-gold animate-pulse'
                    : 'bg-ipl-navy border-ipl-gold/20 hover:border-ipl-gold/50 hover:scale-[1.02] shadow-xl cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-white shadow-inner relative" style={{ backgroundColor: teamInfo.color }}>
                  {teamInfo.id}
                  {selectingId === teamInfo.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                      <Loader2 className="animate-spin text-white" size={16} />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <div className="text-sm font-black text-white leading-none mb-1 uppercase italic">{teamInfo.name}</div>
                  <div className="text-[10px] text-ipl-gold/40 font-bold uppercase">
                    {team ? `Owned by ${participants.find(p => p.uid === team.ownerUid)?.displayName}` : 'Available'}
                  </div>
                </div>
              </div>
              {isTaken && <CheckCircle2 size={20} className="text-white/20" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TeamSelection;
