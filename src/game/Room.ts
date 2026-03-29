import { Player, createPlayer } from './Player';
import {
  getRandomWords,
  generateHintProgressive,
  getNextRevealIndex,
  checkGuess,
} from './WordBank';
import type { WordEntry } from './WordBank';
import { WordBankManager } from './WordBankManager';
import WORD_BANK from './WordBank';
import { Server } from 'socket.io';

export type GameMode = 'classic' | 'gallery' | 'spy' | 'telephone' | 'speed' | 'reveal';

export type RoomState =
  | 'waiting'
  | 'choosing'
  | 'drawing'
  | 'roundEnd'
  | 'gameEnd'
  // Gallery mode states
  | 'allDrawing'
  | 'gallery'
  | 'voting'
  // Spy mode states
  | 'spyPrep'
  | 'spyDrawing'
  | 'spyVoting'
  | 'spyGuess'
  // Telephone mode states
  | 'chainDraw'
  | 'chainGuess'
  | 'chainReveal'
  // Speed mode states
  | 'speedDrawing'
  // Reveal mode state
  | 'revealing';

export interface RoomSettings {
  maxPlayers: number;
  rounds: number;
  spyRounds?: number;
  drawTime: number;
  chooseTime: number;
  mode: GameMode;
  wordBankIds: string[];
  spyCount?: number;
  spyTurnTime?: number;
}

export interface DrawAction {
  type: 'start' | 'draw' | 'end' | 'clear' | 'fill';
  x?: number;
  y?: number;
  color?: string;
  lineWidth?: number;
  fillColor?: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  type: 'message' | 'correct' | 'close' | 'system' | 'join' | 'leave';
  timestamp: number;
}

export interface GuessOrderEntry {
  playerId: string;
  playerName: string;
  position: number;
  score: number;
  timeElapsed: number;
}

// ─── Gallery Mode types ──────────────────────────────────────
export interface GalleryDrawing {
  playerId: string;
  playerName: string;
  dataUrl: string;
}

// ─── Spy Mode types ──────────────────────────────────────────
export interface SpyVote {
  voterId: string;
  suspectId: string;
}

// ─── Telephone Mode types ────────────────────────────────────
export interface TelephoneChainLink {
  playerId: string;
  playerName: string;
  type: 'draw' | 'guess';
  dataUrl?: string;
  text?: string;
}

const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 10,
  rounds: 3,
  spyRounds: 2,
  drawTime: 90,
  chooseTime: 15,
  mode: 'classic',
  wordBankIds: ['all'],
  spyCount: 1,
  spyTurnTime: 5,
};

export class Room {
  id: string;
  players: Map<string, Player> = new Map();
  state: RoomState = 'waiting';
  settings: RoomSettings;
  currentRound: number = 0;
  currentDrawerIndex: number = -1;
  currentWord: string = '';
  currentCategory: string = '';
  wordChoices: WordEntry[] = [];
  hint: string = '';
  revealedIndices: number[] = [];
  drawActions: DrawAction[] = [];
  messages: ChatMessage[] = [];
  timeLeft: number = 0;
  guessedCount: number = 0;
  playerOrder: string[] = [];
  guessOrder: GuessOrderEntry[] = [];

  // Deferred scoring
  private pendingScores: Map<string, number> = new Map();
  private pendingDrawerScore: number = 0;

  private io: Server;
  private roundTimer: NodeJS.Timeout | null = null;
  private hintTimer: NodeJS.Timeout | null = null;
  private msgCounter: number = 0;
  private wordBankManager: WordBankManager | null = null;

  // ─── Gallery mode state ──────────────────────────────────
  galleryDrawings: GalleryDrawing[] = [];
  galleryScores: Map<string, Record<string, number>> = new Map();
  galleryReadyIds: string[] = [];

  // ─── Spy mode state ──────────────────────────────────────
  spyIds: string[] = [];
  spyVotes: SpyVote[] = [];
  spyCurrentDrawerId: string = '';
  spyTurnIndex: number = -1;

  // ─── Telephone mode state ────────────────────────────────
  telephoneChain: TelephoneChainLink[] = [];
  chainCurrentIndex: number = 0;
  chainCurrentWord: string = '';

  // ─── Speed mode state ────────────────────────────────────
  speedWordsGuessed: number = 0;
  speedWordQueue: WordEntry[] = [];

  // ─── Reveal mode state ───────────────────────────────────
  revealProgress: number = 0;      // 0..100 (derived from tiles)
  revealImageUrl: string = '';     // current image URL
  revealedTiles: number[] = [];    // indices of revealed tiles (0..REVEAL_TILES-1)
  revealTileOrder: number[] = [];  // pre-shuffled order to reveal

  constructor(id: string, io: Server, settings?: Partial<RoomSettings>, wordBankManager?: WordBankManager) {
    this.id = id;
    this.io = io;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.wordBankManager = wordBankManager || null;
  }

  // ─── Word Pool ───────────────────────────────────────────
  private getWordPool(): WordEntry[] | undefined {
    if (!this.wordBankManager) return undefined;
    const bankIds = this.settings.wordBankIds;
    if (!bankIds || bankIds.length === 0 || bankIds.includes('all')) {
      const customWords = this.wordBankManager.getWords(['all']);
      if (customWords.length === 0) return undefined;
      return [...WORD_BANK, ...customWords];
    }
    const bankWords = this.wordBankManager.getWords(bankIds);
    return bankWords.length > 0 ? bankWords : undefined;
  }

  // ─── Player Management ────────────────────────────────────────

  addPlayer(socketId: string, name: string): Player | null {
    if (this.players.size >= this.settings.maxPlayers) return null;
    if (this.players.has(socketId)) return this.players.get(socketId)!;

    const isHost = this.players.size === 0;
    const player = createPlayer(socketId, name, isHost);
    this.players.set(socketId, player);

    this.addSystemMessage(`${player.name} присоединился к игре`);
    this.broadcastState();
    return player;
  }

  removePlayer(socketId: string): void {
    const player = this.players.get(socketId);
    if (!player) return;

    this.players.delete(socketId);
    this.playerOrder = this.playerOrder.filter((id) => id !== socketId);
    this.pendingScores.delete(socketId);
    this.addSystemMessage(`${player.name} покинул игру`);

    if (player.isHost && this.players.size > 0) {
      const newHost = this.players.values().next().value!;
      newHost.isHost = true;
      this.addSystemMessage(`${newHost.name} теперь хост`);
    }

    if (player.isDrawing && this.state === 'drawing') {
      this.endRound();
      return;
    }

    if (player.isDrawing && this.state === 'spyDrawing') {
      this.clearTimers();
      this.startNextSpyTurn();
      return;
    }
    if (this.state === 'spyPrep' && this.spyCurrentDrawerId === socketId) {
      this.clearTimers();
      this.startNextSpyTurn();
      return;
    }

    // no special handling needed for revealing state on player leave

    const minPlayersToContinue =
      this.settings.mode === 'reveal' ? 1 : this.settings.mode === 'spy' ? 3 : 2;
    if (this.players.size < minPlayersToContinue && this.state !== 'waiting') {
      this.stopGame();
      return;
    }

    this.broadcastState();
  }

