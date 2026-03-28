import { Server, Socket } from 'socket.io';
import { GameManager } from '../game/GameManager';
import { RoomSettings, DrawAction } from '../game/Room';

export function registerSocketHandlers(io: Server, gameManager: GameManager): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('create-room', (data: { playerName: string; settings?: Partial<RoomSettings> }, callback: (response: any) => void) => {
      const room = gameManager.createRoom(data.settings);
      const player = room.addPlayer(socket.id, data.playerName);
      if (player) {
        socket.join(room.id);
        callback({ success: true, roomId: room.id, player });
        console.log(`Room ${room.id} created by ${player.name} (mode: ${room.settings.mode})`);
      } else {
        callback({ success: false, error: 'Failed to create room' });
      }
    });

    socket.on('join-room', (data: { roomId: string; playerName: string }, callback: (response: any) => void) => {
      const room = gameManager.getRoom(data.roomId.toUpperCase());
      if (!room) { callback({ success: false, error: 'Комната не найдена' }); return; }
      if (room.players.size >= room.settings.maxPlayers) { callback({ success: false, error: 'Комната заполнена' }); return; }
      // Allow joining mid-game — removed state check
      const player = room.addPlayer(socket.id, data.playerName);
      if (player) {
        socket.join(room.id);
        callback({ success: true, roomId: room.id, player, state: room.getPublicState() });
        console.log(`${player.name} joined room ${room.id} (state: ${room.state})`);
        // Send current drawing state if game is in progress
        if (room.drawActions.length > 0 && room.state !== 'waiting') {
          socket.emit('full-draw-state', { actions: room.drawActions });
        }
      } else {
        callback({ success: false, error: 'Не удалось войти в комнату' });
      }
    });

    socket.on('leave-room', () => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (room) { socket.leave(room.id); room.removePlayer(socket.id); }
    });

    socket.on('get-rooms', (callback: (response: any) => void) => {
      callback({ rooms: gameManager.getAvailableRooms() });
    });

    socket.on('get-word-banks', (callback: (response: any) => void) => {
      callback({ banks: gameManager.wordBankManager.listBanks() });
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

    // Single draw action (legacy support)
    socket.on('draw', (action: DrawAction) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      room.handleDraw(socket.id, action);
    });

    // Batched draw actions (optimized)
    socket.on('draw-batch', (actions: DrawAction[]) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      if (!Array.isArray(actions) || actions.length === 0) return;
      room.handleDrawBatch(socket.id, actions);
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

    // Client requests full draw state (on mount, reconnect, or resize sync)
    socket.on('request-draw-state', () => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      if (room.drawActions.length > 0) {
        socket.emit('full-draw-state', { actions: room.drawActions });
      }
    });

    socket.on('guess', (data: { text: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      
      // Route to correct handler based on mode
      if (room.state === 'revealing') {
        room.handleRevealGuess(socket.id, data.text);
      } else {
        room.handleGuess(socket.id, data.text);
      }
    });

    socket.on('chat-message', (data: { text: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      if (room.state === 'drawing' || room.state === 'speedDrawing' || room.state === 'revealing') {
        const player = room.players.get(socket.id);
        if (player && !player.isDrawing && !player.hasGuessed) {
          if (room.state === 'revealing') {
            room.handleRevealGuess(socket.id, data.text);
          } else {
            room.handleGuess(socket.id, data.text);
          }
          return;
        }
      }
      const player = room.players.get(socket.id);
      if (player) {
        const msg = { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`, playerId: socket.id, playerName: player.name, text: data.text.slice(0, 200), type: 'message' as const, timestamp: Date.now() };
        io.to(room.id).emit('chat-message', msg);
      }
    });

    // ─── Gallery mode events ────────────────────────────────
    socket.on('gallery-submit', (data: { dataUrl: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      room.handleGallerySubmit(socket.id, data.dataUrl);
    });

    socket.on('gallery-vote', (data: { scores: Record<string, number> }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      if (!data || typeof data !== 'object' || !data.scores || typeof data.scores !== 'object') return;
      room.handleGalleryVote(socket.id, data.scores);
    });

    // ─── Spy mode events ────────────────────────────────────
    socket.on('spy-vote', (data: { suspectId: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      if (!data || typeof data !== 'object' || typeof data.suspectId !== 'string') return;
      room.handleSpyVote(socket.id, data.suspectId);
    });

    // ─── Telephone mode events ──────────────────────────────
    socket.on('telephone-submit-drawing', (data: { dataUrl: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      room.handleTelephoneSubmit(socket.id, data.dataUrl);
    });

    socket.on('telephone-submit-guess', (data: { text: string }) => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (!room) return;
      room.handleTelephoneGuess(socket.id, data.text);
    });

    socket.on('disconnect', () => {
      const room = gameManager.findRoomByPlayer(socket.id);
      if (room) { room.removePlayer(socket.id); }
      console.log(`Player disconnected: ${socket.id}`);
    });
  });
}
