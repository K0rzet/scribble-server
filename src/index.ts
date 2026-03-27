import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './game/GameManager';
import { registerSocketHandlers } from './handlers/socketHandlers';

const PORT = parseInt(process.env.PORT || '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL || '*';

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const gameManager = new GameManager(io);

registerSocketHandlers(io, gameManager);

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    rooms: gameManager.roomCount,
    players: gameManager.totalPlayers,
  });
});

app.get('/rooms', (_req, res) => {
  res.json({ rooms: gameManager.getAvailableRooms() });
});

httpServer.listen(PORT, () => {
  console.log(`🎨 Scribble server running on port ${PORT}`);
});
