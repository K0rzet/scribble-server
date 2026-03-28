import { Room, RoomSettings, GameMode } from './Room';
import { WordBankManager } from './WordBankManager';
import { Server } from 'socket.io';

export const MODE_NAMES: Record<GameMode, string> = {
  classic: 'Классика',
  gallery: 'Оценка',
  spy: 'Шпион',
  telephone: 'Телефон',
  speed: 'Быстрый раунд',
  reveal: 'Угадай по частям',
};

export class GameManager {
  private rooms: Map<string, Room> = new Map();
  private io: Server;
  public wordBankManager: WordBankManager;

  constructor(io: Server) {
    this.io = io;
    this.wordBankManager = new WordBankManager();
    setInterval(() => this.cleanupEmptyRooms(), 60000);
  }

  createRoom(settings?: Partial<RoomSettings>): Room {
    const id = this.generateRoomId();
    const room = new Room(id, this.io, settings, this.wordBankManager);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  deleteRoom(id: string): void {
    const room = this.rooms.get(id);
    if (room) {
      room.destroy();
      this.rooms.delete(id);
    }
  }

  getAvailableRooms() {
    const available: Array<{
      id: string;
      playerCount: number;
      maxPlayers: number;
      state: string;
      hostName: string;
      mode: GameMode;
      modeName: string;
      currentRound: number;
      totalRounds: number;
    }> = [];
    this.rooms.forEach((room) => {
      // Show ALL rooms that have players and aren't full
      if (room.playerCount > 0 && room.playerCount < room.settings.maxPlayers) {
        const host = room.getHost();
        available.push({
          id: room.id,
          playerCount: room.playerCount,
          maxPlayers: room.settings.maxPlayers,
          state: room.state,
          hostName: host?.name || 'Unknown',
          mode: room.settings.mode,
          modeName: MODE_NAMES[room.settings.mode] || room.settings.mode,
          currentRound: room.currentRound,
          totalRounds: room.settings.rounds,
        });
      }
    });
    return available;
  }

  findRoomByPlayer(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) return room;
    }
    return undefined;
  }

  private cleanupEmptyRooms(): void {
    const toDelete: string[] = [];
    this.rooms.forEach((room, id) => { if (room.isEmpty) toDelete.push(id); });
    toDelete.forEach((id) => this.deleteRoom(id));
    if (toDelete.length > 0) console.log(`Cleaned up ${toDelete.length} empty rooms`);
  }

  private generateRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
      code = '';
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    } while (this.rooms.has(code));
    return code;
  }

  get roomCount(): number { return this.rooms.size; }
  get totalPlayers(): number { let c = 0; this.rooms.forEach((r) => { c += r.playerCount; }); return c; }
}
