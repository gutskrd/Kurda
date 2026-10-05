"""
The alphabet page's sounds, generated once and committed as small MP3s.

Why synthesised, and why this way
---------------------------------
No browser ships a Kurdish voice, so the page cannot ask the reader's device
to speak; and a Turkish or Persian voice reading Kurdish would teach the wrong
sound with confidence. Native-speaker recordings would be best; until there
are some, these are made with eSpeak NG, an open-source synthesiser that has a
Kurmancî voice and reads Arabic exactly.

Nothing here is trusted on faith. Every clip states the IPA it must come out
as, and the script asks eSpeak for its phonemes first and stops if they differ
— so a letter cannot quietly end up with the wrong sound. Sounds the Kurmancî
voice does not have are taken from the voice that has them exactly: ح ع غ and
the glottal stop from Arabic, the dark ł from Russian's hard л. Where no voice
gives a sound accurately, there is no clip, and the page shows no play button.

Running it
----------
    pip download espeakng-loader --no-deps -d /tmp/w
    unzip /tmp/w/espeakng_loader-*.whl -d /tmp/esp
    ESPEAK_DIR=/tmp/esp/espeakng_loader python3 web/scripts/alphabet-audio/generate.py

It needs ffmpeg with libmp3lame. Output: web/public/audio/alphabet/*.mp3 and
web/src/alphabet/clips.ts, which maps each clip's key to its file.
"""
import json, os, subprocess, sys, tempfile, hashlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import espeak  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'audio', 'alphabet')
MANIFEST = os.path.join(ROOT, 'src', 'alphabet', 'clips.ts')

# (key, text, expected IPA without stress marks). A text in [[ ]] is an eSpeak
# phoneme given directly — only the short u, which the voice otherwise reads long.
# A letter's sound: a vowel on its own; a consonant before a, the way Kurdish
# primers say them, because a stop like b or q cannot be heard alone.
KMR_SOUNDS = [
    ('a', 'a', 'a'), ('b', 'ba', 'ba'), ('c', 'ca', 'dʒa'), ('ç', 'ça', 'tʃa'), ('d', 'da', 'da'),
    ('e', 'e', 'ɛ'), ('ê', 'ê', 'e'), ('f', 'fa', 'fa'), ('g', 'ga', 'ɡa'), ('h', 'ha', 'ha'),
    ('i', 'i', 'ɪ'), ('î', 'î', 'i'), ('j', 'ja', 'ʒa'), ('k', 'ka', 'ka'), ('l', 'la', 'la'),
    ('m', 'ma', 'ma'), ('n', 'na', 'na'), ('o', 'o', 'o'), ('p', 'pa', 'pa'), ('q', 'qa', 'qa'),
    ('r', 'ra', 'ra'), ('s', 'sa', 'sa'), ('ş', 'şa', 'ʃa'), ('t', 'ta', 'ta'), ('u', '[[U]]', 'ʊ'),
    ('û', 'û', 'u'), ('v', 'va', 'va'), ('w', 'wa', 'wa'), ('x', 'xa', 'xa'), ('y', 'ya', 'ja'),
    ('z', 'za', 'za'),
]
# Kurmancî's example words, as letters.ts has them
KMR_WORDS = [
    ('a', 'av', 'av'), ('b', 'bav', 'bav'), ('c', 'cîran', 'dʒiran'), ('ç', 'çav', 'tʃav'), ('d', 'dest', 'dɛst'),
    ('e', 'ez', 'ɛz'), ('ê', 'êvar', 'evar'), ('f', 'fêkî', 'feci'), ('g', 'gul', 'ɡʊl'), ('h', 'hesp', 'hɛsp'),
    ('i', 'dil', 'dɪl'), ('î', 'îro', 'iɾo'), ('j', 'jin', 'ʒɪn'), ('k', 'kur', 'kʊr'), ('l', 'lêv', 'lev'),
    ('m', 'mal', 'mal'), ('n', 'nan', 'nan'), ('o', 'roj', 'roʒ'), ('p', 'pirtûk', 'pɪrtuk'), ('q', 'qelem', 'qɛlɛm'),
    ('r', 'rê', 're'), ('s', 'sêv', 'sev'), ('ş', 'şîr', 'ʃir'), ('t', 'tav', 'tav'), ('u', 'du', 'dʊ'),
    ('û', 'rû', 'ru'), ('v', 'evîn', 'ɛvin'), ('w', 'welat', 'wɛlat'), ('x', 'xwişk', 'xwɪʃk'), ('y', 'yek', 'jɛk'),
    ('z', 'ziman', 'zɪman'),
]
# the sounds only Soranî gives letters of their own; the rest share Kurmancî's clips
CKB_SOUNDS = [
    ('ḧe', 'ar', 'حا', 'ħaː'), ('eyn', 'ar', 'عا', 'ʕaː'), ('xeyn', 'ar', 'غا', 'ɣaː'),
    ('hamza', 'ar', 'أا', 'ʔaː'), ('łam', 'ru', 'ла', 'ɭɑ'), ('ře', 'ku', 'ra', 'ra'),
]
# Soranî's example words. Read from Latin by the Kurmancî voice (same sounds),
# or from Arabic by the Arabic voice where the word turns on ح ع غ.
CKB_WORDS = [
    ('hamza', 'ku', 'aw', 'aw'), ('alif', 'ku', 'dar', 'dar'), ('be', 'ku', 'bawk', 'bawk'),
    ('pe', 'ku', 'pişîle', 'pɪʃilɛ'), ('te', 'ku', 'to', 'to'), ('cîm', 'ku', 'cwan', 'dʒwan'),
    ('çîm', 'ku', 'çaw', 'tʃaw'), ('ḧe', 'ar', 'حَوت', 'ħaut'), ('xe', 'ku', 'xwişk', 'xwɪʃk'),
    ('dal', 'ku', 'dest', 'dɛst'), ('re', 'ku', 'şar', 'ʃar'), ('ře', 'ku', 'roj', 'roʒ'),
    ('ze', 'ku', 'ziman', 'zɪman'), ('je', 'ku', 'jin', 'ʒɪn'), ('sîn', 'ku', 'sêw', 'sew'),
    ('şîn', 'ku', 'şîr', 'ʃir'), ('eyn', 'ar', 'عَشق', 'ʕaʃq'), ('xeyn', 'ar', 'باغ', 'baːɣ'),
    ('fe', 'ku', 'fîl', 'fil'), ('ve', 'ku', 'vîdyo', 'vidjo'), ('qaf', 'ku', 'qawe', 'qawɛ'),
    ('kaf', 'ku', 'kur', 'kʊr'), ('gaf', 'ku', 'gwê', 'ɡwe'), ('lam', 'ku', 'lêw', 'lew'),
    ('łam', 'ru', 'бал', 'bɑɭ'), ('mîm', 'ku', 'mang', 'manɡ'), ('nûn', 'ku', 'nan', 'nan'),
    ('he', 'ku', 'hawrê', 'hawre'), ('e', 'ku', 'êware', 'ewaɾɛ'), ('waw', 'ku', 'wişe', 'wɪʃɛ'),
    ('ww', 'ku', 'dûr', 'dur'), ('o', 'ku', 'xor', 'xor'), ('ye', 'ku', 'yek', 'jɛk'), ('ê', 'ku', 'rê', 're'),
]
# minimal pairs: one mark, another word
PAIRS = [('kur', 'kʊr'), ('kûr', 'kur'), ('dil', 'dɪl'), ('dîl', 'dil'), ('ker', 'kɛr'), ('kêr', 'cer'), ('şer', 'ʃɛr'), ('şêr', 'ʃer')]


