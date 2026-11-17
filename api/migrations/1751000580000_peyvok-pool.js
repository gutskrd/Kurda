/**
 * The game words: a Peyvok pool big enough for a daily word, rhyme prompts
 * that have partners, and the first Soranî rhyme words.
 *
 * `dict_entries.in_games` is the one pool of words the games choose from:
 * Peyvok's answers, the rhyme rounds' prompts and the words they suggest, and
 * Hevalo's own words in The Last Letter. It held the 79 words of
 * 1751000094000, which made a daily word that came round again within three
 * weeks (21, 22 and 15 good answers in the three bands), four answers that were
 * not dictionary words but inflected forms (mala, dara, gula, navê), a Soranî
 * of the Kurmancî kevan (kewan), and an Arabic loan where the course says ajal
 * (heywan).
 *
 * This migration:
 *
 * - takes those six out of the pool. They stay in the dictionary, so a guess of
 *   one is still a word; they are simply never the answer, nor a prompt.
 * - adds the words the course and the Impostor deck teach as lemmas: lower case,
 *   one word in the Hawar alphabet, never an inflected form or an infinitive
 *   (every pool word of four to eight letters is a Peyvok answer), no
 *   adverbs or function words, and none the word filter refuses. That gives
 *   each band at least 120 answers. Two-and-three-letter words go in for the
 *   rhymes and The Last Letter; Peyvok never sets a word that short.
 * - gives every pool word one meaning (a part of speech and a short English
 *   gloss), so a round's end can say what the word means. A word card's
 *   meanings in every language come first where there is one (word-meanings.ts);
 *   this is the fallback, and it is only written where an entry has no sense.
 * - curates the rhyme prompts (`is_rhyme_prompt`): 150 Kurmancî words, each
 *   with at least eight perfect partners among the pool words by the rime rule
 *   (rhyme.ts), and 80 Soranî, each with eight by Soranî's last-two-letters
 *   rule. Forty curated prompts is what opens a dialect's rhyme rounds
 *   (rhyme-words.ts), so this is what opens Soranî.
 *
 * The words are written out here rather than read from `game_content` at
 * migrate time: a migration says what it did, and a deck edited later must not
 * change what an old migration meant.
 *
 * A word already in the dictionary with the same spelling (an imported lexicon
 * has most of them) is flagged rather than added again, and keeps its own
 * senses. The keys are written as the application writes them (@kurda/shared
 * `letterKey`, `dictionaryKey`, `letterCount`), copied below because a
 * migration is plain JavaScript and cannot import the TypeScript workspace.
 *
 * Every Kurdish word here is on the owner's native-speaker review list; the
 * everyday words the course does not teach yet are kept apart for that.
 */

/** @kurda/shared `letterKey`: lower case, NFC, letters only (ê and e stay different letters). */
function letterKey(word) {
  return word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
}

const FOLD = { ê: 'e', î: 'i', û: 'u', ç: 'c', ş: 's', Ê: 'E', Î: 'I', Û: 'U', Ç: 'C', Ş: 'S' };

/** @kurda/shared `dictionaryKey`: the same letters with the Kurmancî marks folded, which is how an entry is found. */
function dictionaryKey(word) {
  return letterKey(word.normalize('NFC').trim().replace(/[êîûçşÊÎÛÇŞ]/g, (ch) => FOLD[ch] ?? ch));
}

/** @kurda/shared `letterCount`: how many letters a word has, which decides its Peyvok band. */
function letterCount(word) {
  return Array.from(word.normalize('NFC').replace(/[^\p{L}]/gu, '')).length;
}

/** The pool words that stop being answers and prompts: four inflected forms, a misspelling and a loan the course replaces. */
export const OUT_OF_GAMES = ['mala', 'dara', 'gula', 'navê', 'kewan', 'heywan'];

/** The words 1751000094000 put in the pool that stay there, each with the meaning it never had. */
export const KMR_SEEDS = [
  ['roj', 'noun', 'day; sun'], ['mal', 'noun', 'house, home'], ['nan', 'noun', 'bread'], ['bav', 'noun', 'father'], ['dar', 'noun', 'tree; wood'],
  ['gul', 'noun', 'rose, flower'], ['dil', 'noun', 'heart'], ['şev', 'noun', 'night'], ['sor', 'adjective', 'red'], ['reş', 'adjective', 'black'],
  ['sar', 'adjective', 'cold'], ['çem', 'noun', 'river'], ['keç', 'noun', 'girl, daughter'], ['zêr', 'noun', 'gold'], ['kal', 'noun', 'old man'],
  ['war', 'noun', 'homeland; a camping place'], ['gav', 'noun', 'step; moment'], ['gund', 'noun', 'village'], ['dost', 'noun', 'friend'],
  ['kurd', 'noun', 'a Kurd'], ['çiya', 'noun', 'mountain'], ['ronî', 'noun', 'light'], ['masî', 'noun', 'fish'], ['kanî', 'noun', 'spring (of water)'],
  ['deng', 'noun', 'voice, sound'], ['reng', 'noun', 'colour'], ['berf', 'noun', 'snow'], ['êvar', 'noun', 'evening'], ['sibe', 'noun', 'tomorrow; morning'],
  ['heft', 'numeral', 'seven'], ['pênc', 'numeral', 'five'], ['kesk', 'adjective', 'green'], ['xanî', 'noun', 'house'], ['peyv', 'noun', 'word'],
  ['bira', 'noun', 'brother'], ['derî', 'noun', 'door'], ['agir', 'noun', 'fire'], ['çend', 'adverb', 'how many; a few'], ['heval', 'noun', 'friend'],
  ['welat', 'noun', 'country, homeland'], ['ziman', 'noun', 'language; tongue'], ['bajar', 'noun', 'city, town'], ['keçik', 'noun', 'girl'],
  ['mezin', 'adjective', 'big; grown-up'], ['hesin', 'noun', 'iron'], ['kevir', 'noun', 'stone'], ['baran', 'noun', 'rain'],
  ['bahar', 'noun', 'spring (the season)'], ['dayik', 'noun', 'mother'], ['zarok', 'noun', 'child'], ['azadî', 'noun', 'freedom'], ['jiyan', 'noun', 'life'],
  ['stran', 'noun', 'song'], ['mirov', 'noun', 'person, human being'], ['çîrok', 'noun', 'story'], ['gulan', 'noun', 'May (the month)'],
  ['huner', 'noun', 'art'], ['qelem', 'noun', 'pencil, pen'], ['roman', 'noun', 'novel'], ['pirtûk', 'noun', 'book'],
  ['newroz', 'noun', 'Newroz, the new year in spring'], ['govend', 'noun', 'the Kurdish circle dance'], ['welatî', 'noun', 'fellow countryman; citizen'],
  ['biratî', 'noun', 'brotherhood, fellowship'], ['soranî', 'noun', 'Soranî (the language)'], ['defter', 'noun', 'notebook'], ['mamoste', 'noun', 'teacher'],
  ['xwendin', 'noun', 'reading; schooling'], ['helbest', 'noun', 'poem'], ['pencere', 'noun', 'window'], ['kurmancî', 'noun', 'Kurmancî (the language)'],
  ['zimannas', 'noun', 'linguist'], ['stranbêj', 'noun', 'singer'],
];

