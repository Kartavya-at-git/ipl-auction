import { useState } from 'react';
import { Upload, Users, ListOrdered, Play, Loader2 } from 'lucide-react';
import type { Room, Participant, Team, Player } from '../types';
import { ref, update } from 'firebase/database';
import { db } from '../lib/firebase';
import * as XLSX from 'xlsx';

interface SetupProps {
  room: Room;
  participants: Participant[];
  teams: Team[];
  players: Player[];
  isHost: boolean;
  currentUserUid: string;
  serverTimeOffset: number;
}

const Setup = ({ room, teams, players, isHost, serverTimeOffset }: SetupProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (players.length > 0) {
      setError('Player list already exists. Please delete the room and create a new one to re-upload.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      const updates: any = {};
      
      jsonData.forEach((row, index) => {
        const playerId = `player_${Date.now()}_${index}`;
        
        // Robust base price parsing
        let rawPrice = row['Base Price (₹)'] || row.BasePrice || row.basePrice || 0;
        if (typeof rawPrice === 'string') {
          // Remove currency symbols, commas, and spaces
          rawPrice = rawPrice.replace(/[^\d.]/g, '');
        }
        const basePrice = parseFloat(rawPrice) || 0;

        // Robust set number parsing
        let rawSet = String(row['Set No'] || row['Set No.'] || row['Set Number'] || '0');
        const setNo = Number(rawSet.replace(/[^\d]/g, '')) || 0;

        updates[`rooms/${room.id}/players/${playerId}`] = {
          name: row['Player Name'] || row.Name || row.name || 'Unknown Player',
          basePrice: basePrice,
          role: row.Role || row.role || '',
          country: row.Country || row.country || '',
          category: row.Category || row.category || 'General',
          setNo: setNo,
          status: 'upcoming',
          currentBid: 0,
          highestBidderTeamId: null,
          soldPrice: null,
          teamId: null,
          order: index + 1
        };
      });

      await update(ref(db), updates);
    } catch (err: any) {
      setError('Failed to parse Excel file');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartAuction = async () => {
    if (loading || room.status !== 'setup') return;
    if (players.length === 0) {
      setError('Please upload players first');
      return;
    }
    if (teams.length < 2) {
      setError('Need at least 2 teams to start');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const nextEndTime = Date.now() + serverTimeOffset + (room.settings.timerDuration * 1000);
      
      // Find the first set and pick a random player from it
      const sortedSets = [...new Set(players.map(p => p.setNo || 0))].sort((a, b) => a - b);
      const firstSetNo = sortedSets[0];
      const firstSetPlayers = players.filter(p => (p.setNo || 0) === firstSetNo && p.status === 'upcoming');
      
      const firstPlayer = firstSetPlayers[Math.floor(Math.random() * firstSetPlayers.length)] || players[0];

      const updates: any = {};
      updates[`rooms/${room.id}/status`] = 'active';
      updates[`rooms/${room.id}/currentPlayerId`] = firstPlayer.id;
      updates[`rooms/${room.id}/timerEndTime`] = nextEndTime;
      updates[`rooms/${room.id}/auctionNumber`] = 1;
      updates[`rooms/${room.id}/players/${firstPlayer.id}/status`] = 'current';
      updates[`rooms/${room.id}/players/${firstPlayer.id}/currentBid`] = firstPlayer.basePrice;
      updates[`rooms/${room.id}/players/${firstPlayer.id}/timerEndTime`] = nextEndTime;
      updates[`rooms/${room.id}/players/${firstPlayer.id}/auctionedOrder`] = 1;

      await update(ref(db), updates);
    } catch (err) {
      console.error("Failed to start auction:", err);
      setError("Failed to start auction. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 text-center">
      <div className="bg-ipl-navy border border-ipl-gold/20 rounded-2xl p-10 shadow-2xl space-y-8 max-w-4xl mx-auto">
        <div className="space-y-2">
          <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">Auction Setup</h2>
          <p className="text-ipl-gold/60 text-sm font-bold uppercase tracking-widest">Configure your player list and start the session</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="p-6 bg-ipl-bg/50 rounded-xl border border-ipl-gold/10 space-y-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-ipl-gold/10 text-ipl-gold mx-auto">
              <ListOrdered size={24} />
            </div>
            <div>
              <div className="text-2xl font-black text-white">{players.length}</div>
              <div className="text-[10px] text-ipl-gold/40 uppercase font-black tracking-widest">Players Imported</div>
            </div>
            {isHost && (
              <label className={`flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-ipl-gold/20 text-ipl-gold font-bold rounded-lg cursor-pointer hover:bg-white/10 transition-colors ${loading ? 'opacity-50' : ''}`}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                {loading ? 'Processing...' : 'Upload Excel'}
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={loading} />
              </label>
            )}
          </div>

          <div className="p-6 bg-ipl-bg/50 rounded-xl border border-ipl-gold/10 space-y-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-ipl-gold/10 text-ipl-gold mx-auto">
              <Users size={24} />
            </div>
            <div>
              <div className="text-2xl font-black text-white">{teams.length}</div>
              <div className="text-[10px] text-ipl-gold/40 uppercase font-black tracking-widest">Teams Joined</div>
            </div>
            <div className="flex -space-x-2 justify-center overflow-hidden">
              {teams.map(t => (
                <div key={t.id} className="w-8 h-8 rounded-full border-2 border-ipl-bg flex items-center justify-center text-[8px] font-black text-white shadow-lg shrink-0" style={{ backgroundColor: t.color }}>
                  {t.id}
                </div>
              ))}
              {teams.length === 0 && <div className="text-[10px] text-white/20 italic">Waiting for participants to pick teams...</div>}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg">
            {error}
          </div>
        )}

        {isHost && (
          <button
            onClick={handleStartAuction}
            disabled={players.length === 0 || teams.length < 2}
            className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-ipl-gold text-ipl-navy font-black text-xl rounded-xl hover:bg-ipl-gold/90 transition-all shadow-2xl disabled:opacity-30 disabled:grayscale transform hover:scale-[1.01]"
          >
            <Play size={24} fill="currentColor" />
            OPEN AUCTION ROOM
          </button>
        )}
      </div>

      {/* Player List Table (Restored) */}
      {players.length > 0 && (
        <div className="bg-ipl-navy border border-ipl-gold/20 rounded-2xl overflow-hidden shadow-xl max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
          <div className="p-4 bg-ipl-bg/50 border-b border-ipl-gold/10 flex items-center justify-between">
            <h3 className="text-sm font-black text-ipl-gold uppercase tracking-widest flex items-center gap-2">
              <ListOrdered size={16} />
              Imported Players
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-ipl-navy text-ipl-gold/40 uppercase font-black tracking-tighter">
                <tr>
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3 text-right">Base Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ipl-gold/5 bg-ipl-bg/10">
                {players.slice(0, 50).map((player) => (
                  <tr key={player.id} className="hover:bg-ipl-gold/5 transition-colors">
                    <td className="px-6 py-3 text-ipl-gold/40 font-mono">#{player.order}</td>
                    <td className="px-6 py-3 font-bold text-white/80">{player.name}</td>
                    <td className="px-6 py-3">
                      <span className="bg-white/5 px-2 py-0.5 rounded text-[10px] uppercase font-bold text-ipl-gold/60">{player.category}</span>
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-ipl-gold">₹{(player.basePrice / 10000000).toFixed(2)} Cr</td>
                  </tr>
                ))}
                {players.length > 50 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-ipl-gold/20 italic">
                      + {players.length - 50} more players imported
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {!isHost && (
        <div className="mt-8 p-6 bg-ipl-gold/5 border border-ipl-gold/10 rounded-xl max-w-md mx-auto">
          <p className="text-ipl-gold/60 text-sm italic">The host is currently setting up the auction. Please wait for the hammer to fall!</p>
        </div>
      )}
    </div>
  );
};

export default Setup;
