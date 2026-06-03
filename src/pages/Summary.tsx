import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { formatCurrency } from '../utils/helpers';
import { Trophy, Users, XCircle, Home, Download } from 'lucide-react';
interface SummaryProps {
  standalone?: boolean;
  onBack?: () => void;
}

const Summary = ({ standalone = true }: SummaryProps) => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { players, teams, loading } = useRoom(roomId || '');

  if (loading) return <div className="p-8 text-center text-ipl-gold animate-pulse">Loading Results...</div>;

  const soldPlayers = players.filter(p => p.status === 'sold');
  const unsoldPlayers = players.filter(p => p.status === 'unsold');

  return (
    <div className={`min-h-screen bg-ipl-bg text-white pb-20 ${!standalone ? 'h-full overflow-y-auto' : ''}`}>
      {standalone && (
        <header className="bg-ipl-navy p-6 border-b border-ipl-gold/20 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Trophy className="text-ipl-gold" size={32} />
              <div>
                <h1 className="text-2xl font-black italic uppercase tracking-tighter">Auction Summary</h1>
                <p className="text-ipl-gold/40 text-xs font-bold uppercase tracking-widest">Room: {roomId}</p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/')}
              className="p-2 bg-white/5 border border-ipl-gold/20 rounded-lg text-ipl-gold hover:bg-white/10"
            >
              <Home size={20} />
            </button>
          </div>
        </header>
      )}

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-12">
...

        {/* Team Squads Grid */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-ipl-gold">
            <Users size={24} />
            Team Squads
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => {
              const teamPlayers = soldPlayers.filter(p => p.teamId === team.id);
              return (
                <div key={team.id} className="bg-ipl-navy border border-ipl-gold/10 rounded-xl overflow-hidden shadow-xl">
                  <div className="p-4 flex items-center justify-between border-b border-ipl-gold/10" style={{ borderLeft: `4px solid ${team.color}` }}>
                    <div>
                      <h3 className="font-black text-white uppercase italic">{team.name}</h3>
                      <p className="text-[10px] text-ipl-gold/40 font-bold uppercase tracking-wider">{teamPlayers.length} Players</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-ipl-gold">{formatCurrency(team.purseBalance)}</div>
                      <div className="text-[10px] text-white/20 uppercase font-bold">Remaining</div>
                    </div>
                  </div>
                  <div className="p-4 space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                    {teamPlayers.length === 0 ? (
                      <p className="text-xs text-white/20 italic text-center py-4">No players bought</p>
                    ) : (
                      teamPlayers.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-ipl-bg/30 rounded border border-white/5">
                          <span className="font-bold text-white/80">{p.name}</span>
                          <span className="font-mono text-ipl-gold/60">{formatCurrency(p.soldPrice || 0)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unsold Players */}
        <div className="bg-ipl-navy/50 border border-red-500/20 rounded-xl p-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-red-400 mb-6">
            <XCircle size={24} />
            Unsold Players ({unsoldPlayers.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {unsoldPlayers.map(p => (
              <div key={p.id} className="p-3 bg-ipl-bg/30 border border-white/5 rounded text-center">
                <div className="text-xs font-bold text-white/60 mb-1">{p.name}</div>
                <div className="text-[10px] text-white/20 font-mono">Base: {formatCurrency(p.basePrice)}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Quick Summary Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-ipl-navy border-t border-ipl-gold/20 p-4 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex gap-8">
            <div>
              <div className="text-[10px] text-ipl-gold/40 uppercase font-bold">Total Spent</div>
              <div className="text-lg font-black text-white">
                {formatCurrency(soldPlayers.reduce((acc, p) => acc + (p.soldPrice || 0), 0))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-ipl-gold/40 uppercase font-bold">Players Sold</div>
              <div className="text-lg font-black text-white">{soldPlayers.length}</div>
            </div>
          </div>
          <button className="flex items-center gap-2 px-6 py-2 bg-ipl-gold text-ipl-navy font-bold rounded-lg">
            <Download size={18} />
            Export
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Summary;