/** New Kurmancî pool words the course teaches. */
export const KMR_TAUGHT = [
  ['av', 'noun', 'water'], ['çav', 'noun', 'eye'], ['nav', 'noun', 'name'], ['tav', 'noun', 'sunshine, warmth of the sun'], ['bar', 'noun', 'load, burden'],
  ['kar', 'noun', 'work, job'], ['çar', 'numeral', 'four'], ['ban', 'noun', 'flat roof'], ['dev', 'noun', 'mouth'], ['mêr', 'noun', 'man; husband'],
  ['şîn', 'adjective', 'blue'], ['sêv', 'noun', 'apple'], ['şîr', 'noun', 'milk'], ['çay', 'noun', 'tea'], ['dew', 'noun', 'ayran (salted yoghurt drink)'],
  ['ard', 'noun', 'flour'], ['guh', 'noun', 'ear'], ['poz', 'noun', 'nose'], ['mil', 'noun', 'shoulder'], ['zik', 'noun', 'belly'], ['çok', 'noun', 'knee'],
  ['ser', 'noun', 'head'], ['pez', 'noun', 'sheep (the flock)'], ['ker', 'noun', 'donkey'], ['gur', 'noun', 'wolf'], ['mar', 'noun', 'snake'],
  ['hêk', 'noun', 'egg'], ['sal', 'noun', 'year'], ['meh', 'noun', 'month'], ['dem', 'noun', 'time'], ['gir', 'noun', 'hill'], ['gol', 'noun', 'lake'],
  ['kon', 'noun', 'tent'], ['def', 'noun', 'frame drum'], ['jin', 'noun', 'woman; wife'], ['kur', 'noun', 'son, boy'],
  ['mam', 'noun', 'uncle (father’s brother)'], ['xal', 'noun', 'uncle (mother’s brother)'], ['bûk', 'noun', 'bride'], ['xwê', 'noun', 'salt'],
  ['şîv', 'noun', 'supper'], ['jîr', 'adjective', 'clever'], ['baş', 'adjective', 'good'], ['zer', 'adjective', 'yellow'], ['spî', 'adjective', 'white'],
  ['dûr', 'adjective', 'far'], ['dest', 'noun', 'hand'], ['ling', 'noun', 'leg'], ['pişt', 'noun', 'back (of the body)'], ['sing', 'noun', 'chest'],
  ['tilî', 'noun', 'finger'], ['berx', 'noun', 'lamb'], ['hesp', 'noun', 'horse'], ['hirç', 'noun', 'bear'], ['rovî', 'noun', 'fox'],
  ['zava', 'noun', 'bridegroom'], ['şahî', 'noun', 'joy, festivity'], ['cejn', 'noun', 'festival, holiday'], ['zana', 'adjective', 'wise, learned'],
  ['kinc', 'noun', 'clothes'], ['aram', 'adjective', 'calm'], ['hêrs', 'noun', 'anger'], ['hêvî', 'noun', 'hope'],
  ['razî', 'adjective', 'content, agreeing'], ['xewn', 'noun', 'dream'], ['şerm', 'noun', 'shame, shyness'], ['evîn', 'noun', 'love'],
  ['hest', 'noun', 'feeling'], ['goşt', 'noun', 'meat'], ['keşk', 'noun', 'dried curd'], ['mast', 'noun', 'yoghurt'], ['tirî', 'noun', 'grapes'],
  ['mêwe', 'noun', 'fruit'], ['hewş', 'noun', 'yard, courtyard'], ['mase', 'noun', 'table'], ['çira', 'noun', 'lamp'], ['meşk', 'noun', 'goatskin churn'],
  ['sobe', 'noun', 'stove'], ['şûşe', 'noun', 'bottle; glass'], ['nûçe', 'noun', 'news'], ['spas', 'noun', 'thanks'], ['wane', 'noun', 'lesson'],
  ['wêne', 'noun', 'picture, photo'], ['tişt', 'noun', 'thing'], ['pere', 'noun', 'money'], ['biha', 'adjective', 'expensive'],
  ['pîşe', 'noun', 'profession, trade'], ['awaz', 'noun', 'tune, melody'], ['lorî', 'noun', 'lullaby'], ['deşt', 'noun', 'plain (flat land)'],
  ['gelî', 'noun', 'valley, gorge'], ['giya', 'noun', 'grass'], ['heyv', 'noun', 'moon'], ['mêrg', 'noun', 'meadow'], ['zevî', 'noun', 'field'],
  ['hewa', 'noun', 'weather; air'], ['bîst', 'numeral', 'twenty'], ['heşt', 'numeral', 'eight'], ['xort', 'noun', 'young man'],
  ['germ', 'adjective', 'warm, hot'], ['kevn', 'adjective', 'old (of things)'], ['kûvî', 'adjective', 'wild'], ['nerm', 'adjective', 'soft, gentle'],
  ['rast', 'adjective', 'true, right'], ['tarî', 'adjective', 'dark'], ['tije', 'adjective', 'full'], ['vala', 'adjective', 'empty'],
  ['xweş', 'adjective', 'nice, pleasant'], ['hêdî', 'adjective', 'slow'], ['hêja', 'adjective', 'worthy, worthwhile'], ['şano', 'noun', 'theatre'],
  ['trên', 'noun', 'train'], ['dûrî', 'noun', 'distance'], ['stêrk', 'noun', 'star'], ['bihar', 'noun', 'spring (the season)'], ['beran', 'noun', 'ram'],
  ['bizin', 'noun', 'goat'], ['karik', 'noun', 'kid (a young goat)'], ['kûçik', 'noun', 'dog'], ['pisîk', 'noun', 'cat'],
  ['çivîk', 'noun', 'little bird, sparrow'], ['çêlek', 'noun', 'cow'], ['diran', 'noun', 'tooth'], ['hêsir', 'noun', 'tear (from the eye)'],
  ['dawet', 'noun', 'wedding'], ['mêvan', 'noun', 'guest'], ['wêrek', 'adjective', 'brave'], ['kiras', 'noun', 'shirt, dress'], ['pêlav', 'noun', 'shoe'],
  ['nerît', 'noun', 'custom'], ['rûmet', 'noun', 'honour'], ['bapîr', 'noun', 'grandfather'], ['dapîr', 'noun', 'grandmother'],
  ['xaltî', 'noun', 'aunt (mother’s sister)'], ['xwişk', 'noun', 'sister'], ['birçî', 'adjective', 'hungry'], ['xweşî', 'noun', 'joy'],
  ['garis', 'noun', 'maize, corn'], ['hevîr', 'noun', 'dough'], ['penîr', 'noun', 'cheese'], ['taştê', 'noun', 'breakfast'], ['şekir', 'noun', 'sugar'],
  ['derzî', 'noun', 'needle; injection'], ['kuxik', 'noun', 'cough'], ['kulav', 'noun', 'felt rug'], ['kursî', 'noun', 'chair'],
  ['nivîn', 'noun', 'bed, bedding'], ['aşpêj', 'noun', 'cook'], ['hosta', 'noun', 'craftsman, builder'], ['şivan', 'noun', 'shepherd'],
  ['kevçî', 'noun', 'spoon'], ['sifre', 'noun', 'the cloth a meal is laid on'], ['tenûr', 'noun', 'clay oven for bread'], ['derew', 'noun', 'lie'],
  ['peyam', 'noun', 'message'], ['raman', 'noun', 'thought, idea'], ['rastî', 'noun', 'truth'], ['silav', 'noun', 'greeting, hello'],
  ['şîret', 'noun', 'advice'], ['gotar', 'noun', 'speech; article'], ['çewtî', 'noun', 'mistake'], ['erzan', 'adjective', 'cheap'],
  ['bilûr', 'noun', 'shepherd’s flute'], ['dahol', 'noun', 'big drum'], ['kilam', 'noun', 'a dengbêj’s sung tale'], ['zirne', 'noun', 'zurna (the shawm)'],
  ['çepik', 'noun', 'clapping'], ['asman', 'noun', 'sky'], ['zinar', 'noun', 'cliff, big rock'], ['zozan', 'noun', 'summer pasture in the mountains'],
  ['şitil', 'noun', 'sapling'], ['dûman', 'noun', 'smoke'], ['pêncî', 'numeral', 'fifty'], ['hezar', 'numeral', 'a thousand'], ['yekem', 'numeral', 'first'],
  ['duyem', 'numeral', 'second'], ['cîran', 'noun', 'neighbour'], ['xwedî', 'noun', 'owner'], ['bihêz', 'adjective', 'strong'],
  ['biçûk', 'adjective', 'small'], ['ciwan', 'adjective', 'young; beautiful'], ['dirêj', 'adjective', 'long'], ['giran', 'adjective', 'heavy'],
  ['girtî', 'adjective', 'closed'], ['lawaz', 'adjective', 'thin, frail'], ['nêzîk', 'adjective', 'near'], ['sivik', 'adjective', 'light (not heavy)'],
  ['amade', 'adjective', 'ready'], ['şiyar', 'adjective', 'awake'], ['tenik', 'adjective', 'thin'], ['nebaş', 'adjective', 'bad'],
  ['çêtir', 'adjective', 'better'], ['mijar', 'noun', 'subject, topic'], ['bûyer', 'noun', 'event'], ['bêtam', 'adjective', 'tasteless'],
  ['şîrîn', 'adjective', 'sweet'], ['havîn', 'noun', 'summer'], ['payîz', 'noun', 'autumn'], ['hefte', 'noun', 'week'], ['nîvro', 'noun', 'noon'],
  ['sibeh', 'noun', 'morning'], ['xulek', 'noun', 'minute'], ['selik', 'noun', 'basket'], ['werîs', 'noun', 'rope'], ['bazar', 'noun', 'market'],
  ['dikan', 'noun', 'shop'], ['firne', 'noun', 'bakery'], ['kolan', 'noun', 'street'], ['taksî', 'noun', 'taxi'], ['bilêt', 'noun', 'ticket'],
  ['nexşe', 'noun', 'map'], ['pîvaz', 'noun', 'onion'], ['baxçe', 'noun', 'garden, orchard'], ['êzing', 'noun', 'firewood'], ['bahoz', 'noun', 'storm'],
  ['dilop', 'noun', 'drop (of water)'], ['serma', 'noun', 'the cold'], ['civîn', 'noun', 'meeting'], ['ezmûn', 'noun', 'experience'],
  ['mirîşk', 'noun', 'hen'], ['simbêl', 'noun', 'moustache'], ['diyarî', 'noun', 'present, gift'], ['rojbûn', 'noun', 'birthday'],
  ['sersal', 'noun', 'New Year (the first of January)'], ['hişyar', 'adjective', 'alert, careful'], ['rastgo', 'adjective', 'honest'],
  ['xwarzî', 'noun', 'a sister’s child'], ['bawerî', 'noun', 'trust; belief'], ['xemgîn', 'adjective', 'sad'], ['şermok', 'adjective', 'shy'],
  ['hingiv', 'noun', 'honey'], ['nîvişk', 'noun', 'butter'], ['derman', 'noun', 'medicine'], ['nexweş', 'adjective', 'ill'], ['dergeh', 'noun', 'gate'],
  ['ajovan', 'noun', 'driver'], ['cotkar', 'noun', 'farmer'], ['dadwer', 'noun', 'judge'], ['doktor', 'noun', 'doctor'], ['karker', 'noun', 'worker'],
  ['nanpêj', 'noun', 'baker'], ['wergêr', 'noun', 'translator'], ['tilîlî', 'noun', 'ululation (the women’s joyful trill)'], ['kulîlk', 'noun', 'flower'],
  ['hejdeh', 'numeral', 'eighteen'], ['hivdeh', 'numeral', 'seventeen'], ['nozdeh', 'numeral', 'nineteen'], ['sêzdeh', 'numeral', 'thirteen'],
  ['yazdeh', 'numeral', 'eleven'], ['çardeh', 'numeral', 'fourteen'], ['guhdar', 'noun', 'listener'], ['bilind', 'adjective', 'high, tall'],
  ['bêdeng', 'adjective', 'quiet'], ['navdar', 'adjective', 'famous'], ['pêwîst', 'adjective', 'necessary'], ['qedexe', 'adjective', 'forbidden'],
  ['vekirî', 'adjective', 'open'], ['xweşik', 'adjective', 'beautiful'], ['dereng', 'adjective', 'late'], ['girîng', 'adjective', 'important'],
  ['taybet', 'adjective', 'special'], ['bijare', 'adjective', 'favourite, chosen'], ['avjenî', 'noun', 'swimming'], ['nehênî', 'noun', 'secret'],
  ['efsane', 'noun', 'legend'], ['sindoq', 'noun', 'box, chest'], ['otobûs', 'noun', 'bus'], ['serdan', 'noun', 'visit'],
  ['seyran', 'noun', 'an outing in the open'], ['kartol', 'noun', 'potato'], ['berhem', 'noun', 'harvest, produce'], ['simbil', 'noun', 'ear of wheat'],
  ['birûsk', 'noun', 'lightning'], ['armanc', 'noun', 'goal, aim'], ['derfet', 'noun', 'opportunity, chance'], ['biryar', 'noun', 'decision'],
  ['destûr', 'noun', 'permission'], ['lîstik', 'noun', 'game; play'], ['malbat', 'noun', 'family'], ['rêwîtî', 'noun', 'journey'],
  ['xwarin', 'noun', 'food; meal'], ['bêguneh', 'adjective', 'innocent'], ['destmal', 'noun', 'handkerchief'], ['bereket', 'noun', 'blessing, plenty'],
  ['hevaltî', 'noun', 'friendship'], ['şevbêrk', 'noun', 'a winter evening of stories by the fire'], ['dilteng', 'adjective', 'sad, heavy-hearted'],
  ['dilxweş', 'adjective', 'glad, pleased'], ['matmayî', 'adjective', 'amazed'], ['spasdar', 'adjective', 'grateful, thankful'],
  ['firavîn', 'noun', 'lunch'], ['dengbêj', 'noun', 'a singer of the old sung tales'], ['hemşîre', 'noun', 'nurse'], ['panzdeh', 'numeral', 'fifteen'],
  ['şanzdeh', 'numeral', 'sixteen'], ['pêşbirk', 'noun', 'contest, race'], ['telefon', 'noun', 'phone'], ['berbang', 'noun', 'dawn'],
  ['balafir', 'noun', 'aeroplane'], ['minîbûs', 'noun', 'minibus'], ['germahî', 'noun', 'warmth, heat'], ['bername', 'noun', 'programme, plan'],
  ['alîkarî', 'noun', 'help'], ['betlane', 'noun', 'holiday, vacation'], ['bêhempa', 'adjective', 'unique, unmatched'], ['evîndar', 'adjective', 'in love'],
  ['serçopî', 'noun', 'leader of the govend'], ['henekbaz', 'adjective', 'funny; a joker'], ['dilgermî', 'noun', 'enthusiasm, warm-heartedness'],
  ['dikandar', 'noun', 'shopkeeper'], ['firoşkar', 'noun', 'seller'], ['hesinkar', 'noun', 'blacksmith'], ['nivîskar', 'noun', 'writer'],
  ['pêşniyar', 'noun', 'proposal, suggestion'], ['çîrokbêj', 'noun', 'storyteller'], ['daristan', 'noun', 'forest'], ['demjimêr', 'noun', 'hour; clock'],
  ['zarokatî', 'noun', 'childhood'], ['zivistan', 'noun', 'winter'], ['nêrdewan', 'noun', 'ladder'], ['bacansor', 'noun', 'tomato'],
  ['çareserî', 'noun', 'solution'], ['dibistan', 'noun', 'school'], ['bextewar', 'adjective', 'happy, fortunate'],
  ['dengxweş', 'adjective', 'with a fine voice'], ['serkeftî', 'adjective', 'successful'],
];

