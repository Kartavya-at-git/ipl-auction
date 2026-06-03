import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom';
import { useAuth } from '../hooks/useAuth';
import Lobby from '../components/Lobby';
import Setup from '../components/Setup';
import AuctionDashboard from '../components/AuctionDashboard';
import TeamsView from '../components/TeamsView';
import Chat from '../components/Chat';
import ReAuctionSetup from '../components/ReAuctionSetup';
import TeamSelection from '../components/TeamSelection';
import Summary from './Summary';
import { Loader2, LogOut, Gavel, Users, Trophy, MessageCircle, X, Info } from 'lucide-react';

const Room = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<'auction' | 'teams' | 'summary'>('auction');
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const { user, loading: authLoading } = useAuth();
  const { room, players, activePlayer, teams, participants, recentBids, loading: roomLoading } = useRoom(roomId?.toUpperCase() || '');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || roomLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="animate-spin text-ipl-gold" size={48} />
        <p className="text-ipl-gold/60 animate-pulse font-medium tracking-widest uppercase text-xs">Loading Auction Room</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4">
        <h1 className="text-2xl font-bold text-white">Room Not Found</h1>
        <p className="text-ipl-gold/60 max-w-xs">The room code you entered is invalid or the auction has ended.</p>
        <button 
          onClick={() => navigate('/')}
          className="px-6 py-2 bg-ipl-gold text-ipl-navy font-bold rounded-lg mt-4"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const isHost = user?.uid === room.hostId;
  const currentParticipant = participants.find(p => p.uid === user?.uid);
  const userTeam = teams.find(t => t.ownerUid === user?.uid);
  const needsTeam = !isHost && !userTeam;

  // Header Component
  const Header = () => (
    <header className="bg-ipl-navy/80 backdrop-blur-md border-b border-ipl-gold/10 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="font-black text-xl tracking-tighter italic flex items-center gap-1">
            <span className="text-white">IPL</span>
            <span className="text-ipl-gold">AUCTION</span>
          </div>
          <div className="hidden md:flex h-4 w-[1px] bg-ipl-gold/20" />
          <div className="hidden md:flex items-center gap-2 text-xs font-bold text-ipl-gold/60 bg-ipl-gold/5 px-2 py-1 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            LIVE: {roomId}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-white leading-none">{currentParticipant?.displayName}</div>
            <div className="text-[10px] text-ipl-gold/40 uppercase tracking-wider">
              {isHost ? 'AUCTIONEER' : userTeam ? userTeam.name : 'SPECTATOR'}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <button 
              onClick={() => setIsChatOpen(true)}
              className="p-2 text-ipl-gold/60 hover:text-ipl-gold hover:bg-ipl-gold/10 rounded-full transition-colors relative"
            >
              <MessageCircle size={20} />
            </button>
            <button 
              onClick={() => navigate('/')}
              className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );

  // Bottom Nav Component
  const BottomNav = () => (
    <nav className="fixed bottom-0 left-0 right-0 bg-ipl-navy border-t border-ipl-gold/20 md:hidden flex items-center justify-around h-16 z-30 backdrop-blur-lg">
      <button 
        onClick={() => setActiveTab('auction')}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'auction' ? 'text-ipl-gold' : 'text-ipl-gold/30'}`}
      >
        <Gavel size={20} />
        <span className="text-[10px] font-bold uppercase">Auction</span>
      </button>
      <button 
        onClick={() => setActiveTab('teams')}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'teams' ? 'text-ipl-gold' : 'text-ipl-gold/30'}`}
      >
        <Users size={20} />
        <span className="text-[10px] font-bold uppercase">Teams</span>
      </button>
      <button 
        onClick={() => setActiveTab('summary')}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'summary' ? 'text-ipl-gold' : 'text-ipl-gold/30'}`}
      >
        <Trophy size={20} />
        <span className="text-[10px] font-bold uppercase">Summary</span>
      </button>
    </nav>
  );

  // 1. Forced Team Selection for Participants
  if (needsTeam && room.status !== 'waiting') {
    return (
      <div className="min-h-screen flex flex-col bg-ipl-bg text-white">
        <Header />
        <main className="flex-1 p-4 md:p-8">
          <TeamSelection room={room} teams={teams} participants={participants} currentUserUid={user?.uid || ''} />
        </main>
      </div>
    );
  }

  // 2. Room is Completed
  if (room.status === 'completed' || activeTab === 'summary') {
    return (
      <div className="min-h-screen flex flex-col bg-ipl-bg text-white">
        {room.status !== 'completed' && <Header />}
        <Summary standalone={room.status === 'completed'} />
        {room.status !== 'completed' && <BottomNav />}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0 relative overflow-hidden bg-ipl-bg text-white">
      <Header />

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {room.status === 'waiting' && (
          <Lobby room={room} participants={participants} isHost={isHost} />
        )}
        
        {room.status === 'setup' && (
          <Setup 
            room={room} 
            participants={participants} 
            teams={teams} 
            players={players} 
            isHost={isHost} 
            currentUserUid={user?.uid || ''} 
          />
        )}

        {room.status === 're-auction-setup' && (
          <ReAuctionSetup 
            room={room} 
            players={players} 
            teams={teams} 
            isHost={isHost} 
            currentUserUid={user?.uid || ''} 
          />
        )}

        {(room.status === 'active' || room.status === 'paused' || room.status === 're-auction-active') && (
          <>
            {activeTab === 'auction' ? (
              activePlayer ? (
                <AuctionDashboard
                  room={room}
                  currentPlayer={activePlayer}
                  players={players}
                  teams={teams}
                  recentBids={recentBids}
                  isHost={isHost}
                  currentUserUid={user?.uid || ''}
                />
              ) : (
                <div className="text-center py-20 flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-ipl-gold/10 flex items-center justify-center text-ipl-gold">
                    <Info size={32} />
                  </div>
                  <h2 className="text-xl font-black text-white uppercase italic">Waiting for Next Player</h2>
                  <p className="text-ipl-gold/40 text-sm max-w-xs">The auctioneer is preparing the next set of players. Stay tuned!</p>
                </div>
              )
            ) : (
              <TeamsView teams={teams} players={players} />
            )}
          </>
        )}
      </main>

      {/* Chat Sidebar */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-ipl-bg border-l border-ipl-gold/20 z-50 transform transition-transform duration-300 shadow-2xl ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-4 border-b border-ipl-gold/10 flex items-center justify-between bg-ipl-navy">
            <h3 className="font-black italic text-ipl-gold uppercase tracking-widest text-sm">Live Chat</h3>
            <button onClick={() => setIsChatOpen(false)} className="text-ipl-gold/60 hover:text-ipl-gold">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden p-2">
            <Chat 
              roomId={roomId || ''} 
              currentUserUid={user?.uid || ''} 
              currentUserName={currentParticipant?.displayName || 'User'}
              userTeamId={userTeam?.id || null}
              userTeamColor={userTeam?.color || null}
            />
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Room;
