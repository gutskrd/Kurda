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
 * A meaning is listed once, under the category it belongs in first. A verb
 * ("to run") is matched against the `verbs` of a category before anything
 * else, so that the verb "to light" and the adjective "light" each find their
 * own; and a word with several meanings ("box, chest") goes where its first
 * meaning goes, which is the one the lesson taught.
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
  /** English verbs that belong in it, as their infinitive without "to": matched only by a meaning given as "to …" */
  verbs?: readonly string[];
}

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  {
    slug: 'animals',
    name: { kmr: 'heywan', ckb: 'ئاژەڵ' },
    meanings: { en: 'animal', de: 'Tier', es: 'animal', fr: 'animal', nl: 'dier', tr: 'hayvan', ar: 'حيوان' },
    words: [
      'cat', 'dog', 'horse', 'cow', 'sheep', 'goat', 'bird', 'fish', 'chicken', 'hen', 'rooster', 'donkey', 'mouse', 'wolf', 'bear', 'fox', 'lion',
      'snake', 'bee', 'butterfly', 'rabbit', 'camel', 'duck', 'frog', 'deer', 'lamb', 'calf', 'ox', 'eagle', 'partridge', 'pigeon', 'mule', 'goose',
      'ewe', 'ram', 'kid', 'gazelle', 'dove', 'turtle', 'tortoise', 'hedgehog', 'ant', 'spider', 'fly', 'mosquito', 'turkey', 'pig', 'squirrel',
      'elephant', 'monkey', 'tiger', 'bull', 'foal', 'puppy', 'kitten', 'crow', 'owl', 'stork', 'lizard', 'scorpion', 'worm', 'sparrow', 'falcon',
      'buffalo', 'leopard', 'boar', 'jackal', 'hare', 'grasshopper', 'ladybird', 'snail',
    ],
  },
  {
    slug: 'food',
    name: { kmr: 'xwarin', ckb: 'خواردن' },
    meanings: { en: 'food', de: 'Essen', es: 'comida', fr: 'nourriture', nl: 'eten', tr: 'yemek', ar: 'طعام' },
    words: [
      'bread', 'cheese', 'rice', 'meat', 'egg', 'soup', 'yoghurt', 'yogurt', 'butter', 'honey', 'salt', 'sugar', 'oil', 'cake', 'flour', 'bulgur',
      'kebab', 'dolma', 'dinner', 'breakfast', 'lunch', 'meal', 'olive', 'walnut', 'maize', 'corn', 'nut', 'almond', 'pistachio', 'chickpeas',
      'pasta', 'jam', 'molasses', 'spice', 'biscuit', 'chocolate', 'ice cream', 'sandwich', 'stew', 'pilaf', 'flatbread', 'food', 'cream', 'sausage',
      'omelette', 'pie', 'pancake', 'dough', 'sesame', 'raisin', 'hazelnut',
    ],
  },
  {
    slug: 'fruit',
    name: { kmr: 'fêkî', ckb: 'میوە' },
    meanings: { en: 'fruit', de: 'Obst', es: 'fruta', fr: 'fruit', nl: 'fruit', tr: 'meyve', ar: 'فاكهة' },
    words: [
      'apple', 'pear', 'grape', 'grapes', 'melon', 'watermelon', 'pomegranate', 'fig', 'cherry', 'apricot', 'peach', 'orange', 'lemon', 'banana',
      'plum', 'mulberry', 'strawberry', 'quince', 'date', 'tangerine', 'mandarin', 'kiwi', 'pineapple', 'berry', 'blackberry', 'raspberry',
      'grapefruit', 'mango', 'coconut', 'fruit',
    ],
  },
  {
    slug: 'vegetables',
    name: { kmr: 'zebze', ckb: 'سەوزە' },
    meanings: { en: 'vegetable', de: 'Gemüse', es: 'verdura', fr: 'légume', nl: 'groente', tr: 'sebze', ar: 'خضار' },
    words: [
      'tomato', 'potato', 'onion', 'cucumber', 'carrot', 'pepper', 'garlic', 'aubergine', 'eggplant', 'lettuce', 'beans', 'lentils', 'cabbage',
      'pumpkin', 'spinach', 'parsley', 'mint', 'courgette', 'zucchini', 'okra', 'radish', 'beetroot', 'leek', 'peas', 'mushroom', 'celery', 'chilli',
      'vegetable', 'turnip', 'cauliflower', 'dill', 'basil',
    ],
  },
  {
    slug: 'drinks',
    name: { kmr: 'vexwarin', ckb: 'خواردنەوە' },
    meanings: { en: 'drink', de: 'Getränk', es: 'bebida', fr: 'boisson', nl: 'drankje', tr: 'içecek', ar: 'مشروب' },
    words: [
      'water', 'tea', 'coffee', 'milk', 'juice', 'ayran', 'sherbet', 'lemonade', 'cola', 'soda', 'wine', 'beer', 'buttermilk', 'syrup', 'compote',
      'mineral water', 'hot chocolate', 'drink', 'herbal tea',
    ],
  },
  {
    slug: 'family',
    name: { kmr: 'malbat', ckb: 'خێزان' },
    meanings: { en: 'family', de: 'Familie', es: 'familia', fr: 'famille', nl: 'familie', tr: 'aile', ar: 'عائلة' },
    words: [
      'mother', 'father', 'brother', 'sister', 'son', 'daughter', 'grandmother', 'grandfather', 'uncle', 'aunt', 'cousin', 'wife', 'husband',
      'child', 'baby', 'grandchild', 'mum', 'mom', 'dad', 'niece', 'nephew', 'grandpa', 'grandma', 'parents', 'twin', 'daughter-in-law',
      'son-in-law', 'mother-in-law', 'father-in-law', 'relative', 'sibling', 'granddaughter', 'grandson', 'family', 'boy', 'stepmother',
      'stepfather', 'fiancé', 'fiancée', 'ancestor', 'orphan',
    ],
  },
  {
    slug: 'body',
    name: { kmr: 'laş', ckb: 'لەش' },
    meanings: { en: 'body', de: 'Körper', es: 'cuerpo', fr: 'corps', nl: 'lichaam', tr: 'vücut', ar: 'جسم' },
    words: [
      'head', 'hand', 'foot', 'leg', 'arm', 'eye', 'ear', 'nose', 'mouth', 'tooth', 'hair', 'face', 'heart', 'finger', 'knee', 'shoulder', 'neck',
      'tongue', 'lip', 'stomach', 'belly', 'chest', 'bone', 'back', 'blood', 'tear', 'moustache', 'beard', 'skin', 'thumb', 'elbow', 'wrist',
      'ankle', 'cheek', 'chin', 'forehead', 'eyebrow', 'eyelash', 'throat', 'lung', 'brain', 'palm', 'heel', 'toe', 'waist', 'body', 'rib', 'vein',
      'muscle', 'jaw', 'liver', 'kidney',
    ],
  },
  {
    slug: 'clothes',
    name: { kmr: 'cil', ckb: 'جل' },
    meanings: { en: 'clothes', de: 'Kleidung', es: 'ropa', fr: 'vêtements', nl: 'kleding', tr: 'giysi', ar: 'ملابس' },
    words: [
      'shirt', 'dress', 'shoe', 'shoes', 'hat', 'coat', 'trousers', 'scarf', 'sock', 'socks', 'skirt', 'jacket', 'belt', 'glove', 'gloves', 'boots',
      'cap', 'garment', 'clothes', 'sash', 'necklace', 'handkerchief', 'glasses', 'ring', 'earring', 'bracelet', 'headscarf', 'shawl', 'vest',
      'waistcoat', 'sandals', 'slippers', 'pocket', 'button', 'sleeve', 'collar', 'tie', 'suit', 'pyjamas', 'sweater', 'jumper', 'uniform', 'apron',
      'veil', 'turban', 'cloak', 'raincoat',
    ],
  },
  {
    slug: 'home',
    name: { kmr: 'mal', ckb: 'ماڵ' },
    meanings: { en: 'home', de: 'Zuhause', es: 'casa', fr: 'maison', nl: 'thuis', tr: 'ev', ar: 'بيت' },
    words: [
      'door', 'window', 'wall', 'roof', 'room', 'kitchen', 'table', 'chair', 'bed', 'carpet', 'lamp', 'cupboard', 'key', 'stairs', 'sofa', 'mirror',
      'pillow', 'blanket', 'house', 'home', 'yard', 'bathroom', 'floor', 'storey', 'gate', 'bedding', 'balcony', 'garage', 'cellar', 'ceiling',
      'corridor', 'bedroom', 'living room', 'toilet', 'shower', 'tap', 'curtain', 'rug', 'shelf', 'drawer', 'wardrobe', 'chimney', 'building',
      'threshold', 'courtyard', 'mattress', 'quilt', 'heater', 'fireplace', 'doorbell',
    ],
  },
  {
    slug: 'jobs',
    name: { kmr: 'pîşe', ckb: 'پیشە' },
    meanings: { en: 'job', de: 'Beruf', es: 'oficio', fr: 'métier', nl: 'beroep', tr: 'meslek', ar: 'مهنة' },
    words: [
      'teacher', 'doctor', 'farmer', 'shepherd', 'baker', 'driver', 'nurse', 'cook', 'tailor', 'engineer', 'police officer', 'policeman', 'worker',
      'shopkeeper', 'writer', 'singer', 'carpenter', 'merchant', 'blacksmith', 'judge', 'journalist', 'lawyer', 'translator', 'craftsman', 'builder',
      'seller', 'milkmaid', 'actor', 'director', 'pilot', 'soldier', 'dentist', 'painter', 'butcher', 'barber', 'hairdresser', 'waiter', 'mechanic',
      'electrician', 'plumber', 'postman', 'fisherman', 'hunter', 'miller', 'weaver', 'potter', 'guard', 'firefighter', 'scientist', 'artist',
      'musician', 'poet', 'secretary', 'manager', 'gardener', 'profession', 'trade', 'job', 'vet', 'grocer', 'jeweller', 'shoemaker', 'mason',
      'clerk', 'architect', 'photographer', 'professor', 'imam',
    ],
  },
  {
    slug: 'nature',
    name: { kmr: 'xweza', ckb: 'سروشت' },
    meanings: { en: 'nature', de: 'Natur', es: 'naturaleza', fr: 'nature', nl: 'natuur', tr: 'doğa', ar: 'طبيعة' },
    words: [
      'mountain', 'river', 'tree', 'flower', 'sea', 'lake', 'sun', 'moon', 'star', 'sky', 'rain', 'snow', 'wind', 'cloud', 'forest', 'stone', 'rock',
      'field', 'grass', 'valley', 'hill', 'leaf', 'ground', 'earth', 'soil', 'mud', 'rose', 'sapling', 'root', 'summer pastures', 'slope', 'cave',
      'waterfall', 'island', 'desert', 'beach', 'shore', 'sand', 'plain', 'meadow', 'bush', 'branch', 'seed', 'oak', 'pine', 'stream', 'pond',
      'wave', 'summit', 'peak', 'cliff', 'nature', 'thorn', 'blossom', 'moss', 'reed', 'poplar', 'willow', 'horizon', 'volcano', 'glacier',
    ],
  },
  {
    slug: 'town',
    name: { kmr: 'bajar', ckb: 'شار' },
    meanings: { en: 'town', de: 'Stadt', es: 'ciudad', fr: 'ville', nl: 'stad', tr: 'şehir', ar: 'مدينة' },
    words: [
      'school', 'market', 'shop', 'hospital', 'mosque', 'street', 'road', 'bridge', 'bank', 'park', 'bakery', 'cafe', 'restaurant', 'station',
      'library', 'pharmacy', 'city', 'town', 'square', 'tea house', 'citadel', 'castle', 'centre', 'center', 'neighbourhood', 'neighborhood',
      'theatre', 'theater', 'cinema', 'museum', 'hotel', 'post office', 'police station', 'church', 'factory', 'office', 'pavement', 'traffic',
      'traffic light', 'university', 'stop', 'bus stop', 'tower', 'fountain', 'statue', 'bazaar', 'inn', 'prison', 'court', 'town hall', 'kiosk',
      'car park', 'alley', 'crossroads', 'petrol station',
    ],
  },
  {
    slug: 'transport',
    name: { kmr: 'veguhastin', ckb: 'گواستنەوە' },
    meanings: { en: 'transport', de: 'Verkehrsmittel', es: 'transporte', fr: 'transport', nl: 'vervoer', tr: 'ulaşım', ar: 'مواصلات' },
    words: [
      'car', 'bus', 'train', 'plane', 'aeroplane', 'airplane', 'bicycle', 'bike', 'taxi', 'boat', 'ship', 'lorry', 'truck', 'motorbike', 'tractor',
      'minibus', 'helicopter', 'tram', 'metro', 'underground', 'ferry', 'cart', 'wagon', 'ambulance', 'scooter', 'van', 'wheel', 'engine', 'petrol',
      'transport', 'sledge', 'rocket', 'raft',
    ],
  },
  {
    slug: 'colours',
    name: { kmr: 'reng', ckb: 'ڕەنگ' },
    meanings: { en: 'colour', de: 'Farbe', es: 'color', fr: 'couleur', nl: 'kleur', tr: 'renk', ar: 'لون' },
    words: [
      'red', 'blue', 'green', 'yellow', 'white', 'black', 'purple', 'pink', 'brown', 'grey', 'gray', 'colourful', 'colour', 'turquoise', 'navy',
      'beige', 'violet', 'dark blue', 'light blue', 'dark green',
    ],
  },
  {
    slug: 'school',
    name: { kmr: 'dibistan', ckb: 'قوتابخانە' },
    meanings: { en: 'school', de: 'Schule', es: 'escuela', fr: 'école', nl: 'school', tr: 'okul', ar: 'مدرسة' },
    words: [
      'book', 'pen', 'pencil', 'notebook', 'lesson', 'class', 'classroom', 'student', 'pupil', 'blackboard', 'board', 'desk', 'bag', 'paper',
      'homework', 'exam', 'ruler', 'eraser', 'question', 'answer', 'letter', 'page', 'classmate', 'certificate', 'diploma', 'learning', 'list',
      'dictionary', 'chalk', 'grade', 'mark', 'break', 'alphabet', 'text', 'exercise', 'subject', 'topic', 'information', 'knowledge', 'schoolbag',
      'timetable', 'headteacher', 'calculator', 'compass',
    ],
  },
  {
    slug: 'time',
    name: { kmr: 'dem', ckb: 'کات' },
    meanings: { en: 'time', de: 'Zeit', es: 'tiempo', fr: 'temps', nl: 'tijd', tr: 'zaman', ar: 'وقت' },
    words: [
      'day', 'night', 'morning', 'evening', 'noon', 'afternoon', 'week', 'month', 'year', 'hour', 'minute', 'today', 'tomorrow', 'yesterday',
      'spring', 'summer', 'autumn', 'winter', 'season', 'clock', 'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'dawn',
      'day after tomorrow', 'day before yesterday', 'last year', 'future', 'now', 'early', 'late', 'later', 'sometimes', 'before', 'always', 'never',
      'often', 'soon', 'second', 'century', 'calendar', 'midnight', 'sunrise', 'sunset', 'weekend', 'time', 'past', 'moment', 'age', 'youth',
      'childhood', 'beginning', 'end',
    ],
  },
  {
    slug: 'kitchen',
    name: { kmr: 'aşxane', ckb: 'چێشتخانە' },
    meanings: { en: 'kitchen', de: 'Küche', es: 'cocina', fr: 'cuisine', nl: 'keuken', tr: 'mutfak', ar: 'مطبخ' },
    words: [
      'plate', 'spoon', 'fork', 'knife', 'glass', 'cup', 'pot', 'pan', 'kettle', 'teapot', 'bowl', 'tray', 'oven', 'stove', 'fridge', 'bottle',
      'jug', 'clay bread oven', 'saj', 'griddle', 'goatskin churn', 'churn', 'tin', 'sieve', 'ladle', 'grater', 'lid', 'napkin', 'tablecloth',
      'cloth a meal is laid on', 'rolling pin', 'mortar', 'samovar', 'cauldron', 'dish', 'saucer', 'chopping board', 'sink', 'sponge',
    ],
  },
  {
    slug: 'feelings',
    name: { kmr: 'hest', ckb: 'هەست' },
    meanings: { en: 'feeling', de: 'Gefühl', es: 'sentimiento', fr: 'sentiment', nl: 'gevoel', tr: 'duygu', ar: 'شعور' },
    words: [
      'love', 'joy', 'fear', 'anger', 'hope', 'happiness', 'sadness', 'shame', 'longing', 'pain', 'laughter', 'smile', 'dream', 'peace', 'patience',
      'courage', 'feeling', 'sad', 'glad', 'pleased', 'tired', 'hungry', 'thirsty', 'bored', 'annoyed', 'upset', 'hurt', 'heartbroken', 'amazed',
      'fed up', 'homesick', 'hopeful', 'proud', 'grateful', 'calm', 'content', 'happy', 'angry', 'afraid', 'surprised', 'worried', 'lonely',
      'jealous', 'excited', 'trust', 'belief', 'enthusiasm', 'wish', 'grief', 'sorrow', 'regret', 'pity', 'pride', 'relief', 'comfort',
    ],
  },
  {
    slug: 'play',
    name: { kmr: 'lîstik', ckb: 'یاری' },
    meanings: { en: 'game', de: 'Spiel', es: 'juego', fr: 'jeu', nl: 'spel', tr: 'oyun', ar: 'لعبة' },
    words: [
      'ball', 'game', 'chess', 'toy', 'kite', 'swing', 'backgammon', 'dance', 'doll', 'puzzle', 'marble', 'hide and seek', 'dice', 'card', 'cards',
      'riddle', 'role', 'turn', 'tag', 'skipping rope', 'slide', 'seesaw', 'balloon', 'playground', 'board game', 'dominoes', 'yo-yo',
      'spinning top',
    ],
  },
  {
    slug: 'music',
    name: { kmr: 'muzîk', ckb: 'مۆسیقا' },
    meanings: { en: 'music', de: 'Musik', es: 'música', fr: 'musique', nl: 'muziek', tr: 'müzik', ar: 'موسيقى' },
    words: [
      'song', 'drum', 'flute', 'voice', 'music', 'saz', 'tambur', 'melody', 'instrument', 'violin', 'guitar', 'frame drum', 'zurna', 'shawm',
      'kilam', 'tembûr', 'dengbêj', 'govend', 'big drum', 'verse', 'stanza', 'clapping', 'applause', 'ululation', 'tune', 'sound', 'rhythm', 'choir',
      'concert', 'lute', 'pipe', 'horn', 'bell', 'piano', 'whistle', 'lullaby', 'anthem', 'note', 'chorus', 'band', 'harp', 'accordion',
    ],
  },
  {
    slug: 'celebrations',
    name: { kmr: 'cejn', ckb: 'جەژن' },
    meanings: { en: 'celebration', de: 'Fest', es: 'fiesta', fr: 'fête', nl: 'feest', tr: 'bayram', ar: 'عيد' },
    words: [
      'wedding', 'newroz', 'feast', 'festival', 'gift', 'present', 'guest', 'birthday', 'holiday', 'party', 'fire', 'bride', 'groom', 'new year',
      'celebration', 'circle dance', 'candle', 'invitation', 'congratulations', 'picnic', 'bonfire', 'costume', 'parade', 'fireworks', 'engagement',
      'anniversary', 'henna', 'ribbon', 'decoration', 'toast', 'dowry', 'lantern', 'procession',
    ],
  },
  {
    slug: 'tools',
    name: { kmr: 'amûr', ckb: 'ئامێر' },
    meanings: { en: 'tool', de: 'Werkzeug', es: 'herramienta', fr: 'outil', nl: 'gereedschap', tr: 'alet', ar: 'أداة' },
    words: [
      'hammer', 'saw', 'axe', 'shovel', 'rope', 'ladder', 'needle', 'scissors', 'broom', 'lock', 'nail', 'bucket', 'basket', 'plough', 'sickle',
      'pump', 'wheelbarrow', 'pickaxe', 'drill', 'screwdriver', 'pliers', 'spade', 'rake', 'chain', 'hook', 'brush', 'tape', 'glue', 'thread',
      'wire', 'tool', 'machine', 'net', 'whip', 'stick', 'cane', 'anvil', 'chisel', 'file', 'spanner', 'hoe', 'pitchfork', 'bellows', 'loom',
      'spindle',
    ],
  },
  {
    slug: 'village',
    name: { kmr: 'gund', ckb: 'گوند' },
    meanings: { en: 'village', de: 'Dorf', es: 'pueblo', fr: 'village', nl: 'dorp', tr: 'köy', ar: 'قرية' },
    words: [
      'village', 'mill', 'flock', 'barn', 'tent', 'harvest', 'wheat', 'garden', 'orchard', 'vineyard', 'fence', 'hay', 'pasture', 'neighbour',
      'neighbor', 'firewood', 'haystack', 'stable', 'coop', 'beehive', 'threshing floor', 'granary', 'path', 'crop', 'barley', 'straw', 'grain',
      'herd', 'fold', 'water well', 'scarecrow', 'trough', 'yoke', 'dung', 'dairy', 'hut', 'plot', 'furrow',
    ],
  },
  {
    slug: 'numbers',
    name: { kmr: 'hejmar', ckb: 'ژمارە' },
    meanings: { en: 'number', de: 'Zahl', es: 'número', fr: 'nombre', nl: 'getal', tr: 'sayı', ar: 'رقم' },
    words: [
      'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
      'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred',
      'thousand', 'million', '30', '40', '50', '60', '70', '80', '90', '100', '1000', 'half', 'quarter', 'zero', 'number', 'double', 'pair', 'dozen',
    ],
  },
  {
    slug: 'weather',
    name: { kmr: 'hewa', ckb: 'کەشوهەوا' },
    meanings: { en: 'weather', de: 'Wetter', es: 'clima', fr: 'météo', nl: 'weer', tr: 'hava', ar: 'طقس' },
    words: [
      'weather', 'sunshine', 'cold', 'ice', 'storm', 'cloudy', 'clear', 'fog', 'mist', 'thunder', 'lightning', 'rainbow', 'hail', 'frost', 'heat',
      'warmth', 'hot', 'warm', 'shade', 'shadow', 'drop', 'flood', 'drought', 'breeze', 'snowstorm', 'temperature', 'degree', 'humid', 'dry', 'wet',
      'sunny', 'rainy', 'windy', 'snowy', 'dew', 'drizzle', 'sleet', 'thaw',
    ],
  },
  {
    slug: 'health',
    name: { kmr: 'tenduristî', ckb: 'تەندروستی' },
    meanings: { en: 'health', de: 'Gesundheit', es: 'salud', fr: 'santé', nl: 'gezondheid', tr: 'sağlık', ar: 'صحة' },
    words: [
      'illness', 'medicine', 'fever', 'cough', 'wound', 'pill', 'health', 'ill', 'healthy', 'injection', 'flu', 'headache', 'toothache', 'bandage',
      'plaster', 'clinic', 'patient', 'operation', 'vaccine', 'diet', 'sleep', 'rest', 'vitamin', 'allergy', 'sneeze', 'pulse', 'thermometer',
      'prescription', 'cure', 'wheelchair', 'crutch', 'ointment', 'stitches', 'bruise', 'burn', 'swelling',
    ],
  },
  {
    slug: 'people',
    name: { kmr: 'mirov', ckb: 'مرۆڤ' },
    meanings: { en: 'person', de: 'Mensch', es: 'persona', fr: 'personne', nl: 'mens', tr: 'insan', ar: 'إنسان' },
    words: [
      'friend', 'girl', 'woman', 'man', 'person', 'people', 'thief', 'old man', 'old woman', 'liar', 'coward', 'stranger', 'kurd', 'lady',
      'gentleman', 'teenager', 'adult', 'crowd', 'enemy', 'visitor', 'citizen', 'villager', 'listener', 'audience', 'joker', 'leader', 'member',
      'companion', 'human', 'anyone', 'nobody', 'everybody', 'bachelor', 'widow', 'traveller', 'beggar', 'expert', 'beginner', 'fool', 'genius',
    ],
  },
  {
    slug: 'taste',
    name: { kmr: 'tam', ckb: 'تام' },
    meanings: { en: 'taste', de: 'Geschmack', es: 'sabor', fr: 'goût', nl: 'smaak', tr: 'tat', ar: 'طعم' },
    words: [
      'sweet', 'sour', 'bitter', 'tasteless', 'tasty', 'fresh', 'salty', 'spicy', 'delicious', 'smell', 'taste', 'flavour', 'ripe', 'raw', 'cooked',
      'juicy', 'crispy', 'greasy', 'mild', 'stale', 'rotten', 'scent', 'aroma', 'appetite', 'bite', 'sip',
    ],
  },
  {
    slug: 'stories',
    name: { kmr: 'çîrok', ckb: 'چیرۆک' },
    meanings: { en: 'story', de: 'Geschichte', es: 'cuento', fr: 'conte', nl: 'verhaal', tr: 'masal', ar: 'حكاية' },
    words: [
      'story', 'tale', 'legend', 'king', 'prince', 'lord', 'giant', 'ogre', 'treasure', 'adventure', 'secret', 'storyteller', 'hero', 'princess',
      'queen', 'dragon', 'witch', 'fairy', 'magic', 'sword', 'shield', 'crown', 'trick', 'spell', 'curse', 'monster', 'ghost', 'fable', 'myth',
      'epic', 'poem', 'event', 'palace', 'throne', 'knight', 'dwarf', 'wizard', 'genie',
    ],
  },
  {
    slug: 'money',
    name: { kmr: 'pere', ckb: 'پارە' },
    meanings: { en: 'money', de: 'Geld', es: 'dinero', fr: 'argent', nl: 'geld', tr: 'para', ar: 'مال' },
    words: [
      'money', 'price', 'bill', 'debt', 'salary', 'rent', 'kilo', 'expensive', 'cheap', 'gold', 'silver', 'coin', 'banknote', 'wallet', 'purse',
      'cash', 'loan', 'profit', 'loss', 'tax', 'discount', 'receipt', 'customer', 'bargain', 'wage', 'savings', 'cost', 'free', 'rich', 'poor',
      'scales', 'weight', 'measure', 'gram', 'litre', 'metre',
    ],
  },
  {
    slug: 'qualities',
    name: { kmr: 'taybetmendî', ckb: 'تایبەتمەندی' },
    meanings: { en: 'quality', de: 'Eigenschaft', es: 'cualidad', fr: 'qualité', nl: 'eigenschap', tr: 'özellik', ar: 'صفة' },
    words: [
      'big', 'small', 'new', 'old', 'young', 'long', 'short', 'clean', 'dirty', 'heavy', 'light', 'empty', 'full', 'easy', 'difficult', 'hard',
      'deep', 'high', 'tall', 'low', 'far', 'near', 'beautiful', 'pretty', 'nice', 'quiet', 'soft', 'open', 'closed', 'dark', 'wild', 'hidden',
      'strong', 'weak', 'thin', 'fat', 'thick', 'wide', 'narrow', 'fast', 'slow', 'round', 'straight', 'sharp', 'smooth', 'rough', 'broken', 'bad',
      'good', 'better', 'special', 'famous', 'equal', 'same', 'different', 'important', 'necessary', 'true', 'right', 'wrong', 'obvious', 'complete',
      'flawless', 'endless', 'unknown', 'ugly', 'strange', 'simple', 'main', 'traditional', 'shared', 'common', 'comfortable', 'serious',
      'forbidden', 'possible', 'ready', 'safe', 'dangerous', 'alone', 'together', 'bigger', 'more', 'enough', 'few', 'many', 'less',
    ],
  },
  {
    slug: 'character',
    name: { kmr: 'kesayetî', ckb: 'کەسایەتی' },
    meanings: { en: 'character', de: 'Charakter', es: 'carácter', fr: 'caractère', nl: 'karakter', tr: 'karakter', ar: 'شخصية' },
    words: [
      'clever', 'brave', 'gallant', 'cowardly', 'honest', 'loyal', 'kind', 'wise', 'learned', 'foolish', 'funny', 'careful', 'attentive', 'alert',
      'stern', 'strict', 'innocent', 'responsible', 'willing', 'hospitable', 'dear', 'fluent', 'lazy', 'hardworking', 'polite', 'rude', 'generous',
      'stingy', 'shy', 'stubborn', 'friendly', 'curious', 'modest', 'cheerful', 'naughty', 'mind', 'good sense', 'cleverness', 'strength',
      'trustworthy', 'selfish', 'gentle', 'sure', 'certain',
    ],
  },
  {
    slug: 'actions',
    name: { kmr: 'lêker', ckb: 'کردار' },
    meanings: { en: 'action', de: 'Tätigkeit', es: 'acción', fr: 'action', nl: 'handeling', tr: 'eylem', ar: 'فعل' },
    words: [],
    verbs: [
      'run', 'stop', 'wait', 'hide', 'make', 'build', 'sew', 'play', 'light', 'decorate', 'continue', 'keep going', 'cry', 'hurt', 'beat', 'walk',
      'guard', 'protect', 'choose', 'fall', 'enter', 'think', 'go down', 'get off', 'plant', 'send', 'change', 'trick', 'deceive', 'sulk', 'return',
      'eat', 'drink', 'sleep', 'read', 'write', 'speak', 'say', 'see', 'look', 'hear', 'listen', 'go', 'come', 'give', 'take', 'buy', 'sell', 'work',
      'open', 'close', 'sit', 'stand', 'jump', 'swim', 'fly', 'cook', 'wash', 'clean', 'laugh', 'smile', 'sing', 'dance', 'love', 'want', 'know',
      'learn', 'teach', 'ask', 'answer', 'help', 'find', 'lose', 'win', 'carry', 'bring', 'throw', 'catch', 'push', 'pull', 'cut', 'break', 'fix',
      'draw', 'paint', 'count', 'climb', 'ride', 'drive', 'travel', 'visit', 'call', 'meet', 'wake up', 'get up', 'forget', 'remember', 'live',
      'die', 'grow', 'milk', 'bake', 'knit', 'weave', 'pray', 'fight', 'kiss', 'hug',
    ],
  },
  {
    slug: 'culture',
    name: { kmr: 'çand', ckb: 'کولتوور' },
    meanings: { en: 'culture', de: 'Kultur', es: 'cultura', fr: 'culture', nl: 'cultuur', tr: 'kültür', ar: 'ثقافة' },
    words: [
      'culture', 'tradition', 'custom', 'habit', 'heritage', 'hospitality', 'blessing', 'plenty', 'brotherhood', 'friendship', 'honour', 'respect',
      'generation', 'proverb', 'folklore', 'kilim', 'handicraft', 'embroidery', 'history', 'identity', 'religion', 'prayer', 'pilgrimage', 'tribe',
      'keepsake', 'memory', 'art', 'winter evening of stories', 'greeting', 'gratitude', 'mourning', 'vow',
    ],
  },
  {
    slug: 'language',
    name: { kmr: 'ziman', ckb: 'زمان' },
    meanings: { en: 'language', de: 'Sprache', es: 'lengua', fr: 'langue', nl: 'taal', tr: 'dil', ar: 'لغة' },
    words: [
      'language', 'word', 'name', 'meaning', 'news', 'message', 'joke', 'rumour', 'lie', 'truth', 'advice', 'complaint', 'sentence', 'speech',
      'conversation', 'hello', 'thanks', 'sorry', 'goodbye', 'welcome', 'please', 'kurdish', 'dialect', 'grammar', 'translation', 'accent',
      'silence', 'promise', 'oath', 'shout', 'whisper', 'thought', 'idea', 'opinion', 'offer', 'farewell', 'syllable', 'vowel', 'consonant',
    ],
  },
  {
    slug: 'work',
    name: { kmr: 'kar', ckb: 'کار' },
    meanings: { en: 'work', de: 'Arbeit', es: 'trabajo', fr: 'travail', nl: 'werk', tr: 'iş', ar: 'عمل' },
    words: [
      'work', 'contract', 'experience', 'labour', 'effort', 'meeting', 'council', 'opportunity', 'chance', 'goal', 'aim', 'plan', 'programme',
      'success', 'progress', 'problem', 'solution', 'result', 'step', 'task', 'duty', 'project', 'company', 'boss', 'colleague', 'career',
      'interview', 'skill', 'load', 'situation', 'condition', 'preparations', 'service', 'order', 'mistake', 'fault', 'shift', 'strike', 'pension',
      'apprentice', 'workshop',
    ],
  },
  {
    slug: 'travel',
    name: { kmr: 'rêwîtî', ckb: 'گەشت' },
    meanings: { en: 'travel', de: 'Reise', es: 'viaje', fr: 'voyage', nl: 'reis', tr: 'yolculuk', ar: 'سفر' },
    words: [
      'trip', 'journey', 'ticket', 'passenger', 'tourist', 'airport', 'visit', 'outing in the open', 'outing', 'distance', 'suitcase', 'luggage',
      'passport', 'visa', 'map', 'guide', 'souvenir', 'direction', 'arrival', 'departure', 'backpack', 'customs', 'platform', 'harbour', 'port',
      'campsite',
    ],
  },
  {
    slug: 'things',
    name: { kmr: 'tişt', ckb: 'شت' },
    meanings: { en: 'thing', de: 'Ding', es: 'cosa', fr: 'chose', nl: 'ding', tr: 'eşya', ar: 'شيء' },
    words: [
      'phone', 'box', 'photo', 'picture', 'thing', 'umbrella', 'newspaper', 'magazine', 'computer', 'television', 'tv', 'radio', 'camera', 'battery',
      'comb', 'soap', 'towel', 'toothbrush', 'matches', 'lighter', 'envelope', 'stamp', 'screen', 'charger', 'cradle', 'walking stick',
      'prayer beads', 'beads', 'bead', 'string', 'parcel', 'cushion', 'vase', 'frame', 'torch',
    ],
  },
  {
    slug: 'sports',
    name: { kmr: 'werziş', ckb: 'وەرزش' },
    meanings: { en: 'sport', de: 'Sport', es: 'deporte', fr: 'sport', nl: 'sport', tr: 'spor', ar: 'رياضة' },
    words: [
      'goalkeeper', 'football', 'race', 'contest', 'match', 'team', 'player', 'referee', 'swimming', 'wrestling', 'running', 'basketball',
      'volleyball', 'tennis', 'boxing', 'skiing', 'cycling', 'gymnastics', 'medal', 'champion', 'trophy', 'stadium', 'score', 'coach', 'sport',
      'horse riding', 'archery', 'marathon', 'penalty',
    ],
  },
  {
    slug: 'world',
    name: { kmr: 'cîhan', ckb: 'جیهان' },
    meanings: { en: 'world', de: 'Welt', es: 'mundo', fr: 'monde', nl: 'wereld', tr: 'dünya', ar: 'عالم' },
    words: [
      'country', 'homeland', 'world', 'border', 'flag', 'nation', 'capital', 'continent', 'region', 'ocean', 'planet', 'north', 'south', 'east',
      'west', 'europe', 'asia', 'kurdistan', 'equator', 'pole', 'province', 'state', 'abroad',
    ],
  },
];