/** New Kurmancî pool words of everyday speech that the course does not teach yet: the review list shows them apart. */
export const KMR_EVERYDAY = [
  ['can', 'noun', 'soul; dear one'], ['şêr', 'noun', 'lion'], ['kêr', 'noun', 'knife'], ['têr', 'adjective', 'full (after eating)'],
  ['kew', 'noun', 'partridge'], ['kûr', 'adjective', 'deep'], ['zîv', 'noun', 'silver'], ['birû', 'noun', 'eyebrow'], ['mejî', 'noun', 'brain'],
  ['xwîn', 'noun', 'blood'], ['pirç', 'noun', 'hair (of the body); fur'], ['mişk', 'noun', 'mouse'], ['kûsî', 'noun', 'tortoise'], ['kund', 'noun', 'owl'],
  ['hişk', 'adjective', 'dry; stern'], ['gore', 'noun', 'sock'], ['puşî', 'noun', 'fringed head scarf'], ['gewr', 'adjective', 'grey'],
  ['nifş', 'noun', 'generation'], ['nevî', 'noun', 'grandchild'], ['tirs', 'noun', 'fear'], ['nîsk', 'noun', 'lentils'], ['pûng', 'noun', 'wild mint'],
  ['îsot', 'noun', 'hot pepper'], ['qutî', 'noun', 'box, tin'], ['sênî', 'noun', 'tray'], ['tawe', 'noun', 'frying pan'], ['sond', 'noun', 'oath'],
  ['wate', 'noun', 'meaning'], ['pirs', 'noun', 'question'], ['name', 'noun', 'letter (that you post)'], ['zerf', 'noun', 'envelope'],
  ['deyn', 'noun', 'debt'], ['kirê', 'noun', 'rent'], ['mûçe', 'noun', 'salary'], ['nirx', 'noun', 'price, value'], ['qeşa', 'noun', 'ice'],
  ['şêst', 'numeral', 'sixty'], ['nizm', 'adjective', 'low'], ['rind', 'adjective', 'nice, pretty'], ['kurt', 'adjective', 'short'],
  ['teng', 'adjective', 'narrow, tight'], ['bêhn', 'noun', 'smell; breath'], ['teze', 'adjective', 'fresh'], ['tirş', 'adjective', 'sour'],
  ['dawî', 'noun', 'end'], ['kêlî', 'noun', 'moment'], ['kela', 'noun', 'castle, fortress'], ['otêl', 'noun', 'hotel'], ['geşt', 'noun', 'trip, journey'],
  ['rêwî', 'noun', 'traveller'], ['axur', 'noun', 'stable'], ['rewş', 'noun', 'situation, condition'], ['kevok', 'noun', 'pigeon, dove'],
  ['kevan', 'noun', 'bow; arch'], ['xezal', 'noun', 'gazelle'], ['hêlîn', 'noun', 'nest'], ['kêzik', 'noun', 'insect, bug'], ['hestî', 'noun', 'bone'],
  ['nînok', 'noun', 'fingernail'], ['delal', 'adjective', 'dear, lovely'], ['zîrek', 'adjective', 'clever, skilful'], ['rewan', 'adjective', 'fluent'],
  ['guhar', 'noun', 'earring'], ['lepik', 'noun', 'glove'], ['pembe', 'adjective', 'pink'], ['zêrîn', 'adjective', 'golden'], ['mîras', 'noun', 'heritage'],
  ['bêzar', 'adjective', 'bored, fed up'], ['qehwe', 'noun', 'coffee'], ['savar', 'noun', 'bulgur'], ['şorbe', 'noun', 'soup'], ['gêlas', 'noun', 'cherry'],
  ['hejîr', 'noun', 'fig'], ['hinar', 'noun', 'pomegranate'], ['hirmî', 'noun', 'pear'], ['lîmon', 'noun', 'lemon'], ['petêx', 'noun', 'melon'],
  ['zebeş', 'noun', 'watermelon'], ['birîn', 'noun', 'wound'], ['serêş', 'noun', 'headache'], ['zikêş', 'noun', 'stomach ache'], ['balîf', 'noun', 'pillow'],
  ['dîwar', 'noun', 'wall'], ['kilît', 'noun', 'key'], ['lihêf', 'noun', 'quilt'], ['polîs', 'noun', 'police officer'], ['terzî', 'noun', 'tailor'],
  ['beroş', 'noun', 'cooking pot'], ['qedeh', 'noun', 'drinking glass'], ['çetel', 'noun', 'fork'], ['gazin', 'noun', 'complaint'],
  ['henek', 'noun', 'joke'], ['kurdî', 'noun', 'Kurdish (the language)'], ['hesab', 'noun', 'bill; sum'], ['derya', 'noun', 'sea'],
  ['heftê', 'numeral', 'seventy'], ['heştê', 'numeral', 'eighty'], ['bêhêz', 'adjective', 'weak'], ['hêsan', 'adjective', 'easy'],
  ['paqij', 'adjective', 'clean'], ['qirêj', 'adjective', 'dirty'], ['zelal', 'adjective', 'clear (of water or sky)'], ['fireh', 'adjective', 'wide'],
  ['zirav', 'adjective', 'thin, slender'], ['azmûn', 'noun', 'exam'], ['jêbir', 'noun', 'eraser'], ['lîste', 'noun', 'list'], ['pênûs', 'noun', 'pen'],
  ['çente', 'noun', 'bag, schoolbag'], ['gulaş', 'noun', 'wrestling'], ['kişik', 'noun', 'chess'], ['xelat', 'noun', 'prize'],
  ['efsûn', 'noun', 'magic spell'], ['kaxez', 'noun', 'paper'], ['radyo', 'noun', 'radio'], ['bivir', 'noun', 'axe'], ['mişar', 'noun', 'saw (the tool)'],
  ['çakûç', 'noun', 'hammer'], ['keştî', 'noun', 'ship'], ['qeyik', 'noun', 'boat'], ['bavul', 'noun', 'suitcase'], ['gêzer', 'noun', 'carrot'],
  ['kelem', 'noun', 'cabbage'], ['xiyar', 'noun', 'cucumber'], ['bêder', 'noun', 'threshing floor'], ['genim', 'noun', 'wheat'], ['zîpik', 'noun', 'hail'],
  ['encam', 'noun', 'result'], ['sînor', 'noun', 'border'], ['xebat', 'noun', 'work, effort'], ['werdek', 'noun', 'duck'], ['hêştir', 'noun', 'camel'],
  ['kulîçe', 'noun', 'a round festive biscuit'], ['şîranî', 'noun', 'sweets'], ['baldar', 'adjective', 'careful, attentive'],
  ['dilsoz', 'adjective', 'loyal'], ['mêrxas', 'adjective', 'brave, gallant'], ['gustîl', 'noun', 'ring (worn on the finger)'], ['kember', 'noun', 'belt'],
  ['pantol', 'noun', 'trousers'], ['pismam', 'noun', 'cousin (father’s brother’s son)'], ['poşman', 'adjective', 'regretful, sorry'],
  ['birinc', 'noun', 'rice'], ['zeytûn', 'noun', 'olive'], ['şerbet', 'noun', 'sherbet (a sweet cold drink)'], ['mişmiş', 'noun', 'apricot'],
  ['betanî', 'noun', 'blanket'], ['neynik', 'noun', 'mirror'], ['serşok', 'noun', 'bathroom'], ['xalîçe', 'noun', 'carpet, rug'], ['fîncan', 'noun', 'cup'],
  ['sarinc', 'noun', 'fridge'], ['bêpere', 'adjective', 'free (of charge)'], ['qezenc', 'noun', 'profit'], ['tembûr', 'noun', 'the long-necked lute'],
  ['şikeft', 'noun', 'cave'], ['çaryek', 'noun', 'a quarter'], ['dijwar', 'adjective', 'difficult'], ['bersiv', 'noun', 'answer'],
  ['xetkêş', 'noun', 'ruler'], ['futbol', 'noun', 'football'], ['destan', 'noun', 'epic (a long heroic tale)'], ['leheng', 'noun', 'hero'],
  ['sindan', 'noun', 'anvil'], ['navend', 'noun', 'centre'], ['kamyon', 'noun', 'lorry, truck'], ['kundir', 'noun', 'courgette, squash'],
  ['peyman', 'noun', 'agreement'], ['netewe', 'noun', 'nation'], ['zengil', 'noun', 'bell'], ['bêdawî', 'adjective', 'endless'],
  ['dilovan', 'adjective', 'kind'], ['dilxwaz', 'noun', 'volunteer'], ['hişmend', 'adjective', 'wise'], ['berçavk', 'noun', 'glasses'],
  ['gerdenî', 'noun', 'necklace'], ['qehweyî', 'adjective', 'brown'], ['hêvîdar', 'adjective', 'hopeful'], ['nexweşî', 'noun', 'illness'],
  ['pêlekan', 'noun', 'stairs'], ['bêrîvan', 'noun', 'milkmaid at the summer pasture'], ['parêzer', 'noun', 'lawyer'], ['rêveber', 'noun', 'director, head'],
  ['wênekêş', 'noun', 'photographer'], ['çaydank', 'noun', 'teapot'], ['bêdengî', 'noun', 'silence'], ['gencîne', 'noun', 'treasure'],
  ['padîşah', 'noun', 'king'], ['pîrejin', 'noun', 'old woman'], ['veşartî', 'adjective', 'hidden'], ['zanyarî', 'noun', 'information'],
  ['metelok', 'noun', 'riddle'], ['destpêk', 'noun', 'beginning'], ['paşeroj', 'noun', 'the future'], ['traktor', 'noun', 'tractor'],
  ['trimbêl', 'noun', 'car'], ['geştyar', 'noun', 'tourist'], ['okyanûs', 'noun', 'ocean'], ['paytext', 'noun', 'capital (city)'],
  ['pirpirok', 'noun', 'butterfly'], ['kevneşop', 'noun', 'tradition'], ['porteqal', 'noun', 'orange (the fruit)'], ['endezyar', 'noun', 'engineer'],
  ['kompîter', 'noun', 'computer'], ['muzexane', 'noun', 'museum'], ['bisîklet', 'noun', 'bicycle'], ['pasaport', 'noun', 'passport'],
  ['bacanreş', 'noun', 'aubergine'], ['keskesor', 'noun', 'rainbow'], ['gerstêrk', 'noun', 'planet'], ['parzemîn', 'noun', 'continent'],
];

