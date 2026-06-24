"""File uploads (lab results, scans, documents)."""
import os
import time

from flask import jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from db import Database
from . import bp_v2, auth_required


UPLOAD_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'uploads')
)
ALLOWED_EXT = {'pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv'}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def _ensure_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _allowed(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT


@bp_v2.route('/uploads', methods=['POST'])
@auth_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    f = request.files['file']
    if not f or not f.filename:
        return jsonify({'error': 'Empty file'}), 400
    if not _allowed(f.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > MAX_BYTES:
        return jsonify({'error': 'File too large (max 5 MB)'}), 400

    _ensure_dir()
    safe_name = secure_filename(f.filename)
    user_dir = os.path.join(UPLOAD_DIR, str(request.user_id))
    os.makedirs(user_dir, exist_ok=True)
    final_name = f"{int(time.time())}_{safe_name}"
    full_path = os.path.join(user_dir, final_name)
    f.save(full_path)

    rel_path = os.path.relpath(full_path, UPLOAD_DIR).replace('\\', '/')
    db = Database()
    try:
        new_id = db.execute_query(
            "INSERT INTO file_uploads (user_id, related_type, related_id, "
            "filename, mime_type, size_bytes, path) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (request.user_id,
             request.form.get('related_type'),
             request.form.get('related_id') or None,
             safe_name, f.mimetype, size, rel_path)
        )
        return jsonify({'id': new_id, 'filename': safe_name,
                        'path': rel_path, 'size_bytes': size}), 201
    finally:
        db.close()


@bp_v2.route('/uploads', methods=['GET'])
@auth_required
def list_my_uploads():
    rt = request.args.get('related_type')
    rid = request.args.get('related_id')
    db = Database()
    try:
        if rt and rid:
            rows = db.execute_query(
                "SELECT * FROM file_uploads WHERE user_id=%s "
                "AND related_type=%s AND related_id=%s ORDER BY uploaded_at DESC",
                (request.user_id, rt, rid), fetch=True
            ) or []
        else:
            rows = db.execute_query(
                "SELECT * FROM file_uploads WHERE user_id=%s "
                "ORDER BY uploaded_at DESC LIMIT 200",
                (request.user_id,), fetch=True
            ) or []
        return jsonify({'files': rows}), 200
    finally:
        db.close()


@bp_v2.route('/uploads/<int:fid>', methods=['GET'])
@auth_required
def download_file(fid):
    db = Database()
    try:
        row = db.execute_query(
            "SELECT * FROM file_uploads WHERE id=%s AND user_id=%s",
            (fid, request.user_id), fetch_one=True
        )
        if not row:
            return jsonify({'error': 'Not found'}), 404
        return send_from_directory(UPLOAD_DIR, row['path'],
                                   as_attachment=True,
                                   download_name=row['filename'])
    finally:
        db.close()


@bp_v2.route('/uploads/<int:fid>', methods=['DELETE'])
@auth_required
def delete_upload(fid):
    db = Database()
    try:
        row = db.execute_query(
            "SELECT path FROM file_uploads WHERE id=%s AND user_id=%s",
            (fid, request.user_id), fetch_one=True
        )
        if not row:
            return jsonify({'error': 'Not found'}), 404
        full = os.path.join(UPLOAD_DIR, row['path'])
        try:
            if os.path.exists(full):
                os.remove(full)
        except OSError:
            pass
        db.execute_query(
            "DELETE FROM file_uploads WHERE id=%s AND user_id=%s",
            (fid, request.user_id)
        )
        return jsonify({'message': 'Deleted'}), 200
    finally:
        db.close()
