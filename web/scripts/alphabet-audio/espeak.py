"""A thin ctypes wrapper around libespeak-ng: phonemes out, and speech into a WAV file."""
import ctypes, os, sys, wave, array
BASE = os.environ['ESPEAK_DIR']  # the unpacked espeakng_loader wheel; see generate.py
lib = ctypes.cdll.LoadLibrary(os.path.join(BASE, 'libespeak-ng.so'))
SYNCH = 2
rate = lib.espeak_Initialize(SYNCH, 0, BASE.encode() + b'/espeak-ng-data', 0)
CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
buf = array.array('h')
@CB
def cb(wav, n, ev):
    if n > 0: buf.extend(wav[:n])
    return 0
lib.espeak_SetSynthCallback(cb)
lib.espeak_TextToPhonemes.restype = ctypes.c_char_p
def voice(name): assert lib.espeak_SetVoiceByName(name.encode()) == 0, name
def ipa(text):
    p = ctypes.c_char_p(text.encode())
    out = []
    pp = ctypes.pointer(p)
    while p.value:
        r = lib.espeak_TextToPhonemes(ctypes.cast(pp, ctypes.POINTER(ctypes.c_void_p)), 1, 0x02)
        out.append(r.decode())
    return ' '.join(out)
def synth(text, path, phonemes=False, speed=120, gap=0):
    buf[:] = array.array('h')
    lib.espeak_SetParameter(1, speed, 0)  # rate wpm
    lib.espeak_SetParameter(7, gap, 0)    # word gap
    flags = 1 | (0x100 if phonemes else 0)  # UTF8, phoneme input
    t = text.encode()
    lib.espeak_Synth(t, len(t) + 1, 0, 1, 0, flags, None, None)
    lib.espeak_Synchronize()
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(buf.tobytes())
    return len(buf) / rate
if __name__ == '__main__':
    voice('ku')
    for w in sys.argv[1:]: print(f'{w:10} {ipa(w)}')
