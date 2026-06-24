"""v2 routes blueprint. Imported and registered by app.py."""
import time
import uuid
import secrets
from collections import defaultdict, deque
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

bp_v2 = Blueprint('v2', __name__)

# ---- shared helpers ----------------------------------------------------------

_RL_BUCKETS = defaultdict(deque)


def rate_limit(name, max_calls, per_seconds):
    """Naive in-memory rate limiter keyed by name + remote IP."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            key = f"{name}:{request.remote_addr or 'anon'}"
            now = time.time()
            q = _RL_BUCKETS[key]
            while q and q[0] < now - per_seconds:
                q.popleft()
            if len(q) >= max_calls:
                return jsonify({'error': 'Rate limit exceeded',
                                'retry_after': int(per_seconds)}), 429
            q.append(now)
            return f(*args, **kwargs)
        return wrapper
    return decorator


def jwt_user():
    """Return user id (int) from current JWT or None."""
    try:
        verify_jwt_in_request()
        return int(get_jwt_identity())
    except Exception:
        return None


def auth_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        uid = jwt_user()
        if not uid:
            return jsonify({'error': 'Authentication required'}), 401
        request.user_id = uid
        return f(*args, **kwargs)
    return wrapper


def role_required(*roles):
    from flask_jwt_extended import get_jwt
    def deco(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            uid = jwt_user()
            if not uid:
                return jsonify({'error': 'Authentication required'}), 401
            try:
                claims = get_jwt() or {}
            except Exception:
                claims = {}
            if claims.get('role') not in roles:
                return jsonify({'error': 'Access denied'}), 403
            request.user_id = uid
            request.user_role = claims.get('role')
            return f(*args, **kwargs)
        return wrapper
    return deco


def gen_token(prefix=''):
    """URL-safe random token for password reset / rx codes."""
    return f"{prefix}{secrets.token_urlsafe(16)}"


def send_sms_stub(phone, message):
    """SMS gateway stub. Real provider plugs in here (Nexah/Africastalking)."""
    print(f"[SMS_STUB] -> {phone}: {message}")
    return True


def send_email_stub(email, subject, body):
    """SMTP stub. Plug a real SMTP / SendGrid here."""
    print(f"[EMAIL_STUB] -> {email}\n  subject: {subject}\n  body: {body[:200]}")
    return True


def push_notification(db, user_id, title, body=None, link=None):
    """Insert an in-app notification row."""
    try:
        db.execute_query(
            "INSERT INTO notifications (user_id, title, body, link) VALUES (%s,%s,%s,%s)",
            (user_id, title, body, link)
        )
    except Exception as e:
        print(f"[NOTIFY] failed: {e}")


# Import submodules so their routes register on bp_v2
from . import profile   # noqa: E402,F401
from . import rx        # noqa: E402,F401
from . import social    # noqa: E402,F401
from . import slots     # noqa: E402,F401
from . import misc      # noqa: E402,F401
from . import uploads   # noqa: E402,F401
from . import payments  # noqa: E402,F401