  reconnectPlayer(socketId: string, oldSocketId: string): boolean {
    const player = this.players.get(oldSocketId);
    if (!player) return false;

    this.players.delete(oldSocketId);
    player.socketId = socketId;
    player.id = socketId;
    player.connected = true;
    this.players.set(socketId, player);

    const pending = this.pendingScores.get(oldSocketId);
    if (pending !== undefined) {
      this.pendingScores.delete(oldSocketId);
      this.pendingScores.set(socketId, pending);
    }

    const idx = this.playerOrder.indexOf(oldSocketId);
    if (idx >= 0) this.playerOrder[idx] = socketId;

    this.spyIds = this.spyIds.map((id) => (id === oldSocketId ? socketId : id));
    this.spyVotes = this.spyVotes.map((v) => ({
      voterId: v.voterId === oldSocketId ? socketId : v.voterId,
      suspectId: v.suspectId === oldSocketId ? socketId : v.suspectId,
    }));
    if (this.spyCurrentDrawerId === oldSocketId) {
      this.spyCurrentDrawerId = socketId;
    }

    return true;
  }

  // ─── Game Flow (Classic Mode) ─────────────────────────────

  startGame(): void {
    const mode = this.settings.mode;

    if (mode === 'reveal') {
      if (this.players.size < 1) return;
    } else if (mode === 'spy') {
      if (this.players.size < 3) return;
    } else {
      if (this.players.size < 2) return;
    }
    if (this.state !== 'waiting') return;

    this.currentRound = 0;
    this.playerOrder = Array.from(this.players.keys());
    this.currentDrawerIndex = -1;

    this.players.forEach((p) => {
      p.score = 0;
      p.isEliminated = false;
    });

    this.addSystemMessage('Игра началась!');

    switch (mode) {
      case 'gallery':   this.startGalleryRound(); break;
      case 'spy':       this.startSpyRound(); break;
      case 'telephone': this.startTelephoneRound(); break;
      case 'speed':     this.startSpeedRound(); break;
      case 'reveal':    this.startRevealRound(); break;
      default:          this.nextTurn(); break;
    }
  }

  private nextTurn(): void {
    this.drawActions = [];
    this.revealedIndices = [];
    this.guessedCount = 0;
    this.currentWord = '';
    this.currentCategory = '';
    this.hint = '';
    this.guessOrder = [];
    this.pendingScores.clear();
    this.pendingDrawerScore = 0;

    // Clear chat for new round
    this.messages = [];
    this.io.to(this.id).emit('chat-cleared');

    this.players.forEach((p) => {
      p.hasGuessed = false;
      p.isDrawing = false;
      p.guessedAt = 0;
    });

    this.currentDrawerIndex++;
    if (this.currentDrawerIndex >= this.playerOrder.length) {
      this.currentDrawerIndex = 0;
      this.currentRound++;

      if (this.currentRound >= this.settings.rounds) {
        this.endGame();
        return;
      }
    }

    const drawerId = this.playerOrder[this.currentDrawerIndex];
    const drawer = this.players.get(drawerId);
    if (!drawer) {
      this.nextTurn();
      return;
    }

    drawer.isDrawing = true;
    this.wordChoices = getRandomWords(3, this.getWordPool());
    this.state = 'choosing';
    this.timeLeft = this.settings.chooseTime;

    this.addSystemMessage(
      `Раунд ${this.currentRound + 1}/${this.settings.rounds} — ${drawer.name} рисует`
    );

    this.io.to(drawerId).emit('word-choices', {
      words: this.wordChoices,
      timeLeft: this.timeLeft,
    });

    this.broadcastState();

    this.startTimer(() => {
      if (this.state === 'choosing') {
        const randomEntry =
          this.wordChoices[Math.floor(Math.random() * this.wordChoices.length)];
        this.chooseWord(drawerId, randomEntry.word);
      }
    }, this.settings.chooseTime);
  }

  chooseWord(socketId: string, word: string): void {
    const player = this.players.get(socketId);
    if (!player?.isDrawing) return;
    if (this.state !== 'choosing') return;

    const entry = this.wordChoices.find((w) => w.word === word);
    this.currentWord = word;
    this.currentCategory = entry?.category || '';
    this.state = 'drawing';
    this.timeLeft = this.settings.drawTime;
    this.revealedIndices = [];
    this.updateHint();

    this.clearTimers();
    this.broadcastState();

    this.startTimer(() => {
      this.endRound();
    }, this.settings.drawTime);

    this.startHintTimer();
  }

  handleDraw(socketId: string, action: DrawAction): void {
    const player = this.players.get(socketId);
    if (!player?.isDrawing) return;
    if (
      this.state !== 'drawing' &&
      this.state !== 'speedDrawing' &&
      this.state !== 'spyDrawing' &&
      this.state !== 'allDrawing' &&
      this.state !== 'chainDraw'
    ) return;

    if (this.state === 'allDrawing' || this.state === 'chainDraw') return;

    this.drawActions.push(action);
    this.io.to(this.id).except(socketId).emit('draw-action', action);
  }

  handleDrawBatch(socketId: string, actions: DrawAction[]): void {
    const player = this.players.get(socketId);
    if (!player?.isDrawing) return;
    if (
      this.state !== 'drawing' &&
      this.state !== 'speedDrawing' &&
      this.state !== 'spyDrawing' &&
      this.state !== 'allDrawing' &&
      this.state !== 'chainDraw'
    ) return;

    if (this.state === 'allDrawing' || this.state === 'chainDraw') return;

    this.drawActions.push(...actions);
    this.io.to(this.id).except(socketId).emit('draw-batch', actions);
  }

