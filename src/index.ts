import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './game/GameManager';
import { registerSocketHandlers } from './handlers/socketHandlers';
import WORD_BANK from './game/WordBank';

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

// ─── Reveal image parsing/proxy ───────────────────────────────
const IMAGE_HOST_ALLOWLIST = new Set([
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'ru.wikipedia.org',
  'en.wikipedia.org',
]);

const WORD_IMAGE_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const wordImageCache = new Map<string, { url: string; expiresAt: number }>();
const imageBinaryCache = new Map<string, { data: Buffer; contentType: string; expiresAt: number }>();

function isAllowedImageHost(hostname: string): boolean {
  if (IMAGE_HOST_ALLOWLIST.has(hostname)) return true;
  return hostname.endsWith('.wikimedia.org') || hostname.endsWith('.wikipedia.org');
}

function normalizeRevealWord(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/\s+/g, ' ');
}

async function wikipediaTitleImage(word: string, lang: 'ru' | 'en'): Promise<string | null> {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=900&titles=${encodeURIComponent(word)}`;
  const resp = await fetch(endpoint);
  if (!resp.ok) return null;
  const data = await resp.json() as {
    query?: {
      pages?: Record<string, { thumbnail?: { source?: string } }>;
    };
  };
  const pages = data.query?.pages ? Object.values(data.query.pages) : [];
  for (const page of pages) {
    const src = page.thumbnail?.source;
    if (typeof src === 'string' && src.startsWith('https://')) return src;
  }
  return null;
}

async function wikipediaSearchImage(word: string, lang: 'ru' | 'en'): Promise<string | null> {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(word)}&gsrlimit=8&gsrnamespace=0&prop=pageimages&piprop=thumbnail&pithumbsize=900`;
  const resp = await fetch(endpoint);
  if (!resp.ok) return null;
  const data = await resp.json() as {
    query?: {
      pages?: Record<string, { thumbnail?: { source?: string } }>;
    };
  };
  const pages = data.query?.pages ? Object.values(data.query.pages) : [];
  for (const page of pages) {
    const src = page.thumbnail?.source;
    if (typeof src === 'string' && src.startsWith('https://')) return src;
  }
  return null;
}

async function resolveRevealImageByWord(word: string): Promise<string | null> {
  const normalized = normalizeRevealWord(word);
  if (!normalized) return null;

  const cached = wordImageCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const variants = [normalized, `${normalized} фото`, `${normalized} объект`];
  const resolvers: Array<() => Promise<string | null>> = [];
  for (const variant of variants) {
    resolvers.push(() => wikipediaTitleImage(variant, 'ru'));
    resolvers.push(() => wikipediaSearchImage(variant, 'ru'));
    resolvers.push(() => wikipediaTitleImage(variant, 'en'));
    resolvers.push(() => wikipediaSearchImage(variant, 'en'));
  }

  for (const run of resolvers) {
    try {
      const url = await run();
      if (!url) continue;
      try {
        const host = new URL(url).hostname;
        if (!isAllowedImageHost(host)) continue;
      } catch {
        continue;
      }
      wordImageCache.set(normalized, { url, expiresAt: Date.now() + WORD_IMAGE_CACHE_TTL_MS });
      return url;
    } catch {
      // Continue trying next resolver
    }
  }

  return null;
}

async function proxyImageFromUrl(sourceUrl: string): Promise<{ data: Buffer; contentType: string }> {
  const cached = imageBinaryCache.get(sourceUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, contentType: cached.contentType };
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Image upstream failed with status ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    throw new Error('Upstream response is not an image');
  }

  const data = Buffer.from(await response.arrayBuffer());
  imageBinaryCache.set(sourceUrl, {
    data,
    contentType,
    expiresAt: Date.now() + WORD_IMAGE_CACHE_TTL_MS,
  });
  return { data, contentType };
}

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

