// Admin Dashboard JavaScript

// Check authentication
if (!requireAuth()) {
    throw new Error('Authentication required');
}

const user = getCurrentUser();
if (user.role !== 'admin') {
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
        case 'hospitals':  await loadHospitals(); break;
        case 'services':   await loadServices(); break;
        case 'users':      await loadUsers(); break;
        case 'audit':      await loadAuditLogs(); break;
        case 'analytics':  await loadAnalytics(); break;
        case 'alerts':     await loadAdminAlerts(); break;
        case 'ratings':    await loadAdminRatings(); break;
    }
}

// Load statistics
async function loadStats() {
    try {
        const response = await api.getAdminStats();
        const stats = response.stats;

        const statsCards = document.getElementById('statsCards');
        statsCards.innerHTML = `
            <div class="card">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; color: var(--primary-light); font-weight: bold;">${stats.total_users}</div>
                    <div style="color: var(--text-secondary); margin-top: 0.5rem;">Total Users</div>
                </div>
            </div>
            <div class="card">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; color: var(--secondary-color); font-weight: bold;">${stats.total_doctors}</div>
                    <div style="color: var(--text-secondary); margin-top: 0.5rem;">Total Doctors</div>
                </div>
            </div>
            <div class="card">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; color: var(--success-color); font-weight: bold;">${stats.total_hospitals}</div>
                    <div style="color: var(--text-secondary); margin-top: 0.5rem;">Total Hospitals</div>
                </div>
            </div>
            <div class="card">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; color: var(--warning-color); font-weight: bold;">${stats.total_consultations}</div>
                    <div style="color: var(--text-secondary); margin-top: 0.5rem;">Total Consultations</div>
                </div>
            </div>
            <div class="card">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; color: var(--danger-color); font-weight: bold;">${stats.pending_consultations}</div>
                    <div style="color: var(--text-secondary); margin-top: 0.5rem;">Pending Consultations</div>
                </div>
            </div>
            <div class="card">
                <div style="text-align: center;">
                    <div style="font-size: 2.5rem; color: var(--primary-light); font-weight: bold;">${stats.total_tests}</div>
                    <div style="color: var(--text-secondary); margin-top: 0.5rem;">Total Tests</div>
                </div>
            </div>
        `;
    } catch (error) {
        showAlert('Failed to load statistics: ' + error.message, 'error');
    }
}

// Load hospitals
async function loadHospitals() {
    try {
        const response = await api.getHospitals();
        const hospitalsList = document.getElementById('hospitalsList');

        if (response.hospitals.length === 0) {
            hospitalsList.innerHTML = '<p style="color: var(--text-secondary);">No hospitals yet.</p>';
            return;
        }

        hospitalsList.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Address</th>
                        <th>Phone</th>
                        <th>Emergency</th>
                        <th>Services</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${response.hospitals.map(hospital => `
                        <tr>
                            <td>${escapeHtml(hospital.name)}</td>
                            <td>${escapeHtml(hospital.address)}</td>
                            <td>${hospital.phone}</td>
                            <td>${hospital.emergency_contact}</td>
                            <td>${hospital.services ? escapeHtml(hospital.services) : '-'}</td>
                            <td>
                                <button class="btn btn-danger btn-sm" onclick="deleteHospital(${hospital.id}, '${escapeHtml(hospital.name)}')">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        showAlert('Failed to load hospitals: ' + error.message, 'error');
    }
}

// Load services for checkboxes
async function loadServicesCheckboxes() {
    try {
        const response = await api.getServices();
        const container = document.getElementById('servicesCheckboxes');
        
        container.innerHTML = response.services.map(service => `
            <div style="padding: 0.5rem;">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" name="services" value="${service.id}">
                    <span>${escapeHtml(service.name)}</span>
                </label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load services:', error);
    }
}

// Add hospital form
document.getElementById('addHospitalForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedServices = Array.from(document.querySelectorAll('input[name="services"]:checked'))
        .map(cb => parseInt(cb.value));

    const latitude = document.getElementById('hospitalLatitude').value;
    const longitude = document.getElementById('hospitalLongitude').value;

    const hospitalData = {
        name: document.getElementById('hospitalName').value,
        address: document.getElementById('hospitalAddress').value,
        phone: document.getElementById('hospitalPhone').value,
        emergency_contact: document.getElementById('hospitalEmergency').value,
        email: document.getElementById('hospitalEmail').value,
        description: document.getElementById('hospitalDescription').value,
        service_ids: selectedServices,
    };

    // Add coordinates if both are provided
    if (latitude && longitude) {
        hospitalData.latitude = parseFloat(latitude);
        hospitalData.longitude = parseFloat(longitude);
    }

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        await api.createHospital(hospitalData);

        showAlert('Hospital added successfully!', 'success');
        hideModal('addHospitalModal');
        e.target.reset();

        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Hospital';

        await loadHospitals();
        await loadStats();

    } catch (error) {
        showAlert('Failed to add hospital: ' + error.message, 'error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Hospital';
    }
});

// Delete hospital
async function deleteHospital(id, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
        return;
    }

    try {
        await api.deleteHospital(id);
        showAlert('Hospital deleted successfully', 'success');
        await loadHospitals();
        await loadStats();
    } catch (error) {
        showAlert('Failed to delete hospital: ' + error.message, 'error');
    }
}

