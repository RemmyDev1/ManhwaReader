import re

def clean_tts_phonetics_and_dashes(text: str) -> str:
    t = text
    t = re.sub(r'(\b[a-zA-Z]{2,})-\s+([a-zA-Z]{2,}\b)', r'\1\2', t)
    contraction_fixes = [
        (r"\b([a-zA-Z]+)\s+t\b", r"\1't"),
        (r"\bi\s+m\b", "I'm"),
    ]
    for pat, rep in contraction_fixes:
        t = re.sub(pat, rep, t, flags=re.IGNORECASE)
    t = re.sub(r'[~^#@*_\[\]{}\\\/<>\$|•►★☆♪♫="`]+', ' ', t)
    t = re.sub(r'\s*,\s*', ', ', t)
    t = re.sub(r'\s*\.\s*', '. ', t)
    t = re.sub(r'\s*\?\s*', '? ', t)
    t = re.sub(r'\s*\!\s*', '! ', t)
    t = re.sub(r',\s*,+', ', ', t)
    t = re.sub(r'\.\s*\.+', '. ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'^[^\w\'"]+|[^\w\.\!\?\'"]+$', '', t)
    return t.strip()

def normalize_dialogue_text(text: str) -> str:
    clean = text.strip()
    clean = re.sub(r'[\r\n\t]+', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean)
    clean = clean.replace('|', '').replace('..', '.')

    # Smart Sentence Capitalization
    sentences = re.split(r'([\.\!\?\…]\s*)', clean)
    formatted = []
    for s in sentences:
        s_strip = s.strip()
        if s_strip and not re.match(r'^[\.\!\?\…]+$', s_strip):
            capitalized = s_strip[0].upper() + s_strip[1:].lower()
            formatted.append(capitalized)
        else:
            formatted.append(s)
    clean = "".join(formatted)

    clean = clean_tts_phonetics_and_dashes(clean)
    return clean

print(normalize_dialogue_text("professor—and, indeed, he had seemed to be headed down that path"))
print(normalize_dialogue_text("amazing feats—it was a love"))