app.get('/api/reveal-image', async (req, res) => {
  try {
    const src = typeof req.query.src === 'string' ? req.query.src : '';
    const word = typeof req.query.word === 'string' ? req.query.word : '';

    let sourceUrl = src.trim();
    if (!sourceUrl && word.trim()) {
      const resolved = await resolveRevealImageByWord(word);
      if (!resolved) {
        res.status(404).json({ error: 'Не удалось найти картинку для слова' });
        return;
      }
      sourceUrl = resolved;
    }

    if (!sourceUrl) {
      res.status(400).json({ error: 'Передайте src или word query-параметр' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      res.status(400).json({ error: 'Некорректный URL изображения' });
      return;
    }

    if (parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Разрешены только HTTPS изображения' });
      return;
    }

    if (!isAllowedImageHost(parsed.hostname)) {
      res.status(400).json({ error: 'Домен изображения не разрешен' });
      return;
    }

    const { data, contentType } = await proxyImageFromUrl(parsed.toString());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=21600, stale-while-revalidate=86400');
    res.send(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    res.status(502).json({ error: `Не удалось получить изображение: ${message}` });
  }
});

// ─── Word Bank Admin API ─────────────────────────────────────

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const headerKey = req.headers['x-admin-key'] as string | undefined;
  const authHeader = req.headers.authorization || '';
  const bearerKey = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  const apiKey = (headerKey || bearerKey || '').trim();
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized. Provide X-Admin-Key header or Bearer token.' });
    return;
  }
  next();
}

function parseCategoriesPayload(
  value: unknown
): { ok: true; categories: Record<string, string[]> } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      error: 'categories must be an object: { "CategoryName": ["word1", "word2"] }',
    };
  }

  const categories: Record<string, string[]> = {};
  for (const [rawCategory, words] of Object.entries(value as Record<string, unknown>)) {
    const category = rawCategory.trim();
    if (!category) continue;
    if (!Array.isArray(words)) {
      return { ok: false, error: `Category "${rawCategory}" must be an array of strings` };
    }
    const normalizedWords = words
      .map((w) => String(w).trim())
      .filter(Boolean);
    categories[category] = Array.from(new Set(normalizedWords));
  }

  return { ok: true, categories };
}

// List all word banks
app.get('/api/word-banks', (_req, res) => {
  res.json({ banks: gameManager.wordBankManager.listBanks() });
});

// Get all words tree: built-in + custom banks
app.get('/api/word-banks/tree', (_req, res) => {
  const builtInCategories: Record<string, string[]> = {};
  for (const entry of WORD_BANK) {
    if (!builtInCategories[entry.category]) builtInCategories[entry.category] = [];
    builtInCategories[entry.category].push(entry.word);
  }
  for (const key of Object.keys(builtInCategories)) {
    builtInCategories[key] = Array.from(new Set(builtInCategories[key]));
  }

  const customBanks = gameManager.wordBankManager.listBanks().map((bankSummary) => {
    const full = gameManager.wordBankManager.getBank(bankSummary.id);
    return full
      ? {
          id: full.id,
          name: full.name,
          categories: full.categories,
          wordCount: full.wordCount,
          createdAt: full.createdAt,
        }
      : null;
  }).filter(Boolean);

  res.json({
    allWords: {
      builtIn: {
        name: 'Встроенный банк',
        categories: builtInCategories,
      },
      customBanks,
    },
  });
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
  const parsed = parseCategoriesPayload(categories ?? {});
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const bank = gameManager.wordBankManager.addBank(name.trim(), parsed.categories);
  res.status(201).json({ bank });
});

// Fill/update categories and words of selected bank (admin only)
app.post('/api/word-banks/:id/categories', requireAdmin, (req, res) => {
  const bankId = req.params.id;
  const modeRaw = typeof req.body?.mode === 'string' ? req.body.mode : 'merge';
  const mode = modeRaw === 'replace' ? 'replace' : 'merge';

  const parsed = parseCategoriesPayload(req.body?.categories);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const updated = gameManager.wordBankManager.updateBankCategories(bankId, parsed.categories, mode);
  if (!updated) {
    res.status(404).json({ error: 'Word bank not found' });
    return;
  }

  res.json({ bank: updated, mode });
});

// Bulk create banks from JSON (admin only)
app.post('/api/word-banks/import', requireAdmin, (req, res) => {
  const banks = req.body?.banks;
  if (!Array.isArray(banks) || banks.length === 0) {
    res.status(400).json({ error: 'banks must be a non-empty array' });
    return;
  }

  const created: Array<{ id: string; name: string; wordCount: number }> = [];
  for (const [idx, item] of banks.entries()) {
    if (!item || typeof item !== 'object') {
      res.status(400).json({ error: `banks[${idx}] must be an object` });
      return;
    }

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: `banks[${idx}].name is required` });
      return;
    }

    const parsed = parseCategoriesPayload((item as { categories?: unknown }).categories ?? {});
    if (!parsed.ok) {
      res.status(400).json({ error: `banks[${idx}] invalid categories: ${parsed.error}` });
      return;
    }

    const bank = gameManager.wordBankManager.addBank(name, parsed.categories);
    created.push({ id: bank.id, name: bank.name, wordCount: bank.wordCount });
  }

  res.status(201).json({ createdCount: created.length, banks: created });
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
