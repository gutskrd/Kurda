"""
The word sets' sounds (colours, numbers, days, months), made the way the
alphabet's are and checked the same way: see generate.py for why, and for how
to run it (the same eSpeak NG and ffmpeg), with this file in place of it.

Each word is (key, voice, text, expected IPA without stress marks): the key
after `words:`, as shared/src/word-sets/sounds.ts files it. Kurmancî is read
as written; Soranî from its Latin letters by the Kurmancî voice, whose sounds
are the same, or from Arabic by the Arabic voice where the word turns on ḧ.
Kurmancî's Gelarêzan is given a doubled r, which the voice rolls, as the r of
rêzan is.

No voice says these accurately, so they have no clip and no play button
until they are recorded: the Soranî words with the dark ł (پرتەقاڵی,
خۆڵەمێشی, گوڵان, گەڵاڕێزان) — Russian's л comes with Russian's reduced vowels
around it — and حەڤدە, whose ḧ and v no single voice has together.

Output: web/public/audio/words/*.mp3 and shared/src/word-sets/clips.ts.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate  # noqa: E402

OUT = os.path.join(generate.ROOT, 'public', 'audio', 'words')
MANIFEST = os.path.join(generate.ROOT, '..', 'shared', 'src', 'word-sets', 'clips.ts')

WORDS = [
    # colours
    ('colours:kmr:red', 'ku', 'sor', 'sor'), ('colours:kmr:blue', 'ku', 'şîn', 'ʃin'),
    ('colours:kmr:green', 'ku', 'kesk', 'kɛsk'), ('colours:kmr:yellow', 'ku', 'zer', 'zɛr'),
    ('colours:kmr:black', 'ku', 'reş', 'rɛʃ'), ('colours:kmr:white', 'ku', 'spî', 'spi'),
    ('colours:kmr:brown', 'ku', 'qehweyî', 'qɛhweɪi'), ('colours:kmr:orange', 'ku', 'porteqalî', 'portɛqali'),
    ('colours:kmr:purple', 'ku', 'mor', 'mor'), ('colours:kmr:pink', 'ku', 'pembe', 'pɛmbɛ'),
    ('colours:kmr:grey', 'ku', 'gewr', 'ɟeʊr'),
    ('colours:ckb:red', 'ku', 'sûr', 'sur'), ('colours:ckb:blue', 'ku', 'şîn', 'ʃin'),
    ('colours:ckb:green', 'ku', 'sewz', 'seʊz'), ('colours:ckb:yellow', 'ku', 'zerd', 'zɛrd'),
    ('colours:ckb:black', 'ku', 'reş', 'rɛʃ'), ('colours:ckb:white', 'ku', 'spî', 'spi'),
    ('colours:ckb:brown', 'ku', 'qaweyî', 'qaweɪi'), ('colours:ckb:purple', 'ku', 'mor', 'mor'),
    ('colours:ckb:pink', 'ku', 'pemeyî', 'pɛmeɪi'),
    # numbers
    ('numbers:kmr:0', 'ku', 'sifir', 'sɪfɪr'), ('numbers:kmr:1', 'ku', 'yek', 'jɛk'), ('numbers:kmr:2', 'ku', 'du', 'dʊ'),
    ('numbers:kmr:3', 'ku', 'sê', 'se'), ('numbers:kmr:4', 'ku', 'çar', 'tʃar'), ('numbers:kmr:5', 'ku', 'pênc', 'pendʒ'),
    ('numbers:kmr:6', 'ku', 'şeş', 'ʃɛʃ'), ('numbers:kmr:7', 'ku', 'heft', 'hɛft'), ('numbers:kmr:8', 'ku', 'heşt', 'hɛʃt'),
    ('numbers:kmr:9', 'ku', 'neh', 'nɛh'), ('numbers:kmr:10', 'ku', 'deh', 'dɛh'),
    ('numbers:kmr:11', 'ku', 'yazdeh', 'jazdɛh'), ('numbers:kmr:12', 'ku', 'diwanzdeh', 'dɪwanzdɛh'),
    ('numbers:kmr:13', 'ku', 'sêzdeh', 'sezdɛh'), ('numbers:kmr:14', 'ku', 'çardeh', 'tʃardɛh'),
    ('numbers:kmr:15', 'ku', 'panzdeh', 'panzdɛh'), ('numbers:kmr:16', 'ku', 'şanzdeh', 'ʃanzdɛh'),
    ('numbers:kmr:17', 'ku', 'hivdeh', 'hɪvdɛh'), ('numbers:kmr:18', 'ku', 'hejdeh', 'hɛʒdɛh'),
    ('numbers:kmr:19', 'ku', 'nozdeh', 'nozdɛh'), ('numbers:kmr:20', 'ku', 'bîst', 'bist'),
    ('numbers:kmr:30', 'ku', 'sî', 'si'), ('numbers:kmr:40', 'ku', 'çil', 'tʃɪl'),
    ('numbers:kmr:50', 'ku', 'pêncî', 'pendʒi'), ('numbers:kmr:60', 'ku', 'şêst', 'ʃest'),
    ('numbers:kmr:70', 'ku', 'heftê', 'hɛfte'), ('numbers:kmr:80', 'ku', 'heştê', 'hɛʃte'),
    ('numbers:kmr:90', 'ku', 'not', 'not'), ('numbers:kmr:100', 'ku', 'sed', 'sɛd'),
    ('numbers:kmr:1000', 'ku', 'hezar', 'hɛzar'),
    ('numbers:ckb:0', 'ku', 'sifir', 'sɪfɪr'), ('numbers:ckb:1', 'ku', 'yek', 'jɛk'), ('numbers:ckb:2', 'ku', 'dû', 'du'),
    ('numbers:ckb:3', 'ku', 'sê', 'se'), ('numbers:ckb:4', 'ku', 'çwar', 'tʃwar'), ('numbers:ckb:5', 'ku', 'pênc', 'pendʒ'),
    ('numbers:ckb:6', 'ku', 'şeş', 'ʃɛʃ'), ('numbers:ckb:7', 'ar', 'حَوت', 'ħaut'), ('numbers:ckb:8', 'ku', 'heşt', 'hɛʃt'),
    ('numbers:ckb:9', 'ku', 'no', 'no'), ('numbers:ckb:10', 'ku', 'de', 'dɛ'),
    ('numbers:ckb:11', 'ku', 'yazde', 'jazdɛ'), ('numbers:ckb:12', 'ku', 'dwazde', 'dwazdɛ'),
    ('numbers:ckb:13', 'ku', 'sêzde', 'sezdɛ'), ('numbers:ckb:14', 'ku', 'çwarde', 'tʃwardɛ'),
    ('numbers:ckb:15', 'ku', 'pazde', 'pazdɛ'), ('numbers:ckb:16', 'ku', 'şazde', 'ʃazdɛ'),
    ('numbers:ckb:18', 'ku', 'hejde', 'hɛʒdɛ'), ('numbers:ckb:19', 'ku', 'nozde', 'nozdɛ'),
    ('numbers:ckb:20', 'ku', 'bîst', 'bist'), ('numbers:ckb:30', 'ku', 'sî', 'si'), ('numbers:ckb:40', 'ku', 'çil', 'tʃɪl'),
    ('numbers:ckb:50', 'ku', 'penca', 'pɛndʒa'), ('numbers:ckb:60', 'ku', 'şest', 'ʃɛst'),
    ('numbers:ckb:70', 'ar', 'حَفتا', 'ħaftaː'), ('numbers:ckb:80', 'ku', 'heşta', 'hɛʃta'),
    ('numbers:ckb:90', 'ku', 'newed', 'neʊɛd'), ('numbers:ckb:100', 'ku', 'sed', 'sɛd'),
    ('numbers:ckb:1000', 'ku', 'hezar', 'hɛzar'),
    # days
    ('days:kmr:sat', 'ku', 'şemî', 'ʃɛmi'), ('days:kmr:sun', 'ku', 'yekşem', 'jɛkʃɛm'),
    ('days:kmr:mon', 'ku', 'duşem', 'dʊʃɛm'), ('days:kmr:tue', 'ku', 'sêşem', 'seʃɛm'),
    ('days:kmr:wed', 'ku', 'çarşem', 'tʃarʃɛm'), ('days:kmr:thu', 'ku', 'pêncşem', 'pendʒʃɛm'),
    ('days:kmr:fri', 'ku', 'în', 'in'),
    ('days:ckb:sat', 'ku', 'şemme', 'ʃɛmmɛ'), ('days:ckb:sun', 'ku', 'yekşemme', 'jɛkʃɛmmɛ'),
    ('days:ckb:mon', 'ku', 'dûşemme', 'duʃɛmmɛ'), ('days:ckb:tue', 'ku', 'sêşemme', 'seʃɛmmɛ'),
    ('days:ckb:wed', 'ku', 'çwarşemme', 'tʃwarʃɛmmɛ'), ('days:ckb:thu', 'ku', 'pêncşemme', 'pendʒʃɛmmɛ'),
    ('days:ckb:fri', 'ku', 'heynî', 'heɪni'),
    # months
    ('months:kmr:jan', 'ku', 'kanûna paşîn', 'kanunapaʃin'), ('months:kmr:feb', 'ku', 'sibat', 'sɪbat'),
    ('months:kmr:mar', 'ku', 'adar', 'adar'), ('months:kmr:apr', 'ku', 'nîsan', 'nisan'),
    ('months:kmr:may', 'ku', 'gulan', 'ɡʊlan'), ('months:kmr:jun', 'ku', 'hezîran', 'hɛziran'),
    ('months:kmr:jul', 'ku', 'tîrmeh', 'tirmɛh'), ('months:kmr:aug', 'ku', 'tebax', 'tɛbax'),
    ('months:kmr:sep', 'ku', 'îlon', 'ilon'), ('months:kmr:oct', 'ku', 'cotmeh', 'dʒotmɛh'),
    ('months:kmr:nov', 'ku', 'mijdar', 'mɪʒdar'), ('months:kmr:dec', 'ku', 'kanûna pêşîn', 'kanunapeʃin'),
    ('months:kmr:xakelewe', 'ku', 'xakelêwe', 'xakɛlewɛ'), ('months:kmr:cozerdan', 'ku', 'cozerdan', 'dʒozɛrdan'),
    ('months:kmr:pusper', 'ku', 'pûşper', 'puʃpɛr'), ('months:kmr:gelawej', 'ku', 'gelawêj', 'ɡɛlaweʒ'),
    ('months:kmr:xermanan', 'ku', 'xermanan', 'xɛrmanan'), ('months:kmr:rezber', 'ku', 'rezber', 'rɛzbɛr'),
    ('months:kmr:gelarezan', 'ku', 'gelarrêzan', 'ɡɛlarezan'), ('months:kmr:sermawez', 'ku', 'sermawez', 'sɛrmawɛz'),
    ('months:kmr:berfanbar', 'ku', 'berfanbar', 'bɛrfanbar'), ('months:kmr:rebendan', 'ku', 'rêbendan', 'rebɛndan'),
    ('months:kmr:resemi', 'ku', 'reşemî', 'rɛʃɛmi'),
    ('months:ckb:jan', 'ku', 'kanûnî duwem', 'kanunidʊwɛm'), ('months:ckb:feb', 'ku', 'şubat', 'ʃʊbat'),
    ('months:ckb:mar', 'ku', 'azar', 'azar'), ('months:ckb:apr', 'ku', 'nîsan', 'nisan'),
    ('months:ckb:may', 'ku', 'ayar', 'ajar'), ('months:ckb:jun', 'ar', 'حُزَيران', 'ħuzairaːn'),
    ('months:ckb:jul', 'ku', 'temmûz', 'tɛmmuz'), ('months:ckb:aug', 'ku', 'ab', 'ab'),
    ('months:ckb:sep', 'ku', 'eylûl', 'eɪlul'), ('months:ckb:oct', 'ku', 'tişrînî yekem', 'tɪʃrinijɛkɛm'),
    ('months:ckb:nov', 'ku', 'tişrînî duwem', 'tɪʃrinidʊwɛm'), ('months:ckb:dec', 'ku', 'kanûnî yekem', 'kanunijɛkɛm'),
    ('months:ckb:xakelewe', 'ku', 'xakelêwe', 'xakɛlewɛ'), ('months:ckb:cozerdan', 'ku', 'cozerdan', 'dʒozɛrdan'),
    ('months:ckb:pusper', 'ku', 'pûşper', 'puʃpɛr'), ('months:ckb:gelawej', 'ku', 'gelawêj', 'ɡɛlaweʒ'),
    ('months:ckb:xermanan', 'ku', 'xermanan', 'xɛrmanan'), ('months:ckb:rezber', 'ku', 'rezber', 'rɛzbɛr'),
    ('months:ckb:sermawez', 'ku', 'sermawez', 'sɛrmawɛz'), ('months:ckb:berfanbar', 'ku', 'befranbar', 'bɛfranbar'),
    ('months:ckb:rebendan', 'ku', 'rêbendan', 'rebɛndan'), ('months:ckb:resemi', 'ku', 'reşeme', 'rɛʃɛmɛ'),
]


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    clips: dict = {}
    for key, voice, text, ipa in WORDS:
        generate.make(f'words:{key}', voice, text, ipa, 110, clips, out=OUT, prefix='w')
    with open(MANIFEST, 'w') as f:
        f.write('/* Generated by web/scripts/alphabet-audio/words.py — do not edit by hand. */\n')
        f.write('export const WORD_CLIPS: Readonly<Record<string, string>> = ')
        f.write(json.dumps(dict(sorted(clips.items())), ensure_ascii=False, indent=2).replace('"', "'"))
        f.write(';\n')
    print(f'{len(clips)} clips')


if __name__ == '__main__':
    main()
