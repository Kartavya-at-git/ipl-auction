import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Plus, LogIn, Clock, ArrowRight } from 'lucide-react';
import { ref, set, get, child, serverTimestamp, onValue } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { generateRoomCode } from '../utils/helpers';

const Landing = () => {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentRooms, setRecentRooms] = useState<any[]>([]);
  const navigate = useNavigate();
  const { user, loginWithGoogle, firebaseInitialized } = useAuth();

  useEffect(() => {
    if (user) {
      const recentRef = ref(db, `users/${user.uid}/recentRooms`);
      const unsubscribe = onValue(recentRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const list = Object.keys(data).map(code => ({
            code,
            lastVisited: data[code].lastVisited
          })).sort((a, b) => b.lastVisited - a.lastVisited);
          setRecentRooms(list.slice(0, 3)); // Show top 3 recent
        } else {
          setRecentRooms([]);
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  if (!firebaseInitialized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 text-center space-y-4">
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl max-w-md">
          <h1 className="text-xl font-bold text-red-500 mb-2">Configuration Required</h1>
          <p className="text-white/60 text-sm">
            It looks like your Firebase configuration is missing or incorrect. 
            Please fill in your <code className="bg-white/10 px-1 rounded">.env</code> file with your Firebase project details.
          </p>
          <div className="mt-4 text-xs text-white/40 text-left bg-black/20 p-3 rounded font-mono">
            VITE_FIREBASE_API_KEY=...<br/>
            VITE_FIREBASE_PROJECT_ID=...
          </div>
        </div>
      </div>
    );
  }

  const saveToHistory = async (uid: string, code: string) => {
    try {
      await set(ref(db, `users/${uid}/recentRooms/${code}`), {
        lastVisited: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to save history:", err);
    }
  };

  const handleCreateRoom = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const currentUser = user || await loginWithGoogle();
      
      // Collision safety: Check if room code already exists
      let newRoomCode = generateRoomCode();
      let exists = true;
      let attempts = 0;
      
      while (exists && attempts < 5) {
        const snap = await get(ref(db, `rooms/${newRoomCode}`));
        if (!snap.exists()) {
          exists = false;
        } else {
          newRoomCode = generateRoomCode();
          attempts++;
        }
      }

      if (exists) throw new Error("Failed to generate a unique room code. Try again.");

      const roomRef = ref(db, `rooms/${newRoomCode}`);

      await set(roomRef, {
        hostId: currentUser.uid,
        status: 'waiting',
        currentPlayerId: null,
        timerEndTime: null,
        auctionNumber: 0,
        settings: {
          initialPurse: 1200000000, // 120 Cr default
          timerDuration: 30, // 30 seconds default
          availableTeams: ['MI', 'CSK', 'RCB', 'KKR', 'SRH', 'GT', 'LSG', 'RR', 'DC', 'PBKS']
        },
        createdAt: serverTimestamp(),
        participants: {
          [currentUser.uid]: {
            uid: currentUser.uid,
            displayName: name,
            role: 'host',
            teamId: null,
            isOnline: true,
            lastActive: serverTimestamp()
          }
        }
      });

      await saveToHistory(currentUser.uid, newRoomCode);
      navigate(`/room/${newRoomCode}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!name.trim() || !roomCode.trim()) {
      setError('Please enter name and room code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const upperCode = roomCode.trim().toUpperCase();
      const roomSnap = await get(child(ref(db), `rooms/${upperCode}`));

      if (!roomSnap.exists()) {
        setError('Room not found');
        setLoading(false);
        return;
      }

      const currentUser = user || await loginWithGoogle();
      
      // Add participant
      const participantRef = ref(db, `rooms/${upperCode}/participants/${currentUser.uid}`);
      const partSnap = await get(participantRef);

      if (!partSnap.exists()) {
        await set(participantRef, {
          uid: currentUser.uid,
          displayName: name,
          role: 'participant',
          teamId: null,
          isOnline: true,
          lastActive: serverTimestamp()
        });
      }

      await saveToHistory(currentUser.uid, upperCode);
      navigate(`/room/${upperCode}`);
    } catch (err: any) {
      setError(err.message || 'Failed to join room');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Branding */}
        <div className="bg-ipl-navy p-8 rounded-xl border border-ipl-gold/20 shadow-2xl space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ipl-gold/10 text-ipl-gold mb-4">
              <Trophy size={32} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">IPL Auction</h1>
            <p className="text-ipl-gold/60">Private Auction Room</p>
          </div>

          {/* Recent Rooms Section */}
          {user && recentRooms.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-black text-ipl-gold/40 uppercase tracking-[0.2em]">
                <Clock size={12} />
                Continue Recent Auctions
              </div>
              <div className="grid gap-2">
                {recentRooms.map((room) => (
                  <button
                    key={room.code}
                    onClick={() => navigate(`/room/${room.code}`)}
                    className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg hover:border-ipl-gold/40 hover:bg-white/10 transition-all group"
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold text-white tracking-widest uppercase">{room.code}</span>
                      <span className="text-[10px] text-white/30">Last visited {new Date(room.lastVisited).toLocaleDateString()}</span>
                    </div>
                    <ArrowRight size={16} className="text-ipl-gold/40 group-hover:text-ipl-gold transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg text-center">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium text-ipl-gold/80 ml-1">Your Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 bg-ipl-bg border border-ipl-gold/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-ipl-gold/50 text-white placeholder:text-gray-600 disabled:opacity-50"
              />
            </div>

            <div className="pt-2 space-y-3">
              <button
                onClick={handleCreateRoom}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-ipl-gold text-ipl-navy font-bold rounded-lg hover:bg-ipl-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-ipl-navy/30 border-t-ipl-navy rounded-full animate-spin" />
                ) : (
                  <>
                    <Plus size={20} />
                    Host New Auction
                  </>
                )}
              </button>
              
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-ipl-gold/10"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-ipl-navy px-2 text-ipl-gold/40">Or join existing</span>
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter Room Code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-ipl-bg border border-ipl-gold/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-ipl-gold/50 text-white text-center tracking-widest uppercase placeholder:text-gray-600 disabled:opacity-50"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-white/5 border border-ipl-gold/30 text-ipl-gold font-bold rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-ipl-gold/30 border-t-ipl-gold rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn size={20} />
                      Join Room
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-center text-ipl-gold/30 text-xs uppercase tracking-[0.2em]">
        Professional Auction Management System
      </div>
    </div>
  );
};

export default Landing;
