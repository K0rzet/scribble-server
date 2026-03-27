const WORDS: string[] = [
  'кошка', 'собака', 'слон', 'жираф', 'лев', 'тигр', 'медведь', 'заяц',
  'лиса', 'волк', 'олень', 'панда', 'обезьяна', 'крокодил', 'черепаха',
  'пингвин', 'дельфин', 'акула', 'кит', 'орёл', 'попугай', 'сова',
  'лягушка', 'бабочка', 'паук', 'муравей', 'пчела', 'улитка', 'ёжик',
  'белка', 'хомяк', 'корова', 'свинья', 'курица', 'утка', 'лошадь',
  'осёл', 'коза', 'овца', 'верблюд', 'носорог', 'бегемот', 'зебра',
  'пицца', 'бургер', 'мороженое', 'торт', 'конфета', 'шоколад',
  'яблоко', 'банан', 'арбуз', 'виноград', 'клубника', 'лимон',
  'помидор', 'огурец', 'морковь', 'картошка', 'лук', 'перец',
  'хлеб', 'сыр', 'молоко', 'яйцо', 'суп', 'каша',
  'макароны', 'сосиска', 'рыба', 'креветка', 'салат',
  'печенье', 'пончик', 'кекс', 'варенье', 'мёд', 'чай', 'кофе',
  'сок', 'лимонад', 'вода',
  'телефон', 'компьютер', 'телевизор', 'часы', 'лампа', 'стул',
  'стол', 'кровать', 'диван', 'шкаф', 'зеркало', 'окно',
  'дверь', 'ключ', 'замок', 'книга', 'ручка', 'карандаш',
  'ножницы', 'клей', 'линейка', 'рюкзак', 'сумка', 'зонт',
  'очки', 'шляпа', 'перчатки', 'ботинки', 'футболка', 'платье',
  'гитара', 'барабан', 'пианино', 'микрофон', 'наушники', 'камера',
  'мяч', 'велосипед', 'самокат', 'скейтборд', 'лыжи', 'коньки',
  'машина', 'автобус', 'поезд', 'самолёт', 'вертолёт', 'корабль',
  'лодка', 'ракета', 'трактор', 'мотоцикл', 'такси', 'скорая',
  'пожарная машина', 'подводная лодка', 'воздушный шар',
  'солнце', 'луна', 'звезда', 'облако', 'дождь', 'снег',
  'радуга', 'молния', 'гора', 'вулкан', 'река', 'озеро',
  'море', 'океан', 'остров', 'пустыня', 'лес', 'дерево',
  'цветок', 'роза', 'подсолнух', 'гриб', 'кактус', 'трава',
  'водопад', 'пещера', 'айсберг',
  'дом', 'замок', 'мост', 'маяк', 'церковь', 'школа',
  'больница', 'магазин', 'ресторан', 'кинотеатр', 'стадион',
  'аэропорт', 'вокзал', 'библиотека', 'музей', 'зоопарк',
  'цирк', 'парк', 'детская площадка', 'бассейн', 'пляж',
  'врач', 'повар', 'пожарный', 'полицейский', 'космонавт',
  'пират', 'рыцарь', 'принцесса', 'клоун', 'волшебник',
  'робот', 'инопланетянин', 'ниндзя', 'супергерой',
  'балерина', 'художник', 'музыкант', 'учитель',
  'рыбалка', 'костёр', 'палатка', 'карусель', 'качели',
  'фейерверк', 'свадьба', 'день рождения', 'Новый год',
  'Хэллоуин', 'снеговик', 'ёлка', 'подарок', 'воздушный змей',
  'дракон', 'единорог', 'русалка', 'привидение', 'ведьма',
  'вампир', 'зомби', 'фея', 'эльф', 'гном', 'тролль',
  'сокровище', 'волшебная палочка', 'ковёр-самолёт', 'шапка-невидимка',
  'футбол', 'баскетбол', 'теннис', 'хоккей', 'бокс',
  'плавание', 'бег', 'шахматы', 'дартс', 'боулинг',
  'скрипка', 'труба', 'флейта', 'арфа', 'аккордеон',
  'балалайка', 'бубен', 'ксилофон',
  'космический корабль', 'Эйфелева башня', 'Статуя Свободы',
  'колесо обозрения', 'американские горки', 'Северное сияние',
  'солнечная система', 'чёрная дыра', 'машина времени',
  'летающая тарелка', 'подводный мир', 'домик на дереве',
  'рыцарский турнир', 'сундук с сокровищами', 'ковбой на лошади',
  'кот в сапогах', 'Баба Яга', 'Кощей Бессмертный',
  'Змей Горыныч', 'золотая рыбка', 'курочка Ряба',
  'Снежная королева', 'Красная Шапочка', 'три медведя',
];

export function getRandomWords(count: number = 3): string[] {
  const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function generateHint(word: string, revealedCount: number): string {
  const chars = word.split('');
  const letterIndices: number[] = [];
  chars.forEach((ch, i) => { if (ch !== ' ' && ch !== '-' && ch !== '–') letterIndices.push(i); });
  const shuffledIndices = [...letterIndices].sort(() => Math.random() - 0.5);
  const toReveal = new Set(shuffledIndices.slice(0, revealedCount));
  return chars.map((ch, i) => { if (ch === ' ') return '  '; if (ch === '-' || ch === '–') return ch; return toReveal.has(i) ? ch : '_'; }).join(' ');
}

export function generateHintProgressive(word: string, revealedIndices: number[]): string {
  const chars = word.split('');
  const revealed = new Set(revealedIndices);
  return chars.map((ch, i) => { if (ch === ' ') return '  '; if (ch === '-' || ch === '–') return ch; return revealed.has(i) ? ch : '_'; }).join(' ');
}

export function getNextRevealIndex(word: string, alreadyRevealed: number[]): number | null {
  const chars = word.split('');
  const revealed = new Set(alreadyRevealed);
  const available: number[] = [];
  chars.forEach((ch, i) => { if (ch !== ' ' && ch !== '-' && ch !== '–' && !revealed.has(i)) available.push(i); });
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function checkGuess(guess: string, word: string): 'correct' | 'close' | 'wrong' {
  const normalizedGuess = guess.trim().toLowerCase().replace(/ё/g, 'е');
  const normalizedWord = word.trim().toLowerCase().replace(/ё/g, 'е');
  if (normalizedGuess === normalizedWord) return 'correct';
  const distance = levenshteinDistance(normalizedGuess, normalizedWord);
  const maxLen = Math.max(normalizedGuess.length, normalizedWord.length);
  const similarity = 1 - distance / maxLen;
  if (similarity >= 0.7 && normalizedGuess.length >= 3) return 'close';
  return 'wrong';
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) { matrix[i][j] = matrix[i - 1][j - 1]; }
      else { matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1); }
    }
  }
  return matrix[b.length][a.length];
}

export default WORDS;
