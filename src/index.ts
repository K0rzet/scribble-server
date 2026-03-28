import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './game/GameManager';
import { registerSocketHandlers } from './handlers/socketHandlers';

const PORT = parseInt(process.env.PORT || '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL || '*';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'scribble-admin-secret-2024';

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '10mb' }));

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

// ─── Public API ──────────────────────────────────────────────

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

// ─── Word Bank Admin API ─────────────────────────────────────

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const apiKey = req.headers['x-admin-key'] as string;
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized. Provide X-Admin-Key header.' });
    return;
  }
  next();
}

// List all word banks
app.get('/api/word-banks', (_req, res) => {
  res.json({ banks: gameManager.wordBankManager.listBanks() });
});

// Get a specific word bank
app.get('/api/word-banks/:id', (req, res) => {
  const bank = gameManager.wordBankManager.getBank(req.params.id);
  if (!bank) {
    res.status(404).json({ error: 'Word bank not found' });
    return;
  }
  res.json({ bank });
});

// Create a word bank (admin only)
app.post('/api/word-banks', requireAdmin, (req, res) => {
  const { name, categories } = req.body;
  
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required and must be a string' });
    return;
  }
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
    res.status(400).json({ error: 'categories must be an object: { "CategoryName": ["word1", "word2", ...] }' });
    return;
  }

  // Validate categories
  for (const [cat, words] of Object.entries(categories)) {
    if (!Array.isArray(words)) {
      res.status(400).json({ error: `Category "${cat}" must be an array of strings` });
      return;
    }
    for (const w of words) {
      if (typeof w !== 'string') {
        res.status(400).json({ error: `All words in category "${cat}" must be strings` });
        return;
      }
    }
  }

  const bank = gameManager.wordBankManager.addBank(name, categories as Record<string, string[]>);
  res.status(201).json({ bank });
});

// Delete a word bank (admin only)
app.delete('/api/word-banks/:id', requireAdmin, (req, res) => {
  const deleted = gameManager.wordBankManager.deleteBank(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Word bank not found' });
    return;
  }
  res.json({ success: true });
});

httpServer.listen(PORT, () => {
  console.log(`🎨 Scribble server running on port ${PORT}`);
  console.log(`📚 Admin API key: ${ADMIN_API_KEY}`);
});