/** One alternative of a published word's English meaning: what the categories list, and whether it was given as a verb ("to …"). */
interface MeaningPart {
  key: string;
  verb: boolean;
}

/** A meaning's alternatives in the order it gives them, each as the categories list it. */
function meaningParts(en: string): MeaningPart[] {
  return en
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[/,;]| or /)
    .map((part) => {
      const plain = part.replace(/[.!?"“”‘’']/g, ' ').trim();
      return {
        key: plain
          .replace(/^(a|an|the|to|my|your|some)\s+/, '')
          .replace(/\s+/g, ' ')
          .trim(),
        verb: /^to\s+/.test(plain),
      };
    })
    .filter((part) => part.key !== '');
}

/**
 * A published word's English meaning as the categories list them: lower
 * case, without an article or "to", without anything in brackets, each of its
 * alternatives ("cat / kitten", "the cat, a cat") on its own.
 */
export function meaningKeys(en: string): string[] {
  return meaningParts(en).map((part) => part.key);
}

/**
 * The starter category a published word belongs in, by its English meaning,
 * or null: the category of its first alternative that has one. A verb looks
 * among the categories' verbs first, and only then among their words (a
 * category that lists "dance" takes "to dance" where no other lists the verb).
 */
export function starterCategoryOf(en: string | undefined): StarterCategory | null {
  if (!en) return null;
  for (const part of meaningParts(en)) {
    const asVerb = part.verb ? STARTER_CATEGORIES.find((c) => c.verbs?.includes(part.key)) : undefined;
    const found = asVerb ?? STARTER_CATEGORIES.find((c) => c.words.includes(part.key));
    if (found) return found;
  }
  return null;
}
