"""Doctor schedule slots & slot-based booking."""
from datetime import datetime, timedelta

from flask import jsonify, request

from db import Database
from . import bp_v2, auth_required, role_required, push_notification


def _doctor_id_for_user(db, user_id):
    row = db.execute_query(
        "SELECT id FROM doctors WHERE user_id=%s", (user_id,), fetch_one=True
    )
    return row['id'] if row else None


@bp_v2.route('/doctors/<int:doctor_id>/slots', methods=['GET'])
def list_slots(doctor_id):
    """Patient-facing: list open future slots for a doctor."""
    db = Database()
    try:
        rows = db.execute_query(
            "SELECT id, start_time, end_time, status "
            "FROM doctor_slots "
            "WHERE doctor_id=%s AND status='open' AND start_time > NOW() "
            "ORDER BY start_time ASC LIMIT 200",
            (doctor_id,), fetch=True
        ) or []
        return jsonify({'slots': rows}), 200
    finally:
        db.close()


@bp_v2.route('/me/slots', methods=['GET'])
@role_required('doctor')
def list_my_slots():
    db = Database()
    try:
        did = _doctor_id_for_user(db, request.user_id)
        if not did:
            return jsonify({'error': 'Doctor profile not found'}), 404
        rows = db.execute_query(
            "SELECT * FROM doctor_slots WHERE doctor_id=%s "
            "AND start_time > NOW() - INTERVAL 7 DAY "
            "ORDER BY start_time ASC LIMIT 500",
            (did,), fetch=True
        ) or []
        return jsonify({'slots': rows}), 200
    finally:
        db.close()


@bp_v2.route('/me/slots', methods=['POST'])
@role_required('doctor')
def create_slot():
    """Create a single slot or a recurring batch.
    Body: {start_time, end_time} OR
          {date, start_hour, end_hour, slot_minutes, repeat_days}."""
    data = request.get_json() or {}
    db = Database()
    try:
        did = _doctor_id_for_user(db, request.user_id)
        if not did:
            return jsonify({'error': 'Doctor profile not found'}), 404
        if data.get('start_time') and data.get('end_time'):
            db.execute_query(
                "INSERT INTO doctor_slots (doctor_id, start_time, end_time) "
                "VALUES (%s,%s,%s)",
                (did, data['start_time'], data['end_time'])
            )
            return jsonify({'message': 'Slot added'}), 201
        date = data.get('date')
        sh = int(data.get('start_hour', 9))
        eh = int(data.get('end_hour', 17))
        mins = int(data.get('slot_minutes', 30))
        rep = int(data.get('repeat_days', 1))
        if not date:
            return jsonify({'error': 'date or start_time required'}), 400
        try:
            base = datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'date must be YYYY-MM-DD'}), 400
        created = 0
        for d_off in range(rep):
            day = base + timedelta(days=d_off)
            t = day.replace(hour=sh, minute=0, second=0, microsecond=0)
            end_of_day = day.replace(hour=eh, minute=0, second=0, microsecond=0)
            while t + timedelta(minutes=mins) <= end_of_day:
                db.execute_query(
                    "INSERT INTO doctor_slots (doctor_id, start_time, end_time) "
                    "VALUES (%s,%s,%s)",
                    (did, t, t + timedelta(minutes=mins))
                )
                t += timedelta(minutes=mins)
                created += 1
        return jsonify({'message': f'{created} slots created'}), 201
    finally:
        db.close()


@bp_v2.route('/me/slots/<int:sid>', methods=['DELETE'])
@role_required('doctor')
def delete_slot(sid):
    db = Database()
    try:
        did = _doctor_id_for_user(db, request.user_id)
        db.execute_query(
            "DELETE FROM doctor_slots WHERE id=%s AND doctor_id=%s "
            "AND status='open'", (sid, did)
        )
        return jsonify({'message': 'Deleted'}), 200
    finally:
        db.close()


@bp_v2.route('/slots/<int:sid>/book', methods=['POST'])
@auth_required
def book_slot(sid):
    """Patient books a slot -> creates a consultation row + marks slot booked."""
    data = request.get_json() or {}
    symptoms = (data.get('symptoms') or '').strip()
    db = Database()
    try:
        slot = db.execute_query(
            "SELECT * FROM doctor_slots WHERE id=%s", (sid,), fetch_one=True
        )
        if not slot:
            return jsonify({'error': 'Slot not found'}), 404
        if slot['status'] != 'open':
            return jsonify({'error': 'Slot not available'}), 400
        doc = db.execute_query(
            "SELECT user_id FROM doctors WHERE id=%s",
            (slot['doctor_id'],), fetch_one=True
        )
        cid = db.execute_query(
            "INSERT INTO consultations (patient_id, doctor_id, "
            "appointment_date, status, symptoms) VALUES (%s,%s,%s,'pending',%s)",
            (request.user_id, slot['doctor_id'], slot['start_time'], symptoms)
        )
        db.execute_query(
            "UPDATE doctor_slots SET status='booked', consultation_id=%s "
            "WHERE id=%s", (cid, sid)
        )
        if doc:
            push_notification(db, doc['user_id'],
                              'New appointment booked',
                              f"Slot {slot['start_time']} booked by a patient.",
                              '/doctor-dashboard.html')
        return jsonify({'message': 'Booked', 'consultation_id': cid}), 201
    finally:
        db.close()
