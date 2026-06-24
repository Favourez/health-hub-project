from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt
from db import Database

def token_required(f):
    """Decorator to require valid JWT token"""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            print(f"[AUTH] Verifying JWT for {f.__name__}")
            print(f"[AUTH] Authorization header: {request.headers.get('Authorization', 'NOT PRESENT')}")
            verify_jwt_in_request()
            print(f"[AUTH] JWT verified successfully")
            return f(*args, **kwargs)
        except Exception as e:
            print(f"[AUTH] JWT verification failed: {type(e).__name__}: {str(e)}")
            return jsonify({'error': 'Invalid or missing token', 'message': str(e)}), 401
    return decorated

def role_required(*allowed_roles):
    """Decorator to require specific user roles"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            try:
                verify_jwt_in_request()
                claims = get_jwt()
                user_role = claims.get('role')
                
                if user_role not in allowed_roles:
                    return jsonify({'error': 'Access denied', 'message': 'Insufficient permissions'}), 403
                
                return f(*args, **kwargs)
            except Exception as e:
                return jsonify({'error': 'Authorization failed', 'message': str(e)}), 401
        return decorated
    return decorator

def get_current_user():
    """Get current authenticated user details"""
    try:
        verify_jwt_in_request()
        user_id = int(get_jwt_identity())  # Convert from string to int
        claims = get_jwt()

        return {
            'id': user_id,
            'role': claims.get('role'),
            'username': claims.get('username')
        }
    except:
        return None

def log_audit(user_id, action, entity_type=None, entity_id=None, details=None):
    """Log audit trail for admin actions"""
    try:
        db = Database()
        ip_address = request.remote_addr if request else None
        
        query = """
            INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        db.execute_query(query, (user_id, action, entity_type, entity_id, details, ip_address))
        db.close()
    except Exception as e:
        print(f"Audit log error: {e}")

