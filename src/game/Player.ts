export interface Player {
  id: string;
  socketId: string;
  name: string;
  avatarIndex: number;
  score: number;
  hasGuessed: boolean;
  isDrawing: boolean;
  isHost: boolean;
  connected: boolean;
}

export function createPlayer(socketId: string, name: string, isHost: boolean = false): Player {
  return {
    id: socketId,
    socketId,
    name: name.trim().slice(0, 20) || 'Игрок',
    avatarIndex: Math.floor(Math.random() * 24),
    score: 0,
    hasGuessed: false,
    isDrawing: false,
    isHost,
    connected: true,
  };
}
