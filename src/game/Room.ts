import { Player, createPlayer } from './Player';
import {
  getRandomWords,
  generateHintProgressive,
  getNextRevealIndex,
  checkGuess,
} from './WordBank';
import type { WordEntry } from './WordBank';
import {
  getRandomWords,
  generateHintProgressive,
  getNextRevealIndex,
  checkGuess,
} from './WordBank';
import type { WordEntry } from './WordBank';
import { Server } from 'socket.io';

export type RoomState =
  | 'waiting'
  | 'choosing'
  | 'drawing'
  | 'roundEnd'
  | 'gameEnd';
export type RoomState =
  | 'waiting'
  | 'choosing'
  | 'drawing'
  | 'roundEnd'
  | 'gameEnd';

export interface RoomSettings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  chooseTime: number;
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

const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 10,
  rounds: 3,
  drawTime: 90,
  chooseTime: 15,
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
  currentCategory: string = '';
  wordChoices: WordEntry[] = [];
  hint: string = '';
  revealedIndices: number[] = [];
  drawActions: DrawAction[] = [];
  messages: ChatMessage[] = [];
  timeLeft: number = 0;
  guessedCount: number = 0;
  playerOrder: string[] = [];

  // Deferred scoring: accumulate during round, apply at end
  private pendingScores: Map<string, number> = new Map();
  private pendingDrawerScore: number = 0;

  // Deferred scoring: accumulate during round, apply at end
  private pendingScores: Map<string, number> = new Map();
  private pendingDrawerScore: number = 0;

  private io: Server;
  private roundTimer: NodeJS.Timeout | null = null;
  private hintTimer: NodeJS.Timeout | null = null;
  private msgCounter: number = 0;

  constructor(id: string, io: Server, settings?: Partial<RoomSettings>) {
    this.id = id;
    this.io = io;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  // ─── Player Management ────────────────────────────────────────

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

    if (this.players.size < 2 && this.state !== 'waiting') {
      this.stopGame();
      return;
    }


    if (player.isDrawing && this.state === 'drawing') {
      this.endRound();
      return;
    }

    if (this.players.size < 2 && this.state !== 'waiting') {
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

    // Transfer pending score
    const pending = this.pendingScores.get(oldSocketId);
    if (pending !== undefined) {
      this.pendingScores.delete(oldSocketId);
      this.pendingScores.set(socketId, pending);
    }

    const idx = this.playerOrder.indexOf(oldSocketId);
    if (idx >= 0) this.playerOrder[idx] = socketId;


    return true;
  }

  // ─── Game Flow ────────────────────────────────────────────────

  // ─── Game Flow ────────────────────────────────────────────────

  startGame(): void {
    if (this.players.size < 2) return;
    if (this.state !== 'waiting') return;


    this.currentRound = 0;
    this.playerOrder = Array.from(this.players.keys());
    this.currentDrawerIndex = -1;

    this.players.forEach((p) => {
      p.score = 0;
    });


    this.players.forEach((p) => {
      p.score = 0;
    });

    this.addSystemMessage('Игра началась!');
    this.nextTurn();
  }

  private nextTurn(): void {
    this.drawActions = [];
    this.revealedIndices = [];
    this.guessedCount = 0;
    this.currentWord = '';
    this.currentCategory = '';
    this.currentCategory = '';
    this.hint = '';
    this.pendingScores.clear();
    this.pendingDrawerScore = 0;

    this.players.forEach((p) => {
      p.hasGuessed = false;
      p.isDrawing = false;
    });

    this.pendingScores.clear();
    this.pendingDrawerScore = 0;

    this.players.forEach((p) => {
      p.hasGuessed = false;
      p.isDrawing = false;
    });

    this.currentDrawerIndex++;
    if (this.currentDrawerIndex >= this.playerOrder.length) {
      this.currentDrawerIndex = 0;
      this.currentRound++;

      if (this.currentRound >= this.settings.rounds) {
        this.endGame();
        return;
      }

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

    if (!drawer) {
      this.nextTurn();
      return;
    }

    drawer.isDrawing = true;
    this.wordChoices = getRandomWords(3);
    this.state = 'choosing';
    this.timeLeft = this.settings.chooseTime;

    this.addSystemMessage(
      `Раунд ${this.currentRound + 1}/${this.settings.rounds} — ${drawer.name} рисует`
    );

    // Send word choices only to drawer (with categories)
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

    // Find the chosen word entry to get category
    const entry = this.wordChoices.find((w) => w.word === word);
    this.currentWord = word;
    this.currentCategory = entry?.category || '';
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


    this.startTimer(() => {
      this.endRound();
    }, this.settings.drawTime);

    this.startHintTimer();
  }

  handleDraw(socketId: string, action: DrawAction): void {
    const player = this.players.get(socketId);
    if (!player?.isDrawing) return;
    if (this.state !== 'drawing') return;


    this.drawActions.push(action);
    this.io.to(this.id).except(socketId).emit('draw-action', action);
  }

  handleGuess(socketId: string, text: string): void {
    const player = this.players.get(socketId);
    if (!player) return;
    if (player.isDrawing) return;
    if (player.hasGuessed) return;
    if (this.state !== 'drawing') return;


    const result = checkGuess(text, this.currentWord);


    if (result === 'correct') {
      player.hasGuessed = true;
      this.guessedCount++;

      // Deferred scoring: accumulate but don't apply yet
      const elapsed = this.settings.drawTime - this.timeLeft;
      const guesserScore = Math.max(50, 500 - elapsed * 5);
      const drawerBonus = 50;

      this.pendingScores.set(
        socketId,
        (this.pendingScores.get(socketId) || 0) + guesserScore
      );
      this.pendingDrawerScore += drawerBonus;

      // Show correct message (without revealing the word text)
      this.addMessage(socketId, player.name, '', 'correct');
      this.addSystemMessage(`${player.name} угадал слово!`);

      const activePlayers = Array.from(this.players.values()).filter(
        (p) => !p.isDrawing && p.connected
      );
      const allGuessed = activePlayers.every((p) => p.hasGuessed);

      if (allGuessed) {
        this.endRound();
      } else {
        this.broadcastState();
      }

      if (allGuessed) {
        this.endRound();
      } else {
        this.broadcastState();
      }
    } else if (result === 'close') {
      // Only send "close" notification to the guesser, hide text from others
      const closeMsg: ChatMessage = {
        id: `msg-${++this.msgCounter}`,
        playerId: socketId,
        playerName: player.name,
        text: '', // Don't reveal the close guess text
        type: 'close',
        timestamp: Date.now(),
      };
      // Send to guesser only
      this.io.to(socketId).emit('chat-message', closeMsg);
      this.io.to(socketId).emit('guess-result', { result: 'close' });
    } else {
      this.addMessage(socketId, player.name, text, 'message');
    }
  }

  private endRound(): void {
    this.clearTimers();
    this.state = 'roundEnd';

    // Apply deferred scores NOW
    const scoreDeltas: Record<string, number> = {};

    this.pendingScores.forEach((score, playerId) => {
      const player = this.players.get(playerId);
      if (player) {
        player.score += score;
        scoreDeltas[playerId] = score;
      }
    });

    // Apply drawer bonus
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
      scoreDeltas, // Send per-player score earned this round
    });

    this.broadcastState();

    this.pendingScores.clear();
    this.pendingDrawerScore = 0;

    setTimeout(() => {
      if (this.state === 'roundEnd') {
        this.nextTurn();
      }
    }, 5000);

    this.pendingScores.clear();
    this.pendingDrawerScore = 0;

    setTimeout(() => {
      if (this.state === 'roundEnd') {
        this.nextTurn();
      }
    }, 5000);
  }

  private endGame(): void {
    this.clearTimers();
    this.state = 'gameEnd';

    const sortedPlayers = this.getPlayersArray().sort(
      (a, b) => b.score - a.score
    );


    const sortedPlayers = this.getPlayersArray().sort(
      (a, b) => b.score - a.score
    );

    this.addSystemMessage('Игра окончена!');

    this.io.to(this.id).emit('game-end', {
      players: sortedPlayers,
      winner: sortedPlayers[0],
    });


    this.io.to(this.id).emit('game-end', {
      players: sortedPlayers,
      winner: sortedPlayers[0],
    });

    this.broadcastState();

    setTimeout(() => {
      this.resetToWaiting();
    }, 10000);

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
    this.currentCategory = '';
    this.hint = '';
    this.revealedIndices = [];
    this.pendingScores.clear();
    this.pendingDrawerScore = 0;
    this.players.forEach((p) => {
      p.score = 0;
      p.hasGuessed = false;
      p.isDrawing = false;
    });
    this.pendingScores.clear();
    this.pendingDrawerScore = 0;
    this.players.forEach((p) => {
      p.score = 0;
      p.hasGuessed = false;
      p.isDrawing = false;
    });
    this.broadcastState();
  }

  // ─── Hints ────────────────────────────────────────────────────

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
    if (nextIdx !== null) {
      this.revealedIndices.push(nextIdx);
      this.updateHint();
      this.broadcastState();
    }
  }

  private startHintTimer(): void {
    const hintInterval = 15;
    const hintInterval = 15;
    this.hintTimer = setInterval(() => {
      if (this.state !== 'drawing') {
        if (this.hintTimer) clearInterval(this.hintTimer);
        return;
      }
      if (this.state !== 'drawing') {
        if (this.hintTimer) clearInterval(this.hintTimer);
        return;
      }
      this.revealNextLetter();
    }, hintInterval * 1000);
    }, hintInterval * 1000);
  }

  // ─── Timers ───────────────────────────────────────────────────

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
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }
    this.io.to(this.id).emit('chat-message', msg);
  }

  addSystemMessage(text: string): void {
    this.addMessage('system', 'Система', text, 'system');
  }

  // ─── State Broadcasting ───────────────────────────────────────
  addSystemMessage(text: string): void {
    this.addMessage('system', 'Система', text, 'system');
  }

  // ─── State Broadcasting ───────────────────────────────────────

  getPlayersArray(): Player[] {
    return Array.from(this.players.values());
  }
  getPlayersArray(): Player[] {
    return Array.from(this.players.values());
  }

  getPublicState() {
    const drawerId = this.playerOrder[this.currentDrawerIndex];
    return {
      id: this.id,
      state: this.state,
      players: this.getPlayersArray(),
      currentRound: this.currentRound,
      totalRounds: this.settings.rounds,
      drawerId,
      hint: this.hint,
      currentCategory: this.currentCategory,
      timeLeft: this.timeLeft,
      settings: this.settings,
      drawActions: this.drawActions,
    };
    return {
      id: this.id,
      state: this.state,
      players: this.getPlayersArray(),
      currentRound: this.currentRound,
      totalRounds: this.settings.rounds,
      drawerId,
      hint: this.hint,
      currentCategory: this.currentCategory,
      timeLeft: this.timeLeft,
      settings: this.settings,
      drawActions: this.drawActions,
    };
  }

  getDrawerState() {
    return {
      ...this.getPublicState(),
      currentWord: this.currentWord,
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
      if (player.socketId === drawerId && this.state === 'drawing') {
        this.io.to(player.socketId).emit('game-state', this.getDrawerState());
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
    this.settings = { ...this.settings, ...settings };
    this.broadcastState();
  }

  destroy(): void {
    this.clearTimers();
    this.players.clear();
    this.messages = [];
    this.drawActions = [];
    this.pendingScores.clear();
  }
  destroy(): void {
    this.clearTimers();
    this.players.clear();
    this.messages = [];
    this.drawActions = [];
    this.pendingScores.clear();
  }
}
