import { Server, Socket } from 'socket.io';
import { GameManager } from '../game/GameManager';
import { RoomSettings, DrawAction } from '../game/Room';

export function registerSocketHandlers(io: Server, gameManager: GameManager): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('create-room', (data: { playerName: string; settings?: Partial<RoomSettings> }, callback: (response: any) => void) => {
      const room = gameManager.createRoom(data.settings);
      const player = room.addPlayer(socket.id, data.playerName);
      if (player) { socket.join(room.id); callback({ success: true, roomId: room.id, player }); console.log(`Room ${room.id} created by ${player.name}`);
      } else { callback({ success: false, error: 'Failed to create room' }); }
    });

    socket.on('join-room', (data: { roomId: string; playerName: string }, callback: (response: any) => void) => {
      const room = gameManager.getRoom(data.roomId.toUpperCase());
      if (!room) { callback({ success: false, error: 'Комната не найдена' }); return; }
      if (room.players.size >= room.settings.maxPlayers) { callback({ success: false, error: 'Комната заполнена' }); return; }
      if (room.state !== 'waiting') { callback({ success: false, error: 'Игра уже началась' }); return; }
      const player = room.addPlayer(socket.id, data.playerName);
      if (player) { socket.join(room.id); callback({ success: true, roomId: room.id, player, state: room.getPublicState() }); console.log(`${player.name} joined room ${room.id}`);
      } else { callback({ success: false, error: 'Не удалось войти в комнату' }); }
    });

    socket.on('leave-room', () => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (room) { socket.leave(room.id); room.removePlayer(socket.id); }
    });

    socket.on('get-rooms', (callback: (response: any) => void) => {
      callback({ rooms: gameManager.getAvailableRooms() });
    });

    socket.on('start-game', () => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player?.isHost) return;
      room.startGame();
    });

    socket.on('choose-word', (data: { word: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      room.chooseWord(socket.id, data.word);
    });

    socket.on('update-settings', (data: { settings: Partial<RoomSettings> }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player?.isHost) return;
      room.updateSettings(data.settings);
    });

    socket.on('draw', (action: DrawAction) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      room.handleDraw(socket.id, action);
    });

    socket.on('clear-canvas', () => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player?.isDrawing) return;
      room.drawActions = [];
      io.to(room.id).emit('canvas-cleared');
    });

    socket.on('undo-draw', () => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player?.isDrawing) return;
      const lastStartIdx = room.drawActions.map(a => a.type).lastIndexOf('start');
      if (lastStartIdx >= 0) {
        room.drawActions = room.drawActions.slice(0, lastStartIdx);
        io.to(room.id).emit('full-draw-state', { actions: room.drawActions });
      }
    });

    socket.on('guess', (data: { text: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      room.handleGuess(socket.id, data.text);
    });

    socket.on('chat-message', (data: { text: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      if (room.state === 'drawing') {
        const player = room.players.get(socket.id);
        if (player && !player.isDrawing && !player.hasGuessed) { room.handleGuess(socket.id, data.text); return; }
      }
      const player = room.players.get(socket.id);
      if (player) {
        const msg = { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`, playerId: socket.id, playerName: player.name, text: data.text.slice(0, 200), type: 'message' as const, timestamp: Date.now() };
        io.to(room.id).emit('chat-message', msg);
      }
    });

    socket.on('disconnect', () => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (room) { room.removePlayer(socket.id); }
      console.log(`Player disconnected: ${socket.id}`);
    });
  });
}
