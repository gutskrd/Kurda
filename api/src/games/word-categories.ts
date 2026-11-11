/**
 * The starter categories Kurdish Impostor's word cards are sorted into, for
 * the admin's "starter word cards" import (content-admin.ts): each a slug, its
 * name in each variety, what it means in the interface languages, and the
 * English meanings of the published words that belong in it.
 *
 * The import never writes a learner's word: every card's word and meaning are
 * copied from published vocabulary, and only the category is put beside it,
 * matched by the word's English meaning. The category names here are the one
 * new Kurdish — the hint the impostor is shown — and every row made from them
 * is a draft (source 'starter', unreviewed) that a native speaker reviews
 * before it can be published. Until then nothing here reaches a learner.
 *
 * [native-speaker review] every `kmr` and `ckb` name below.
 */
import type { Meanings } from '@kurda/shared';

export interface StarterCategory {
  slug: string;
  /** the category's name in each variety, as the impostor's hint */
  name: { kmr: string; ckb: string };
  meanings: Meanings;
  /** English meanings of the words that belong in it, lower case, without "a", "the" or "to" */
  words: readonly string[];
}

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  {
    slug: 'animals',
    name: { kmr: 'heywan', ckb: 'ئاژەڵ' },
    meanings: { en: 'animal', de: 'Tier', es: 'animal', fr: 'animal', nl: 'dier', tr: 'hayvan', ar: 'حيوان' },
    words: ['cat', 'dog', 'horse', 'cow', 'sheep', 'goat', 'bird', 'fish', 'chicken', 'hen', 'rooster', 'donkey', 'mouse', 'wolf', 'bear', 'fox', 'lion', 'snake', 'bee', 'butterfly', 'rabbit', 'camel', 'duck', 'frog', 'deer', 'lamb', 'calf', 'ox', 'eagle', 'partridge', 'pigeon', 'mule', 'goose'],
  },
  {
    slug: 'food',
    name: { kmr: 'xwarin', ckb: 'خواردن' },
    meanings: { en: 'food', de: 'Essen', es: 'comida', fr: 'nourriture', nl: 'eten', tr: 'yemek', ar: 'طعام' },
    words: ['bread', 'cheese', 'rice', 'meat', 'egg', 'soup', 'yoghurt', 'yogurt', 'butter', 'honey', 'salt', 'sugar', 'oil', 'cake', 'flour', 'bulgur', 'kebab', 'dolma'],
  },
  {
    slug: 'fruit',
    name: { kmr: 'fêkî', ckb: 'میوە' },
    meanings: { en: 'fruit', de: 'Obst', es: 'fruta', fr: 'fruit', nl: 'fruit', tr: 'meyve', ar: 'فاكهة' },
    words: ['apple', 'pear', 'grape', 'grapes', 'melon', 'watermelon', 'pomegranate', 'fig', 'cherry', 'apricot', 'peach', 'orange', 'lemon', 'banana', 'plum', 'mulberry', 'strawberry', 'quince'],
  },
  {
    slug: 'vegetables',
    name: { kmr: 'zebze', ckb: 'سەوزە' },
    meanings: { en: 'vegetable', de: 'Gemüse', es: 'verdura', fr: 'légume', nl: 'groente', tr: 'sebze', ar: 'خضار' },
    words: ['tomato', 'potato', 'onion', 'cucumber', 'carrot', 'pepper', 'garlic', 'aubergine', 'eggplant', 'lettuce', 'beans', 'lentils', 'cabbage', 'pumpkin'],
  },
  {
    slug: 'drinks',
    name: { kmr: 'vexwarin', ckb: 'خواردنەوە' },
    meanings: { en: 'drink', de: 'Getränk', es: 'bebida', fr: 'boisson', nl: 'drankje', tr: 'içecek', ar: 'مشروب' },
    words: ['water', 'tea', 'coffee', 'milk', 'juice', 'ayran', 'sherbet', 'lemonade'],
  },
  {
    slug: 'family',
    name: { kmr: 'malbat', ckb: 'خێزان' },
    meanings: { en: 'family', de: 'Familie', es: 'familia', fr: 'famille', nl: 'familie', tr: 'aile', ar: 'عائلة' },
    words: ['mother', 'father', 'brother', 'sister', 'son', 'daughter', 'grandmother', 'grandfather', 'uncle', 'aunt', 'cousin', 'wife', 'husband', 'child', 'baby', 'grandchild', 'mum', 'mom', 'dad'],
  },
  {
    slug: 'body',
    name: { kmr: 'laş', ckb: 'لەش' },
    meanings: { en: 'body', de: 'Körper', es: 'cuerpo', fr: 'corps', nl: 'lichaam', tr: 'vücut', ar: 'جسم' },
    words: ['head', 'hand', 'foot', 'leg', 'arm', 'eye', 'ear', 'nose', 'mouth', 'tooth', 'hair', 'face', 'heart', 'finger', 'knee', 'shoulder', 'neck', 'tongue', 'lip', 'stomach', 'belly'],
  },
  {
    slug: 'clothes',
    name: { kmr: 'cil', ckb: 'جل' },
    meanings: { en: 'clothes', de: 'Kleidung', es: 'ropa', fr: 'vêtements', nl: 'kleding', tr: 'giysi', ar: 'ملابس' },
    words: ['shirt', 'dress', 'shoe', 'shoes', 'hat', 'coat', 'trousers', 'scarf', 'sock', 'socks', 'skirt', 'jacket', 'belt', 'glove', 'gloves', 'boots'],
  },
  {
    slug: 'home',
    name: { kmr: 'mal', ckb: 'ماڵ' },
    meanings: { en: 'home', de: 'Zuhause', es: 'casa', fr: 'maison', nl: 'thuis', tr: 'ev', ar: 'بيت' },
    words: ['door', 'window', 'wall', 'roof', 'room', 'kitchen', 'table', 'chair', 'bed', 'carpet', 'lamp', 'cupboard', 'key', 'stairs', 'sofa', 'mirror', 'pillow', 'blanket'],
  },
  {
    slug: 'jobs',
    name: { kmr: 'pîşe', ckb: 'پیشە' },
    meanings: { en: 'job', de: 'Beruf', es: 'oficio', fr: 'métier', nl: 'beroep', tr: 'meslek', ar: 'مهنة' },
    words: ['teacher', 'doctor', 'farmer', 'shepherd', 'baker', 'driver', 'nurse', 'cook', 'tailor', 'engineer', 'police officer', 'policeman', 'worker', 'shopkeeper', 'writer', 'singer', 'carpenter', 'merchant'],
  },
  {
    slug: 'nature',
    name: { kmr: 'xweza', ckb: 'سروشت' },
    meanings: { en: 'nature', de: 'Natur', es: 'naturaleza', fr: 'nature', nl: 'natuur', tr: 'doğa', ar: 'طبيعة' },
    words: ['mountain', 'river', 'tree', 'flower', 'sea', 'lake', 'sun', 'moon', 'star', 'sky', 'rain', 'snow', 'wind', 'cloud', 'forest', 'stone', 'rock', 'field', 'grass', 'valley'],
  },
  {
    slug: 'town',
    name: { kmr: 'bajar', ckb: 'شار' },
    meanings: { en: 'town', de: 'Stadt', es: 'ciudad', fr: 'ville', nl: 'stad', tr: 'şehir', ar: 'مدينة' },
    words: ['school', 'market', 'shop', 'hospital', 'mosque', 'street', 'road', 'bridge', 'bank', 'park', 'bakery', 'cafe', 'restaurant', 'station', 'library', 'pharmacy'],
  },
  {
    slug: 'transport',
    name: { kmr: 'veguhastin', ckb: 'گواستنەوە' },
    meanings: { en: 'transport', de: 'Verkehrsmittel', es: 'transporte', fr: 'transport', nl: 'vervoer', tr: 'ulaşım', ar: 'مواصلات' },
    words: ['car', 'bus', 'train', 'plane', 'aeroplane', 'airplane', 'bicycle', 'bike', 'taxi', 'boat', 'ship', 'lorry', 'truck', 'motorbike'],
  },
  {
    slug: 'colours',
    name: { kmr: 'reng', ckb: 'ڕەنگ' },
    meanings: { en: 'colour', de: 'Farbe', es: 'color', fr: 'couleur', nl: 'kleur', tr: 'renk', ar: 'لون' },
    words: ['red', 'blue', 'green', 'yellow', 'white', 'black', 'purple', 'pink', 'brown', 'grey', 'gray'],
  },
  {
    slug: 'school',
    name: { kmr: 'dibistan', ckb: 'قوتابخانە' },
    meanings: { en: 'school', de: 'Schule', es: 'escuela', fr: 'école', nl: 'school', tr: 'okul', ar: 'مدرسة' },
    words: ['book', 'pen', 'pencil', 'notebook', 'lesson', 'class', 'classroom', 'student', 'pupil', 'blackboard', 'board', 'desk', 'bag', 'paper', 'homework', 'exam', 'ruler', 'eraser', 'question', 'answer', 'letter', 'page'],
  },
  {
    slug: 'time',
    name: { kmr: 'dem', ckb: 'کات' },
    meanings: { en: 'time', de: 'Zeit', es: 'tiempo', fr: 'temps', nl: 'tijd', tr: 'zaman', ar: 'وقت' },
    words: ['day', 'night', 'morning', 'evening', 'noon', 'afternoon', 'week', 'month', 'year', 'hour', 'minute', 'today', 'tomorrow', 'yesterday', 'spring', 'summer', 'autumn', 'winter', 'season', 'clock'],
  },
  {
    slug: 'kitchen',
    name: { kmr: 'aşxane', ckb: 'چێشتخانە' },
    meanings: { en: 'kitchen', de: 'Küche', es: 'cocina', fr: 'cuisine', nl: 'keuken', tr: 'mutfak', ar: 'مطبخ' },
    words: ['plate', 'spoon', 'fork', 'knife', 'glass', 'cup', 'pot', 'pan', 'kettle', 'teapot', 'bowl', 'tray', 'oven', 'stove', 'fridge', 'bottle', 'jug'],
  },
  {
    slug: 'feelings',
    name: { kmr: 'hest', ckb: 'هەست' },
    meanings: { en: 'feeling', de: 'Gefühl', es: 'sentimiento', fr: 'sentiment', nl: 'gevoel', tr: 'duygu', ar: 'شعور' },
    words: ['love', 'joy', 'fear', 'anger', 'hope', 'happiness', 'sadness', 'shame', 'longing', 'pain', 'laughter', 'smile', 'dream', 'peace', 'patience', 'courage'],
  },
  {
    slug: 'play',
    name: { kmr: 'lîstik', ckb: 'یاری' },
    meanings: { en: 'game', de: 'Spiel', es: 'juego', fr: 'jeu', nl: 'spel', tr: 'oyun', ar: 'لعبة' },
    words: ['ball', 'game', 'football', 'chess', 'toy', 'kite', 'swing', 'backgammon', 'dance', 'race', 'doll', 'puzzle'],
  },
  {
    slug: 'music',
    name: { kmr: 'muzîk', ckb: 'مۆسیقا' },
    meanings: { en: 'music', de: 'Musik', es: 'música', fr: 'musique', nl: 'muziek', tr: 'müzik', ar: 'موسيقى' },
    words: ['song', 'drum', 'flute', 'voice', 'music', 'saz', 'tambur', 'melody', 'instrument', 'violin', 'guitar'],
  },
  {
    slug: 'celebrations',
    name: { kmr: 'cejn', ckb: 'جەژن' },
    meanings: { en: 'celebration', de: 'Fest', es: 'fiesta', fr: 'fête', nl: 'feest', tr: 'bayram', ar: 'عيد' },
    words: ['wedding', 'newroz', 'feast', 'festival', 'gift', 'present', 'guest', 'birthday', 'holiday', 'party', 'fire', 'bride', 'groom'],
  },
  {
    slug: 'tools',
    name: { kmr: 'amûr', ckb: 'ئامێر' },
    meanings: { en: 'tool', de: 'Werkzeug', es: 'herramienta', fr: 'outil', nl: 'gereedschap', tr: 'alet', ar: 'أداة' },
    words: ['hammer', 'saw', 'axe', 'shovel', 'rope', 'ladder', 'needle', 'scissors', 'broom', 'lock', 'nail', 'bucket', 'basket', 'plough', 'sickle'],
  },
  {
    slug: 'village',
    name: { kmr: 'gund', ckb: 'گوند' },
    meanings: { en: 'village', de: 'Dorf', es: 'pueblo', fr: 'village', nl: 'dorp', tr: 'köy', ar: 'قرية' },
    words: ['village', 'well', 'mill', 'flock', 'barn', 'tent', 'harvest', 'wheat', 'garden', 'orchard', 'vineyard', 'fence', 'hay', 'pasture', 'neighbour', 'neighbor'],
  },
];

/**
 * A published word's English meaning as the categories list them: lower
 * case, without an article or "to", without anything in brackets, each of its
 * alternatives ("cat / kitten", "the cat, a cat") on its own.
 */
export function meaningKeys(en: string): string[] {
  return en
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[/,;]| or /)
    .map((part) =>
      part
        .replace(/[.!?"“”‘’']/g, ' ')
        .trim()
        .replace(/^(a|an|the|to|my|your|some)\s+/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((part) => part !== '');
}

/** The starter category a published word belongs in, by its English meaning, or null. */
export function starterCategoryOf(en: string | undefined): StarterCategory | null {
  if (!en) return null;
  const keys = meaningKeys(en);
  return STARTER_CATEGORIES.find((c) => keys.some((k) => c.words.includes(k))) ?? null;
}
