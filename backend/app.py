from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity
from config import Config
from db import Database, hash_password, verify_password, init_database
from auth import token_required, role_required, get_current_user, log_audit
from datetime import datetime, timedelta
import re
import uuid
import json
import math
import ai_provider

app = Flask(__name__)
app.config['JWT_SECRET_KEY'] = Config.JWT_SECRET_KEY
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES)

CORS(app)
jwt = JWTManager(app)

# Register v2 routes blueprint (modular endpoints under /api/v2)
from routes_v2 import bp_v2 as _bp_v2
app.register_blueprint(_bp_v2, url_prefix='/api/v2')

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def validate_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_phone(phone):
    """Validate phone number format"""
    pattern = r'^\+?[\d\s\-()]{10,20}$'
    return re.match(pattern, phone) is not None

# ============================================================================
# AUTHENTICATION ROUTES
# ============================================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    """User registration endpoint"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['username', 'email', 'password', 'full_name']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        # Validate email format
        if not validate_email(data['email']):
            return jsonify({'error': 'Invalid email format'}), 400
        
        # Validate password strength
        if len(data['password']) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        
        db = Database()
        
        # Check if username or email already exists
        check_query = "SELECT id FROM users WHERE username = %s OR email = %s"
        existing = db.execute_query(check_query, (data['username'], data['email']), fetch_one=True)
        
        if existing:
            db.close()
            return jsonify({'error': 'Username or email already exists'}), 409
        
        # Hash password
        password_hash = hash_password(data['password'])
        
        # Insert new user
        insert_query = """
            INSERT INTO users (username, email, password_hash, full_name, role, phone)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        role = data.get('role', 'user')
        if role not in ['user', 'doctor']:
            role = 'user'  # Only allow user or doctor registration
        
        user_id = db.execute_query(insert_query, (
            data['username'],
            data['email'],
            password_hash,
            data['full_name'],
            role,
            data.get('phone')
        ))
        
        # If registering as doctor, create doctor profile
        if role == 'doctor' and data.get('specialty'):
            doctor_query = """
                INSERT INTO doctors (user_id, specialty, license_number, experience_years, consultation_fee)
                VALUES (%s, %s, %s, %s, %s)
            """
            db.execute_query(doctor_query, (
                user_id,
                data.get('specialty'),
                data.get('license_number'),
                data.get('experience_years', 0),
                data.get('consultation_fee', 0)
            ))
        
        db.close()
        
        return jsonify({
            'message': 'Registration successful',
            'user_id': user_id
        }), 201
        
    except Exception as e:
        return jsonify({'error': 'Registration failed', 'message': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login endpoint"""
    try:
        data = request.get_json()
        
        if not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Username and password are required'}), 400
        
        db = Database()
        
        # Get user by username
        query = "SELECT * FROM users WHERE username = %s"
        user = db.execute_query(query, (data['username'],), fetch_one=True)
        
        db.close()
        
        if not user or not verify_password(data['password'], user['password_hash']):
            return jsonify({'error': 'Invalid username or password'}), 401
        
        # Create JWT token with user claims
        additional_claims = {
            'role': user['role'],
            'username': user['username']
        }
        access_token = create_access_token(
            identity=str(user['id']),  # Convert to string for JWT
            additional_claims=additional_claims
        )
        
        return jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'user': {
                'id': user['id'],
                'username': user['username'],
                'email': user['email'],
                'full_name': user['full_name'],
                'role': user['role'],
                'phone': user['phone']
            }
        }), 200
        
    except Exception as e:
        return jsonify({'error': 'Login failed', 'message': str(e)}), 500

@app.route('/api/auth/me', methods=['GET'])
@token_required
def get_profile():
    """Get current user profile"""
    try:
        user_id = int(get_jwt_identity())  # Convert from string to int
        db = Database()

        query = "SELECT id, username, email, full_name, role, phone FROM users WHERE id = %s"
        user = db.execute_query(query, (user_id,), fetch_one=True)
        
        db.close()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'user': user}), 200
        
    except Exception as e:
        return jsonify({'error': 'Failed to fetch profile', 'message': str(e)}), 500

# ============================================================================
# HOSPITAL ROUTES
# ============================================================================