/** The Kurmancî rhyme prompts. */
export const KMR_PROMPTS = [
  'baran', 'ziman', 'jiyan', 'stran', 'nan', 'can', 'beran', 'diran', 'mêvan', 'şivan', 'asman', 'zozan', 'dûman', 'cîran', 'ciwan', 'giran', 'hêsan',
  'dikan', 'kolan', 'derman', 'ajovan', 'fîncan', 'destan', 'serdan', 'ban', 'dilovan', 'daristan', 'zivistan', 'raman', 'erzan', 'dar', 'sar', 'war',
  'êvar', 'bajar', 'bihar', 'bar', 'kar', 'guhar', 'hinar', 'dîwar', 'gotar', 'zinar', 'hezar', 'şiyar', 'mijar', 'mişar', 'bazar', 'xiyar', 'hişyar',
  'cotkar', 'navdar', 'biryar', 'spasdar', 'dikandar', 'firoşkar', 'nivîskar', 'savar', 'dijwar', 'evîndar', 'keçik', 'dayik', 'karik', 'kûçik', 'kêzik',
  'lepik', 'çepik', 'sivik', 'kişik', 'selik', 'qeyik', 'zîpik', 'neynik', 'xweşik', 'lîstik', 'huner', 'defter', 'ser', 'bûyer', 'gêzer', 'kember',
  'karker', 'dadwer', 'zer', 'rêveber', 'meh', 'qedeh', 'sibeh', 'dergeh', 'yazdeh', 'çardeh', 'şîn', 'evîn', 'hêlîn', 'zêrîn', 'nivîn', 'şîrîn', 'havîn',
  'civîn', 'xemgîn', 'firavîn', 'mal', 'heval', 'sal', 'xezal', 'delal', 'zelal', 'destmal', 'porteqal', 'agir', 'kevir', 'gir', 'hêsir', 'şekir', 'bivir',
  'hêştir', 'balafir', 'av', 'çav', 'nav', 'tav', 'gav', 'pêlav', 'silav', 'bav', 'zarok', 'çîrok', 'kevok', 'pirpirok', 'metelok', 'şermok', 'derî', 'masî',
  'kanî', 'xanî', 'azadî', 'kurdî', 'kursî', 'keştî', 'rovî', 'zevî', 'diyarî', 'hêvî', 'kevçî', 'tirî', 'xweşî', 'hirmî', 'hestî', 'avjenî', 'nehênî',
];