  handleGuess(socketId: string, text: string): void {
    const player = this.players.get(socketId);
    if (!player) return;
    if (this.state === 'spyGuess') return;

    if (player.isDrawing) return;
    if (player.hasGuessed) return;
    if (this.state !== 'drawing' && this.state !== 'speedDrawing') return;

    const result = checkGuess(text, this.currentWord);

    if (result === 'correct') {
      const isSpeedMode = this.state === 'speedDrawing';
      // Speed mode: only the first correct answer per word counts.
      if (isSpeedMode && this.guessedCount > 0) return;

      player.hasGuessed = true;
      player.guessedAt = Date.now();
      this.guessedCount++;

      const elapsed = this.settings.drawTime - this.timeLeft;
      const guesserScore = isSpeedMode ? 1 : Math.max(50, 500 - elapsed * 5);
      const drawerBonus = isSpeedMode ? 1 : 50;

      const orderEntry: GuessOrderEntry = {
        playerId: socketId,
        playerName: player.name,
        position: this.guessedCount,
        score: guesserScore,
        timeElapsed: elapsed,
      };
      this.guessOrder.push(orderEntry);

      this.pendingScores.set(
        socketId,
        (this.pendingScores.get(socketId) || 0) + guesserScore
      );
      this.pendingDrawerScore += drawerBonus;

      this.addMessage(socketId, player.name, '', 'correct');
      if (isSpeedMode) {
        this.addSystemMessage(
          `⚡ Слово "${this.currentWord}" первым угадал(а) ${player.name}.`
        );
      } else {
        this.addSystemMessage(`${player.name} угадал слово!`);
      }

      const activePlayers = Array.from(this.players.values()).filter(
        (p) => !p.isDrawing && p.connected
      );
      const allGuessed = activePlayers.every((p) => p.hasGuessed);

      if (isSpeedMode) {
        this.io.to(this.id).emit('speed-word-guessed', {
          word: this.currentWord,
          guesserName: player.name,
        });
        this.speedNextWord();
      } else if (allGuessed) {
        this.endRound();
      } else {
        this.broadcastState();
      }
    } else if (result === 'close') {
      const closeMsg: ChatMessage = {
        id: `msg-${++this.msgCounter}`,
        playerId: socketId,
        playerName: player.name,
        text: '',
        type: 'close',
        timestamp: Date.now(),
      };
      this.io.to(socketId).emit('chat-message', closeMsg);
      this.io.to(socketId).emit('guess-result', { result: 'close' });
    } else {
      this.addMessage(socketId, player.name, text, 'message');
    }
  }

  private endRound(): void {
    this.clearTimers();
    this.state = 'roundEnd';

    const scoreDeltas: Record<string, number> = {};

    this.pendingScores.forEach((score, playerId) => {
      const player = this.players.get(playerId);
      if (player) {
        player.score += score;
        scoreDeltas[playerId] = score;
      }
    });

    const drawerId = this.playerOrder[this.currentDrawerIndex];
    const drawer = this.players.get(drawerId);
    if (drawer && this.pendingDrawerScore > 0) {
      drawer.score += this.pendingDrawerScore;
      scoreDeltas[drawerId] =
        (scoreDeltas[drawerId] || 0) + this.pendingDrawerScore;
    }

    this.addSystemMessage(`Слово было: ${this.currentWord}`);

    this.io.to(this.id).emit('round-end', {
      word: this.currentWord,
      category: this.currentCategory,
      players: this.getPlayersArray(),
      scoreDeltas,
      guessOrder: this.guessOrder,
      mode: this.settings.mode,
    });

    this.broadcastState();

    this.pendingScores.clear();
    this.pendingDrawerScore = 0;

    setTimeout(() => {
      if (this.state === 'roundEnd') {
        if (this.settings.mode === 'classic' || this.settings.mode === 'speed') {
          this.nextTurn();
        } else {
          this.nextModeRound();
        }
      }
    }, 8000);
  }

  private endGame(): void {
    this.clearTimers();
    this.state = 'gameEnd';

    const sortedPlayers = this.getPlayersArray().sort(
      (a, b) => b.score - a.score
    );

    this.addSystemMessage('Игра окончена!');

    this.io.to(this.id).emit('game-end', {
      players: sortedPlayers,
      winner: sortedPlayers[0],
      mode: this.settings.mode,
    });

    this.broadcastState();

    setTimeout(() => {
      this.resetToWaiting();
    }, 10000);
  }

  private stopGame(): void {
    this.clearTimers();
    this.state = 'waiting';
    this.addSystemMessage('Недостаточно игроков. Игра остановлена.');
    this.broadcastState();
  }

  private resetToWaiting(): void {
    this.state = 'waiting';
    this.currentRound = 0;
    this.currentDrawerIndex = -1;
    this.drawActions = [];
    this.currentWord = '';
    this.currentCategory = '';
    this.hint = '';
    this.revealedIndices = [];
    this.guessOrder = [];
    this.pendingScores.clear();
    this.pendingDrawerScore = 0;
    this.galleryDrawings = [];
    this.galleryScores.clear();
    this.spyVotes = [];
    this.spyIds = [];
    this.spyCurrentDrawerId = '';
    this.spyTurnIndex = -1;
    this.telephoneChain = [];
    this.revealImageUrl = '';
    this.revealedTiles = [];
    this.revealTileOrder = [];
    this.revealProgress = 0;
    this.speedWordsGuessed = 0;
    this.speedWordQueue = [];
    this.players.forEach((p) => {
      p.score = 0;
      p.hasGuessed = false;
      p.isDrawing = false;
      p.guessedAt = 0;
    });
    this.broadcastState();
  }

