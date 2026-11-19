import type { AppLocale } from './locales.js';
import { foldForSearch } from './shop-items.js';

/**
 * The descriptions of the items the shop ships with (api/content/cosmetics.json and the Kurdish tag, where they are
 * English), in every other interface language. Keyed by the English, since several items share one; an item an admin
 * adds or rewords has no entry and is shown as written.
 */
const DESCRIPTIONS: Record<string, Record<Exclude<AppLocale, 'en'>, string>> = {
  'Hevalo violet': {
    ku: 'Mora Hevalo', ckb: 'مۆری Hevalo', de: 'Hevalo-Violett', es: 'Violeta Hevalo',
    fr: 'Violet Hevalo', nl: 'Hevalo-violet', tr: 'Hevalo moru', ar: 'بنفسجي Hevalo',
  },
  'Night on the high pastures': {
    ku: 'Şev li zozanan', ckb: 'شەو لە کوێستان', de: 'Nacht auf den Hochweiden', es: 'Noche en los pastos de montaña',
    fr: 'Nuit sur les alpages', nl: 'Nacht op de bergweiden', tr: 'Yaylada gece', ar: 'ليلة في المراعي العالية',
  },
  'Sky full of stars': {
    ku: 'Ezmanê tijî stêrk', ckb: 'ئاسمانێکی پڕ لە ئەستێرە', de: 'Himmel voller Sterne', es: 'Cielo lleno de estrellas',
    fr: 'Ciel plein d’étoiles', nl: 'Hemel vol sterren', tr: 'Yıldızlarla dolu gökyüzü', ar: 'سماء مليئة بالنجوم',
  },
  'Silver moon': {
    ku: 'Heyva zîvîn', ckb: 'مانگی زیوین', de: 'Silbermond', es: 'Luna de plata',
    fr: 'Lune d’argent', nl: 'Zilveren maan', tr: 'Gümüş ay', ar: 'قمر فضي',
  },
  'Snow on the mountains': {
    ku: 'Berf li çiyayan', ckb: 'بەفر لەسەر چیاکان', de: 'Schnee auf den Bergen', es: 'Nieve en las montañas',
    fr: 'Neige sur les montagnes', nl: 'Sneeuw op de bergen', tr: 'Dağlarda kar', ar: 'ثلج على الجبال',
  },
  'Blue lake': { ku: 'Gola şîn', ckb: 'دەریاچەی شین', de: 'Blauer See', es: 'Lago azul', fr: 'Lac bleu', nl: 'Blauw meer', tr: 'Mavi göl', ar: 'بحيرة زرقاء' },
  'Northern lights': {
    ku: 'Ronahiya bakur', ckb: 'ڕووناکیی باکوور', de: 'Nordlicht', es: 'Aurora boreal',
    fr: 'Aurore boréale', nl: 'Noorderlicht', tr: 'Kuzey ışıkları', ar: 'الشفق القطبي',
  },
  'Under the Judas trees': {
    ku: 'Binê darên erxewanê', ckb: 'لە ژێر دارە ئەرخەوانەکان', de: 'Unter den Judasbäumen', es: 'Bajo los árboles de Judas',
    fr: 'Sous les arbres de Judée', nl: 'Onder de judasbomen', tr: 'Erguvanların altında', ar: 'تحت أشجار الأرجوان',
  },
  'Daybreak': { ku: 'Berbang', ckb: 'بەرەبەیان', de: 'Morgengrauen', es: 'Amanecer', fr: 'Point du jour', nl: 'Dageraad', tr: 'Şafak', ar: 'الفجر' },
  'Rose mist': { ku: 'Mija gulan', ckb: 'تەمی گوڵان', de: 'Rosennebel', es: 'Niebla rosa', fr: 'Brume rose', nl: 'Rozenmist', tr: 'Gül sisi', ar: 'ضباب وردي' },
  'Golden evening': {
    ku: 'Êvara zêrîn', ckb: 'ئێوارەی زێڕین', de: 'Goldener Abend', es: 'Atardecer dorado',
    fr: 'Soir doré', nl: 'Gouden avond', tr: 'Altın akşam', ar: 'مساء ذهبي',
  },
  'Newroz fire': {
    ku: 'Agirê Newrozê', ckb: 'ئاگری نەورۆز', de: 'Newroz-Feuer', es: 'Fuego de Newroz',
    fr: 'Feu de Newroz', nl: 'Newroz-vuur', tr: 'Newroz ateşi', ar: 'نار نوروز',
  },
  'Red evening': {
    ku: 'Êvara sor', ckb: 'ئێوارەی سوور', de: 'Roter Abend', es: 'Atardecer rojo',
    fr: 'Soir rouge', nl: 'Rode avond', tr: 'Kızıl akşam', ar: 'مساء أحمر',
  },
  'Red night': { ku: 'Şeva sor', ckb: 'شەوی سوور', de: 'Rote Nacht', es: 'Noche roja', fr: 'Nuit rouge', nl: 'Rode nacht', tr: 'Kızıl gece', ar: 'ليلة حمراء' },
  'Tulip field': {
    ku: 'Zeviya laleyan', ckb: 'کێڵگەی لالە', de: 'Tulpenfeld', es: 'Campo de tulipanes',
    fr: 'Champ de tulipes', nl: 'Tulpenveld', tr: 'Lale tarlası', ar: 'حقل توليب',
  },
  'High pasture': { ku: 'Zozan', ckb: 'کوێستان', de: 'Hochweide', es: 'Pasto de montaña', fr: 'Alpage', nl: 'Bergweide', tr: 'Yayla', ar: 'مرعى جبلي' },
  'Spring': { ku: 'Bihar', ckb: 'بەهار', de: 'Frühling', es: 'Primavera', fr: 'Printemps', nl: 'Lente', tr: 'Bahar', ar: 'الربيع' },
  'Forest at night': {
    ku: 'Daristan bi şev', ckb: 'دارستان لە شەودا', de: 'Wald bei Nacht', es: 'Bosque de noche',
    fr: 'Forêt la nuit', nl: 'Bos bij nacht', tr: 'Gece orman', ar: 'غابة في الليل',
  },
  'Mist': { ku: 'Mij', ckb: 'تەم', de: 'Nebel', es: 'Niebla', fr: 'Brume', nl: 'Mist', tr: 'Sis', ar: 'ضباب' },
  'The colours of Newroz': {
    ku: 'Rengên Newrozê', ckb: 'ڕەنگەکانی نەورۆز', de: 'Die Farben von Newroz', es: 'Los colores de Newroz',
    fr: 'Les couleurs de Newroz', nl: 'De kleuren van Newroz', tr: 'Newroz’un renkleri', ar: 'ألوان نوروز',
  },
  'Red kilim': {
    ku: 'Kilîma sor', ckb: 'بەڕەی سوور', de: 'Roter Kelim', es: 'Kilim rojo',
    fr: 'Kilim rouge', nl: 'Rode kelim', tr: 'Kırmızı kilim', ar: 'كليم أحمر',
  },
  'Purple kilim': {
    ku: 'Kilîma mor', ckb: 'بەڕەی مۆر', de: 'Lila Kelim', es: 'Kilim morado',
    fr: 'Kilim violet', nl: 'Paarse kelim', tr: 'Mor kilim', ar: 'كليم بنفسجي',
  },
  'Gold kilim': {
    ku: 'Kilîma zer', ckb: 'بەڕەی زێڕین', de: 'Goldener Kelim', es: 'Kilim dorado',
    fr: 'Kilim doré', nl: 'Gouden kelim', tr: 'Altın kilim', ar: 'كليم ذهبي',
  },
  'Green kilim': {
    ku: 'Kilîma kesk', ckb: 'بەڕەی سەوز', de: 'Grüner Kelim', es: 'Kilim verde',
    fr: 'Kilim vert', nl: 'Groene kelim', tr: 'Yeşil kilim', ar: 'كليم أخضر',
  },
  'Blue kilim': {
    ku: 'Kilîma şîn', ckb: 'بەڕەی شین', de: 'Blauer Kelim', es: 'Kilim azul',
    fr: 'Kilim bleu', nl: 'Blauwe kelim', tr: 'Mavi kilim', ar: 'كليم أزرق',
  },
  'Rose kilim': {
    ku: 'Kilîma gulan', ckb: 'بەڕەی گوڵان', de: 'Rosa Kelim', es: 'Kilim rosa',
    fr: 'Kilim rose', nl: 'Roze kelim', tr: 'Pembe kilim', ar: 'كليم وردي',
  },
  'Night kilim': {
    ku: 'Kilîma şevê', ckb: 'بەڕەی شەو', de: 'Nacht-Kelim', es: 'Kilim nocturno',
    fr: 'Kilim de nuit', nl: 'Nachtkelim', tr: 'Gece kilimi', ar: 'كليم ليلي',
  },
  'Pomegranate': { ku: 'Hinar', ckb: 'هەنار', de: 'Granatapfel', es: 'Granada', fr: 'Grenade', nl: 'Granaatappel', tr: 'Nar', ar: 'رمان' },
  'Sun': { ku: 'Roj', ckb: 'خۆر', de: 'Sonne', es: 'Sol', fr: 'Soleil', nl: 'Zon', tr: 'Güneş', ar: 'شمس' },
  'Mountain': { ku: 'Çiya', ckb: 'چیا', de: 'Berg', es: 'Montaña', fr: 'Montagne', nl: 'Berg', tr: 'Dağ', ar: 'جبل' },
  'Tulip': { ku: 'Lale', ckb: 'لالە', de: 'Tulpe', es: 'Tulipán', fr: 'Tulipe', nl: 'Tulp', tr: 'Lale', ar: 'توليب' },
  'Purple tulip': {
    ku: 'Laleya mor', ckb: 'لالەی مۆر', de: 'Lila Tulpe', es: 'Tulipán morado',
    fr: 'Tulipe violette', nl: 'Paarse tulp', tr: 'Mor lale', ar: 'توليب بنفسجي',
  },
  'Deer': { ku: 'Ask', ckb: 'ئاسک', de: 'Hirsch', es: 'Ciervo', fr: 'Cerf', nl: 'Hert', tr: 'Geyik', ar: 'غزال' },
  'Sun seal': {
    ku: 'Mohra Rojê', ckb: 'مۆری خۆر', de: 'Sonnensiegel', es: 'Sello del sol',
    fr: 'Sceau du soleil', nl: 'Zonnezegel', tr: 'Güneş mührü', ar: 'ختم الشمس',
  },
  'Tea glass': {
    ku: 'Piyana çayê', ckb: 'پیاڵەی چا', de: 'Teeglas', es: 'Vaso de té',
    fr: 'Verre à thé', nl: 'Theeglas', tr: 'Çay bardağı', ar: 'كأس شاي',
  },
  'Saz': { ku: 'Saz', ckb: 'ساز', de: 'Saz', es: 'Saz', fr: 'Saz', nl: 'Saz', tr: 'Saz', ar: 'ساز' },
  'Dove': { ku: 'Kevok', ckb: 'کۆتر', de: 'Taube', es: 'Paloma', fr: 'Colombe', nl: 'Duif', tr: 'Güvercin', ar: 'حمامة' },
  'Wheat': { ku: 'Genim', ckb: 'گەنم', de: 'Weizen', es: 'Trigo', fr: 'Blé', nl: 'Tarwe', tr: 'Buğday', ar: 'قمح' },
  'Kilim diamond': {
    ku: 'Neqşê kilîmê', ckb: 'نەخشی بەڕە', de: 'Kelim-Raute', es: 'Rombo de kilim',
    fr: 'Losange de kilim', nl: 'Kelimruit', tr: 'Kilim motifi', ar: 'معيّن الكليم',
  },
  'Newroz flame': {
    ku: 'Pêta Newrozê', ckb: 'گڕی نەورۆز', de: 'Newroz-Flamme', es: 'Llama de Newroz',
    fr: 'Flamme de Newroz', nl: 'Newroz-vlam', tr: 'Newroz alevi', ar: 'شعلة نوروز',
  },
  'Crescent moon': {
    ku: 'Heyva nû', ckb: 'مانگی نوێ', de: 'Mondsichel', es: 'Luna creciente',
    fr: 'Croissant de lune', nl: 'Maansikkel', tr: 'Hilal', ar: 'هلال',
  },
  'Tulip wreath': {
    ku: 'Xeleka laleyan', ckb: 'ئەڵقەی لالە', de: 'Tulpenkranz', es: 'Corona de tulipanes',
    fr: 'Couronne de tulipes', nl: 'Tulpenkrans', tr: 'Lale çelengi', ar: 'إكليل توليب',
  },
  'Wheat wreath': {
    ku: 'Xeleka genim', ckb: 'ئەڵقەی گەنم', de: 'Weizenkranz', es: 'Corona de trigo',
    fr: 'Couronne de blé', nl: 'Tarwekrans', tr: 'Buğday çelengi', ar: 'إكليل قمح',
  },
  'Kilim band': {
    ku: 'Xeleka kilîmê', ckb: 'ئەڵقەی بەڕە', de: 'Kelimband', es: 'Banda de kilim',
    fr: 'Bande de kilim', nl: 'Kelimband', tr: 'Kilim şeridi', ar: 'شريط كليم',
  },
  'Sun rays': {
    ku: 'Tîrêjên rojê', ckb: 'تیشکی خۆر', de: 'Sonnenstrahlen', es: 'Rayos de sol',
    fr: 'Rayons de soleil', nl: 'Zonnestralen', tr: 'Güneş ışınları', ar: 'أشعة الشمس',
  },
  'Night sky': {
    ku: 'Ezmanê şevê', ckb: 'ئاسمانی شەو', de: 'Nachthimmel', es: 'Cielo nocturno',
    fr: 'Ciel nocturne', nl: 'Nachthemel', tr: 'Gece göğü', ar: 'سماء الليل',
  },
  'Spring vine': {
    ku: 'Mêwa biharê', ckb: 'مێوی بەهار', de: 'Frühlingsranke', es: 'Enredadera de primavera',
    fr: 'Vigne de printemps', nl: 'Lenterank', tr: 'Bahar sarmaşığı', ar: 'كرمة الربيع',
  },
  'Rose wreath': {
    ku: 'Xeleka gulan', ckb: 'ئەڵقەی گوڵ', de: 'Kranz aus Rosen', es: 'Corona de rosas',
    fr: 'Couronne de roses', nl: 'Krans van rozen', tr: 'Gül çelengi', ar: 'إكليل ورد',
  },
  'Violet wreath': {
    ku: 'Xeleka binefşan', ckb: 'ئەڵقەی وەنەوشە', de: 'Veilchenkranz', es: 'Corona de violetas',
    fr: 'Couronne de violettes', nl: 'Viooltjeskrans', tr: 'Menekşe çelengi', ar: 'إكليل بنفسج',
  },
  'Narcissus wreath': {
    ku: 'Xeleka nêrgizan', ckb: 'ئەڵقەی نێرگز', de: 'Narzissenkranz', es: 'Corona de narcisos',
    fr: 'Couronne de narcisses', nl: 'Narcissenkrans', tr: 'Nergis çelengi', ar: 'إكليل نرجس',
  },
  'Almond blossom': {
    ku: 'Kulîlka behîvê', ckb: 'گوڵی بادەم', de: 'Mandelblüte', es: 'Flor de almendro',
    fr: 'Fleur d’amandier', nl: 'Amandelbloesem', tr: 'Badem çiçeği', ar: 'زهر اللوز',
  },
  'Fawn': { ku: 'Askek biçûk', ckb: 'بەچکە ئاسک', de: 'Rehkitz', es: 'Cervatillo', fr: 'Faon', nl: 'Reekalf', tr: 'Geyik yavrusu', ar: 'ظبي صغير' },
  'Sleeping fox': {
    ku: 'Roviyê razayî', ckb: 'ڕێوی نووستوو', de: 'Schlafender Fuchs', es: 'Zorro dormido',
    fr: 'Renard endormi', nl: 'Slapende vos', tr: 'Uyuyan tilki', ar: 'ثعلب نائم',
  },
  'Serpent': { ku: 'Mar', ckb: 'مار', de: 'Schlange', es: 'Serpiente', fr: 'Serpent', nl: 'Slang', tr: 'Yılan', ar: 'أفعى' },
  'White wings': {
    ku: 'Baskên spî', ckb: 'باڵی سپی', de: 'Weiße Flügel', es: 'Alas blancas',
    fr: 'Ailes blanches', nl: 'Witte vleugels', tr: 'Beyaz kanatlar', ar: 'أجنحة بيضاء',
  },
  'Black wings': {
    ku: 'Baskên reş', ckb: 'باڵی ڕەش', de: 'Schwarze Flügel', es: 'Alas negras',
    fr: 'Ailes noires', nl: 'Zwarte vleugels', tr: 'Siyah kanatlar', ar: 'أجنحة سوداء',
  },
  'Ring of stars': {
    ku: 'Xeleka stêrkan', ckb: 'ئەڵقەی ئەستێرە', de: 'Sternenkranz', es: 'Anillo de estrellas',
    fr: 'Anneau d’étoiles', nl: 'Sterrenkring', tr: 'Yıldız halkası', ar: 'حلقة نجوم',
  },
  'Clock face': {
    ku: 'Rûyê saetê', ckb: 'ڕووی کاتژمێر', de: 'Zifferblatt', es: 'Esfera de reloj',
    fr: 'Cadran d’horloge', nl: 'Wijzerplaat', tr: 'Saat kadranı', ar: 'وجه ساعة',
  },
  'Enchanted ring': {
    ku: 'Xeleka efsûnî', ckb: 'ئەڵقەی جادوویی', de: 'Verzauberter Ring', es: 'Anillo encantado',
    fr: 'Anneau enchanté', nl: 'Betoverde ring', tr: 'Büyülü halka', ar: 'حلقة مسحورة',
  },
  'Black scrollwork': {
    ku: 'Neqşên reş', ckb: 'نەخشی ڕەش', de: 'Schwarzes Rankenwerk', es: 'Volutas negras',
    fr: 'Volutes noires', nl: 'Zwart krulwerk', tr: 'Siyah kıvrım süsleri', ar: 'زخارف سوداء',
  },
  'Inlaid band': {
    ku: 'Xeleka neqşkirî', ckb: 'ئەڵقەی نەخشێنراو', de: 'Eingelegtes Band', es: 'Banda con incrustaciones',
    fr: 'Bande incrustée', nl: 'Ingelegde band', tr: 'Kakma şerit', ar: 'شريط مطعّم',
  },
  'Golden leaves': {
    ku: 'Pelên zêrîn', ckb: 'گەڵای زێڕین', de: 'Goldene Blätter', es: 'Hojas doradas',
    fr: 'Feuilles dorées', nl: 'Gouden bladeren', tr: 'Altın yapraklar', ar: 'أوراق ذهبية',
  },
  'Crosshair': { ku: 'Nîşangeh', ckb: 'نیشانگر', de: 'Fadenkreuz', es: 'Mira', fr: 'Réticule', nl: 'Vizier', tr: 'Nişangah', ar: 'شعيرات التصويب' },
  'Instant photo': {
    ku: 'Wêneyê bilez', ckb: 'وێنەی دەستبەجێ', de: 'Sofortbild', es: 'Foto instantánea',
    fr: 'Photo instantanée', nl: 'Instantfoto', tr: 'Anlık fotoğraf', ar: 'صورة فورية',
  },
  'Black thorns': {
    ku: 'Stiriyên reş', ckb: 'دڕکی ڕەش', de: 'Schwarze Dornen', es: 'Espinas negras',
    fr: 'Épines noires', nl: 'Zwarte doornen', tr: 'Siyah dikenler', ar: 'أشواك سوداء',
  },
  'Silver thorns': {
    ku: 'Stiriyên zîvîn', ckb: 'دڕکی زیوین', de: 'Silberne Dornen', es: 'Espinas de plata',
    fr: 'Épines d’argent', nl: 'Zilveren doornen', tr: 'Gümüş dikenler', ar: 'أشواك فضية',
  },
  'Ring of thorns': {
    ku: 'Xeleka stiriyan', ckb: 'ئەڵقەی دڕک', de: 'Dornenkranz', es: 'Anillo de espinas',
    fr: 'Couronne d’épines', nl: 'Doornenkrans', tr: 'Diken halkası', ar: 'حلقة أشواك',
  },
  'Smoke ring': {
    ku: 'Xeleka dûkelê', ckb: 'ئەڵقەی دووکەڵ', de: 'Rauchring', es: 'Anillo de humo',
    fr: 'Rond de fumée', nl: 'Rookring', tr: 'Duman halkası', ar: 'حلقة دخان',
  },
  'A Kurdish identity tag for your profile.': {
    ku: 'Nîşaneke nasnameya kurdî ji bo profîla te.', ckb: 'تاگێکی ناسنامەی کوردی بۆ پرۆفایلەکەت.', de: 'Ein kurdisches Identitäts-Tag für dein Profil.', es: 'Una etiqueta de identidad kurda para tu perfil.',
    fr: 'Une étiquette d’identité kurde pour ton profil.', nl: 'Een Koerdische identiteitstag voor je profiel.', tr: 'Profilin için bir Kürt kimliği etiketi.', ar: 'وسم هوية كردية لملفك الشخصي.',
  },
  'Eclipse': {
    ku: 'Rojgirtin', ckb: 'خۆرگیران', de: 'Sonnenfinsternis', es: 'Eclipse',
    fr: 'Éclipse', nl: 'Zonsverduistering', tr: 'Güneş tutulması', ar: 'كسوف',
  },
};

/** Whether a shipped description has its words in every language. */
export function hasShopDescription(english: string): boolean {
  return english in DESCRIPTIONS;
}

/**
 * An item's description as `locale` reads it: a shipped one in that language, anything else as stored. None where it
 * only repeats the item's name, as a Kurdish one often would.
 */
export function shopItemDescription(item: { name: string; description?: string | null }, locale: string): string | null {
  const stored = item.description?.trim();
  if (!stored) return null;
  const said = (DESCRIPTIONS[stored] as Partial<Record<string, string>> | undefined)?.[locale] ?? stored;
  return foldForSearch(said) === foldForSearch(item.name) ? null : said;
}