/**
 * Soranî rhyme words: families sharing their last two letters (ـان، ـار، ـاو، ـەر, and seven more), so each prompt below
 * has at least eight partners. Spelt as the course and the Impostor deck spell them (ه for h, ی and ک).
 */
export const CKB_WORDS = [
  ['باران', 'noun', 'rain'], ['نان', 'noun', 'bread'], ['شوان', 'noun', 'shepherd'], ['میوان', 'noun', 'guest'], ['ئاسمان', 'noun', 'sky'],
  ['زستان', 'noun', 'winter'], ['گیان', 'noun', 'soul; dear one'], ['جوان', 'adjective', 'beautiful; young'], ['ژیان', 'noun', 'life'],
  ['زمان', 'noun', 'language; tongue'], ['ددان', 'noun', 'tooth'], ['دوکان', 'noun', 'shop'], ['دارستان', 'noun', 'forest'], ['دەرمان', 'noun', 'medicine'],
  ['کاروان', 'noun', 'caravan'], ['پاڵەوان', 'noun', 'champion, hero'], ['ئاسان', 'adjective', 'easy'], ['نیشتمان', 'noun', 'homeland'],
  ['شان', 'noun', 'shoulder'], ['داستان', 'noun', 'epic (a long heroic tale)'], ['سەیران', 'noun', 'an outing in the countryside'],
  ['سندان', 'noun', 'anvil'], ['گران', 'adjective', 'expensive; heavy'], ['هەرزان', 'adjective', 'cheap'], ['کەمان', 'noun', 'violin; bow'],
  ['مەلەوان', 'noun', 'swimmer'], ['خەرمان', 'noun', 'heap of harvested grain'], ['پەشیمان', 'adjective', 'regretful, sorry'], ['دار', 'noun', 'tree'],
  ['شار', 'noun', 'city'], ['کار', 'noun', 'work, job'], ['بار', 'noun', 'load, burden'], ['بەهار', 'noun', 'spring (the season)'],
  ['هەژار', 'adjective', 'poor'], ['بازار', 'noun', 'market'], ['دیوار', 'noun', 'wall'], ['بڕیار', 'noun', 'decision'], ['هەنار', 'noun', 'pomegranate'],
  ['جووتیار', 'noun', 'farmer'], ['خوێندکار', 'noun', 'student'], ['سوار', 'noun', 'rider'], ['ڕووبار', 'noun', 'river'],
  ['گوڵزار', 'noun', 'flower garden'], ['دیدار', 'noun', 'meeting, reunion'], ['یار', 'noun', 'beloved'], ['هاوار', 'noun', 'a cry for help, shout'],
  ['ئەندازیار', 'noun', 'engineer'], ['مار', 'noun', 'snake'], ['پەرستار', 'noun', 'nurse'], ['دوکاندار', 'noun', 'shopkeeper'],
  ['مشار', 'noun', 'saw (the tool)'], ['بزمار', 'noun', 'nail (for wood)'], ['ئاگادار', 'adjective', 'aware, informed'], ['ڕەفتار', 'noun', 'behaviour'],
  ['ئاو', 'noun', 'water'], ['چاو', 'noun', 'eye'], ['ناو', 'noun', 'name'], ['هەتاو', 'noun', 'sunshine'], ['پێڵاو', 'noun', 'shoe'],
  ['کڵاو', 'noun', 'cap, hat'], ['پیاو', 'noun', 'man'], ['ڕاو', 'noun', 'hunting'], ['گوڵاو', 'noun', 'rose water'], ['سەر', 'noun', 'head'],
  ['هونەر', 'noun', 'art'], ['سەفەر', 'noun', 'journey'], ['نووسەر', 'noun', 'writer'], ['دەفتەر', 'noun', 'notebook'], ['ڕێبەر', 'noun', 'guide, leader'],
  ['خەبەر', 'noun', 'news'], ['ئاسنگەر', 'noun', 'blacksmith'], ['شەمەندەفەر', 'noun', 'train'], ['گەوهەر', 'noun', 'jewel'],
  ['بەر', 'noun', 'fruit (of a tree); front'], ['کەر', 'noun', 'donkey'], ['هاوسەر', 'noun', 'husband or wife'], ['ساوەر', 'noun', 'bulgur'],
  ['زێڕنگەر', 'noun', 'goldsmith'], ['ماڵ', 'noun', 'house, home'], ['منداڵ', 'noun', 'child'], ['ساڵ', 'noun', 'year'], ['باڵ', 'noun', 'wing'],
  ['پرتەقاڵ', 'noun', 'orange (the fruit)'], ['شمشاڵ', 'noun', 'shepherd’s flute'], ['هەواڵ', 'noun', 'news'], ['خاڵ', 'noun', 'uncle (mother’s brother)'],
  ['چەتاڵ', 'noun', 'fork'], ['شەڕواڵ', 'noun', 'the wide traditional trousers'], ['خۆشحاڵ', 'adjective', 'happy, glad'], ['هاوین', 'noun', 'summer'],
  ['هەنگوین', 'noun', 'honey'], ['شیرین', 'adjective', 'sweet'], ['ڕەنگین', 'adjective', 'colourful'], ['شین', 'adjective', 'blue'],
  ['سەرین', 'noun', 'pillow'], ['ژین', 'noun', 'life'], ['خەمگین', 'adjective', 'sad'], ['بەرین', 'adjective', 'wide'], ['گۆرانی', 'noun', 'song'],
  ['بەیانی', 'noun', 'morning'], ['کانی', 'noun', 'spring (of water)'], ['جوانی', 'noun', 'beauty'], ['شیرینی', 'noun', 'sweets'],
  ['بەتانی', 'noun', 'blanket'], ['سینی', 'noun', 'tray'], ['مەلەوانی', 'noun', 'swimming'], ['میوانی', 'noun', 'a meal for guests, hospitality'],
  ['هەور', 'noun', 'cloud'], ['تەنوور', 'noun', 'clay oven for bread'], ['ژوور', 'noun', 'room'], ['سوور', 'adjective', 'red'],
  ['تەمبوور', 'noun', 'the long-necked lute'], ['پوور', 'noun', 'aunt (father’s sister)'], ['تەور', 'noun', 'axe'], ['دوور', 'adjective', 'far'],
  ['نوور', 'noun', 'light'], ['پەنیر', 'noun', 'cheese'], ['هەنجیر', 'noun', 'fig'], ['باپیر', 'noun', 'grandfather'], ['داپیر', 'noun', 'grandmother'],
  ['شیر', 'noun', 'milk'], ['میر', 'noun', 'prince, lord'], ['پیر', 'adjective', 'old (of people)'], ['ژیر', 'adjective', 'wise, sensible'],
  ['بیر', 'noun', 'thought; memory'], ['بەرد', 'noun', 'stone'], ['پرد', 'noun', 'bridge'], ['گرد', 'noun', 'hill'], ['زەرد', 'adjective', 'yellow'],
  ['کورد', 'noun', 'a Kurd'], ['سەرد', 'adjective', 'cold'], ['ورد', 'adjective', 'small, fine'], ['مێرد', 'noun', 'husband'],
  ['پیرەمێرد', 'noun', 'old man'], ['قەڵەم', 'noun', 'pen, pencil'], ['بەلەم', 'noun', 'boat'], ['دەم', 'noun', 'mouth'], ['تەم', 'noun', 'fog, mist'],
  ['خەم', 'noun', 'sorrow, worry'], ['کەم', 'adjective', 'little, few'], ['چەم', 'noun', 'river'], ['یەکەم', 'numeral', 'first'],
  ['دووەم', 'numeral', 'second'],
];

