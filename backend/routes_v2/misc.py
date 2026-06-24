"""Misc endpoints: health check, password reset, SOS, global search."""
from datetime import datetime, timedelta

from flask import jsonify, request

from db import Database, hash_password
from . import (bp_v2, auth_required, rate_limit,
               gen_token, send_email_stub, send_sms_stub, push_notification)


# ---- Health check -----------------------------------------------------------

@bp_v2.route('/health', methods=['GET'])
def health_check():
    db_ok = True
    try:
        db = Database()
        db.execute_query("SELECT 1", fetch_one=True)
        db.close()
    except Exception:
        db_ok = False
    return jsonify({
        'status': 'ok' if db_ok else 'degraded',
        'db': db_ok,
        'time': datetime.utcnow().isoformat() + 'Z',
    }), 200 if db_ok else 503


# ---- Password reset ---------------------------------------------------------

@bp_v2.route('/auth/forgot-password', methods=['POST'])
@rate_limit('forgot', max_calls=5, per_seconds=600)
def forgot_password():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'email required'}), 400
    db = Database()
    try:
        u = db.execute_query(
            "SELECT id, full_name FROM users WHERE email=%s",
            (email,), fetch_one=True
        )
        if u:
            token = gen_token('PR-')
            expires = datetime.utcnow() + timedelta(hours=1)
            db.execute_query(
                "INSERT INTO password_resets (token, user_id, expires_at) "
                "VALUES (%s,%s,%s)", (token, u['id'], expires)
            )
            link = f"/reset-password.html?token={token}"
            send_email_stub(email, 'Password reset',
                            f"Hello {u['full_name']}, click to reset: {link}")
        # Always return ok to avoid email enumeration
        return jsonify({'message': 'If the email exists, a reset link was sent.'}), 200
    finally:
        db.close()


@bp_v2.route('/auth/reset-password', methods=['POST'])
@rate_limit('reset', max_calls=10, per_seconds=600)
def reset_password():
    data = request.get_json() or {}
    token = data.get('token')
    new_pw = data.get('password') or ''
    if not token or len(new_pw) < 6:
        return jsonify({'error': 'token and 6+ char password required'}), 400
    db = Database()
    try:
        row = db.execute_query(
            "SELECT user_id, expires_at, used FROM password_resets WHERE token=%s",
            (token,), fetch_one=True
        )
        if not row or row['used'] or row['expires_at'] < datetime.utcnow():
            return jsonify({'error': 'Invalid or expired token'}), 400
        db.execute_query(
            "UPDATE users SET password_hash=%s WHERE id=%s",
            (hash_password(new_pw), row['user_id'])
        )
        db.execute_query(
            "UPDATE password_resets SET used=TRUE WHERE token=%s", (token,)
        )
        return jsonify({'message': 'Password updated'}), 200
    finally:
        db.close()


# ---- SOS --------------------------------------------------------------------

@bp_v2.route('/sos', methods=['POST'])
@auth_required
def sos():
    """Notify emergency contact + push in-app notice."""
    data = request.get_json() or {}
    lat = data.get('latitude'); lng = data.get('longitude')
    db = Database()
    try:
        u = db.execute_query(
            "SELECT full_name, emergency_contact_name, emergency_contact_phone "
            "FROM users WHERE id=%s", (request.user_id,), fetch_one=True
        )
        msg = (f"SOS from {u['full_name']}. "
               f"Location: {lat},{lng}." if lat and lng
               else f"SOS from {u['full_name']}.")
        if u and u.get('emergency_contact_phone'):
            send_sms_stub(u['emergency_contact_phone'], msg)
        push_notification(db, request.user_id, 'SOS sent',
                          'Your emergency contact was notified.', None)
        return jsonify({'message': 'SOS dispatched'}), 200
    finally:
        db.close()


# ---- Global search ----------------------------------------------------------

@bp_v2.route('/search', methods=['GET'])
def global_search():
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return jsonify({'hospitals': [], 'pharmacies': [], 'drugs': [],
                        'services': [], 'doctors': []}), 200
    like = f"%{q}%"
    db = Database()
    try:
        hospitals = db.execute_query(
            "SELECT id, name, address FROM hospitals "
            "WHERE name LIKE %s OR address LIKE %s LIMIT 10",
            (like, like), fetch=True
        ) or []
        pharmacies = db.execute_query(
            "SELECT id, name, address FROM pharmacies "
            "WHERE name LIKE %s OR address LIKE %s LIMIT 10",
            (like, like), fetch=True
        ) or []
        drugs = db.execute_query(
            "SELECT id, name, generic_name FROM drugs "
            "WHERE name LIKE %s OR generic_name LIKE %s LIMIT 10",
            (like, like), fetch=True
        ) or []
        services = db.execute_query(
            "SELECT id, name FROM services WHERE name LIKE %s LIMIT 10",
            (like,), fetch=True
        ) or []
        doctors = db.execute_query(
            "SELECT d.id, u.full_name, d.specialty FROM doctors d "
            "JOIN users u ON u.id=d.user_id "
            "WHERE u.full_name LIKE %s OR d.specialty LIKE %s LIMIT 10",
            (like, like), fetch=True
        ) or []
        return jsonify({'hospitals': hospitals, 'pharmacies': pharmacies,
                        'drugs': drugs, 'services': services,
                        'doctors': doctors}), 200
    finally:
        db.close()
