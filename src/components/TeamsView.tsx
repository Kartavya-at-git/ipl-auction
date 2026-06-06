import type { Team, Player } from '../types';
import { formatCurrency } from '../utils/helpers';
import { Users, Info } from 'lucide-react';

interface TeamsViewProps {
  teams: Team[];
  players: Player[];
}

const TeamsView = ({ teams, players }: TeamsViewProps) => {
  const soldPlayers = players.filter(p => p.status === 'sold');

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div className="flex items-center gap-2 mb-4">
        <Users className="text-ipl-gold" size={24} />
        <h2 className="text-xl font-bold text-white uppercase italic tracking-tight">Team Overview</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {teams.map((team) => {
          const teamPlayers = soldPlayers.filter(p => p.teamId === team.id);
          return (
            <div key={team.id} className="bg-ipl-navy border border-ipl-gold/10 rounded-xl overflow-hidden shadow-lg">
              <div className="p-4 flex items-center justify-between border-b border-ipl-gold/10" style={{ borderLeft: `4px solid ${team.color}` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-white shadow-inner" style={{ backgroundColor: team.color }}>
                    {team.id}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm uppercase leading-none mb-1">{team.name}</h3>
                    <div className="flex gap-2 text-[8px] font-black uppercase tracking-tighter">
                      <span className="text-ipl-gold">SQUAD: {teamPlayers.length}/25</span>
                      <span className={teamPlayers.filter(p => p.country?.toLowerCase() !== 'india').length > 8 ? 'text-red-500' : 'text-white/40'}>
                        OS: {teamPlayers.filter(p => p.country?.toLowerCase() !== 'india').length}/8
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-ipl-gold">{formatCurrency(team.purseBalance)}</div>
                  <div className="text-[10px] text-white/20 uppercase font-bold">Purse</div>
                </div>
              </div>
              
              <div className="p-3 bg-ipl-bg/30">
                {/* Role Breakdown Bar */}
                <div className="flex h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-3">
                  <div className="bg-blue-500 h-full transition-all" style={{ width: `${(teamPlayers.filter(p => p.role?.toUpperCase().includes('BAT')).length / 25) * 100}%` }} title="Batsmen" />
                  <div className="bg-red-500 h-full transition-all" style={{ width: `${(teamPlayers.filter(p => p.role?.toUpperCase().includes('BOWL')).length / 25) * 100}%` }} title="Bowlers" />
                  <div className="bg-green-500 h-full transition-all" style={{ width: `${(teamPlayers.filter(p => p.role?.toUpperCase().includes('ALL')).length / 25) * 100}%` }} title="All-rounders" />
                  <div className="bg-yellow-500 h-full transition-all" style={{ width: `${(teamPlayers.filter(p => p.role?.toUpperCase().includes('WK')).length / 25) * 100}%` }} title="Wicket-keepers" />
                </div>

                {teamPlayers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {teamPlayers.map(p => (
                      <div key={p.id} className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded border border-white/5 text-[9px] font-bold">
                        <span className="text-white/80">{p.name}</span>
                        {p.country?.toLowerCase() !== 'india' && <span className="text-ipl-gold">✈</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 flex flex-col items-center gap-1 opacity-20">
                    <Info size={16} />
                    <span className="text-[10px] uppercase font-bold">No players signed</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamsView;
