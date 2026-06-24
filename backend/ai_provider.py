"""AI provider abstraction. Supports rules (default), OpenAI and Gemini.
Always falls back to the rule engine if the LLM call fails or is unconfigured."""
import json
import os
import urllib.request
import urllib.error

import diagnosis_engine

PROVIDER = os.getenv('AI_PROVIDER', 'rules').lower()
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
LLM_TIMEOUT = int(os.getenv('LLM_TIMEOUT_SECONDS', '15'))

_PROMPT_TEMPLATE = """You are a medical triage assistant. Output STRICT JSON only, no prose.

Patient context:
- age: {age}
- sex: {sex}
- duration_days: {duration_days}
- severity (1-10): {severity}
- pregnant: {pregnant}
- current_medications: {current_medications}

Symptoms (free text): {symptoms}

Return JSON of shape:
{{
  "differential": [
    {{"condition": "string", "specialty": "string",
      "risk_level": "low|medium|high", "confidence": 0.0,
      "recommendation": "string", "suggested_otc": ["string"],
      "matched_keywords": ["string"]}}
  ],
  "red_flag": null | {{"id":"string","message":"string","specialty":"string"}},
  "follow_up_questions": [{{"keyword":"string","question":"string"}}]
}}

Rules:
- 1-3 differential entries, ordered by confidence desc.
- Use specialty values from: Cardiology, Pulmonology, Neurology, Gastroenterology,
  Orthopedics, Dermatology, General Medicine, Mental Health, Emergency Care, Pediatrics.
- Set red_flag for life-threatening combinations only (heart attack, stroke,
  anaphylaxis, meningitis, severe bleeding, loss of consciousness, suicidal ideation).
- suggested_otc may include: Paracetamol, Ibuprofen, Cetirizine, Loratadine, Vitamin C, Omeprazole.
- 0-3 follow_up_questions, each a yes/no question that would refine the differential.
"""


def _build_prompt(symptoms, ctx):
    return _PROMPT_TEMPLATE.format(
        age=ctx.get('age'), sex=ctx.get('sex'),
        duration_days=ctx.get('duration_days'), severity=ctx.get('severity'),
        pregnant=ctx.get('pregnant'),
        current_medications=ctx.get('current_medications'),
        symptoms=symptoms or '',
    )


def _http_post_json(url, payload, headers, timeout=LLM_TIMEOUT):
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def _call_openai(prompt):
    if not OPENAI_API_KEY:
        raise RuntimeError('OPENAI_API_KEY not set')
    payload = {
        'model': os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
        'messages': [{'role': 'user', 'content': prompt}],
        'response_format': {'type': 'json_object'},
        'temperature': 0.2,
    }
    headers = {
        'Authorization': f'Bearer {OPENAI_API_KEY}',
        'Content-Type': 'application/json',
    }
    data = _http_post_json('https://api.openai.com/v1/chat/completions', payload, headers)
    return json.loads(data['choices'][0]['message']['content'])


def _call_gemini(prompt):
    if not GEMINI_API_KEY:
        raise RuntimeError('GEMINI_API_KEY not set')
    model = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')
    url = (f'https://generativelanguage.googleapis.com/v1beta/models/'
           f'{model}:generateContent?key={GEMINI_API_KEY}')
    payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'response_mime_type': 'application/json', 'temperature': 0.2},
    }
    data = _http_post_json(url, payload, {'Content-Type': 'application/json'})
    text = data['candidates'][0]['content']['parts'][0]['text']
    return json.loads(text)


def _validate_llm_response(obj):
    """Light schema validation; raise ValueError on bad shape."""
    if not isinstance(obj, dict) or 'differential' not in obj:
        raise ValueError('LLM response missing differential')
    diff = obj['differential']
    if not isinstance(diff, list) or not diff:
        raise ValueError('LLM differential empty/invalid')
    for d in diff:
        d.setdefault('confidence', 0.5)
        d.setdefault('risk_level', 'medium')
        d.setdefault('suggested_otc', [])
        d.setdefault('matched_keywords', [])
        d.setdefault('specialty', 'General Medicine')
    obj.setdefault('red_flag', None)
    obj.setdefault('follow_up_questions', [])
    return obj


def analyze(symptoms, *, age=None, sex=None, duration_days=None, severity=None,
            pregnant=False, current_medications=None):
    """Entry point. Tries the configured LLM provider; falls back to rules."""
    ctx = {'age': age, 'sex': sex, 'duration_days': duration_days,
           'severity': severity, 'pregnant': pregnant,
           'current_medications': current_medications}

    if PROVIDER in ('openai', 'gemini'):
        try:
            prompt = _build_prompt(symptoms, ctx)
            raw = _call_openai(prompt) if PROVIDER == 'openai' else _call_gemini(prompt)
            result = _validate_llm_response(raw)
            result['provider'] = PROVIDER
            return result
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError,
                KeyError, json.JSONDecodeError, RuntimeError, TimeoutError) as e:
            print(f'[AI_PROVIDER] LLM call failed ({type(e).__name__}: {e}); '
                  f'falling back to rule engine.')

    return diagnosis_engine.diagnose(
        symptoms, age=age, sex=sex, duration_days=duration_days,
        severity=severity, pregnant=pregnant,
        current_medications=current_medications,
    )