  // ─── Next mode round dispatcher ──────────────────────────
  private nextModeRound(): void {
    switch (this.settings.mode) {
      case 'gallery':   this.startGalleryRound(); break;
      case 'spy':       this.startSpyRound(); break;
      case 'telephone': this.startTelephoneRound(); break;
      default:          this.nextTurn(); break;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // GALLERY MODE
  // ═══════════════════════════════════════════════════════════

  private startGalleryRound(): void {
    if (this.currentRound >= this.settings.rounds) {
      this.endGame();
      return;
    }

    this.galleryDrawings = [];
    this.galleryScores.clear();
    this.galleryReadyIds = [];
    this.guessOrder = [];
    this.messages = [];
    this.io.to(this.id).emit('chat-cleared');
    this.io.to(this.id).emit('clear-canvas');

    const words = getRandomWords(1, this.getWordPool());
    this.currentWord = words[0].word;
    this.currentCategory = words[0].category;

    this.state = 'allDrawing';
    this.timeLeft = this.settings.drawTime;

    this.players.forEach((p) => {
      p.isDrawing = true;
      p.hasGuessed = false;
    });

    this.addSystemMessage(`Раунд ${this.currentRound + 1}/${this.settings.rounds} — Все рисуют: ${this.currentWord}`);

    this.io.to(this.id).emit('gallery-draw-start', {
      word: this.currentWord,
      category: this.currentCategory,
      timeLeft: this.timeLeft,
    });

    this.broadcastState();

    this.startTimer(() => {
      this.endGalleryDrawing();
    }, this.settings.drawTime);
  }

  handleGallerySubmit(socketId: string, dataUrl: string): void {
    if (this.state !== 'allDrawing') return;
    const player = this.players.get(socketId);
    if (!player || player.isEliminated || !player.isDrawing) return;

    if (this.galleryReadyIds.includes(socketId)) return;

    this.galleryDrawings = this.galleryDrawings.filter(d => d.playerId !== socketId);
    this.galleryDrawings.push({
      playerId: socketId,
      playerName: player.name,
      dataUrl,
    });

    this.galleryReadyIds.push(socketId);
    this.addSystemMessage(`${player.name} готов!`);
    this.broadcastState();

    const requiredPlayers = Array.from(this.players.values()).filter(p => !p.isEliminated && p.connected).length;

    if (this.galleryReadyIds.length >= requiredPlayers) {
      if (this.state === 'allDrawing') {
        this.endGalleryDrawing();
      }
    }
  }

  private endGalleryDrawing(): void {
    this.clearTimers();
    this.state = 'voting';
    this.timeLeft = 30;

    this.players.forEach(p => { p.isDrawing = false; });

    this.io.to(this.id).emit('gallery-vote-start', {
      drawings: this.galleryDrawings.map(d => ({
        playerId: d.playerId,
        playerName: d.playerName,
        dataUrl: d.dataUrl,
      })),
      timeLeft: this.timeLeft,
    });

    this.broadcastState();

    this.startTimer(() => {
      this.endGalleryVoting();
    }, 30);
  }

  handleGalleryVote(socketId: string, scores: Record<string, number>): void {
    if (this.state !== 'voting') return;
    if (!this.players.has(socketId)) return;

    const safeScores: Record<string, number> = {};
    Object.entries(scores).forEach(([targetId, score]) => {
      if (targetId !== socketId && this.players.has(targetId)) {
        safeScores[targetId] = Math.max(0, Math.min(5, score));
      }
    });

    this.galleryScores.set(socketId, safeScores);

    if (this.galleryScores.size >= this.players.size) {
      this.endGalleryVoting();
    }
  }

  private endGalleryVoting(): void {
    this.clearTimers();

    const targetSums: Record<string, number> = {};
    this.galleryScores.forEach((scoresByVoter) => {
      Object.entries(scoresByVoter).forEach(([targetId, stars]) => {
        targetSums[targetId] = (targetSums[targetId] || 0) + stars;
      });
    });

    const scoreDeltas: Record<string, number> = {};
    for (const [playerId, totalStars] of Object.entries(targetSums)) {
      const player = this.players.get(playerId);
      if (player) {
        const score = totalStars * 20;
        player.score += score;
        scoreDeltas[playerId] = score;
      }
    }

    this.state = 'roundEnd';

    this.io.to(this.id).emit('round-end', {
      word: this.currentWord,
      category: this.currentCategory,
      players: this.getPlayersArray(),
      scoreDeltas,
      guessOrder: [],
      mode: 'gallery',
      voteCounts: targetSums,
    });

    this.broadcastState();

    setTimeout(() => {
      if (this.state === 'roundEnd') {
        this.currentRound++;
        this.startGalleryRound();
      }
    }, 4000);
  }

  // ═══════════════════════════════════════════════════════════
  // SPY MODE
  // ═══════════════════════════════════════════════════════════

  private startSpyRound(): void {
    const activePlayers = Array.from(this.players.values()).filter((p) => !p.isEliminated && p.connected);
    if (activePlayers.length < 3) {
      const activeSpies = activePlayers.filter((p) => this.spyIds.includes(p.socketId)).length;
      this.endSpyMatchFinal(activeSpies > 0, {}, '');
      return;
    }

    this.spyVotes = [];
    this.spyTurnIndex = -1;
    this.spyCurrentDrawerId = '';
    this.drawActions = [];
    this.galleryDrawings = [];
    this.galleryReadyIds = [];
    this.guessOrder = [];
    this.messages = [];
    this.io.to(this.id).emit('chat-cleared');

    // Select spies once per match, then keep teams until game end.
    if (this.spyIds.length === 0) {
      const desiredSpyCount = this.settings.spyCount || 1;
      const actualSpyCount = Math.min(desiredSpyCount, Math.max(1, activePlayers.length - 2));

      this.spyIds = [];
      const eligibleIds = activePlayers.map((p) => p.socketId);
      for (let i = 0; i < actualSpyCount; i++) {
        if (eligibleIds.length === 0) break;
        const randIdx = Math.floor(Math.random() * eligibleIds.length);
        this.spyIds.push(eligibleIds.splice(randIdx, 1)[0]);
      }
    }

    // New word every phase (after each voting).
    const words = getRandomWords(1, this.getWordPool());
    this.currentWord = words[0].word;
    this.currentCategory = words[0].category;

    this.currentRound = 1;
    const spyTurnTime = this.getSpyTurnTime();
    const spyRounds = this.getSpyRounds();
    this.addSystemMessage(
      `Шпион-режим: ${spyRounds} круг(а), ${spyTurnTime} сек. на ход. Затем голосование.`
    );
    // Shared canvas persists across all turns in this phase and resets only now.
    this.io.to(this.id).emit('clear-canvas');
    this.emitSpyRoles();
    this.startNextSpyTurn();
  }

  private getSpyTurnTime(): number {
    const raw = Number(this.settings.spyTurnTime ?? this.settings.drawTime);
    if (!Number.isFinite(raw)) return 5;
    return Math.max(3, Math.min(Math.round(raw), 120));
  }

  private getSpyRounds(): number {
    const raw = Number(this.settings.spyRounds ?? this.settings.rounds);
    if (!Number.isFinite(raw)) return 2;
    return Math.max(1, Math.min(Math.round(raw), 12));
  }

  private emitSpyRoles(): void {
    this.players.forEach((player) => {
      if (this.spyIds.includes(player.socketId)) {
        this.io.to(player.socketId).emit('spy-role', {
          role: 'spy',
          word: null,
          category: this.currentCategory,
        });
      } else {
        this.io.to(player.socketId).emit('spy-role', {
          role: 'player',
          word: this.currentWord,
          category: this.currentCategory,
        });
      }
    });
  }

  private getActiveSpyPlayerIds(): string[] {
    return this.playerOrder.filter((id) => {
      const p = this.players.get(id);
      return Boolean(p && p.connected && !p.isEliminated);
    });
  }

  private startNextSpyTurn(): void {
    const activeIds = this.getActiveSpyPlayerIds();
    if (activeIds.length < 3) {
      const activeSpies = activeIds.filter((id) => this.spyIds.includes(id)).length;
      this.endSpyMatchFinal(activeSpies > 0, {}, this.spyCurrentDrawerId);
      return;
    }

    this.spyTurnIndex++;
    if (this.spyTurnIndex >= activeIds.length) {
      if (this.currentRound >= this.getSpyRounds()) {
        this.startSpyVoting();
        return;
      }
      this.currentRound++;
      this.spyTurnIndex = 0;
      this.addSystemMessage(`Круг ${this.currentRound}/${this.getSpyRounds()}`);
    }

    const drawerId = activeIds[this.spyTurnIndex];
    const drawer = this.players.get(drawerId);
    if (!drawer) {
      this.startNextSpyTurn();
      return;
    }

    this.spyCurrentDrawerId = drawerId;
    this.startSpyPrep(drawer);
  }

  private startSpyPrep(drawer: Player): void {
    this.clearTimers();
    this.state = 'spyPrep';
    this.timeLeft = 3;

    this.players.forEach((p) => {
      p.isDrawing = false;
      p.hasGuessed = false;
    });

    this.addSystemMessage(`Приготовиться: сейчас рисует ${drawer.name}`);
    this.broadcastState();

    this.startTimer(() => {
      this.startSpyDrawingTurn(drawer.socketId);
    }, this.timeLeft);
  }

  private startSpyDrawingTurn(drawerId: string): void {
    const drawer = this.players.get(drawerId);
    if (!drawer || drawer.isEliminated || !drawer.connected) {
      this.startNextSpyTurn();
      return;
    }

    this.spyCurrentDrawerId = drawerId;
    this.state = 'spyDrawing';
    this.timeLeft = this.getSpyTurnTime();

    this.players.forEach((p) => {
      p.isDrawing = p.socketId === drawerId;
      p.hasGuessed = false;
    });

    this.addSystemMessage(`Ход ${drawer.name} (${this.currentRound}/${this.getSpyRounds()})`);
    this.broadcastState();

    this.startTimer(() => {
      this.startNextSpyTurn();
    }, this.timeLeft);
  }

  private startSpyVoting(): void {
    this.clearTimers();
    this.state = 'spyVoting';
    this.timeLeft = 30;
    this.spyVotes = [];
    this.spyCurrentDrawerId = '';

    this.players.forEach(p => { p.isDrawing = false; });

    const activeIds = this.getActiveSpyPlayerIds();
    this.galleryDrawings = [];
    activeIds.forEach((id) => {
      const p = this.players.get(id);
      if (!p) return;
      this.galleryDrawings.push({
        playerId: p.socketId,
        playerName: p.name,
        dataUrl: '',
      });
    });

    this.io.to(this.id).emit('spy-vote-start', {
      timeLeft: this.timeLeft,
      drawings: this.galleryDrawings,
    });

    this.broadcastState();

    this.startTimer(() => {
      this.endSpyVoting();
    }, this.timeLeft);
  }

  handleSpyVote(socketId: string, suspectId: string): void {
    if (this.state !== 'spyVoting') return;
    if (socketId === suspectId) return;
    const voter = this.players.get(socketId);
    if (!voter || voter.isEliminated) return;

    const suspect = this.players.get(suspectId);
    if (!suspect || suspect.isEliminated) return;

    this.spyVotes = this.spyVotes.filter(v => v.voterId !== socketId);
    this.spyVotes.push({ voterId: socketId, suspectId });

    const activeCount = this.getActiveSpyPlayerIds().length;
    if (this.spyVotes.length >= activeCount) {
      this.endSpyVoting();
    }
  }

  private endSpyVoting(): void {
    this.clearTimers();

    const voteCounts: Record<string, number> = {};
    this.spyVotes.forEach(v => {
      voteCounts[v.suspectId] = (voteCounts[v.suspectId] || 0) + 1;
    });

    let maxVotes = 0;
    let eliminatedIds: string[] = [];
    for (const [id, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedIds = [id];
      } else if (count === maxVotes) {
        eliminatedIds.push(id);
      }
    }

    let eliminatedId = eliminatedIds[Math.floor(Math.random() * eliminatedIds.length)];

    if (!eliminatedId) {
      const activeIds = Array.from(this.players.values()).filter(p => !p.isEliminated).map(p => p.socketId);
      eliminatedId = activeIds[Math.floor(Math.random() * activeIds.length)];
    }

    const eliminatedPlayer = this.players.get(eliminatedId);
    if (eliminatedPlayer) eliminatedPlayer.isEliminated = true;

    const isSpyCaught = this.spyIds.includes(eliminatedId);
    const roleLabel = isSpyCaught ? 'ШПИОНОМ' : 'МИРНЫМ';
    this.addSystemMessage(
      `Голосование окончено! Выбывает ${eliminatedPlayer?.name || 'Аноним'} — он был ${roleLabel}.`
    );

    this.checkSpyWinCondition(eliminatedId, voteCounts);
  }

  private checkSpyWinCondition(lastEliminatedId: string, voteCounts: Record<string, number>): void {
    const activeIds = this.getActiveSpyPlayerIds();
    const activeSpies = activeIds.filter((id) => this.spyIds.includes(id)).length;
    const activeInnocents = activeIds.length - activeSpies;

    const spiesWin = activeSpies > 0 && activeSpies >= activeInnocents;
    const innocentsWin = activeSpies === 0;

    if (spiesWin || innocentsWin) {
      this.endSpyMatchFinal(spiesWin, voteCounts, lastEliminatedId);
    } else {
      this.addSystemMessage(`Осталось ${activeSpies} шпионов и ${activeInnocents} мирных. Следующий раунд через 5 секунд.`);
      this.state = 'roundEnd';

      this.io.to(this.id).emit('round-end', {
        mode: 'spy',
        word: this.currentWord,
        category: this.currentCategory,
        players: this.getPlayersArray(),
        spyId: lastEliminatedId,
        spyName: this.players.get(lastEliminatedId)?.name || 'Unknown',
        spyCaught: this.spyIds.includes(lastEliminatedId),
        voteCounts,
        isMatchEnd: false,
      });

      this.broadcastState();

      this.startTimer(() => {
        // After voting start a new phase: clear canvas and issue a new word.
        this.startSpyRound();
      }, 5000);
    }
  }

  private endSpyMatchFinal(spiesWin: boolean, voteCounts: Record<string, number>, lastEliminatedId: string): void {
    this.clearTimers();
    const scoreDeltas: Record<string, number> = {};

    if (spiesWin) {
      this.addSystemMessage('По итогам игры победили ШПИОНЫ!');
      this.spyIds.forEach(id => {
        const p = this.players.get(id);
        if (p) {
          p.score += 500;
          scoreDeltas[id] = 500;
        }
      });
    } else {
      this.addSystemMessage('По итогам игры победили МИРНЫЕ!');
      this.players.forEach(p => {
        if (!this.spyIds.includes(p.socketId)) {
          p.score += 200;
          scoreDeltas[p.socketId] = 200;
        }
      });
    }

    this.state = 'roundEnd';

    this.io.to(this.id).emit('round-end', {
      word: this.currentWord,
      category: this.currentCategory,
      players: this.getPlayersArray(),
      scoreDeltas,
      guessOrder: [],
      mode: 'spy',
      spyId: lastEliminatedId,
      spyName: this.players.get(lastEliminatedId)?.name || 'Unknown',
      spyCaught: this.spyIds.includes(lastEliminatedId),
      spyIds: this.spyIds,
      spiesWin,
      voteCounts,
      isMatchEnd: true,
    });

    this.broadcastState();

    setTimeout(() => {
      if (this.state === 'roundEnd') {
        this.resetToWaiting();
      }
    }, 10000);
  }

  // ═══════════════════════════════════════════════════════════
  // TELEPHONE MODE
  // ═══════════════════════════════════════════════════════════

  private startTelephoneRound(): void {
    this.currentRound++;
    if (this.currentRound > this.settings.rounds) {
      this.endGame();
      return;
    }

    this.telephoneChain = [];
    this.chainCurrentIndex = 0;
    this.drawActions = [];
    this.guessOrder = [];
    this.messages = [];
    this.io.to(this.id).emit('chat-cleared');

    const words = getRandomWords(1, this.getWordPool());
    this.currentWord = words[0].word;
    this.currentCategory = words[0].category;
    this.chainCurrentWord = this.currentWord;

    this.addSystemMessage(`Раунд ${this.currentRound}/${this.settings.rounds} — Испорченный телефон!`);

    this.startTelephoneDrawStep();
  }

  private startTelephoneDrawStep(): void {
    if (this.chainCurrentIndex >= this.playerOrder.length) {
      this.endTelephoneRound();
      return;
    }

    const playerId = this.playerOrder[this.chainCurrentIndex];
    const player = this.players.get(playerId);
    if (!player) {
      this.chainCurrentIndex++;
      this.startTelephoneDrawStep();
      return;
    }

    this.players.forEach(p => { p.isDrawing = false; });
    player.isDrawing = true;
    this.drawActions = [];
    this.state = 'chainDraw';
    this.timeLeft = Math.min(this.settings.drawTime, 45);

    this.io.to(playerId).emit('telephone-draw', {
      word: this.chainCurrentWord,
      timeLeft: this.timeLeft,
    });

    this.broadcastState();

    this.startTimer(() => {
      this.endTelephoneDrawStep(playerId);
    }, Math.min(this.settings.drawTime, 45));
  }

  handleTelephoneSubmit(socketId: string, dataUrl: string): void {
    if (this.state !== 'chainDraw') return;
    const playerId = this.playerOrder[this.chainCurrentIndex];
    if (socketId !== playerId) return;

    this.endTelephoneDrawStep(socketId, dataUrl);
  }

  private endTelephoneDrawStep(playerId: string, dataUrl?: string): void {
    this.clearTimers();
    const player = this.players.get(playerId);

    this.telephoneChain.push({
      playerId,
      playerName: player?.name || 'Unknown',
      type: 'draw',
      dataUrl: dataUrl || '',
    });

    this.chainCurrentIndex++;

    if (this.chainCurrentIndex < this.playerOrder.length) {
      this.startTelephoneGuessStep();
    } else {
      this.endTelephoneRound();
    }
  }

  private startTelephoneGuessStep(): void {
    const playerId = this.playerOrder[this.chainCurrentIndex];
    const player = this.players.get(playerId);
    if (!player) {
      this.chainCurrentIndex++;
      this.startTelephoneDrawStep();
      return;
    }

    this.players.forEach(p => { p.isDrawing = false; });
    this.state = 'chainGuess';
    this.timeLeft = 20;

    const lastDraw = this.telephoneChain[this.telephoneChain.length - 1];
    this.io.to(playerId).emit('telephone-guess', {
      dataUrl: lastDraw?.dataUrl || '',
      timeLeft: this.timeLeft,
    });

    this.broadcastState();

    this.startTimer(() => {
      this.handleTelephoneGuessTimeout(playerId);
    }, 20);
  }

  handleTelephoneGuess(socketId: string, text: string): void {
    if (this.state !== 'chainGuess') return;
    const playerId = this.playerOrder[this.chainCurrentIndex];
    if (socketId !== playerId) return;

    this.clearTimers();
    const player = this.players.get(socketId);

    this.telephoneChain.push({
      playerId: socketId,
      playerName: player?.name || 'Unknown',
      type: 'guess',
      text: text.trim(),
    });

    this.chainCurrentWord = text.trim();
    this.chainCurrentIndex++;

    if (this.chainCurrentIndex < this.playerOrder.length) {
      this.startTelephoneDrawStep();
    } else {
      this.endTelephoneRound();
    }
  }

  private handleTelephoneGuessTimeout(playerId: string): void {
    this.clearTimers();
    const player = this.players.get(playerId);

    this.telephoneChain.push({
      playerId,
      playerName: player?.name || 'Unknown',
      type: 'guess',
      text: '???',
    });

    this.chainCurrentWord = '???';
    this.chainCurrentIndex++;

    if (this.chainCurrentIndex < this.playerOrder.length) {
      this.startTelephoneDrawStep();
    } else {
      this.endTelephoneRound();
    }
  }

  private endTelephoneRound(): void {
    this.clearTimers();
    this.state = 'roundEnd';

    this.players.forEach(p => { p.isDrawing = false; });

    const scoreDeltas: Record<string, number> = {};
    this.players.forEach(p => {
      p.score += 50;
      scoreDeltas[p.socketId] = 50;
    });

    this.io.to(this.id).emit('round-end', {
      word: this.currentWord,
      category: this.currentCategory,
      players: this.getPlayersArray(),
      scoreDeltas,
      guessOrder: [],
      mode: 'telephone',
      telephoneChain: this.telephoneChain,
    });

    this.broadcastState();

    setTimeout(() => {
      if (this.state === 'roundEnd') {
        this.startTelephoneRound();
      }
    }, 12000);
  }

  // ═══════════════════════════════════════════════════════════
  // SPEED MODE
  // ═══════════════════════════════════════════════════════════

  private startSpeedRound(): void {
    this.drawActions = [];
    this.revealedIndices = [];
    this.guessedCount = 0;
    this.guessOrder = [];
    this.speedWordsGuessed = 0;
    this.pendingScores.clear();
    this.pendingDrawerScore = 0;

    this.players.forEach((p) => {
      p.hasGuessed = false;
      p.isDrawing = false;
      p.guessedAt = 0;
    });

    this.currentDrawerIndex++;
    if (this.currentDrawerIndex >= this.playerOrder.length) {
      this.currentDrawerIndex = 0;
      this.currentRound++;

      if (this.currentRound >= this.settings.rounds) {
        this.endGame();
        return;
      }
    }

    const drawerId = this.playerOrder[this.currentDrawerIndex];
    const drawer = this.players.get(drawerId);
    if (!drawer) {
      this.startSpeedRound();
      return;
    }

    drawer.isDrawing = true;

    this.speedWordQueue = getRandomWords(20, this.getWordPool());
    this.currentWord = this.speedWordQueue[0].word;
    this.currentCategory = this.speedWordQueue[0].category;
    this.speedWordQueue.shift();

    this.state = 'speedDrawing';
    this.timeLeft = this.settings.drawTime;
    this.hint = '';
    this.updateHint();

    this.addSystemMessage(
      `Быстрый раунд! ${drawer.name} рисует — ${this.settings.drawTime} сек!`
    );

    this.io.to(drawerId).emit('speed-word', {
      word: this.currentWord,
      category: this.currentCategory,
      wordsGuessed: this.speedWordsGuessed,
    });

    this.broadcastState();

    this.startTimer(() => {
      this.endSpeedRound();
    }, this.settings.drawTime);
  }

  private speedNextWord(): void {
    this.speedWordsGuessed++;
    this.drawActions = [];
    this.io.to(this.id).emit('canvas-cleared');

    this.players.forEach((p) => {
      if (!p.isDrawing) {
        p.hasGuessed = false;
        p.guessedAt = 0;
      }
    });
    this.guessedCount = 0;
    this.revealedIndices = [];

    if (this.speedWordQueue.length === 0) {
      this.endSpeedRound();
      return;
    }

    this.currentWord = this.speedWordQueue[0].word;
    this.currentCategory = this.speedWordQueue[0].category;
    this.speedWordQueue.shift();
    this.updateHint();

    const drawerId = this.playerOrder[this.currentDrawerIndex];

    this.io.to(drawerId).emit('speed-word', {
      word: this.currentWord,
      category: this.currentCategory,
      wordsGuessed: this.speedWordsGuessed,
    });

    this.broadcastState();
  }

  private endSpeedRound(): void {
    this.clearTimers();
    this.state = 'roundEnd';

    const scoreDeltas: Record<string, number> = {};

    this.pendingScores.forEach((score, playerId) => {
      const player = this.players.get(playerId);
      if (player) {
        player.score += score;
        scoreDeltas[playerId] = score;
      }
    });

    const drawerId = this.playerOrder[this.currentDrawerIndex];
    const drawer = this.players.get(drawerId);
    if (drawer && this.pendingDrawerScore > 0) {
      drawer.score += this.pendingDrawerScore;
      scoreDeltas[drawerId] = (scoreDeltas[drawerId] || 0) + this.pendingDrawerScore;
    }

    // Per-player stats: how many words each guesser correctly answered
    const speedPlayerStats: Record<string, { wordsGuessed: number; playerName: string }> = {};
    this.guessOrder.forEach((entry) => {
      if (!speedPlayerStats[entry.playerId]) {
        speedPlayerStats[entry.playerId] = { wordsGuessed: 0, playerName: entry.playerName };
      }
      speedPlayerStats[entry.playerId].wordsGuessed++;
    });

    this.io.to(this.id).emit('round-end', {
      word: this.currentWord,
      category: 'Быстрый раунд',
      players: this.getPlayersArray(),
      scoreDeltas,
      guessOrder: [],
      mode: 'speed',
      speedWordsGuessed: this.speedWordsGuessed,
      speedDrawerName: drawer?.name ?? '',
      speedPlayerStats,
    });

    this.broadcastState();

    this.pendingScores.clear();
    this.pendingDrawerScore = 0;

    setTimeout(() => {
      if (this.state === 'roundEnd') {
        this.startSpeedRound();
      }
    }, 8000);
  }

  // ═══════════════════════════════════════════════════════════
  // REVEAL MODE  —  Image bank + tile-based reveal
  //   All players see the SAME image from the bank.
  //   Random tiles are uncovered every few seconds.
  //   First to guess the word scores the most points.
  //   Works for 1..N players.
  // ═══════════════════════════════════════════════════════════

  // Total number of tiles in the reveal grid (8×8)
  static readonly REVEAL_GRID = 8;
  static readonly REVEAL_TOTAL_TILES = Room.REVEAL_GRID * Room.REVEAL_GRID; // 64

  // How many tiles to uncover per interval tick
  static readonly TILES_PER_TICK = 3;
  // Interval between tile reveals (ms)
  static readonly REVEAL_TICK_MS = 3000;

  private startRevealRound(): void {
    this.currentRound++;
    if (this.currentRound > this.settings.rounds) {
      this.endGame();
      return;
    }

    // ── Reset state ──────────────────────────────────────────
    this.drawActions = [];
    this.revealedIndices = [];
    this.guessedCount = 0;
    this.guessOrder = [];
    this.pendingScores.clear();
    this.revealProgress = 0;
    this.revealedTiles = [];
    this.messages = [];
    this.io.to(this.id).emit('chat-cleared');

    this.players.forEach((p) => {
      p.hasGuessed = false;
      p.isDrawing = false;
      p.guessedAt = 0;
    });

    // ── Pick random word and resolve image dynamically on server ──
    const words = getRandomWords(1, this.getWordPool());
    this.currentWord = words[0].word;
    this.currentCategory = words[0].category;
    this.revealImageUrl = `/api/reveal-image?word=${encodeURIComponent(this.currentWord)}`;
    this.updateHint(); // letter-hint backup

    // ── Pre-shuffle tile reveal order ────────────────────────
    const total = Room.REVEAL_TOTAL_TILES;
    this.revealTileOrder = Array.from({ length: total }, (_, i) => i)
      .sort(() => Math.random() - 0.5);

    this.state    = 'revealing';
    this.timeLeft = this.settings.drawTime;

    this.addSystemMessage(
      `Раунд ${this.currentRound}/${this.settings.rounds} — Угадайте что на картинке!`
    );

    // Send reveal-start with image URL and empty tile list
    this.io.to(this.id).emit('reveal-start', {
      imageUrl: this.revealImageUrl,
      category: this.currentCategory,
      hint: this.hint,
      timeLeft: this.timeLeft,
      totalTiles: total,
      revealedTiles: [],
    });

    this.broadcastState();
    this.startTimer(() => this.endRevealRound(), this.settings.drawTime);
    this.startRevealInterval();
  }

  /** Uncover TILES_PER_TICK random tiles each tick. */
  private startRevealInterval(): void {
    this.hintTimer = setInterval(() => {
      if (this.state !== 'revealing') {
        if (this.hintTimer) clearInterval(this.hintTimer);
        return;
      }

      const uncovered = this.revealedTiles.length;
      const total     = Room.REVEAL_TOTAL_TILES;
      if (uncovered >= total) return; // all tiles revealed already

      for (let i = 0; i < Room.TILES_PER_TICK && this.revealedTiles.length < total; i++) {
        this.revealedTiles.push(this.revealTileOrder[this.revealedTiles.length]);
      }

      this.revealProgress = Math.round((this.revealedTiles.length / total) * 100);

      // Reveal a letter hint every two ticks
      if (this.revealedTiles.length % (Room.TILES_PER_TICK * 2) < Room.TILES_PER_TICK) {
        this.revealNextLetter();
      }

      this.io.to(this.id).emit('reveal-tile', {
        revealedTiles: this.revealedTiles,
        progress: this.revealProgress,
        hint: this.hint,
      });
    }, Room.REVEAL_TICK_MS);
  }

  handleRevealGuess(socketId: string, text: string): void {
    if (this.state !== 'revealing') return;
    const player = this.players.get(socketId);
    if (!player || player.hasGuessed) return;

    const result = checkGuess(text, this.currentWord);

    if (result === 'correct') {
      player.hasGuessed = true;
      player.guessedAt  = Date.now();
      this.guessedCount++;

      // More tiles hidden → higher score
      const hiddenFraction = 1 - this.revealedTiles.length / Room.REVEAL_TOTAL_TILES;
      const score = Math.max(50, Math.round(500 * hiddenFraction));

      this.guessOrder.push({
        playerId:    socketId,
        playerName:  player.name,
        position:    this.guessedCount,
        score,
        timeElapsed: this.settings.drawTime - this.timeLeft,
      });
      this.pendingScores.set(socketId, (this.pendingScores.get(socketId) || 0) + score);

      this.addMessage(socketId, player.name, '', 'correct');
      this.addSystemMessage(`${player.name} угадал слово!`);

      const allGuessed = Array.from(this.players.values())
        .filter((p) => p.connected)
        .every((p) => p.hasGuessed);

      if (allGuessed) {
        this.endRevealRound();
      } else {
        this.broadcastState();
      }
    } else if (result === 'close') {
      const closeMsg: ChatMessage = {
        id:         `msg-${++this.msgCounter}`,
        playerId:   socketId,
        playerName: player.name,
        text:       '',
        type:       'close',
        timestamp:  Date.now(),
      };
      this.io.to(socketId).emit('chat-message', closeMsg);
    } else {
      this.addMessage(socketId, player.name, text, 'message');
    }
  }

  private endRevealRound(): void {
    this.clearTimers();
    this.state = 'roundEnd';

    const scoreDeltas: Record<string, number> = {};
    this.pendingScores.forEach((score, playerId) => {
      const player = this.players.get(playerId);
      if (player) {
        player.score     += score;
        scoreDeltas[playerId] = score;
      }
    });

    this.io.to(this.id).emit('round-end', {
      word:       this.currentWord,
      category:   this.currentCategory,
      players:    this.getPlayersArray(),
      scoreDeltas,
      guessOrder: this.guessOrder,
      mode:       'reveal',
      revealImageUrl: this.revealImageUrl,
    });

    this.broadcastState();
    this.pendingScores.clear();

    setTimeout(() => {
      if (this.state === 'roundEnd') {
        this.startRevealRound();
      }
    }, 8000);
  }

  // ─── Hints ────────────────────────────────────────────────────

  private updateHint(): void {
    this.hint = generateHintProgressive(this.currentWord, this.revealedIndices);
  }

  private revealNextLetter(): void {
    const nextIdx = getNextRevealIndex(this.currentWord, this.revealedIndices);
    if (nextIdx !== null) {
      this.revealedIndices.push(nextIdx);
      this.updateHint();
      this.broadcastState();
    }
  }

  private startHintTimer(): void {
    const hintInterval = 15;
    this.hintTimer = setInterval(() => {
      if (this.state !== 'drawing' && this.state !== 'speedDrawing') {
        if (this.hintTimer) clearInterval(this.hintTimer);
        return;
      }
      this.revealNextLetter();
    }, hintInterval * 1000);
  }

  // ─── Timers ───────────────────────────────────────────────────

  private startTimer(callback: () => void, seconds: number): void {
    this.clearTimers();
    this.timeLeft = seconds;

    this.roundTimer = setInterval(() => {
      this.timeLeft--;
      this.io.to(this.id).emit('timer-update', { timeLeft: this.timeLeft });

      if (this.timeLeft <= 0) {
        this.clearTimers();
        callback();
      }
    }, 1000);
  }

  private clearTimers(): void {
    if (this.roundTimer) {
      clearInterval(this.roundTimer);
      this.roundTimer = null;
    }
    if (this.hintTimer) {
      clearInterval(this.hintTimer);
      this.hintTimer = null;
    }
  }

  // ─── Messages ─────────────────────────────────────────────────

  private addMessage(
    playerId: string,
    playerName: string,
    text: string,
    type: ChatMessage['type']
  ): void {
    const msg: ChatMessage = {
      id: `msg-${++this.msgCounter}`,
      playerId,
      playerName,
      text,
      type,
      timestamp: Date.now(),
    };
    this.messages.push(msg);
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }
    this.io.to(this.id).emit('chat-message', msg);
  }

  addSystemMessage(text: string): void {
    this.addMessage('system', 'Система', text, 'system');
  }

  // ─── State Broadcasting ───────────────────────────────────────

  getPlayersArray(): Player[] {
    return Array.from(this.players.values());
  }

  getPublicState() {
    let drawerId = this.playerOrder[this.currentDrawerIndex];
    if (this.state === 'allDrawing' || this.state === 'voting') {
      drawerId = 'all';
    } else if (this.state === 'spyDrawing' || this.state === 'spyPrep') {
      drawerId = this.spyCurrentDrawerId;
    } else if (this.state === 'chainDraw' || this.state === 'chainGuess') {
      drawerId = this.playerOrder[this.chainCurrentIndex];
    }

    return {
      id: this.id,
      state: this.state,
      mode: this.settings.mode,
      players: this.getPlayersArray(),
      currentRound: this.currentRound,
      totalRounds: this.settings.mode === 'spy' ? this.getSpyRounds() : this.settings.rounds,
      drawerId,
      hint: this.hint,
      currentCategory: this.currentCategory,
      timeLeft: this.timeLeft,
      settings: this.settings,
      drawActions: this.drawActions,
      speedWordsGuessed: this.speedWordsGuessed,
      revealProgress: this.revealProgress,
      revealedTiles: this.revealedTiles,
      revealImageUrl: this.revealImageUrl,
      galleryReadyIds: this.galleryReadyIds,
      galleryVotedIds:
        this.state === 'spyVoting'
          ? this.spyVotes.map((v) => v.voterId)
          : Array.from(this.galleryScores.keys()),
    };
  }

  getDrawerState() {
    return {
      ...this.getPublicState(),
      currentWord: this.currentWord,
    };
  }

  broadcastState(): void {
    const publicState = this.getPublicState();
    const drawerId = this.playerOrder[this.currentDrawerIndex];

    this.players.forEach((player) => {
      const isCurrentDrawer = player.socketId === drawerId;
      const showWord = isCurrentDrawer && (
        this.state === 'drawing' ||
        this.state === 'speedDrawing' ||
        this.state === 'allDrawing'
      );

        if (showWord) {
        this.io.to(player.socketId).emit('game-state', this.getDrawerState());
      } else if (this.state === 'allDrawing') {
        this.io.to(player.socketId).emit('game-state', {
          ...publicState,
          currentWord: this.currentWord,
        });
      } else {
        this.io.to(player.socketId).emit('game-state', publicState);
      }
    });
  }

  get isEmpty(): boolean {
    return this.players.size === 0;
  }

  get playerCount(): number {
    return this.players.size;
  }

  getHost(): Player | undefined {
    return Array.from(this.players.values()).find((p) => p.isHost);
  }

  updateSettings(settings: Partial<RoomSettings>): void {
    if (this.state !== 'waiting') return;
    const nextSettings = { ...this.settings, ...settings };
    if (nextSettings.mode === 'spy' && nextSettings.maxPlayers < 3) {
      nextSettings.maxPlayers = 3;
    }
    if (nextSettings.spyCount !== undefined) {
      nextSettings.spyCount = Math.max(
        1,
        Math.min(nextSettings.spyCount, Math.max(1, nextSettings.maxPlayers - 2))
      );
    }
    if (nextSettings.spyTurnTime !== undefined) {
      nextSettings.spyTurnTime = Math.max(3, Math.min(nextSettings.spyTurnTime, 120));
    }
    if (nextSettings.spyRounds !== undefined) {
      nextSettings.spyRounds = Math.max(1, Math.min(nextSettings.spyRounds, 12));
    }
    this.settings = nextSettings;
    this.broadcastState();
  }

  destroy(): void {
    this.clearTimers();
    this.players.clear();
    this.messages = [];
    this.drawActions = [];
    this.pendingScores.clear();
    this.galleryDrawings = [];
    this.galleryScores.clear();
    this.telephoneChain = [];
  }
}