// Load services
async function loadServices() {
    try {
        const response = await api.getServices();
        const servicesList = document.getElementById('servicesList');

        if (response.services.length === 0) {
            servicesList.innerHTML = '<p style="color: var(--text-secondary);">No services yet.</p>';
            return;
        }

        servicesList.innerHTML = `
            <div class="grid grid-3">
                ${response.services.map(service => `
                    <div class="card">
                        <h3 style="color: var(--primary-light); margin-bottom: 0.5rem;">${escapeHtml(service.name)}</h3>
                        <p style="color: var(--text-secondary);">${service.description ? escapeHtml(service.description) : 'No description'}</p>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        showAlert('Failed to load services: ' + error.message, 'error');
    }
}

// Add service form
document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const serviceData = {
        name: document.getElementById('serviceName').value,
        description: document.getElementById('serviceDescription').value,
    };

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        await api.createService(serviceData);

        showAlert('Service added successfully!', 'success');
        hideModal('addServiceModal');
        e.target.reset();

        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Service';

        await loadServices();

    } catch (error) {
        showAlert('Failed to add service: ' + error.message, 'error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Service';
    }
});

// Load users
async function loadUsers() {
    try {
        const response = await api.getAllUsers();
        const usersList = document.getElementById('usersList');

        if (response.users.length === 0) {
            usersList.innerHTML = '<p style="color: var(--text-secondary);">No users yet.</p>';
            return;
        }

        usersList.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Full Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Role</th>
                        <th>Registered</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${response.users.map(u => `
                        <tr>
                            <td>${escapeHtml(u.username)}</td>
                            <td>${escapeHtml(u.full_name)}</td>
                            <td>${escapeHtml(u.email)}</td>
                            <td>${u.phone || '-'}</td>
                            <td><span class="badge badge-info">${u.role.toUpperCase()}</span></td>
                            <td>${formatDate(u.created_at)}</td>
                            <td>
                                <button class="btn btn-primary btn-sm" onclick="openUpdateRole(${u.id}, '${escapeHtml(u.username)}', '${u.role}')">
                                    Change Role
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        showAlert('Failed to load users: ' + error.message, 'error');
    }
}

// Open update role modal
function openUpdateRole(id, username, currentRole) {
    document.getElementById('userId').value = id;
    document.getElementById('userNameDisplay').value = username;
    document.getElementById('userRole').value = currentRole;
    showModal('updateRoleModal');
}

// Update role form
document.getElementById('updateRoleForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('userId').value;
    const role = document.getElementById('userRole').value;

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        await api.updateUserRole(userId, role);

        showAlert('User role updated successfully!', 'success');
        hideModal('updateRoleModal');
        e.target.reset();

        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Role';

        await loadUsers();
        await loadStats();

    } catch (error) {
        showAlert('Failed to update role: ' + error.message, 'error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Role';
    }
});

// Load audit logs
async function loadAuditLogs() {
    try {
        const response = await api.getAuditLogs(50);
        const auditLogsList = document.getElementById('auditLogsList');

        if (response.logs.length === 0) {
            auditLogsList.innerHTML = '<p style="color: var(--text-secondary);">No audit logs yet.</p>';
            return;
        }

        auditLogsList.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Date & Time</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Entity</th>
                        <th>Details</th>
                        <th>IP Address</th>
                    </tr>
                </thead>
                <tbody>
                    ${response.logs.map(log => `
                        <tr>
                            <td>${formatDateTime(log.created_at)}</td>
                            <td>${log.username || 'System'}</td>
                            <td><span class="badge badge-info">${escapeHtml(log.action)}</span></td>
                            <td>${log.entity_type ? `${log.entity_type} #${log.entity_id}` : '-'}</td>
                            <td>${log.details ? escapeHtml(log.details) : '-'}</td>
                            <td>${log.ip_address || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        showAlert('Failed to load audit logs: ' + error.message, 'error');
    }
}

// Load services when modal opens
document.querySelector('[onclick*="addHospitalModal"]').addEventListener('click', loadServicesCheckboxes);

// Initial load
loadStats();
loadHospitals();

// ─────────────────────── Analytics ───────────────────────
let _consultChart = null, _diagChart = null;

async function loadAnalytics() {
    try {
        const response = await api.getAdminStats();
        const stats = response.stats || response;
        renderConsultChart(stats);
        renderDiagChart(stats);
        renderRevenueSummary(stats);
    } catch (err) {
        document.getElementById('revenueSummary').innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

function renderConsultChart(stats) {
    const canvas = document.getElementById('consultChart');
    if (!canvas) return;
    // Use basic stats from existing admin stats endpoint
    const s = stats || {};
    const labels = ['Total', 'Pending', 'Completed', 'Cancelled'];
    const values = [
        s.total_consultations || 0,
        s.pending_consultations || 0,
        s.completed_consultations || 0,
        s.cancelled_consultations || 0,
    ];
    if (_consultChart) _consultChart.destroy();
    _consultChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'Consultations', data: values,
                backgroundColor: ['#38bdf8','#fbbf24','#34d399','#f87171'],
                borderRadius: 6 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

function renderDiagChart(stats) {
    const canvas = document.getElementById('diagChart');
    if (!canvas) return;
    const diags = stats.top_diagnoses || [];
    if (!diags.length) { canvas.parentElement.innerHTML += '<p class="text-secondary" style="padding:1rem;">No diagnosis data yet.</p>'; return; }
    if (_diagChart) _diagChart.destroy();
    _diagChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: diags.map(d => d.diagnosis || d.condition || 'Unknown'),
            datasets: [{ data: diags.map(d => d.count || 1),
                backgroundColor: ['#38bdf8','#f472b6','#34d399','#fbbf24','#a78bfa'],
                borderWidth: 2 }]
        },
        options: { responsive: true }
    });
}

function renderRevenueSummary(stats) {
    const el = document.getElementById('revenueSummary');
    if (!el) return;
    const r = stats.revenue || {};
    el.innerHTML = `
        <div class="grid grid-3" style="gap:1rem;">
            <div class="card" style="padding:1rem; text-align:center;">
                <div style="font-size:1.8rem; font-weight:700; color:var(--primary-light);">${(r.total_xaf || 0).toLocaleString()} XAF</div>
                <div class="text-secondary">Total Revenue</div>
            </div>
            <div class="card" style="padding:1rem; text-align:center;">
                <div style="font-size:1.8rem; font-weight:700; color:var(--success-color);">${r.succeeded_count || 0}</div>
                <div class="text-secondary">Successful Payments</div>
            </div>
            <div class="card" style="padding:1rem; text-align:center;">
                <div style="font-size:1.8rem; font-weight:700; color:var(--warning-color,#d97706);">${r.pending_count || 0}</div>
                <div class="text-secondary">Pending Payments</div>
            </div>
        </div>`;
}

// ─────────────────────── Admin Alerts ───────────────────────
async function loadAdminAlerts() {
    const container = document.getElementById('adminAlertsList');
    container.innerHTML = '<p class="text-secondary">Loading…</p>';
    try {
        const data = await api.listAlerts();
        const alerts = data.alerts || [];
        if (!alerts.length) { container.innerHTML = '<p class="text-secondary">No active alerts.</p>'; return; }
        container.innerHTML = alerts.map(a => `
            <div class="card mb-2" style="border-left:4px solid var(--warning-color,#d97706); padding:1rem; display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <strong>${escapeHtml(a.title)}</strong>
                    <span class="badge" style="margin-left:0.5rem; background:${a.severity==='critical'?'var(--danger-color)':a.severity==='warning'?'var(--warning-color,#d97706)':'var(--primary-color)'}; color:#fff; padding:2px 8px; border-radius:10px; font-size:0.72rem;">${a.severity||'info'}</span>
                    <p style="margin:0.4rem 0 0; font-size:0.9rem;">${escapeHtml(a.body || a.message || '')}</p>
                    <div class="text-secondary" style="font-size:0.78rem;">${new Date(a.created_at).toLocaleString()}</div>
                </div>
                <button class="btn btn-sm btn-danger" onclick="deactivateAlert(${a.id})">🗑 Deactivate</button>
            </div>`).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

document.getElementById('createAlertForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        title:    document.getElementById('alertTitle').value.trim(),
        body:     document.getElementById('alertBody').value.trim(),
        severity: document.getElementById('alertSeverity').value,
    };
    try {
        await api.createAlert(payload);
        showAlert('Alert published!', 'success');
        hideModal('createAlertModal');
        e.target.reset();
        await loadAdminAlerts();
    } catch (err) {
        showAlert('Error: ' + err.message, 'error');
    }
});

async function deactivateAlert(id) {
    if (!confirm('Deactivate this alert?')) return;
    try {
        await api.deactivateAlert(id);
        await loadAdminAlerts();
    } catch (err) {
        showAlert('Error: ' + err.message, 'error');
    }
}

// ─────────────────────── Admin Ratings ───────────────────────
async function loadAdminRatings() {
    const container = document.getElementById('ratingsList');
    container.innerHTML = '<p class="text-secondary">Loading…</p>';
    try {
        // Pull ratings for all hospitals
        const hosps = await api.getHospitals();
        const all = [];
        for (const h of (hosps.hospitals || []).slice(0, 5)) {
            try {
                const r = await api.getRatings('hospital', h.id);
                (r.ratings || []).forEach(rt => all.push({ ...rt, target: h.name }));
            } catch(e) {}
        }
        if (!all.length) { container.innerHTML = '<p class="text-secondary">No ratings yet.</p>'; return; }
        container.innerHTML = all.map(r => `
            <div class="card mb-2" style="padding:0.75rem 1rem;">
                <div style="display:flex;justify-content:space-between;">
                    <strong>${escapeHtml(r.target)}</strong>
                    <span>${'⭐'.repeat(r.rating || 0)}${'☆'.repeat(5-(r.rating||0))}</span>
                </div>
                ${r.comment ? `<p style="margin:0.3rem 0 0; font-size:0.9rem;">${escapeHtml(r.comment)}</p>` : ''}
                <div class="text-secondary" style="font-size:0.78rem;">By user #${r.user_id} · ${new Date(r.created_at).toLocaleDateString()}</div>
            </div>`).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

