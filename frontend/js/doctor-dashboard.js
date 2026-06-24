// Doctor Dashboard JavaScript

// Check authentication
if (!requireAuth()) {
    throw new Error('Authentication required');
}

const user = getCurrentUser();
if (user.role !== 'doctor') {
    redirectToDashboard();
}

// Display user name
document.getElementById('userName').textContent = user.full_name;

// Tab management
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
    });

    // Show selected tab
    document.getElementById(tabName + 'Tab').classList.remove('hidden');

    // Highlight active button
    event.target.classList.remove('btn-outline');
    event.target.classList.add('btn-primary');

    // Load tab data
    loadTabData(tabName);
}

// Load tab data
async function loadTabData(tabName) {
    switch (tabName) {
        case 'consultations': await loadConsultations(); break;
        case 'tests': await loadTests(); break;
        case 'prescriptions': await loadIssuedPrescriptions(); break;
        case 'schedule': await loadMySlots(); break;
        case 'ehr': await prepareEHRPatientList(); break;
    }
}

// Load consultations
async function loadConsultations() {
    try {
        const response = await api.getConsultations();
        const consultationsList = document.getElementById('consultationsList');

        if (response.consultations.length === 0) {
            consultationsList.innerHTML = '<p style="color: var(--text-secondary);">No consultations yet.</p>';
            return;
        }

        consultationsList.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Patient</th>
                        <th>Phone</th>
                        <th>Date & Time</th>
                        <th>Symptoms</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${response.consultations.map(consultation => `
                        <tr>
                            <td>${escapeHtml(consultation.patient_name)}</td>
                            <td><a href="tel:${consultation.patient_phone}" style="color: var(--secondary-color);">${consultation.patient_phone || 'N/A'}</a></td>
                            <td>${formatDateTime(consultation.appointment_date)}</td>
                            <td>${consultation.symptoms ? escapeHtml(consultation.symptoms) : '-'}</td>
                            <td><span class="badge ${getStatusBadgeClass(consultation.status)}">${consultation.status.toUpperCase()}</span></td>
                            <td style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                ${consultation.status === 'accepted' || consultation.status === 'in_progress' ? `
                                    <button class="btn btn-sm" onclick="startVideoCall(${consultation.id})" style="background: var(--success-color); color: white;">
                                        🎥 Start Video
                                    </button>
                                ` : ''}
                                ${consultation.status === 'pending' || consultation.status === 'accepted' ? `
                                    <button class="btn btn-primary btn-sm" onclick="openUpdateConsultation(${consultation.id}, '${consultation.status}', '${escapeHtml(consultation.notes || '')}')">
                                        Update
                                    </button>
                                ` : ''}
                                <button class="btn btn-sm btn-secondary" onclick="openWriteRxForPatient(${consultation.patient_id}, '${escapeHtml(consultation.patient_name)}')">
                                    📋 Rx
                                </button>
                                ${consultation.status === 'completed' || consultation.status === 'rejected' || consultation.status === 'cancelled' ? '' : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        showAlert('Failed to load consultations: ' + error.message, 'error');
    }
}

// Open update consultation modal
function openUpdateConsultation(id, currentStatus, notes) {
    document.getElementById('consultationId').value = id;
    document.getElementById('consultationStatus').value = currentStatus === 'pending' ? 'accepted' : 'completed';
    document.getElementById('consultationNotes').value = notes;
    showModal('updateConsultationModal');
}

// Update consultation form
document.getElementById('updateConsultationForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('consultationId').value;
    const status = document.getElementById('consultationStatus').value;
    const notes = document.getElementById('consultationNotes').value;

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        await api.updateConsultationStatus(id, status, notes);

        showAlert('Consultation updated successfully!', 'success');
        hideModal('updateConsultationModal');
        e.target.reset();

        submitBtn.disabled = false;
        submitBtn.textContent = 'Update';

        await loadConsultations();

    } catch (error) {
        showAlert('Failed to update consultation: ' + error.message, 'error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update';
    }
});

// Load tests
async function loadTests() {
    try {
        const response = await api.getMedicalTests();
        const testsList = document.getElementById('testsList');

        if (response.tests.length === 0) {
            testsList.innerHTML = '<p style="color: var(--text-secondary);">No medical test orders yet.</p>';
            return;
        }

        testsList.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Patient</th>
                        <th>Phone</th>
                        <th>Test Name</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${response.tests.map(test => `
                        <tr>
                            <td>${escapeHtml(test.patient_name)}</td>
                            <td><a href="tel:${test.patient_phone}" style="color: var(--secondary-color);">${test.patient_phone || 'N/A'}</a></td>
                            <td>${escapeHtml(test.test_name)}</td>
                            <td>${test.test_date ? formatDate(test.test_date) : 'Not scheduled'}</td>
                            <td><span class="badge ${getStatusBadgeClass(test.status)}">${test.status.toUpperCase()}</span></td>
                            <td>
                                <button class="btn btn-primary btn-sm" onclick="openUpdateTest(${test.id}, '${test.status}', '${escapeHtml(test.results || '')}', '${escapeHtml(test.notes || '')}')">
                                    Update
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        showAlert('Failed to load tests: ' + error.message, 'error');
    }
}

// Open update test modal
function openUpdateTest(id, currentStatus, results, notes) {
    document.getElementById('testId').value = id;
    document.getElementById('testStatus').value = currentStatus === 'pending' ? 'approved' : 'completed';
    document.getElementById('testResults').value = results;
    document.getElementById('testNotes').value = notes;
    showModal('updateTestModal');
}

// Update test form
document.getElementById('updateTestForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('testId').value;
    const status = document.getElementById('testStatus').value;
    const results = document.getElementById('testResults').value;
    const notes = document.getElementById('testNotes').value;

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        await api.updateTestStatus(id, status, results, notes);

        showAlert('Test updated successfully!', 'success');
        hideModal('updateTestModal');
        e.target.reset();

        submitBtn.disabled = false;
        submitBtn.textContent = 'Update';

        await loadTests();

    } catch (error) {
        showAlert('Failed to update test: ' + error.message, 'error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update';
    }
});

// Start video call
function startVideoCall(consultationId) {
    window.location.href = `video-call.html?consultation_id=${consultationId}`;
}

// Initial load
loadConsultations();

// ─────────────────────── Doctor Prescriptions ───────────────────────
let _consultationPatients = []; // cache from last consultations load

async function loadIssuedPrescriptions() {
    const container = document.getElementById('issuedPrescriptionsList');
    container.innerHTML = '<p class="text-secondary">Loading…</p>';
    try {
        const data = await api.listIssuedPrescriptions();
        const rxs = data.prescriptions || [];
        await populateRxPatientDropdown();
        if (!rxs.length) { container.innerHTML = '<p class="text-secondary">No prescriptions issued yet.</p>'; return; }
        container.innerHTML = rxs.map(rx => `
            <div class="card mb-2" style="padding:1rem;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <strong>Rx #${rx.code}</strong>
                        <span class="badge" style="margin-left:0.5rem; background:${rx.status==='active'?'var(--success-color)':'var(--text-secondary)'}; color:#fff; padding:2px 8px; border-radius:10px; font-size:0.75rem;">${rx.status}</span>
                        <div class="text-secondary" style="font-size:0.82rem; margin-top:0.25rem;">Patient: ${rx.patient_name || 'N/A'} | Issued: ${formatDateTime(rx.issued_at)}</div>
                        ${rx.notes ? `<div class="text-secondary" style="font-size:0.82rem;">${escapeHtml(rx.notes)}</div>` : ''}
                    </div>
                </div>
                <div style="margin-top:0.5rem;">
                    ${(rx.items || []).map(item => `
                        <div style="font-size:0.9rem; padding:0.25rem 0; border-bottom:1px solid var(--border-color,#334155);">
                            💊 <strong>${escapeHtml(item.drug_name || item.drug_id || '')}</strong> — ${escapeHtml(item.dosage||'')} ${escapeHtml(item.frequency||'')} × ${item.duration_days||'?'} days
                        </div>`).join('')}
                </div>
            </div>`).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

async function populateRxPatientDropdown() {
    const sel = document.getElementById('rxPatientId');
    if (!sel) return;
    try {
        const resp = await api.getConsultations();
        const seen = new Set();
        const patients = (resp.consultations || []).filter(c => {
            if (seen.has(c.patient_id)) return false;
            seen.add(c.patient_id); return true;
        });
        _consultationPatients = patients;
        sel.innerHTML = '<option value="">— Select patient —</option>'
            + patients.map(c => `<option value="${c.patient_id}">${escapeHtml(c.patient_name)}</option>`).join('');
    } catch (e) {}
}

function openWriteRxForPatient(patientId, patientName) {
    showTab('prescriptions');
    setTimeout(async () => {
        await populateRxPatientDropdown();
        const sel = document.getElementById('rxPatientId');
        if (sel) sel.value = patientId;
        showModal('writePrescriptionModal');
    }, 400);
}

function addRxItem() {
    const list = document.getElementById('rxItemsList');
    const div = document.createElement('div');
    div.className = 'rx-item';
    div.style.cssText = 'border:1px solid var(--border-color,#334155);border-radius:6px;padding:0.75rem;margin-bottom:0.75rem;';
    div.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:0.25rem;">
            <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.rx-item').remove()">✕ Remove</button>
        </div>
        <div class="grid grid-2" style="gap:0.5rem;">
            <div class="form-group"><label class="form-label">Drug Name</label><input type="text" class="form-control rx-drug" placeholder="Drug name" required></div>
            <div class="form-group"><label class="form-label">Dosage</label><input type="text" class="form-control rx-dosage" placeholder="e.g. 1 tablet"></div>
            <div class="form-group"><label class="form-label">Frequency</label><input type="text" class="form-control rx-frequency" placeholder="e.g. 3x/day"></div>
            <div class="form-group"><label class="form-label">Duration (days)</label><input type="number" class="form-control rx-duration" placeholder="7" min="1"></div>
        </div>
        <div class="form-group"><label class="form-label">Instructions</label><input type="text" class="form-control rx-instructions" placeholder="Take after meals"></div>`;
    list.appendChild(div);
}

document.getElementById('writePrescriptionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientId = document.getElementById('rxPatientId').value;
    const notes = document.getElementById('rxNotes').value.trim();
    if (!patientId) { showAlert('Please select a patient.', 'error'); return; }
    const items = [...document.querySelectorAll('#rxItemsList .rx-item')].map(el => ({
        drug_name:    el.querySelector('.rx-drug')?.value.trim() || '',
        dosage:       el.querySelector('.rx-dosage')?.value.trim() || '',
        frequency:    el.querySelector('.rx-frequency')?.value.trim() || '',
        duration_days: parseInt(el.querySelector('.rx-duration')?.value) || null,
        instructions: el.querySelector('.rx-instructions')?.value.trim() || '',
    })).filter(i => i.drug_name);
    if (!items.length) { showAlert('Add at least one drug.', 'error'); return; }
    try {
        const resp = await api.createPrescription({ patient_id: patientId, notes, items });
        showAlert(`Prescription issued! Code: ${resp.code}`, 'success');
        hideModal('writePrescriptionModal');
        e.target.reset();
        await loadIssuedPrescriptions();
    } catch (err) {
        showAlert('Error: ' + err.message, 'error');
    }
});

// ─────────────────────── Doctor Schedule / Slots ───────────────────────
async function loadMySlots() {
    const container = document.getElementById('slotsList');
    container.innerHTML = '<p class="text-secondary">Loading…</p>';
    try {
        const data = await api.listMySlots();
        const slots = data.slots || [];
        if (!slots.length) { container.innerHTML = '<p class="text-secondary">No slots defined yet. Add your first availability slot.</p>'; return; }
        container.innerHTML = slots.map(s => `
            <div class="card mb-2" style="padding:0.75rem 1rem; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${s.slot_date}</strong>
                    <span style="margin-left:0.75rem;">${s.start_time} – ${s.end_time}</span>
                    <span class="badge" style="margin-left:0.5rem; background:${s.is_booked?'var(--warning-color,#d97706)':'var(--success-color)'}; color:#fff; padding:2px 8px; border-radius:10px; font-size:0.75rem;">
                        ${s.is_booked ? '🔒 Booked' : '✅ Open'}
                    </span>
                    ${s.location ? `<span class="text-secondary" style="font-size:0.82rem; margin-left:0.5rem;">${escapeHtml(s.location)}</span>` : ''}
                </div>
                ${!s.is_booked ? `<button class="btn btn-sm btn-danger" onclick="deleteSlot(${s.id})">🗑</button>` : ''}
            </div>`).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

document.getElementById('addSlotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        slot_date:  document.getElementById('slotDate').value,
        start_time: document.getElementById('slotStart').value,
        end_time:   document.getElementById('slotEnd').value,
        location:   document.getElementById('slotLocation').value.trim(),
    };
    try {
        await api.createSlot(payload);
        showAlert('Slot added!', 'success');
        hideModal('addSlotModal');
        e.target.reset();
        await loadMySlots();
    } catch (err) {
        showAlert('Error: ' + err.message, 'error');
    }
});

async function deleteSlot(id) {
    if (!confirm('Remove this availability slot?')) return;
    try {
        await api.deleteSlot(id);
        await loadMySlots();
    } catch (err) {
        showAlert('Error: ' + err.message, 'error');
    }
}

// ─────────────────────── Patient EHR ───────────────────────
async function prepareEHRPatientList() {
    const sel = document.getElementById('ehrPatientSelect');
    if (!sel) return;
    try {
        const resp = await api.getConsultations();
        const seen = new Set();
        const patients = (resp.consultations || []).filter(c => {
            if (seen.has(c.patient_id)) return false;
            seen.add(c.patient_id); return true;
        });
        sel.innerHTML = '<option value="">— Select a patient from your consultations —</option>'
            + patients.map(c => `<option value="${c.patient_id}">${escapeHtml(c.patient_name)}</option>`).join('');
    } catch (e) {}
}

async function loadPatientEHR() {
    const patientId = document.getElementById('ehrPatientSelect').value;
    if (!patientId) { showAlert('Select a patient first.', 'error'); return; }
    const container = document.getElementById('ehrContent');
    container.innerHTML = '<p class="text-secondary">Loading patient data…</p>';
    try {
        // Pull vitals and diagnosis history via the existing endpoints
        const [vitResp, diagResp] = await Promise.all([
            api.request(`/users/${patientId}/vitals`).catch(() => ({ vitals: [] })),
            api.request(`/diagnosis/history`).catch(() => ({ history: [] })),
        ]);
        const vitals = vitResp.vitals || [];
        const diag   = diagResp.history || [];
        container.innerHTML = `
            <h3 style="margin-bottom:0.75rem;">Recent Vitals</h3>
            ${vitals.length ? vitals.slice(0,5).map(v => {
                const d = vitalRowDisplay(v);
                return `<div style="padding:0.4rem 0; border-bottom:1px solid var(--border-color,#334155);">${d.label}: <strong>${d.value} ${d.unit}</strong> <span class="text-secondary">(${new Date(v.recorded_at).toLocaleDateString()})</span></div>`;
            }).join('') : '<p class="text-secondary">No vitals recorded.</p>'}
            <h3 style="margin:1rem 0 0.75rem;">Diagnosis History</h3>
            ${diag.length ? diag.slice(0,5).map(d => `
                <div style="padding:0.4rem 0; border-bottom:1px solid var(--border-color,#334155);">
                    <strong>${escapeHtml(d.diagnosis_result || d.diagnosis || 'N/A')}</strong>
                    <span class="badge" style="margin-left:0.5rem; background:var(--${d.risk_level==='high'?'danger':'primary'}-color,#3b82f6); color:#fff; padding:2px 6px; border-radius:8px; font-size:0.72rem;">${d.risk_level||'?'}</span>
                    <span class="text-secondary" style="font-size:0.82rem; margin-left:0.5rem;">${new Date(d.created_at||d.date).toLocaleDateString()}</span>
                </div>`).join('') : '<p class="text-secondary">No diagnosis records.</p>'}`;
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error loading EHR: ${err.message}</p>`;
    }
}

// ─────────────────────── Utility: vitalRowDisplay (mirror from user-dashboard) ───────────────────────
function vitalRowDisplay(v) {
    if (v.systolic != null)      return { label: '🩺 Blood Pressure',  value: `${v.systolic}/${v.diastolic}`, unit: 'mmHg' };
    if (v.heart_rate != null)    return { label: '❤️ Heart Rate',       value: v.heart_rate,    unit: 'bpm'   };
    if (v.temperature_c != null) return { label: '🌡️ Temperature',      value: v.temperature_c, unit: '°C'    };
    if (v.glucose_mg_dl != null) return { label: '💉 Glucose',          value: v.glucose_mg_dl, unit: 'mg/dL' };
    if (v.weight_kg != null)     return { label: '⚖️ Weight',           value: v.weight_kg,     unit: 'kg'    };
    if (v.spo2 != null)          return { label: '💨 SpO₂',             value: v.spo2,           unit: '%'     };
    return { label: '📊 Vital', value: '—', unit: '' };
}