/** The Soranî rhyme prompts. */
export const CKB_PROMPTS = [
  'باران', 'نان', 'شوان', 'میوان', 'ئاسمان', 'زستان', 'گیان', 'جوان', 'ژیان', 'زمان', 'ددان', 'دوکان', 'دارستان', 'دەرمان', 'کاروان', 'پاڵەوان', 'ئاسان',
  'نیشتمان', 'دار', 'شار', 'کار', 'بار', 'بەهار', 'هەژار', 'بازار', 'دیوار', 'بڕیار', 'هەنار', 'جووتیار', 'خوێندکار', 'سوار', 'ڕووبار', 'گوڵزار', 'دیدار',
  'ئاو', 'چاو', 'ناو', 'هەتاو', 'پێڵاو', 'سەر', 'هونەر', 'سەفەر', 'نووسەر', 'دەفتەر', 'ڕێبەر', 'خەبەر', 'ئاسنگەر', 'شەمەندەفەر', 'گەوهەر', 'ماڵ', 'منداڵ',
  'ساڵ', 'باڵ', 'پرتەقاڵ', 'شمشاڵ', 'هەواڵ', 'هاوین', 'هەنگوین', 'شیرین', 'ڕەنگین', 'گۆرانی', 'بەیانی', 'کانی', 'جوانی', 'هەور', 'تەنوور', 'ژوور', 'سوور',
  'پەنیر', 'هەنجیر', 'باپیر', 'داپیر', 'بەرد', 'پرد', 'گرد', 'زەرد', 'قەڵەم', 'بەلەم', 'دەم', 'تەم',
];

