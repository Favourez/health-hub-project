"""Ratings, notifications, public health alerts."""
from flask import jsonify, request

from db import Database
from . import bp_v2, auth_required, role_required


# ---- Ratings ----------------------------------------------------------------

VALID_TARGETS = ('hospital', 'pharmacy', 'doctor')


@bp_v2.route('/ratings', methods=['POST'])
@auth_required
def add_or_update_rating():
    data = request.get_json() or {}
    t = data.get('target_type')
    tid = data.get('target_id')
    stars = data.get('stars')
    if t not in VALID_TARGETS or not tid or not isinstance(stars, int) \
            or stars < 1 or stars > 5:
        return jsonify({'error': 'Invalid rating payload'}), 400
    db = Database()
    try:
        db.execute_query(
            "INSERT INTO ratings (user_id, target_type, target_id, stars, comment) "
            "VALUES (%s,%s,%s,%s,%s) "
            "ON DUPLICATE KEY UPDATE stars=VALUES(stars), "
            "comment=VALUES(comment), created_at=NOW()",
            (request.user_id, t, tid, stars, data.get('comment'))
        )
        return jsonify({'message': 'Saved'}), 201
    finally:
        db.close()


@bp_v2.route('/ratings/<target_type>/<int:target_id>', methods=['GET'])
def get_ratings(target_type, target_id):
    if target_type not in VALID_TARGETS:
        return jsonify({'error': 'Invalid target type'}), 400
    db = Database()
    try:
        agg = db.execute_query(
            "SELECT COUNT(*) AS count, AVG(stars) AS average "
            "FROM ratings WHERE target_type=%s AND target_id=%s",
            (target_type, target_id), fetch_one=True
        ) or {'count': 0, 'average': None}
        rows = db.execute_query(
            "SELECT r.stars, r.comment, r.created_at, u.full_name "
            "FROM ratings r JOIN users u ON u.id=r.user_id "
            "WHERE r.target_type=%s AND r.target_id=%s "
            "ORDER BY r.created_at DESC LIMIT 50",
            (target_type, target_id), fetch=True
        ) or []
        avg = float(agg['average']) if agg.get('average') else None
        return jsonify({'count': agg['count'], 'average': avg,
                        'reviews': rows}), 200
    finally:
        db.close()


# ---- Notifications ----------------------------------------------------------

@bp_v2.route('/notifications', methods=['GET'])
@auth_required
def list_notifications():
    db = Database()
    try:
        rows = db.execute_query(
            "SELECT * FROM notifications WHERE user_id=%s "
            "ORDER BY created_at DESC LIMIT 100",
            (request.user_id,), fetch=True
        ) or []
        unread = sum(1 for r in rows if not r.get('read_at'))
        return jsonify({'notifications': rows, 'unread': unread}), 200
    finally:
        db.close()


@bp_v2.route('/notifications/<int:nid>/read', methods=['POST'])
@auth_required
def mark_read(nid):
    db = Database()
    try:
        db.execute_query(
            "UPDATE notifications SET read_at=NOW() "
            "WHERE id=%s AND user_id=%s",
            (nid, request.user_id)
        )
        return jsonify({'message': 'Marked read'}), 200
    finally:
        db.close()


@bp_v2.route('/notifications/read-all', methods=['POST'])
@auth_required
def mark_all_read():
    db = Database()
    try:
        db.execute_query(
            "UPDATE notifications SET read_at=NOW() "
            "WHERE user_id=%s AND read_at IS NULL",
            (request.user_id,)
        )
        return jsonify({'message': 'All marked read'}), 200
    finally:
        db.close()


# ---- Public Health Alerts ---------------------------------------------------

@bp_v2.route('/alerts', methods=['GET'])
def list_alerts():
    """Public endpoint - any visitor can see active alerts."""
    db = Database()
    try:
        rows = db.execute_query(
            "SELECT id, title, body, severity, created_at FROM public_alerts "
            "WHERE active=TRUE ORDER BY created_at DESC LIMIT 5",
            fetch=True
        ) or []
        return jsonify({'alerts': rows}), 200
    finally:
        db.close()


@bp_v2.route('/alerts', methods=['POST'])
@role_required('admin')
def create_alert():
    data = request.get_json() or {}
    if not data.get('title') or not data.get('body'):
        return jsonify({'error': 'title and body required'}), 400
    db = Database()
    try:
        new_id = db.execute_query(
            "INSERT INTO public_alerts (title, body, severity, created_by) "
            "VALUES (%s,%s,%s,%s)",
            (data['title'], data['body'],
             data.get('severity', 'info'), request.user_id)
        )
        return jsonify({'id': new_id}), 201
    finally:
        db.close()


@bp_v2.route('/alerts/<int:aid>', methods=['DELETE'])
@role_required('admin')
def deactivate_alert(aid):
    db = Database()
    try:
        db.execute_query(
            "UPDATE public_alerts SET active=FALSE WHERE id=%s", (aid,)
        )
        return jsonify({'message': 'Deactivated'}), 200
    finally:
        db.close()
