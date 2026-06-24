"""Rule-based diagnosis engine with weighted scoring, synonym expansion,
fuzzy similarity matching, red-flag detection, context-aware risk adjustment
and follow-up questions.

Improvements over v1:
- Fuzzy token matching: each keyword is split into tokens and matched against
  the input tokens using a simple character-level similarity ratio (no external
  library required).  A keyword is considered "present" when every one of its
  tokens matches an input token with similarity >= FUZZY_THRESHOLD.
- Partial-word matching: a keyword token also matches if it is a substring of
  an input token or vice-versa (handles "headaches" matching "headache").
- Spacing / punctuation is normalised before matching.
- The fallback "Unable to determine" message is replaced with a friendly
  general-medicine suggestion.
"""
import json
import os
import re
import unicodedata

_RULES_PATH = os.path.join(os.path.dirname(__file__), 'diagnosis_rules.json')

with open(_RULES_PATH, 'r', encoding='utf-8') as f:
    RULES = json.load(f)

RISK_ORDER = {'low': 1, 'medium': 2, 'high': 3}
RISK_NAMES = {1: 'low', 2: 'medium', 3: 'high'}

# Minimum similarity ratio (0-1) for a fuzzy token match
FUZZY_THRESHOLD = 0.75


# ── Text normalisation ────────────────────────────────────────────────────────

def _normalise(text):
    """Lowercase, strip accents, collapse whitespace, remove punctuation."""
    text = (text or '').lower()
    # Normalise unicode accents (e.g. é → e)
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    # Replace punctuation / special chars with space
    text = re.sub(r"[^\w\s]", ' ', text)
    # Collapse multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _tokenise(text):
    """Return list of word tokens from normalised text."""
    return _normalise(text).split()


# ── Fuzzy similarity ──────────────────────────────────────────────────────────

def _char_similarity(a, b):
    """Simple character-level Dice coefficient between two strings."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    # Build bigram sets
    def bigrams(s):
        return set(s[i:i+2] for i in range(len(s) - 1)) if len(s) > 1 else {s}
    ba, bb = bigrams(a), bigrams(b)
    if not ba or not bb:
        # Fall back to exact prefix match for single-char tokens
        return 1.0 if a[0] == b[0] else 0.0
    return 2 * len(ba & bb) / (len(ba) + len(bb))


def _token_matches(kw_token, input_tokens):
    """Return True if kw_token fuzzy-matches any token in input_tokens."""
    for it in input_tokens:
        # Exact match
        if kw_token == it:
            return True
        # Substring match (handles plurals / suffixes)
        if kw_token in it or it in kw_token:
            return True
        # Fuzzy similarity
        if _char_similarity(kw_token, it) >= FUZZY_THRESHOLD:
            return True
    return False


def keyword_present(keyword, input_tokens):
    """Return True if ALL tokens of `keyword` are found (fuzzy) in input_tokens."""
    kw_tokens = _tokenise(keyword)
    return all(_token_matches(t, input_tokens) for t in kw_tokens)


# ── Synonym expansion ─────────────────────────────────────────────────────────

def expand_synonyms(text):
    """Replace synonym phrases with their canonical form.
    Works on normalised text so spacing/punctuation differences don't matter."""
    out = _normalise(text)
    for canonical, alts in RULES.get('synonyms', {}).items():
        # Also try to match the canonical itself (already normalised)
        for alt in alts:
            alt_norm = _normalise(alt)
            if alt_norm in out:
                out = out.replace(alt_norm, _normalise(canonical))
        # Fuzzy synonym expansion: if every token of the alt appears in the text
        alt_tokens_list = [_tokenise(a) for a in alts]
        input_tokens = out.split()
        for alt_tokens in alt_tokens_list:
            if all(_token_matches(t, input_tokens) for t in alt_tokens):
                # Replace by appending canonical (safe – won't duplicate if already there)
                canonical_norm = _normalise(canonical)
                if canonical_norm not in out:
                    out = out + ' ' + canonical_norm
    return out


# ── Red-flag detection ────────────────────────────────────────────────────────

def detect_red_flags(text):
    """Return the first red-flag rule that matches, or None.
    Uses fuzzy token matching so minor typos don't prevent detection."""
    tokens = _tokenise(text)
    for rf in RULES.get('red_flags', []):
        match_terms = rf.get('match', [])
        any_terms = rf.get('any_of', [])
        match_ok = all(keyword_present(t, tokens) for t in match_terms) if match_terms else True
        any_ok = any(keyword_present(t, tokens) for t in any_terms) if any_terms else True
        if match_ok and any_ok and (match_terms or any_terms):
            return rf
    return None