def plain(ipa: str) -> str:
    return ipa.replace('ˈ', '').replace('ˌ', '').replace(' ', '')


def make(key: str, voice: str, text: str, expect: str, speed: int, clips: dict) -> None:
    espeak.voice(voice)
    phonemes = text.startswith('[[')
    # a phoneme given directly is already the answer; text is checked against what it should say
    got = expect if phonemes else plain(espeak.ipa(text))
    if got != expect:
        sys.exit(f'{key}: eSpeak says /{got}/ for {text!r}, expected /{expect}/ — refusing to write it')
    name = 'a' + hashlib.sha1(key.encode()).hexdigest()[:10] + '.mp3'
    with tempfile.NamedTemporaryFile(suffix='.wav') as wav:
        espeak.synth(text, wav.name, phonemes=phonemes, speed=speed)
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-i', wav.name, '-af', 'adelay=60,apad=pad_dur=0.12,loudnorm=I=-18:TP=-2',
             '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', '40k', os.path.join(OUT, name)],
            check=True,
        )
    clips[key] = name
    print(f'{key:22} {voice}  {text:10} /{got}/')


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    clips: dict = {}
    for letter, text, ipa in KMR_SOUNDS:
        make(f'kmr:sound:{letter}', 'ku', text, ipa, 100, clips)
    for letter, text, ipa in KMR_WORDS:
        make(f'kmr:word:{letter}', 'ku', text, ipa, 110, clips)
    for letter, voice, text, ipa in CKB_SOUNDS:
        make(f'ckb:sound:{letter}', voice, text, ipa, 100, clips)
    for letter, voice, text, ipa in CKB_WORDS:
        make(f'ckb:word:{letter}', voice, text, ipa, 110, clips)
    for word, ipa in PAIRS:
        make(f'pair:{word}', 'ku', word, ipa, 110, clips)
    with open(MANIFEST, 'w') as f:
        f.write('/* Generated by web/scripts/alphabet-audio/generate.py — do not edit by hand. */\n')
        f.write('export const CLIPS: Readonly<Record<string, string>> = ')
        f.write(json.dumps(dict(sorted(clips.items())), ensure_ascii=False, indent=2).replace('"', "'"))
        f.write(';\n')
    print(f'{len(clips)} clips')


if __name__ == '__main__':
    main()
