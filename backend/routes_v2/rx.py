"""E-prescription endpoints. Doctors create, patients list,
pharmacies dispense via rx_code (the QR payload)."""
from flask import jsonify, request

from db import Database
from . import bp_v2, auth_required, role_required, gen_token, push_notification


def _doctor_id_for_user(db, user_id):
    row = db.execute_query(
        "SELECT id FROM doctors WHERE user_id=%s", (user_id,), fetch_one=True
    )
    return row['id'] if row else None


@bp_v2.route('/prescriptions', methods=['POST'])
@role_required('doctor')
def create_prescription():
    """Doctor issues a new prescription with one or more drug items."""
    data = request.get_json() or {}
    patient_id = data.get('patient_id')
    items = data.get('items') or []
    if not patient_id or not items:
        return jsonify({'error': 'patient_id and items are required'}), 400

    db = Database()
    try:
        rx_code = gen_token('RX-')
        rx_id = db.execute_query(
            "INSERT INTO prescriptions (patient_id, doctor_id, consultation_id, "
            "rx_code, notes) VALUES (%s,%s,%s,%s,%s)",
            (patient_id, request.user_id, data.get('consultation_id'),
             rx_code, data.get('notes'))
        )
        for it in items:
            db.execute_query(
                "INSERT INTO prescription_items (prescription_id, drug_id, "
                "drug_name, dosage, frequency, duration_days, instructions) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (rx_id, it.get('drug_id'), it.get('drug_name'),
                 it.get('dosage'), it.get('frequency'),
                 it.get('duration_days'), it.get('instructions'))
            )
        push_notification(db, patient_id,
                          'New prescription issued',
                          f'Your doctor issued a prescription. Code: {rx_code}',
                          f'/prescription-view.html?code={rx_code}')
        return jsonify({'id': rx_id, 'rx_code': rx_code}), 201
    finally:
        db.close()


@bp_v2.route('/prescriptions/me', methods=['GET'])
@auth_required
def list_my_prescriptions():
    """Patient's own prescriptions."""
    db = Database()
    try:
        rows = db.execute_query(
            "SELECT p.*, u.full_name AS doctor_name "
            "FROM prescriptions p "
            "JOIN users u ON u.id = p.doctor_id "
            "WHERE p.patient_id=%s ORDER BY p.created_at DESC",
            (request.user_id,), fetch=True
        ) or []
        return jsonify({'prescriptions': rows}), 200
    finally:
        db.close()


@bp_v2.route('/prescriptions/issued', methods=['GET'])
@role_required('doctor')
def list_issued_prescriptions():
    """Prescriptions written by this doctor."""
    db = Database()
    try:
        rows = db.execute_query(
            "SELECT p.*, u.full_name AS patient_name "
            "FROM prescriptions p "
            "JOIN users u ON u.id = p.patient_id "
            "WHERE p.doctor_id=%s ORDER BY p.created_at DESC",
            (request.user_id,), fetch=True
        ) or []
        return jsonify({'prescriptions': rows}), 200
    finally:
        db.close()


@bp_v2.route('/prescriptions/<code>', methods=['GET'])
@auth_required
def get_prescription_by_code(code):
    """Lookup a prescription by its rx_code (pharmacy scans QR)."""
    db = Database()
    try:
        rx = db.execute_query(
            "SELECT p.*, pa.full_name AS patient_name, "
            "       d.full_name AS doctor_name "
            "FROM prescriptions p "
            "JOIN users pa ON pa.id = p.patient_id "
            "JOIN users d ON d.id = p.doctor_id "
            "WHERE p.rx_code=%s", (code,), fetch_one=True
        )
        if not rx:
            return jsonify({'error': 'Prescription not found'}), 404
        items = db.execute_query(
            "SELECT * FROM prescription_items WHERE prescription_id=%s",
            (rx['id'],), fetch=True
        ) or []
        return jsonify({'prescription': rx, 'items': items}), 200
    finally:
        db.close()


@bp_v2.route('/prescriptions/<code>/dispense', methods=['POST'])
@auth_required
def dispense_prescription(code):
    """Mark a prescription as dispensed. Pharmacy operator scans QR & calls this."""
    db = Database()
    try:
        rx = db.execute_query(
            "SELECT id, patient_id, status FROM prescriptions WHERE rx_code=%s",
            (code,), fetch_one=True
        )
        if not rx:
            return jsonify({'error': 'Prescription not found'}), 404
        if rx['status'] == 'dispensed':
            return jsonify({'error': 'Already dispensed'}), 400
        db.execute_query(
            "UPDATE prescriptions SET status='dispensed', dispensed_by=%s, "
            "dispensed_at=NOW() WHERE id=%s",
            (request.user_id, rx['id'])
        )
        push_notification(db, rx['patient_id'],
                          'Prescription dispensed',
                          f'Your prescription {code} was dispensed.',
                          '/user-dashboard.html#prescriptions')
        return jsonify({'message': 'Dispensed'}), 200
    finally:
        db.close()
