"""Mobile-money / payment stubs.

Real integration plugs in at `_provider_charge` for MTN MoMo / Orange Money.
For now the stub returns a synthetic provider_ref and marks the payment
as 'succeeded' immediately so end-to-end flows can be exercised.
"""
import os
import secrets

from flask import jsonify, request

from db import Database
from . import bp_v2, auth_required, push_notification


PAYMENT_PROVIDER = os.getenv('PAYMENT_PROVIDER', 'stub').lower()


def _provider_charge(provider, phone, amount, currency, purpose):
    """Stub charge. Returns (status, provider_ref)."""
    if provider == 'stub':
        return 'succeeded', f"STUB-{secrets.token_hex(6).upper()}"
    # Plug MTN MoMo / Orange Money here.
    return 'pending', f"{provider.upper()}-{secrets.token_hex(6).upper()}"


@bp_v2.route('/payments', methods=['POST'])
@auth_required
def create_payment():
    """Initiate a payment for a consultation, prescription or other purpose."""
    data = request.get_json() or {}
    amount = data.get('amount')
    purpose = data.get('purpose') or 'consultation'
    phone = data.get('phone')
    if not amount or float(amount) <= 0:
        return jsonify({'error': 'amount required'}), 400

    provider = data.get('provider') or PAYMENT_PROVIDER
    status, ref = _provider_charge(
        provider, phone, amount,
        data.get('currency', 'XAF'), purpose
    )

    db = Database()
    try:
        new_id = db.execute_query(
            "INSERT INTO payments (user_id, amount, currency, provider, "
            "provider_ref, purpose, related_id, status) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (request.user_id, amount, data.get('currency', 'XAF'),
             provider, ref, purpose, data.get('related_id'), status)
        )
        if status == 'succeeded':
            push_notification(db, request.user_id,
                              'Payment received',
                              f"{amount} {data.get('currency','XAF')} for {purpose}",
                              '/user-dashboard.html#payments')
        return jsonify({'id': new_id, 'status': status,
                        'provider_ref': ref}), 201
    finally:
        db.close()


@bp_v2.route('/payments/me', methods=['GET'])
@auth_required
def list_my_payments():
    db = Database()
    try:
        rows = db.execute_query(
            "SELECT * FROM payments WHERE user_id=%s "
            "ORDER BY created_at DESC LIMIT 200",
            (request.user_id,), fetch=True
        ) or []
        return jsonify({'payments': rows}), 200
    finally:
        db.close()


@bp_v2.route('/payments/<int:pid>', methods=['GET'])
@auth_required
def get_payment(pid):
    db = Database()
    try:
        row = db.execute_query(
            "SELECT * FROM payments WHERE id=%s AND user_id=%s",
            (pid, request.user_id), fetch_one=True
        )
        if not row:
            return jsonify({'error': 'Not found'}), 404
        return jsonify({'payment': row}), 200
    finally:
        db.close()
