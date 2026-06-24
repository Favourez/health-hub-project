"""Health profile + vitals endpoints."""
from flask import jsonify, request

from db import Database
from . import bp_v2, auth_required


PROFILE_FIELDS = (
    'blood_type', 'height_cm', 'weight_kg', 'allergies',
    'chronic_conditions', 'current_medications', 'family_history',
    'vaccinations', 'smoker', 'alcohol', 'date_of_birth', 'sex',
)

USER_PROFILE_FIELDS = (
    'emergency_contact_name', 'emergency_contact_phone',
    'locale', 'theme', 'address',
)


@bp_v2.route('/me/profile', methods=['GET'])
@auth_required
def get_profile():
    db = Database()
    try:
        u = db.execute_query(
            "SELECT id, username, email, full_name, role, phone, "
            "emergency_contact_name, emergency_contact_phone, locale, theme, address "
            "FROM users WHERE id=%s", (request.user_id,), fetch_one=True
        )
        hp = db.execute_query(
            "SELECT * FROM health_profile WHERE user_id=%s",
            (request.user_id,), fetch_one=True
        )
        return jsonify({'user': u, 'health': hp}), 200
    finally:
        db.close()


@bp_v2.route('/me/profile', methods=['PUT'])
@auth_required
def update_profile():
    data = request.get_json() or {}
    db = Database()
    try:
        u_updates = {k: data[k] for k in USER_PROFILE_FIELDS if k in data}
        if u_updates:
            sets = ', '.join(f"{k}=%s" for k in u_updates)
            db.execute_query(
                f"UPDATE users SET {sets} WHERE id=%s",
                tuple(list(u_updates.values()) + [request.user_id])
            )
        hp_updates = {k: data[k] for k in PROFILE_FIELDS if k in data}
        if hp_updates:
            existing = db.execute_query(
                "SELECT user_id FROM health_profile WHERE user_id=%s",
                (request.user_id,), fetch_one=True
            )
            if existing:
                sets = ', '.join(f"{k}=%s" for k in hp_updates)
                db.execute_query(
                    f"UPDATE health_profile SET {sets} WHERE user_id=%s",
                    tuple(list(hp_updates.values()) + [request.user_id])
                )
            else:
                cols = ['user_id'] + list(hp_updates.keys())
                placeholders = ', '.join(['%s'] * len(cols))
                vals = [request.user_id] + list(hp_updates.values())
                db.execute_query(
                    f"INSERT INTO health_profile ({', '.join(cols)}) VALUES ({placeholders})",
                    tuple(vals)
                )
        return jsonify({'message': 'Profile updated'}), 200
    finally:
        db.close()


@bp_v2.route('/me/vitals', methods=['GET'])
@auth_required
def list_vitals():
    db = Database()
    try:
        rows = db.execute_query(
            "SELECT * FROM vitals WHERE user_id=%s ORDER BY recorded_at DESC LIMIT 200",
            (request.user_id,), fetch=True
        ) or []
        return jsonify({'vitals': rows}), 200
    finally:
        db.close()


@bp_v2.route('/me/vitals', methods=['POST'])
@auth_required
def add_vital():
    data = request.get_json() or {}
    fields = ('systolic', 'diastolic', 'heart_rate', 'glucose_mg_dl',
              'weight_kg', 'temperature_c', 'spo2', 'notes')
    vals = [data.get(k) for k in fields]
    db = Database()
    try:
        cols = ', '.join(fields)
        ph = ', '.join(['%s'] * len(fields))
        new_id = db.execute_query(
            f"INSERT INTO vitals (user_id, {cols}) VALUES (%s, {ph})",
            tuple([request.user_id] + vals)
        )
        return jsonify({'message': 'Vital recorded', 'id': new_id}), 201
    finally:
        db.close()


@bp_v2.route('/me/vitals/<int:vid>', methods=['DELETE'])
@auth_required
def delete_vital(vid):
    db = Database()
    try:
        db.execute_query(
            "DELETE FROM vitals WHERE id=%s AND user_id=%s",
            (vid, request.user_id)
        )
        return jsonify({'message': 'Deleted'}), 200
    finally:
        db.close()


@bp_v2.route('/me/export', methods=['GET'])
@auth_required
def export_my_data():
    """GDPR-style export of all user-owned rows."""
    db = Database()
    try:
        out = {}
        for tbl, key in [
            ('users', 'id'), ('health_profile', 'user_id'), ('vitals', 'user_id'),
            ('diagnosis_history', 'user_id'), ('consultations', 'patient_id'),
            ('medical_tests', 'patient_id'), ('prescriptions', 'patient_id'),
            ('ratings', 'user_id'), ('notifications', 'user_id'),
            ('payments', 'user_id'), ('file_uploads', 'user_id'),
        ]:
            rows = db.execute_query(
                f"SELECT * FROM {tbl} WHERE {key}=%s",
                (request.user_id,), fetch=True
            ) or []
            for r in rows:
                if 'password_hash' in r:
                    r.pop('password_hash', None)
            out[tbl] = rows
        return jsonify(out), 200
    finally:
        db.close()
