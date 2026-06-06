import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { formatCurrency } from '../utils/helpers';
import { Trophy, Users, XCircle, Home, Download } from 'lucide-react';
interface SummaryProps {
  standalone?: boolean;
}

const Summary = ({ standalone = true }: SummaryProps) => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { players, teams, participants, loading } = useRoom(roomId?.toUpperCase() || '');

  if (loading) return <div className="p-8 text-center text-ipl-gold animate-pulse">Loading Results...</div>;

  const soldPlayers = players.filter(p => p.status === 'sold');
  const unsoldPlayers = players.filter(p => p.status === 'unsold');

  const exportToPDF = () => {
    const printWindow = document.createElement('iframe');
    printWindow.style.position = 'absolute';
    printWindow.style.width = '0';
    printWindow.style.height = '0';
    printWindow.style.border = 'none';
    document.body.appendChild(printWindow);

    const doc = printWindow.contentWindow?.document;
    if (!doc) return;

    let htmlContent = `
      <html>
        <head>
          <title>IPL AUCTION Draft Report</title>
          <style>
            @media print {
              body { 
                font-family: 'Inter', -apple-system, sans-serif; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
                margin: 0;
                padding: 40px;
                background-color: white;
              }
              .header-main { 
                text-align: center; 
                margin-bottom: 40px;
                border-bottom: 4px solid #0F172A;
                padding-bottom: 20px;
              }
              .header-main h1 { 
                font-size: 28px; 
                font-weight: 900; 
                margin: 0; 
                color: #0F172A;
                letter-spacing: -1px;
                text-transform: uppercase;
              }
              .header-main p { font-size: 12px; color: #64748B; margin-top: 5px; font-weight: bold; }
              
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 40px; 
                table-layout: fixed;
              }
              
              /* Excel Grid Styling */
              td, th { 
                border: 1px solid #CBD5E1; 
                padding: 10px 12px; 
                font-size: 11px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }

              .team-header { 
                color: white; 
                font-size: 14px; 
                font-weight: 900; 
                text-transform: uppercase; 
                border: 2px solid #0F172A; 
                letter-spacing: 1px;
                padding: 12px;
              }
              
              .col-name { width: 40%; font-weight: bold; color: #0F172A; }
              .col-role { width: 20%; text-transform: uppercase; font-size: 10px; color: #475569; }
              .col-country { width: 15%; text-transform: uppercase; font-size: 10px; color: #475569; }
              .col-price { width: 25%; font-family: 'Courier New', monospace; font-weight: 900; text-align: right; color: #0F172A; }
              
              .total-row { 
                background-color: #F1F5F9; 
                font-weight: 900; 
                border-top: 2px solid #0F172A;
              }
              
              .spacer-row { height: 30px; border: none !important; }
              .spacer-row td { border: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="header-main">
            <h1>IPL AUCTION 2026 OFFICIAL DRAFT REPORT</h1>
            <p>SQUAD LISTS • REMAINING PURSES • OFFICIAL RECORDS</p>
          </div>
          <table>
    `;

    teams.forEach((team, index) => {
      const teamPlayers = soldPlayers.filter(p => p.teamId === team.id);
      const owner = participants.find(p => p.uid === team.ownerUid);
      const ownerName = owner ? owner.displayName : 'UNASSIGNED';
      
      // Create a light tint of the team color for the rows (15% opacity)
      const lightTint = `${team.color}22`; 

      if (index > 0) {
        htmlContent += `<tr class="spacer-row"><td colspan="4"></td></tr>`;
      }

      // Team Header Block
      htmlContent += `
        <tr>
          <td colspan="4" class="team-header" style="background-color: ${team.color};">
            ${team.name} — MANAGED BY ${ownerName}
          </td>
        </tr>
        <tr style="background-color: #F8F9FA; font-weight: 900; font-size: 9px; color: #64748B;">
          <td>PLAYER NAME</td>
          <td>ROLE</td>
          <td>COUNTRY</td>
          <td style="text-align: right;">SOLD PRICE</td>
        </tr>
      `;

      // Player Rows
      if (teamPlayers.length === 0) {
        htmlContent += `
          <tr style="background-color: ${lightTint};">
            <td colspan="4" style="text-align: center; color: #94A3B8; font-style: italic; padding: 20px;">No players acquired in this session</td>
          </tr>
        `;
      } else {
        teamPlayers.forEach(p => {
          htmlContent += `
            <tr style="background-color: ${lightTint};">
              <td class="col-name">${p.name}</td>
              <td class="col-role">${p.role || '-'}</td>
              <td class="col-country">${p.country || '-'}</td>
              <td class="col-price">${formatCurrency(p.soldPrice || 0)}</td>
            </tr>
          `;
        });
      }

      // Summary Row
      const totalSpent = teamPlayers.reduce((acc, p) => acc + (p.soldPrice || 0), 0);
      htmlContent += `
        <tr class="total-row">
          <td colspan="3" style="text-align: right; text-transform: uppercase; letter-spacing: 1px;">SQUAD TOTAL / REMAINING PURSE</td>
          <td class="col-price" style="color: ${team.color};">${formatCurrency(totalSpent)} / ${formatCurrency(team.purseBalance)}</td>
        </tr>
      `;
    });

    htmlContent += `
          </table>
          <div style="text-align: center; font-size: 10px; color: #94A3B8; margin-top: 40px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px;">
            Generated by IPL Auction Broadcast System • Room: ${roomId?.toUpperCase()}
          </div>
        </body>
      </html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      printWindow.contentWindow?.focus();
      printWindow.contentWindow?.print();
      setTimeout(() => document.body.removeChild(printWindow), 1000);
    }, 500);
  };


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
          <button onClick={exportToPDF} className="flex items-center gap-2 px-6 py-2 bg-ipl-gold text-ipl-navy font-bold rounded-lg hover:bg-ipl-gold/90 transition-colors">
            <Download size={18} />
            Export
          </button>
        </div>
      </footer>
    </div>
  );
};

export default Summary;
