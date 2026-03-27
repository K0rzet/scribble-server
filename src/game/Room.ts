import { Player, createPlayer } from './Player';
import { getRandomWords, generateHintProgressive, getNextRevealIndex, checkGuess } from './WordBank';
import { Server } from 'socket.io';

export type RoomState = 'waiting' | 'choosing' | 'drawing' | 'roundEnd' | 'gameEnd';

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
  wordChoices: string[] = [];
  hint: string = '';
  revealedIndices: number[] = [];
  drawActions: DrawAction[] = [];
  messages: ChatMessage[] = [];
  timeLeft: number = 0;
  guessedCount: number = 0;
  playerOrder: string[] = [];

  private io: Server;
  private roundTimer: NodeJS.Timeout | null = null;
  private hintTimer: NodeJS.Timeout | null = null;
  private msgCounter: number = 0;

  constructor(id: string, io: Server, settings?: Partial<RoomSettings>) {
    this.id = id;
    this.io = io;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

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
    this.addSystemMessage(`${player.name} покинул игру`);
    if (player.isHost && this.players.size > 0) {
      const newHost = this.players.values().next().value!;
      newHost.isHost = true;
      this.addSystemMessage(`${newHost.name} теперь хост`);
    }
    if (player.isDrawing && this.state === 'drawing') { this.endRound(); return; }
    if (this.players.size < 2 && this.state !== 'waiting') { this.stopGame(); return; }
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
    const idx = this.playerOrder.indexOf(oldSocketId);
    if (idx >= 0) this.playerOrder[idx] = socketId;
    return true;
  }

  startGame(): void {
    if (this.players.size < 2) return;
    if (this.state !== 'waiting') return;
    this.currentRound = 0;
    this.playerOrder = Array.from(this.players.keys());
    this.currentDrawerIndex = -1;
    this.players.forEach((p) => { p.score = 0; });
    this.addSystemMessage('Игра началась!');
    this.nextTurn();
  }

  private nextTurn(): void {
    this.drawActions = [];
    this.revealedIndices = [];
    this.guessedCount = 0;
    this.currentWord = '';
    this.hint = '';
    this.players.forEach((p) => { p.hasGuessed = false; p.isDrawing = false; });
    this.currentDrawerIndex++;
    if (this.currentDrawerIndex >= this.playerOrder.length) {
      this.currentDrawerIndex = 0;
      this.currentRound++;
      if (this.currentRound >= this.settings.rounds) { this.endGame(); return; }
    }
    const drawerId = this.playerOrder[this.currentDrawerIndex];
    const drawer = this.players.get(drawerId);
    if (!drawer) { this.nextTurn(); return; }
    drawer.isDrawing = true;
    this.wordChoices = getRandomWords(3);
    this.state = 'choosing';
    this.timeLeft = this.settings.chooseTime;
    this.addSystemMessage(`Раунд ${this.currentRound + 1}/${this.settings.rounds} — ${drawer.name} рисует`);
    this.io.to(drawerId).emit('word-choices', { words: this.wordChoices, timeLeft: this.timeLeft });
    this.broadcastState();
    this.startTimer(() => {
      if (this.state === 'choosing') {
        const randomWord = this.wordChoices[Math.floor(Math.random() * this.wordChoices.length)];
        this.chooseWord(drawerId, randomWord);
      }
    }, this.settings.chooseTime);
  }

  chooseWord(socketId: string, word: string): void {
    const player = this.players.get(socketId);
    if (!player?.isDrawing) return;
    if (this.state !== 'choosing') return;
    this.currentWord = word;
    this.state = 'drawing';
    this.timeLeft = this.settings.drawTime;
    this.revealedIndices = [];
    this.updateHint();
    this.clearTimers();
    this.broadcastState();
    this.startTimer(() => { this.endRound(); }, this.settings.drawTime);
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
      const elapsed = this.settings.drawTime - this.timeLeft;
      const guesserScore = Math.max(50, 500 - elapsed * 5);
      const drawerScore = 50;
      player.score += guesserScore;
      const drawerId = this.playerOrder[this.currentDrawerIndex];
      const drawer = this.players.get(drawerId);
      if (drawer) drawer.score += drawerScore;
      this.addMessage(socketId, player.name, text, 'correct');
      this.addSystemMessage(`${player.name} угадал слово! (+${guesserScore} очков)`);
      const activePlayers = Array.from(this.players.values()).filter((p) => !p.isDrawing && p.connected);
      const allGuessed = activePlayers.every((p) => p.hasGuessed);
      if (allGuessed) { this.endRound(); } else { this.broadcastState(); }
    } else if (result === 'close') {
      this.addMessage(socketId, player.name, text, 'close');
      this.io.to(socketId).emit('guess-result', { result: 'close' });
    } else {
      this.addMessage(socketId, player.name, text, 'message');
    }
  }

  private endRound(): void {
    this.clearTimers();
    this.state = 'roundEnd';
    this.addSystemMessage(`Слово было: ${this.currentWord}`);
    this.io.to(this.id).emit('round-end', { word: this.currentWord, players: this.getPlayersArray() });
    this.broadcastState();
    setTimeout(() => { if (this.state === 'roundEnd') this.nextTurn(); }, 5000);
  }

  private endGame(): void {
    this.clearTimers();
    this.state = 'gameEnd';
    const sortedPlayers = this.getPlayersArray().sort((a, b) => b.score - a.score);
    this.addSystemMessage('Игра окончена!');
    this.io.to(this.id).emit('game-end', { players: sortedPlayers, winner: sortedPlayers[0] });
    this.broadcastState();
    setTimeout(() => { this.resetToWaiting(); }, 10000);
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
    this.hint = '';
    this.revealedIndices = [];
    this.players.forEach((p) => { p.score = 0; p.hasGuessed = false; p.isDrawing = false; });
    this.broadcastState();
  }

  private updateHint(): void {
    this.hint = generateHintProgressive(this.currentWord, this.revealedIndices);
  }

  private revealNextLetter(): void {
    const nextIdx = getNextRevealIndex(this.currentWord, this.revealedIndices);
    if (nextIdx !== null) { this.revealedIndices.push(nextIdx); this.updateHint(); this.broadcastState(); }
  }

  private startHintTimer(): void {
    this.hintTimer = setInterval(() => {
      if (this.state !== 'drawing') { if (this.hintTimer) clearInterval(this.hintTimer); return; }
      this.revealNextLetter();
    }, 15000);
  }

  private startTimer(callback: () => void, seconds: number): void {
    this.clearTimers();
    this.timeLeft = seconds;
    this.roundTimer = setInterval(() => {
      this.timeLeft--;
      this.io.to(this.id).emit('timer-update', { timeLeft: this.timeLeft });
      if (this.timeLeft <= 0) { this.clearTimers(); callback(); }
    }, 1000);
  }

  private clearTimers(): void {
    if (this.roundTimer) { clearInterval(this.roundTimer); this.roundTimer = null; }
    if (this.hintTimer) { clearInterval(this.hintTimer); this.hintTimer = null; }
  }

  private addMessage(playerId: string, playerName: string, text: string, type: ChatMessage['type']): void {
    const msg: ChatMessage = { id: `msg-${++this.msgCounter}`, playerId, playerName, text, type, timestamp: Date.now() };
    this.messages.push(msg);
    if (this.messages.length > 100) this.messages = this.messages.slice(-100);
    this.io.to(this.id).emit('chat-message', msg);
  }

  addSystemMessage(text: string): void { this.addMessage('system', 'Система', text, 'system'); }

  getPlayersArray(): Player[] { return Array.from(this.players.values()); }

  getPublicState() {
    const drawerId = this.playerOrder[this.currentDrawerIndex];
    return { id: this.id, state: this.state, players: this.getPlayersArray(), currentRound: this.currentRound, totalRounds: this.settings.rounds, drawerId, hint: this.hint, timeLeft: this.timeLeft, settings: this.settings, drawActions: this.drawActions };
  }

  getDrawerState() { return { ...this.getPublicState(), currentWord: this.currentWord }; }

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

  get isEmpty(): boolean { return this.players.size === 0; }
  get playerCount(): number { return this.players.size; }
  getHost(): Player | undefined { return Array.from(this.players.values()).find((p) => p.isHost); }

  updateSettings(settings: Partial<RoomSettings>): void {
    if (this.state !== 'waiting') return;
    this.settings = { ...this.settings, ...settings };
    this.broadcastState();
  }

  destroy(): void { this.clearTimers(); this.players.clear(); this.messages = []; this.drawActions = []; }
}