const MIGRATION = '1751000580000_peyvok-pool';

const lit = (s) => `'${s.replace(/'/g, "''")}'`;

/** One VALUES list of words with their keys, part of speech and meaning. */
function values(words) {
  return words
    .map(([word, pos, en]) => `(${lit(word)}, ${lit(letterKey(word))}, ${lit(dictionaryKey(word))}, ${letterCount(word)}, ${lit(pos)}, ${lit(en)})`)
    .join(',\n       ');
}

function list(words) {
  return words.map(lit).join(', ');
}

/** Flag the words that are there, add the ones that are not, and give each a meaning where it has none. */
function addWords(pgm, dialect, words) {
  const v = values(words);
  // the same spelling in the same dialect is the same word: flag it, whatever else an import said about it
  pgm.sql(
    `UPDATE dict_entries e SET in_games = true
       FROM (VALUES ${v}) AS v(hw, norm, folded, letters, pos, en)
      WHERE e.dialect = ${lit(dialect)} AND e.headword_folded = v.folded AND e.headword = v.hw AND NOT e.in_games;`,
  );
  pgm.sql(
    `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games, letter_count)
     SELECT v.hw, v.norm, v.folded, ${lit(dialect)}, true, v.letters
       FROM (VALUES ${v}) AS v(hw, norm, folded, letters, pos, en)
      WHERE NOT EXISTS (SELECT 1 FROM dict_entries d WHERE d.dialect = ${lit(dialect)} AND d.headword_folded = v.folded AND d.headword = v.hw);`,
  );
  pgm.sql(
    `INSERT INTO dict_senses (entry_id, position, pos, definition_en)
     SELECT e.id, 1, v.pos, v.en
       FROM (VALUES ${v}) AS v(hw, norm, folded, letters, pos, en)
       JOIN dict_entries e ON e.dialect = ${lit(dialect)} AND e.headword_folded = v.folded AND e.headword = v.hw
      WHERE NOT EXISTS (SELECT 1 FROM dict_senses s WHERE s.entry_id = e.id);`,
  );
}