# ── Risk adjustment ───────────────────────────────────────────────────────────

def adjust_risk(base_risk, severity=None, duration_days=None, age=None):
    """Bump risk up/down based on severity (1-10), duration (days), age."""
    level = RISK_ORDER.get(base_risk, 2)
    try:
        sev = int(severity) if severity is not None else None
    except (ValueError, TypeError):
        sev = None
    if sev is not None:
        if sev >= 8:
            level = min(3, level + 1)
        elif sev <= 3:
            level = max(1, level - 1)
    try:
        dur = int(duration_days) if duration_days is not None else None
    except (ValueError, TypeError):
        dur = None
    if dur is not None and dur >= 14:
        level = min(3, level + 1)
    try:
        a = int(age) if age is not None else None
    except (ValueError, TypeError):
        a = None
    if a is not None and (a < 5 or a >= 65):
        level = min(3, level + 1)
    return RISK_NAMES[level]


# ── Condition scoring ─────────────────────────────────────────────────────────

def score_conditions(text):
    """Compute weighted scores for every condition using fuzzy matching.
    Returns list sorted descending by score."""
    tokens = _tokenise(text)
    matches = []
    for cond in RULES.get('conditions', []):
        matched_keywords = []
        score = 0
        for s in cond.get('symptoms', []):
            kw = s['keyword']
            if keyword_present(kw, tokens):
                score += s.get('weight', 1)
                matched_keywords.append(kw)
        if score >= cond.get('min_score', 1):
            matches.append({
                'condition': cond['name'],
                'specialty': cond.get('specialty'),
                'base_risk': cond.get('base_risk', 'medium'),
                'recommendation': cond.get('recommendation', ''),
                'suggested_otc': cond.get('suggested_otc', []),
                'score': score,
                'matched_keywords': matched_keywords,
            })
    matches.sort(key=lambda m: m['score'], reverse=True)
    return matches


# ── Follow-up questions ───────────────────────────────────────────────────────

def follow_up_questions(top_match, tokens):
    """Generate up to 3 yes/no follow-up questions based on missed keywords."""
    if not top_match:
        return []
    cond = next((c for c in RULES['conditions'] if c['name'] == top_match['condition']), None)
    if not cond:
        return []
    questions = []
    for s in cond.get('symptoms', []):
        kw = s['keyword']
        if not keyword_present(kw, tokens) and len(questions) < 3:
            questions.append({'keyword': kw, 'question': f"Do you also have {kw}?"})
    return questions


# ── Main entry point ──────────────────────────────────────────────────────────

def diagnose(symptoms, *, age=None, sex=None, duration_days=None, severity=None,
             pregnant=False, current_medications=None):
    """Main entry point. Returns differential, red flag, follow-up questions."""
    text = expand_synonyms(symptoms or '')
    tokens = _tokenise(text)

    red_flag = detect_red_flags(text)
    matches = score_conditions(text)

    differential = []
    if matches:
        max_score = matches[0]['score']
        for m in matches[:3]:
            risk = adjust_risk(m['base_risk'], severity, duration_days, age)
            confidence = round(min(0.95, m['score'] / max(max_score * 1.2, 1)), 2)
            differential.append({
                'condition': m['condition'],
                'specialty': m['specialty'],
                'risk_level': risk,
                'confidence': confidence,
                'recommendation': m['recommendation'],
                'suggested_otc': m['suggested_otc'],
                'matched_keywords': m['matched_keywords'],
            })
    else:
        # Friendly fallback — no scary "Unable to determine" message
        differential.append({
            'condition': 'General Health Concern',
            'specialty': 'General Medicine',
            'risk_level': adjust_risk('medium', severity, duration_days, age),
            'confidence': 0.3,
            'recommendation': (
                'Your symptoms could not be matched to a specific condition in our database. '
                'Please consult a General Practitioner who can perform a proper physical examination '
                'and order any necessary tests. Try describing your symptoms in more detail for a '
                'better match (e.g. "fever, cough, sore throat" instead of "feeling sick").'
            ),
            'suggested_otc': [],
            'matched_keywords': [],
        })

    if pregnant:
        for d in differential:
            if d['risk_level'] == 'low':
                d['risk_level'] = 'medium'
            d['recommendation'] += ' Note: medication choices during pregnancy require medical guidance.'

    follow_ups = follow_up_questions(matches[0] if matches else None, tokens)
    return {
        'differential': differential,
        'red_flag': red_flag,
        'follow_up_questions': follow_ups,
        'provider': RULES.get('version', 'rules-v2'),
    }
