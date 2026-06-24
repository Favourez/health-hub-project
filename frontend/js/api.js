// HealthHub API Client
const API_BASE_URL = 'http://localhost:5000/api';

class API {
    constructor() {
        this.baseURL = API_BASE_URL;
    }

    // Get auth token from localStorage
    getToken() {
        return localStorage.getItem('token');
    }

    // Set auth token
    setToken(token) {
        localStorage.setItem('token', token);
    }

    // Remove auth token
    removeToken() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }

    // Get current user
    getUser() {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    }

    // Set current user
    setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    }

    // Make API request
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = this.getToken();

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            console.log(`[API] Request to ${endpoint} with token:`, token.substring(0, 20) + '...');
        } else {
            console.warn(`[API] Request to ${endpoint} WITHOUT token`);
        }

        try {
            console.log(`[API] Headers:`, headers);
            const response = await fetch(url, {
                ...options,
                headers,
            });

            const data = await response.json();

            if (!response.ok) {
                console.error(`[API] Request failed with status ${response.status}:`, data);
                throw new Error(data.error || data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // Authentication
    async register(userData) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
    }

    async login(credentials) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        });

        console.log('Login response:', data);
        console.log('Access token:', data.access_token);

        if (data.access_token) {
            console.log('Setting token...');
            this.setToken(data.access_token);
            this.setUser(data.user);
            console.log('Token set. Verifying...');
            console.log('Token from storage:', this.getToken());
            console.log('User from storage:', this.getUser());
        } else {
            console.error('No access_token in response!');
        }

        return data;
    }

    async getProfile() {
        return this.request('/auth/me');
    }

    logout() {
        this.removeToken();
        window.location.href = 'login.html';
    }

    // Hospitals
    async getHospitals(search = '') {
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        return this.request(`/hospitals${query}`);
    }

    async getHospital(id) {
        return this.request(`/hospitals/${id}`);
    }

    async createHospital(hospitalData) {
        return this.request('/hospitals', {
            method: 'POST',
            body: JSON.stringify(hospitalData),
        });
    }

    async updateHospital(id, hospitalData) {
        return this.request(`/hospitals/${id}`, {
            method: 'PUT',
            body: JSON.stringify(hospitalData),
        });
    }

    async deleteHospital(id) {
        return this.request(`/hospitals/${id}`, {
            method: 'DELETE',
        });
    }

    // Services
    async getServices() {
        return this.request('/services');
    }

    async getServiceHospitals(serviceId) {
        return this.request(`/services/${serviceId}/hospitals`);
    }

    async createService(serviceData) {
        return this.request('/services', {
            method: 'POST',
            body: JSON.stringify(serviceData),
        });
    }

    // Pharmacies
    async getPharmacies(search = '') {
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        return this.request(`/pharmacies${query}`);
    }

    async getPharmacy(id) {
        return this.request(`/pharmacies/${id}`);
    }

    // Drugs
    async getDrugs(search = '', category = '') {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (category) params.append('category', category);
        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request(`/drugs${query}`);
    }

    async getDrugPharmacies(drugId) {
        return this.request(`/drugs/${drugId}/pharmacies`);
    }

    // Doctors
    async getDoctors(specialty = '') {
        const query = specialty ? `?specialty=${encodeURIComponent(specialty)}` : '';
        return this.request(`/doctors${query}`);
    }

    async getDoctor(id) {
        return this.request(`/doctors/${id}`);
    }

    // Diagnosis
    async getDiagnosis(payload) {
        const body = typeof payload === 'string' ? { symptoms: payload } : payload;
        return this.request('/diagnosis', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    async getDiagnosisFollowUp(payload) {
        return this.request('/diagnosis/follow-up', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }

    async getDiagnosisHistory() {
        return this.request('/diagnosis/history');
    }

    // Consultations
    async bookConsultation(consultationData) {
        return this.request('/consultations', {
            method: 'POST',
            body: JSON.stringify(consultationData),
        });
    }

    async getConsultations() {
        return this.request('/consultations');
    }

    async updateConsultationStatus(id, status, notes = '') {
        return this.request(`/consultations/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status, notes }),
        });
    }

    async cancelConsultation(id) {
        return this.request(`/consultations/${id}`, {
            method: 'DELETE',
        });
    }

    // Video Conferencing
    async startVideoCall(consultationId) {
        return this.request(`/consultations/${consultationId}/video/start`, {
            method: 'POST',
        });
    }

    async endVideoCall(consultationId) {
        return this.request(`/consultations/${consultationId}/video/end`, {
            method: 'POST',
        });
    }

    async getVideoCallStatus(consultationId) {
        return this.request(`/consultations/${consultationId}/video/status`);
    }

    // Medical Tests
    async orderMedicalTest(testData) {
        return this.request('/medical-tests', {
            method: 'POST',
            body: JSON.stringify(testData),
        });
    }

    async getMedicalTests() {
        return this.request('/medical-tests');
    }

    async updateTestStatus(id, status, results = '', notes = '') {
        return this.request(`/medical-tests/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status, results, notes }),
        });
    }

    // Admin
    async getAllUsers() {
        return this.request('/admin/users');
    }

    async updateUserRole(userId, role) {
        return this.request(`/admin/users/${userId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role }),
        });
    }

    async getAdminStats() {
        return this.request('/admin/stats');
    }

    async getAuditLogs(limit = 100) {
        return this.request(`/admin/audit-logs?limit=${limit}`);
    }

    // ==================================================================
    // v2 endpoints (mounted under /api/v2)
    // ==================================================================
    async v2(endpoint, options = {}) {
        const url = `${this.baseURL}/v2${endpoint}`;
        const token = this.getToken();
        const headers = { ...(options.headers || {}) };
        const isForm = options.body instanceof FormData;
        if (!isForm && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await fetch(url, { ...options, headers });
        const text = await resp.text();
        const data = text ? JSON.parse(text) : {};
        if (!resp.ok) throw new Error(data.error || data.message || `HTTP ${resp.status}`);
        return data;
    }

    // Profile + vitals
    async getProfile() { return this.v2('/me/profile'); }
    async updateProfile(payload) {
        return this.v2('/me/profile', { method: 'PUT', body: JSON.stringify(payload) });
    }
    async listVitals() { return this.v2('/me/vitals'); }
    async addVital(payload) {
        return this.v2('/me/vitals', { method: 'POST', body: JSON.stringify(payload) });
    }
    async deleteVital(id) {
        return this.v2(`/me/vitals/${id}`, { method: 'DELETE' });
    }
    async exportMyData() { return this.v2('/me/export'); }

    // Prescriptions
    async listMyPrescriptions() { return this.v2('/prescriptions/me'); }
    async listIssuedPrescriptions() { return this.v2('/prescriptions/issued'); }
    async createPrescription(payload) {
        return this.v2('/prescriptions', { method: 'POST', body: JSON.stringify(payload) });
    }
    async getPrescriptionByCode(code) { return this.v2(`/prescriptions/${code}`); }
    async dispensePrescription(code) {
        return this.v2(`/prescriptions/${code}/dispense`, { method: 'POST' });
    }

    // Ratings
    async submitRating(payload) {
        return this.v2('/ratings', { method: 'POST', body: JSON.stringify(payload) });
    }
    async getRatings(targetType, targetId) {
        return this.v2(`/ratings/${targetType}/${targetId}`);
    }

    // Notifications
    async listNotifications() { return this.v2('/notifications'); }
    async markNotificationRead(id) {
        return this.v2(`/notifications/${id}/read`, { method: 'POST' });
    }
    async markAllNotificationsRead() {
        return this.v2('/notifications/read-all', { method: 'POST' });
    }

    // Public alerts
    async listAlerts() { return this.v2('/alerts'); }
    async createAlert(payload) {
        return this.v2('/alerts', { method: 'POST', body: JSON.stringify(payload) });
    }
    async deactivateAlert(id) {
        return this.v2(`/alerts/${id}`, { method: 'DELETE' });
    }

    // Doctor slots
    async listDoctorSlots(doctorId) { return this.v2(`/doctors/${doctorId}/slots`); }
    async listMySlots() { return this.v2('/me/slots'); }
    async createSlot(payload) {
        return this.v2('/me/slots', { method: 'POST', body: JSON.stringify(payload) });
    }
    async deleteSlot(id) { return this.v2(`/me/slots/${id}`, { method: 'DELETE' }); }
    async bookSlot(slotId, payload) {
        return this.v2(`/slots/${slotId}/book`, { method: 'POST', body: JSON.stringify(payload || {}) });
    }

    // Misc
    async healthCheck() { return this.v2('/health'); }
    async forgotPassword(email) {
        return this.v2('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    }
    async resetPassword(token, password) {
        return this.v2('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
    }
    async sendSOS(payload) {
        return this.v2('/sos', { method: 'POST', body: JSON.stringify(payload || {}) });
    }
    async globalSearch(q) {
        return this.v2(`/search?q=${encodeURIComponent(q)}`);
    }

    // File uploads
    async uploadFile(file, relatedType = null, relatedId = null) {
        const fd = new FormData();
        fd.append('file', file);
        if (relatedType) fd.append('related_type', relatedType);
        if (relatedId) fd.append('related_id', relatedId);
        return this.v2('/uploads', { method: 'POST', body: fd });
    }
    async listMyUploads(relatedType = null, relatedId = null) {
        const qs = new URLSearchParams();
        if (relatedType) qs.append('related_type', relatedType);
        if (relatedId) qs.append('related_id', relatedId);
        const q = qs.toString() ? `?${qs}` : '';
        return this.v2(`/uploads${q}`);
    }
    async deleteUpload(id) {
        return this.v2(`/uploads/${id}`, { method: 'DELETE' });
    }

    // Payments
    async createPayment(payload) {
        return this.v2('/payments', { method: 'POST', body: JSON.stringify(payload) });
    }
    async listMyPayments() { return this.v2('/payments/me'); }
}

// Create global API instance
const api = new API();

