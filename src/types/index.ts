export type RoomStatus = 'waiting' | 'setup' | 'active' | 'paused' | 're-auction-setup' | 're-auction-active' | 'completed';
export type PlayerStatus = 'upcoming' | 'current' | 'sold' | 'unsold';
export type UserRole = 'host' | 'participant';

export interface Room {
  id: string;
  hostId: string;
  status: RoomStatus;
  currentPlayerId: string | null;
  timerEndTime: number | null;
  auctionNumber: number;
  settings: {
    initialPurse: number;
    timerDuration: number;
    availableTeams: string[];
  };
  createdAt: any;
}

export interface Player {
  id: string;
  name: string;
  basePrice: number;
  role?: string;
  country?: string;
  category?: string;
  status: PlayerStatus;
  currentBid: number;
  highestBidderTeamId: string | null;
  soldPrice: number | null;
  teamId: string | null;
  order: number;
  isNominated?: boolean;
  setNo?: number;
  setName?: string;
  timerEndTime?: number | null;
  bidHistory?: {
    amount: number;
    teamId: string;
    timestamp: number;
  }[];
}

export interface Team {
  id: string;
  name: string;
  color: string;
  ownerUid: string | null;
  initialPurse: number;
  purseBalance: number;
  playerCount: number;
}

export interface Participant {
  uid: string;
  displayName: string;
  role: UserRole;
  teamId: string | null;
  isOnline: boolean;
  lastActive: any;
}

export interface Bid {
  id: string;
  amount: number;
  teamId: string;
  playerId: string;
  timestamp: any;
}
