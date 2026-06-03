import { Users, ShieldCheck, Play } from 'lucide-react';
import type { Room, Participant } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface LobbyProps {
  room: Room;
  participants: Participant[];
  isHost: boolean;
}

const Lobby = ({ room, participants, isHost }: LobbyProps) => {
  const handleStartSetup = async () => {
    await updateDoc(doc(db, 'rooms', room.id), {
      status: 'setup'
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-ipl-navy border border-ipl-gold/20 rounded-xl p-8 text-center space-y-4 shadow-xl">
        <h2 className="text-ipl-gold/60 uppercase tracking-[0.2em] text-sm font-bold">Auction Room Code</h2>
        <div className="text-6xl font-black text-white tracking-widest">{room.id}</div>
        <p className="text-ipl-gold/40 text-sm">Share this code with your friends to join</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-ipl-navy/50 border border-ipl-gold/10 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-ipl-gold font-bold mb-4">
            <Users size={20} />
            Participants ({participants.length})
          </div>
          <div className="space-y-2">
            {participants.map((p) => (
              <div key={p.uid} className="flex items-center justify-between p-3 bg-ipl-bg/50 rounded-lg border border-ipl-gold/5">
                <span className="font-medium">{p.displayName}</span>
                {p.role === 'host' && (
                  <span className="flex items-center gap-1 text-[10px] bg-ipl-gold/20 text-ipl-gold px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-ipl-gold/30">
                    <ShieldCheck size={10} />
                    Host
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center space-y-6 text-center md:text-left">
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Waiting for players...</h3>
            <p className="text-ipl-gold/50 text-sm leading-relaxed">
              Once everyone has joined, the host can proceed to the setup phase where teams will be selected and players will be imported.
            </p>
          </div>
          
          {isHost ? (
            <button
              onClick={handleStartSetup}
              className="flex items-center justify-center gap-2 px-8 py-4 bg-ipl-gold text-ipl-navy font-black rounded-lg hover:bg-ipl-gold/90 transition-all transform hover:scale-[1.02] shadow-lg shadow-ipl-gold/10"
            >
              <Play size={20} fill="currentColor" />
              START SETUP PHASE
            </button>
          ) : (
            <div className="p-4 bg-ipl-gold/5 border border-ipl-gold/20 rounded-lg text-ipl-gold/70 text-sm italic">
              Waiting for host to start setup...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lobby;
