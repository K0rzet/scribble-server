import { WordEntry } from './WordBank';
import { v4 as uuidv4 } from 'uuid';

export interface WordBankData {
  id: string;
  name: string;
  categories: Record<string, string[]>;
  wordCount: number;
  createdAt: number;
}

export class WordBankManager {
  private banks: Map<string, WordBankData> = new Map();

  /**
   * Add a new word bank
   */
  addBank(name: string, categories: Record<string, string[]>): WordBankData {
    const id = uuidv4().slice(0, 8);
    let wordCount = 0;
    for (const words of Object.values(categories)) {
      wordCount += words.length;
    }
    const bank: WordBankData = {
      id,
      name,
      categories,
      wordCount,
      createdAt: Date.now(),
    };
    this.banks.set(id, bank);
    console.log(`📚 Word bank "${name}" added with ${wordCount} words (id: ${id})`);
    return bank;
  }

  /**
   * Get a specific bank by ID
   */
  getBank(id: string): WordBankData | undefined {
    return this.banks.get(id);
  }

  /**
   * Delete a bank by ID
   */
  deleteBank(id: string): boolean {
    return this.banks.delete(id);
  }

  /**
   * List all banks (summary)
   */
  listBanks(): Array<{ id: string; name: string; wordCount: number; categoryCount: number }> {
    const list: Array<{ id: string; name: string; wordCount: number; categoryCount: number }> = [];
    this.banks.forEach((bank) => {
      list.push({
        id: bank.id,
        name: bank.name,
        wordCount: bank.wordCount,
        categoryCount: Object.keys(bank.categories).length,
      });
    });
    return list;
  }

  /**
   * Get words from specified bank IDs as WordEntry[], or all banks if bankIds includes 'all' or is empty
   */
  getWords(bankIds: string[]): WordEntry[] {
    const entries: WordEntry[] = [];

    const useAll = bankIds.length === 0 || bankIds.includes('all');
    const banksToUse = useAll
      ? Array.from(this.banks.values())
      : bankIds.map((id) => this.banks.get(id)).filter(Boolean) as WordBankData[];

    for (const bank of banksToUse) {
      for (const [category, words] of Object.entries(bank.categories)) {
        for (const word of words) {
          entries.push({ word, category });
        }
      }
    }

    return entries;
  }

  get bankCount(): number {
    return this.banks.size;
  }
}