export const up = (pgm) => {
  pgm.sql(
    `UPDATE dict_entries SET in_games = false, is_rhyme_prompt = false
      WHERE dialect = 'kurmanji' AND headword IN (${list(OUT_OF_GAMES)});`,
  );
  addWords(pgm, 'kurmanji', [...KMR_SEEDS, ...KMR_TAUGHT, ...KMR_EVERYDAY]);
  addWords(pgm, 'sorani', CKB_WORDS);
  pgm.sql(`UPDATE dict_entries SET is_rhyme_prompt = true WHERE in_games AND dialect = 'kurmanji' AND headword IN (${list(KMR_PROMPTS)});`);
  pgm.sql(`UPDATE dict_entries SET is_rhyme_prompt = true WHERE in_games AND dialect = 'sorani' AND headword IN (${list(CKB_PROMPTS)});`);
};

/**
 * Undo, as far as the database can say what this did. Entries it inserted were
 * stamped with the transaction's time, which is also this migration's `run_on`:
 * those go, with their senses. A meaning it gave an entry that was there
 * already goes if it is still exactly this one. The six words come back into
 * the pool, the prompts are no longer curated, and the words it flagged leave
 * the pool again, except the ones 1751000094000 put there. (A word an admin had
 * flagged by hand before this ran cannot be told apart, and leaves with them.)
 */
export const down = (pgm) => {
  const kmr = [...KMR_SEEDS, ...KMR_TAUGHT, ...KMR_EVERYDAY];
  for (const [dialect, words] of [['kurmanji', kmr], ['sorani', CKB_WORDS]]) {
    const v = values(words);
    pgm.sql(
      `DELETE FROM dict_entries e
        USING (VALUES ${v}) AS v(hw, norm, folded, letters, pos, en), pgmigrations m
        WHERE m.name = ${lit(MIGRATION)} AND e.dialect = ${lit(dialect)} AND e.headword_folded = v.folded AND e.headword = v.hw
          AND e.created_at BETWEEN m.run_on - interval '1 minute' AND m.run_on;`,
    );
    pgm.sql(
      `DELETE FROM dict_senses s
        USING dict_entries e, (VALUES ${v}) AS v(hw, norm, folded, letters, pos, en)
        WHERE s.entry_id = e.id AND e.dialect = ${lit(dialect)} AND e.headword_folded = v.folded AND e.headword = v.hw
          AND s.position = 1 AND s.pos = v.pos AND s.definition_en = v.en AND s.definition_ku IS NULL;`,
    );
    pgm.sql(`UPDATE dict_entries SET is_rhyme_prompt = false WHERE dialect = ${lit(dialect)} AND headword IN (${list(dialect === 'sorani' ? CKB_PROMPTS : KMR_PROMPTS)});`);
  }
  pgm.sql(
    `UPDATE dict_entries SET in_games = false
      WHERE dialect = 'kurmanji' AND headword IN (${list([...KMR_TAUGHT, ...KMR_EVERYDAY].map(([w]) => w))});`,
  );
  pgm.sql(`UPDATE dict_entries SET in_games = false WHERE dialect = 'sorani' AND headword IN (${list(CKB_WORDS.map(([w]) => w))});`);
  pgm.sql(`UPDATE dict_entries SET in_games = true WHERE dialect = 'kurmanji' AND headword IN (${list(OUT_OF_GAMES)});`);
};