@app.route('/api/hospitals', methods=['GET'])
def get_hospitals():
    """Get all hospitals with their services"""
    try:
        db = Database()
        search = request.args.get('search', '')
        
        query = """
            SELECT h.*, GROUP_CONCAT(s.name SEPARATOR ', ') as services
            FROM hospitals h
            LEFT JOIN hospital_services hs ON h.id = hs.hospital_id
            LEFT JOIN services s ON hs.service_id = s.id
        """
        
        if search:
            query += " WHERE h.name LIKE %s OR h.address LIKE %s"
            params = (f'%{search}%', f'%{search}%')
            query += " GROUP BY h.id"
            hospitals = db.execute_query(query, params, fetch=True)
        else:
            query += " GROUP BY h.id"
            hospitals = db.execute_query(query, fetch=True)
        
        db.close()
        
        return jsonify({'hospitals': hospitals}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch hospitals', 'message': str(e)}), 500

# ============================================================================
# PHARMACIES ENDPOINTS
# ============================================================================

@app.route('/api/pharmacies', methods=['GET'])
def get_pharmacies():
    """Get all pharmacies"""
    try:
        db = Database()
        search = request.args.get('search', '')

        query = "SELECT * FROM pharmacies"

        if search:
            query += " WHERE name LIKE %s OR address LIKE %s"
            params = (f'%{search}%', f'%{search}%')
            pharmacies = db.execute_query(query, params, fetch=True)
        else:
            pharmacies = db.execute_query(query, fetch=True)

        db.close()

        return jsonify({'pharmacies': pharmacies}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch pharmacies', 'message': str(e)}), 500

@app.route('/api/pharmacies/<int:pharmacy_id>', methods=['GET'])
def get_pharmacy(pharmacy_id):
    """Get single pharmacy details with available drugs"""
    try:
        db = Database()

        # Get pharmacy details
        query = "SELECT * FROM pharmacies WHERE id = %s"
        pharmacy = db.execute_query(query, (pharmacy_id,), fetch_one=True)

        if not pharmacy:
            db.close()
            return jsonify({'error': 'Pharmacy not found'}), 404

        # Get pharmacy inventory with drug details
        inventory_query = """
            SELECT d.*, pi.quantity, pi.price, pi.in_stock
            FROM drugs d
            JOIN pharmacy_inventory pi ON d.id = pi.drug_id
            WHERE pi.pharmacy_id = %s AND pi.in_stock = TRUE
            ORDER BY d.name
        """
        drugs = db.execute_query(inventory_query, (pharmacy_id,), fetch=True)

        pharmacy['drugs'] = drugs
        db.close()

        return jsonify({'pharmacy': pharmacy}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch pharmacy', 'message': str(e)}), 500

@app.route('/api/drugs', methods=['GET'])
def get_drugs():
    """Get all drugs with optional search and category filter"""
    try:
        db = Database()
        search = request.args.get('search', '')
        category = request.args.get('category', '')

        query = "SELECT * FROM drugs WHERE 1=1"
        params = []

        if search:
            query += " AND (name LIKE %s OR generic_name LIKE %s OR description LIKE %s)"
            search_param = f'%{search}%'
            params.extend([search_param, search_param, search_param])

        if category:
            query += " AND category = %s"
            params.append(category)

        query += " ORDER BY name"

        if params:
            drugs = db.execute_query(query, tuple(params), fetch=True)
        else:
            drugs = db.execute_query(query, fetch=True)

        db.close()

        return jsonify({'drugs': drugs}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch drugs', 'message': str(e)}), 500

@app.route('/api/drugs/<int:drug_id>/pharmacies', methods=['GET'])
def get_drug_pharmacies(drug_id):
    """Get all pharmacies that have a specific drug in stock"""
    try:
        db = Database()

        # Get drug details
        drug_query = "SELECT * FROM drugs WHERE id = %s"
        drug = db.execute_query(drug_query, (drug_id,), fetch_one=True)

        if not drug:
            db.close()
            return jsonify({'error': 'Drug not found'}), 404

        # Get pharmacies with this drug in stock
        pharmacies_query = """
            SELECT p.*, pi.quantity, pi.price, pi.in_stock
            FROM pharmacies p
            JOIN pharmacy_inventory pi ON p.id = pi.pharmacy_id
            WHERE pi.drug_id = %s AND pi.in_stock = TRUE
            ORDER BY p.name
        """
        pharmacies = db.execute_query(pharmacies_query, (drug_id,), fetch=True)

        db.close()

        return jsonify({
            'drug': drug,
            'pharmacies': pharmacies
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch pharmacies for drug', 'message': str(e)}), 500

@app.route('/api/hospitals/<int:hospital_id>', methods=['GET'])
def get_hospital(hospital_id):
    """Get single hospital details"""
    try:
        db = Database()

        # Get hospital details
        query = "SELECT * FROM hospitals WHERE id = %s"
        hospital = db.execute_query(query, (hospital_id,), fetch_one=True)

        if not hospital:
            db.close()
            return jsonify({'error': 'Hospital not found'}), 404

        # Get hospital services
        services_query = """
            SELECT s.* FROM services s
            JOIN hospital_services hs ON s.id = hs.service_id
            WHERE hs.hospital_id = %s
        """
        services = db.execute_query(services_query, (hospital_id,), fetch=True)
        hospital['services'] = services

        db.close()

        return jsonify({'hospital': hospital}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch hospital', 'message': str(e)}), 500

@app.route('/api/hospitals', methods=['POST'])
@role_required('admin')
def create_hospital():
    """Create new hospital (Admin only)"""
    try:
        data = request.get_json()
        current_user = get_current_user()

        # Validate required fields
        required_fields = ['name', 'address', 'phone', 'emergency_contact']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400

        db = Database()

        # Insert hospital
        query = """
            INSERT INTO hospitals (name, address, phone, emergency_contact, email, description, latitude, longitude)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        hospital_id = db.execute_query(query, (
            data['name'],
            data['address'],
            data['phone'],
            data['emergency_contact'],
            data.get('email'),
            data.get('description'),
            data.get('latitude'),
            data.get('longitude')
        ))

        # Add services if provided
        if data.get('service_ids'):
            for service_id in data['service_ids']:
                service_query = "INSERT INTO hospital_services (hospital_id, service_id) VALUES (%s, %s)"
                db.execute_query(service_query, (hospital_id, service_id))

        db.close()

        # Log audit
        log_audit(current_user['id'], 'CREATE_HOSPITAL', 'hospital', hospital_id, f"Created hospital: {data['name']}")

        return jsonify({'message': 'Hospital created successfully', 'hospital_id': hospital_id}), 201

    except Exception as e:
        return jsonify({'error': 'Failed to create hospital', 'message': str(e)}), 500

@app.route('/api/hospitals/<int:hospital_id>', methods=['PUT'])
@role_required('admin')
def update_hospital(hospital_id):
    """Update hospital (Admin only)"""
    try:
        data = request.get_json()
        current_user = get_current_user()

        db = Database()

        # Build update query dynamically
        update_fields = []
        params = []

        for field in ['name', 'address', 'phone', 'emergency_contact', 'email', 'description']:
            if field in data:
                update_fields.append(f"{field} = %s")
                params.append(data[field])

        if not update_fields:
            db.close()
            return jsonify({'error': 'No fields to update'}), 400

        params.append(hospital_id)
        query = f"UPDATE hospitals SET {', '.join(update_fields)} WHERE id = %s"
        db.execute_query(query, tuple(params))

        # Update services if provided
        if 'service_ids' in data:
            # Remove existing services
            db.execute_query("DELETE FROM hospital_services WHERE hospital_id = %s", (hospital_id,))

            # Add new services
            for service_id in data['service_ids']:
                service_query = "INSERT INTO hospital_services (hospital_id, service_id) VALUES (%s, %s)"
                db.execute_query(service_query, (hospital_id, service_id))

        db.close()

        # Log audit
        log_audit(current_user['id'], 'UPDATE_HOSPITAL', 'hospital', hospital_id, f"Updated hospital ID: {hospital_id}")

        return jsonify({'message': 'Hospital updated successfully'}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to update hospital', 'message': str(e)}), 500

@app.route('/api/hospitals/<int:hospital_id>', methods=['DELETE'])
@role_required('admin')
def delete_hospital(hospital_id):
    """Delete hospital (Admin only)"""
    try:
        current_user = get_current_user()
        db = Database()

        query = "DELETE FROM hospitals WHERE id = %s"
        db.execute_query(query, (hospital_id,))
        db.close()

        # Log audit
        log_audit(current_user['id'], 'DELETE_HOSPITAL', 'hospital', hospital_id, f"Deleted hospital ID: {hospital_id}")

        return jsonify({'message': 'Hospital deleted successfully'}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to delete hospital', 'message': str(e)}), 500

# ============================================================================
# SERVICES ROUTES
# ============================================================================

@app.route('/api/services', methods=['GET'])
def get_services():
    """Get all services"""
    try:
        db = Database()
        query = "SELECT * FROM services ORDER BY name"
        services = db.execute_query(query, fetch=True)
        db.close()

        return jsonify({'services': services}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch services', 'message': str(e)}), 500

@app.route('/api/services/<int:service_id>/hospitals', methods=['GET'])
def get_service_hospitals(service_id):
    """Get all hospitals offering a specific service"""
    try:
        db = Database()

        service = db.execute_query(
            "SELECT * FROM services WHERE id = %s", (service_id,), fetch_one=True
        )
        if not service:
            db.close()
            return jsonify({'error': 'Service not found'}), 404

        hospitals_query = """
            SELECT h.*
            FROM hospitals h
            JOIN hospital_services hs ON h.id = hs.hospital_id
            WHERE hs.service_id = %s
            ORDER BY h.name
        """
        hospitals = db.execute_query(hospitals_query, (service_id,), fetch=True)
        db.close()

        return jsonify({'service': service, 'hospitals': hospitals}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch hospitals for service', 'message': str(e)}), 500

@app.route('/api/services', methods=['POST'])
@role_required('admin')
def create_service():
    """Create new service (Admin only)"""
    try:
        data = request.get_json()
        current_user = get_current_user()

        if not data.get('name'):
            return jsonify({'error': 'Service name is required'}), 400

        db = Database()
        query = "INSERT INTO services (name, description) VALUES (%s, %s)"
        service_id = db.execute_query(query, (data['name'], data.get('description')))
        db.close()

        # Log audit
        log_audit(current_user['id'], 'CREATE_SERVICE', 'service', service_id, f"Created service: {data['name']}")

        return jsonify({'message': 'Service created successfully', 'service_id': service_id}), 201

    except Exception as e:
        return jsonify({'error': 'Failed to create service', 'message': str(e)}), 500

# ============================================================================
# AI DIAGNOSIS ROUTES
# ============================================================================

DISCLAIMER = ('This diagnosis is not a substitute for professional medical advice. '
              'Please consult a qualified healthcare provider for accurate diagnosis '
              'and treatment.')


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    dlat = math.radians(float(lat2) - float(lat1))
    dlon = math.radians(float(lon2) - float(lon1))
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(float(lat1))) * math.cos(math.radians(float(lat2)))
         * math.sin(dlon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def enrich_with_local_data(result, user_lat=None, user_lng=None):
    """Cross-link specialty/OTC/red-flag to local hospitals, drugs and 24/7 hospitals."""
    db = Database()
    try:
        for diag in result.get('differential', []):
            specialty = diag.get('specialty')
            if specialty:
                svc = db.execute_query(
                    "SELECT id, name FROM services WHERE name = %s",
                    (specialty,), fetch_one=True
                )
                diag['service_id'] = svc['id'] if svc else None
                diag['service_name'] = svc['name'] if svc else specialty
            otc = diag.get('suggested_otc') or []
            diag['suggested_drugs'] = []
            if otc:
                placeholders = ','.join(['%s'] * len(otc))
                rows = db.execute_query(
                    f"SELECT id, name, requires_prescription FROM drugs "
                    f"WHERE name IN ({placeholders})",
                    tuple(otc), fetch=True
                ) or []
                diag['suggested_drugs'] = rows

        if result.get('red_flag') or any(d.get('risk_level') == 'high'
                                          for d in result.get('differential', [])):
            hospitals = db.execute_query(
                "SELECT id, name, address, phone, emergency_contact, latitude, longitude "
                "FROM hospitals WHERE is_24_hours = TRUE",
                fetch=True
            ) or []
            if user_lat is not None and user_lng is not None:
                for h in hospitals:
                    if h.get('latitude') and h.get('longitude'):
                        h['distance_km'] = round(
                            _haversine_km(user_lat, user_lng,
                                          h['latitude'], h['longitude']), 2)
                hospitals.sort(key=lambda h: h.get('distance_km') or 9999)
            result['emergency_hospitals'] = hospitals[:3]
        else:
            result['emergency_hospitals'] = []
    finally:
        db.close()
    return result


def _save_history(user_id, payload, result):
    """Persist a diagnosis run to diagnosis_history. Returns inserted id."""
    top = (result.get('differential') or [{}])[0]
    db = Database()
    try:
        row_id = db.execute_query(
            """INSERT INTO diagnosis_history
                  (user_id, symptoms, diagnosis_result, risk_level, recommendation,
                   age, sex, duration_days, severity, pregnant, current_medications,
                   specialty, confidence, ai_provider, differential_json, red_flag_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                user_id, payload.get('symptoms', ''),
                top.get('condition', 'Unknown'),
                top.get('risk_level', 'medium'),
                top.get('recommendation', ''),
                payload.get('age'), payload.get('sex'),
                payload.get('duration_days'), payload.get('severity'),
                bool(payload.get('pregnant')),
                payload.get('current_medications'),
                top.get('specialty'), top.get('confidence'),
                result.get('provider', 'rules-v2'),
                json.dumps(result.get('differential', [])),
                (result.get('red_flag') or {}).get('id'),
            )
        )
        return row_id
    finally:
        db.close()


@app.route('/api/diagnosis', methods=['POST'])
@token_required
def get_diagnosis():
    """Structured-intake diagnosis with differential, red flags and cross-links."""
    try:
        data = request.get_json() or {}
        user_id = int(get_jwt_identity())
        symptoms = (data.get('symptoms') or '').strip()
        if not symptoms:
            return jsonify({'error': 'Symptoms are required'}), 400

        result = ai_provider.analyze(
            symptoms,
            age=data.get('age'),
            sex=data.get('sex'),
            duration_days=data.get('duration_days'),
            severity=data.get('severity'),
            pregnant=bool(data.get('pregnant')),
            current_medications=data.get('current_medications'),
        )

        result = enrich_with_local_data(
            result,
            user_lat=data.get('latitude'),
            user_lng=data.get('longitude'),
        )

        history_id = _save_history(user_id, data, result)
        result['history_id'] = history_id
        result['disclaimer'] = DISCLAIMER
        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': 'Diagnosis failed', 'message': str(e)}), 500


@app.route('/api/diagnosis/follow-up', methods=['POST'])
@token_required
def diagnosis_follow_up():
    """Re-run diagnosis with extra answers appended to the original symptoms."""
    try:
        data = request.get_json() or {}
        user_id = int(get_jwt_identity())
        base = (data.get('symptoms') or '').strip()
        answers = data.get('answers') or []
        extra = ' '.join(a.get('keyword', '') for a in answers
                         if a.get('confirmed'))
        symptoms = (base + ' ' + extra).strip()
        if not symptoms:
            return jsonify({'error': 'Symptoms are required'}), 400

        result = ai_provider.analyze(
            symptoms,
            age=data.get('age'), sex=data.get('sex'),
            duration_days=data.get('duration_days'),
            severity=data.get('severity'),
            pregnant=bool(data.get('pregnant')),
            current_medications=data.get('current_medications'),
        )
        result = enrich_with_local_data(
            result, user_lat=data.get('latitude'), user_lng=data.get('longitude'))
        history_id = _save_history(user_id, {**data, 'symptoms': symptoms}, result)
        result['history_id'] = history_id
        result['disclaimer'] = DISCLAIMER
        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': 'Follow-up failed', 'message': str(e)}), 500

@app.route('/api/diagnosis/history', methods=['GET'])
@token_required
def get_diagnosis_history():
    """Get user's diagnosis history"""
    try:
        user_id = int(get_jwt_identity())  # Convert from string to int
        db = Database()

        query = """
            SELECT * FROM diagnosis_history
            WHERE user_id = %s
            ORDER BY created_at DESC
        """
        history = db.execute_query(query, (user_id,), fetch=True)
        db.close()

        return jsonify({'history': history}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch history', 'message': str(e)}), 500

# ============================================================================
# DOCTORS ROUTES
# ============================================================================

@app.route('/api/doctors', methods=['GET'])
def get_doctors():
    """Get all doctors"""
    try:
        db = Database()
        specialty = request.args.get('specialty')

        query = """
            SELECT d.*, u.full_name, u.email, u.phone, h.name as hospital_name
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN hospitals h ON d.hospital_id = h.id
            WHERE d.available = TRUE
        """

        if specialty:
            query += " AND d.specialty LIKE %s"
            doctors = db.execute_query(query, (f'%{specialty}%',), fetch=True)
        else:
            doctors = db.execute_query(query, fetch=True)

        db.close()

        return jsonify({'doctors': doctors}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch doctors', 'message': str(e)}), 500

@app.route('/api/doctors/<int:doctor_id>', methods=['GET'])
def get_doctor(doctor_id):
    """Get single doctor details"""
    try:
        db = Database()

        query = """
            SELECT d.*, u.full_name, u.email, u.phone, h.name as hospital_name
            FROM doctors d
            JOIN users u ON d.user_id = u.id
            LEFT JOIN hospitals h ON d.hospital_id = h.id
            WHERE d.id = %s
        """
        doctor = db.execute_query(query, (doctor_id,), fetch_one=True)
        db.close()

        if not doctor:
            return jsonify({'error': 'Doctor not found'}), 404

        return jsonify({'doctor': doctor}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch doctor', 'message': str(e)}), 500

# ============================================================================
# CONSULTATION ROUTES
# ============================================================================

@app.route('/api/consultations', methods=['POST'])
@token_required
def book_consultation():
    """Book a consultation"""
    try:
        data = request.get_json()
        user_id = int(get_jwt_identity())  # Convert from string to int

        # Validate required fields
        if not data.get('doctor_id') or not data.get('appointment_date'):
            return jsonify({'error': 'Doctor ID and appointment date are required'}), 400

        db = Database()

        # Check if doctor exists
        doctor_check = "SELECT id FROM doctors WHERE id = %s"
        doctor = db.execute_query(doctor_check, (data['doctor_id'],), fetch_one=True)

        if not doctor:
            db.close()
            return jsonify({'error': 'Doctor not found'}), 404

        # Insert consultation
        query = """
            INSERT INTO consultations (patient_id, doctor_id, appointment_date, symptoms, notes, status)
            VALUES (%s, %s, %s, %s, %s, 'pending')
        """
        consultation_id = db.execute_query(query, (
            user_id,
            data['doctor_id'],
            data['appointment_date'],
            data.get('symptoms'),
            data.get('notes')
        ))

        db.close()

        return jsonify({
            'message': 'Consultation booked successfully',
            'consultation_id': consultation_id
        }), 201

    except Exception as e:
        return jsonify({'error': 'Failed to book consultation', 'message': str(e)}), 500

@app.route('/api/consultations', methods=['GET'])
@token_required
def get_consultations():
    """Get consultations (filtered by role)"""
    try:
        user_id = int(get_jwt_identity())  # Convert from string to int
        current_user = get_current_user()
        db = Database()

        if current_user['role'] == 'doctor':
            # Get doctor's consultations
            doctor_query = "SELECT id FROM doctors WHERE user_id = %s"
            doctor = db.execute_query(doctor_query, (user_id,), fetch_one=True)

            if not doctor:
                db.close()
                return jsonify({'error': 'Doctor profile not found'}), 404

            query = """
                SELECT c.*, u.full_name as patient_name, u.phone as patient_phone
                FROM consultations c
                JOIN users u ON c.patient_id = u.id
                WHERE c.doctor_id = %s
                ORDER BY c.appointment_date DESC
            """
            consultations = db.execute_query(query, (doctor['id'],), fetch=True)
        else:
            # Get patient's consultations
            query = """
                SELECT c.*, u.full_name as doctor_name, d.specialty
                FROM consultations c
                JOIN doctors d ON c.doctor_id = d.id
                JOIN users u ON d.user_id = u.id
                WHERE c.patient_id = %s
                ORDER BY c.appointment_date DESC
            """
            consultations = db.execute_query(query, (user_id,), fetch=True)

        db.close()

        return jsonify({'consultations': consultations}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch consultations', 'message': str(e)}), 500

@app.route('/api/consultations/<int:consultation_id>/status', methods=['PUT'])
@role_required('doctor')
def update_consultation_status(consultation_id):
    """Update consultation status (Doctor only)"""
    try:
        data = request.get_json()

        if not data.get('status'):
            return jsonify({'error': 'Status is required'}), 400

        if data['status'] not in ['accepted', 'rejected', 'completed']:
            return jsonify({'error': 'Invalid status'}), 400

        db = Database()

        query = "UPDATE consultations SET status = %s, notes = %s WHERE id = %s"
        db.execute_query(query, (data['status'], data.get('notes'), consultation_id))
        db.close()

        return jsonify({'message': 'Consultation status updated successfully'}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to update consultation', 'message': str(e)}), 500

@app.route('/api/consultations/<int:consultation_id>', methods=['DELETE'])
@token_required
def cancel_consultation(consultation_id):
    """Cancel consultation"""
    try:
        user_id = int(get_jwt_identity())  # Convert from string to int
        db = Database()

        # Check if consultation belongs to user
        check_query = "SELECT patient_id FROM consultations WHERE id = %s"
        consultation = db.execute_query(check_query, (consultation_id,), fetch_one=True)

        if not consultation or consultation['patient_id'] != user_id:
            db.close()
            return jsonify({'error': 'Consultation not found or access denied'}), 403

        # Update status to cancelled
        query = "UPDATE consultations SET status = 'cancelled' WHERE id = %s"
        db.execute_query(query, (consultation_id,))
        db.close()

        return jsonify({'message': 'Consultation cancelled successfully'}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to cancel consultation', 'message': str(e)}), 500

# ============================================================================
# VIDEO CONFERENCING ROUTES
# ============================================================================

@app.route('/api/consultations/<int:consultation_id>/video/start', methods=['POST'])
@token_required
def start_video_call(consultation_id):
    """Start a video call for a consultation"""
    try:
        user_id = int(get_jwt_identity())
        current_user = get_current_user()

        print(f"[VIDEO] Starting video call for consultation {consultation_id}, user {user_id}")

        # Use consultation_id as room identifier (consistent with signal endpoints)
        video_room_id = f"room-{consultation_id}"

        # Clear any old signals for this room to prevent stale data
        if video_room_id in video_signals:
            print(f"[VIDEO] Clearing {len(video_signals[video_room_id])} old signals for room: {video_room_id}")
            video_signals[video_room_id] = []

        print(f"[VIDEO] Generated video room ID: {video_room_id}")

        return jsonify({
            'video_room_id': video_room_id,
            'consultation_id': consultation_id,
            'message': 'Video call started successfully'
        }), 200

    except Exception as e:
        print(f"[VIDEO] Error starting video call: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to start video call', 'message': str(e)}), 500

# In-memory storage for WebRTC signaling (in production, use Redis or database)
video_signals = {}

@app.route('/api/consultations/<int:consultation_id>/video/signal', methods=['POST'])
@token_required
def video_signal(consultation_id):
    """Handle WebRTC signaling (offer, answer, ICE candidates)"""
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()

        signal_type = data.get('type')  # 'offer', 'answer', 'ice-candidate'
        signal_data = data.get('data')

        if not signal_type or not signal_data:
            return jsonify({'error': 'Missing signal type or data'}), 400

        # For testing: Use consultation_id as room identifier
        video_room_id = f"room-{consultation_id}"

        print(f"[VIDEO] Received {signal_type} signal for room {video_room_id} from user {user_id}")

        # Store the signal
        if video_room_id not in video_signals:
            video_signals[video_room_id] = []

        video_signals[video_room_id].append({
            'type': signal_type,
            'data': signal_data,
            'from_user_id': user_id,
            'timestamp': datetime.now().isoformat()
        })

        # Keep only last 50 signals per room to prevent memory issues
        if len(video_signals[video_room_id]) > 50:
            video_signals[video_room_id] = video_signals[video_room_id][-50:]

        print(f"[VIDEO] Stored {signal_type} signal for room {video_room_id} from user {user_id}. Total signals: {len(video_signals[video_room_id])}")

        return jsonify({'message': 'Signal stored successfully'}), 200

    except Exception as e:
        print(f"[VIDEO] Signal error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to process signal', 'message': str(e)}), 500

@app.route('/api/consultations/<int:consultation_id>/video/signals', methods=['GET'])
@token_required
def get_video_signals(consultation_id):
    """Get pending WebRTC signals for this user"""
    try:
        user_id = int(get_jwt_identity())

        # For testing: Use consultation_id as room identifier
        video_room_id = f"room-{consultation_id}"

        # Get signals for this room that are NOT from this user
        room_signals = video_signals.get(video_room_id, [])
        other_user_signals = [s for s in room_signals if s['from_user_id'] != user_id]

        print(f"[VIDEO] User {user_id} polling room {video_room_id}: {len(other_user_signals)} signals available (total in room: {len(room_signals)})")

        return jsonify({'signals': other_user_signals}), 200

    except Exception as e:
        print(f"[VIDEO] Get signals error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get signals', 'message': str(e)}), 500

@app.route('/api/consultations/<int:consultation_id>/video/end', methods=['POST'])
@token_required
def end_video_call(consultation_id):
    """End a video call for a consultation"""
    try:
        user_id = int(get_jwt_identity())
        current_user = get_current_user()
        db = Database()

        # Get consultation details
        query = """
            SELECT c.*, d.user_id as doctor_user_id
            FROM consultations c
            JOIN doctors d ON c.doctor_id = d.id
            WHERE c.id = %s
        """
        consultation = db.execute_query(query, (consultation_id,), fetch_one=True)

        if not consultation:
            db.close()
            return jsonify({'error': 'Consultation not found'}), 404

        # Check if user is authorized (doctor or patient)
        is_doctor = current_user['role'] == 'doctor' and consultation['doctor_user_id'] == user_id
        is_patient = consultation['patient_id'] == user_id

        if not (is_doctor or is_patient):
            db.close()
            return jsonify({'error': 'Unauthorized access'}), 403

        # Update consultation
        update_query = """
            UPDATE consultations
            SET video_ended_at = CURRENT_TIMESTAMP,
                status = 'completed'
            WHERE id = %s
        """
        db.execute_query(update_query, (consultation_id,))
        db.close()

        return jsonify({'message': 'Video call ended successfully'}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to end video call', 'message': str(e)}), 500

@app.route('/api/consultations/<int:consultation_id>/video/status', methods=['GET'])
@token_required
def get_video_call_status(consultation_id):
    """Get video call status for a consultation"""
    try:
        user_id = int(get_jwt_identity())
        current_user = get_current_user()
        db = Database()

        # Get consultation details
        query = """
            SELECT c.*, d.user_id as doctor_user_id,
                   u1.full_name as patient_name,
                   u2.full_name as doctor_name
            FROM consultations c
            JOIN doctors d ON c.doctor_id = d.id
            JOIN users u1 ON c.patient_id = u1.id
            JOIN users u2 ON d.user_id = u2.id
            WHERE c.id = %s
        """
        consultation = db.execute_query(query, (consultation_id,), fetch_one=True)

        if not consultation:
            db.close()
            return jsonify({'error': 'Consultation not found'}), 404

        # Check if user is authorized
        is_doctor = current_user['role'] == 'doctor' and consultation['doctor_user_id'] == user_id
        is_patient = consultation['patient_id'] == user_id

        if not (is_doctor or is_patient):
            db.close()
            return jsonify({'error': 'Unauthorized access'}), 403

        db.close()

        return jsonify({
            'video_room_id': consultation['video_room_id'],
            'status': consultation['status'],
            'video_started_at': consultation['video_started_at'],
            'video_ended_at': consultation['video_ended_at'],
            'patient_name': consultation['patient_name'],
            'doctor_name': consultation['doctor_name']
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to get video call status', 'message': str(e)}), 500

# ============================================================================
# MEDICAL TESTS ROUTES
# ============================================================================

@app.route('/api/medical-tests', methods=['POST'])
@token_required
def order_medical_test():
    """Order a medical test"""
    try:
        data = request.get_json()
        user_id = int(get_jwt_identity())  # Convert from string to int

        # Validate required fields
        if not data.get('doctor_id') or not data.get('test_name'):
            return jsonify({'error': 'Doctor ID and test name are required'}), 400

        db = Database()

        # Insert medical test order
        query = """
            INSERT INTO medical_tests (patient_id, doctor_id, test_name, test_date, notes, status)
            VALUES (%s, %s, %s, %s, %s, 'pending')
        """
        test_id = db.execute_query(query, (
            user_id,
            data['doctor_id'],
            data['test_name'],
            data.get('test_date'),
            data.get('notes')
        ))

        db.close()

        return jsonify({
            'message': 'Medical test ordered successfully',
            'test_id': test_id
        }), 201

    except Exception as e:
        return jsonify({'error': 'Failed to order test', 'message': str(e)}), 500

@app.route('/api/medical-tests', methods=['GET'])
@token_required
def get_medical_tests():
    """Get medical tests (filtered by role)"""
    try:
        user_id = int(get_jwt_identity())  # Convert from string to int
        current_user = get_current_user()
        db = Database()

        if current_user['role'] == 'doctor':
            # Get doctor's test orders
            doctor_query = "SELECT id FROM doctors WHERE user_id = %s"
            doctor = db.execute_query(doctor_query, (user_id,), fetch_one=True)

            if not doctor:
                db.close()
                return jsonify({'error': 'Doctor profile not found'}), 404

            query = """
                SELECT mt.*, u.full_name as patient_name, u.phone as patient_phone
                FROM medical_tests mt
                JOIN users u ON mt.patient_id = u.id
                WHERE mt.doctor_id = %s
                ORDER BY mt.created_at DESC
            """
            tests = db.execute_query(query, (doctor['id'],), fetch=True)
        else:
            # Get patient's test orders
            query = """
                SELECT mt.*, u.full_name as doctor_name, d.specialty
                FROM medical_tests mt
                JOIN doctors d ON mt.doctor_id = d.id
                JOIN users u ON d.user_id = u.id
                WHERE mt.patient_id = %s
                ORDER BY mt.created_at DESC
            """
            tests = db.execute_query(query, (user_id,), fetch=True)

        db.close()

        return jsonify({'tests': tests}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch tests', 'message': str(e)}), 500

@app.route('/api/medical-tests/<int:test_id>/status', methods=['PUT'])
@role_required('doctor')
def update_test_status(test_id):
    """Update medical test status and results (Doctor only)"""
    try:
        data = request.get_json()

        if not data.get('status'):
            return jsonify({'error': 'Status is required'}), 400

        if data['status'] not in ['approved', 'completed', 'cancelled']:
            return jsonify({'error': 'Invalid status'}), 400

        db = Database()

        query = "UPDATE medical_tests SET status = %s, results = %s, notes = %s WHERE id = %s"
        db.execute_query(query, (data['status'], data.get('results'), data.get('notes'), test_id))
        db.close()

        return jsonify({'message': 'Test status updated successfully'}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to update test', 'message': str(e)}), 500

# ============================================================================
# ADMIN ROUTES
# ============================================================================

@app.route('/api/admin/users', methods=['GET'])
@role_required('admin')
def get_all_users():
    """Get all users (Admin only)"""
    try:
        db = Database()

        query = """
            SELECT id, username, email, full_name, role, phone, created_at
            FROM users
            ORDER BY created_at DESC
        """
        users = db.execute_query(query, fetch=True)
        db.close()

        return jsonify({'users': users}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch users', 'message': str(e)}), 500

@app.route('/api/admin/users/<int:user_id>/role', methods=['PUT'])
@role_required('admin')
def update_user_role(user_id):
    """Update user role (Admin only)"""
    try:
        data = request.get_json()
        current_user = get_current_user()

        if not data.get('role'):
            return jsonify({'error': 'Role is required'}), 400

        if data['role'] not in ['admin', 'doctor', 'user']:
            return jsonify({'error': 'Invalid role'}), 400

        db = Database()

        query = "UPDATE users SET role = %s WHERE id = %s"
        db.execute_query(query, (data['role'], user_id))
        db.close()

        # Log audit
        log_audit(current_user['id'], 'UPDATE_USER_ROLE', 'user', user_id, f"Changed role to: {data['role']}")

        return jsonify({'message': 'User role updated successfully'}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to update role', 'message': str(e)}), 500

@app.route('/api/admin/stats', methods=['GET'])
@role_required('admin')
def get_admin_stats():
    """Get dashboard statistics (Admin only)"""
    try:
        db = Database()

        stats = {}

        # Total users
        stats['total_users'] = db.execute_query("SELECT COUNT(*) as count FROM users", fetch_one=True)['count']

        # Total doctors
        stats['total_doctors'] = db.execute_query("SELECT COUNT(*) as count FROM doctors", fetch_one=True)['count']

        # Total hospitals
        stats['total_hospitals'] = db.execute_query("SELECT COUNT(*) as count FROM hospitals", fetch_one=True)['count']

        # Total consultations
        stats['total_consultations'] = db.execute_query("SELECT COUNT(*) as count FROM consultations", fetch_one=True)['count']

        # Pending consultations
        stats['pending_consultations'] = db.execute_query(
            "SELECT COUNT(*) as count FROM consultations WHERE status = 'pending'",
            fetch_one=True
        )['count']

        # Total medical tests
        stats['total_tests'] = db.execute_query("SELECT COUNT(*) as count FROM medical_tests", fetch_one=True)['count']

        # Completed / cancelled consultations
        stats['completed_consultations'] = db.execute_query(
            "SELECT COUNT(*) as count FROM consultations WHERE status='completed'", fetch_one=True)['count']
        stats['cancelled_consultations'] = db.execute_query(
            "SELECT COUNT(*) as count FROM consultations WHERE status='cancelled'", fetch_one=True)['count']

        # Top diagnoses (top 5)
        top_diag = db.execute_query(
            "SELECT diagnosis_result AS diagnosis, COUNT(*) AS count "
            "FROM diagnosis_history GROUP BY diagnosis_result ORDER BY count DESC LIMIT 5",
            fetch=True
        ) or []
        stats['top_diagnoses'] = top_diag

        # Revenue summary from payments table
        rev = db.execute_query(
            "SELECT COALESCE(SUM(CASE WHEN status='succeeded' THEN amount ELSE 0 END),0) AS total_xaf, "
            "SUM(CASE WHEN status='succeeded' THEN 1 ELSE 0 END) AS succeeded_count, "
            "SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count "
            "FROM payments", fetch_one=True
        ) or {}
        stats['revenue'] = rev

        db.close()

        return jsonify({'stats': stats, **stats}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch statistics', 'message': str(e)}), 500

@app.route('/api/admin/audit-logs', methods=['GET'])
@role_required('admin')
def get_audit_logs():
    """Get audit logs (Admin only)"""
    try:
        db = Database()

        limit = request.args.get('limit', 100)

        query = """
            SELECT al.*, u.username
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT %s
        """
        logs = db.execute_query(query, (limit,), fetch=True)
        db.close()

        return jsonify({'logs': logs}), 200

    except Exception as e:
        return jsonify({'error': 'Failed to fetch audit logs', 'message': str(e)}), 500

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'HealthHub API',
        'version': '1.0.0'
    }), 200

@app.route('/', methods=['GET'])
def index():
    """API root endpoint"""
    return jsonify({
        'message': 'Welcome to HealthHub API',
        'version': '1.0.0',
        'endpoints': {
            'auth': '/api/auth/*',
            'hospitals': '/api/hospitals',
            'services': '/api/services',
            'doctors': '/api/doctors',
            'consultations': '/api/consultations',
            'medical_tests': '/api/medical-tests',
            'diagnosis': '/api/diagnosis',
            'admin': '/api/admin/*'
        }
    }), 200

# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("HealthHub Backend Server")
    print("=" * 60)

    # Initialize database if needed
    try:
        db = Database()
        db.close()
        print("✓ Database connection successful")
    except:
        print("⚠ Database not initialized. Run database.sql first.")

    print("\nStarting server on http://localhost:5000")
    print("=" * 60)

    app.run(debug=True, host='0.0.0.0', port=5000)

