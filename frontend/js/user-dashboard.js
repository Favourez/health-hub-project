// User Dashboard JavaScript

// Check authentication
if (!requireAuth()) {
    throw new Error('Authentication required');
}

const user = getCurrentUser();
if (user.role !== 'user') {
    redirectToDashboard();
}

// Display user name
document.getElementById('userName').textContent = user.full_name;

// Map variables
let hospitalMap = null;
let userMarker = null;
let hospitalMarkers = [];
let userLocation = null;
let routingControl = null;
let nearestHospital = null;
let allHospitals = [];

// Pharmacy map variables
let pharmacyMap = null;
let pharmacyUserMarker = null;
let pharmacyMarkers = [];
let pharmacyUserLocation = null;
let pharmacyRoutingControl = null;
let nearestPharmacy = null;
let allPharmacies = [];

// Tab management
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });

    // Remove active class from all sidebar links
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName + 'Tab').classList.remove('hidden');

    // Highlight active sidebar link
    if (event && event.target) {
        const clickedLink = event.target.closest('.sidebar-link');
        if (clickedLink) {
            clickedLink.classList.add('active');
        }
    }

    // Load tab data
    loadTabData(tabName);
}

// Load tab data
async function loadTabData(tabName) {
    switch (tabName) {
        case 'hospitals':
            await loadHospitals();
            await loadServiceCards();
            // Initialize map when hospitals tab is shown
            setTimeout(() => {
                console.log('Attempting to initialize map...');
                initializeMap();
                if (hospitalMap) {
                    console.log('Invalidating map size...');
                    hospitalMap.invalidateSize();
                }
            }, 300);
            break;
        case 'pharmacies':
            await loadPharmacies();
            await loadDrugs();
            // Initialize pharmacy map when pharmacies tab is shown
            setTimeout(() => {
                console.log('Attempting to initialize pharmacy map...');
                initializePharmacyMap();
                if (pharmacyMap) {
                    console.log('Invalidating pharmacy map size...');
                    pharmacyMap.invalidateSize();
                }
            }, 300);
            break;
        case 'diagnosis':
            await loadDiagnosisHistory();
            break;
        case 'doctors':
            await loadDoctors();
            break;
        case 'consultations':
            await loadConsultations();
            break;
        case 'tests':
            await loadTests();
            break;
        case 'profile':
            await loadHealthProfile();
            break;
        case 'vitals':
            await loadVitals();
            break;
        case 'prescriptions':
            await loadPrescriptions();
            break;
        case 'alerts':
            await loadAlertsTab();
            break;
        case 'uploads':
            await loadUploads();
            break;
    }
}

// Initialize map
function initializeMap() {
    const mapContainer = document.getElementById('hospitalMap');

    if (!mapContainer) {
        console.error('Map container not found!');
        return;
    }

    if (!hospitalMap) {
        try {
            console.log('Initializing map...');

            // Default center (Yaoundé, Cameroon)
            hospitalMap = L.map('hospitalMap').setView([3.8480, 11.5021], 12);

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(hospitalMap);

            console.log('Map initialized successfully');

            // Load hospitals on map with default view (no user location yet)
            loadHospitalsOnMapWithoutLocation();
        } catch (error) {
            console.error('Error initializing map:', error);
            document.getElementById('locationStatus').innerHTML =
                '❌ Failed to load map. Please refresh the page.';
            document.getElementById('locationStatus').style.color = 'var(--danger-color)';
        }
    }
}

// Load hospitals on map without user location
async function loadHospitalsOnMapWithoutLocation() {
    try {
        const response = await api.getHospitals();

        // Store all hospitals globally
        allHospitals = response.hospitals;

        // Clear existing hospital markers
        hospitalMarkers.forEach(marker => marker.remove());
        hospitalMarkers = [];

        // Add hospital markers
        const hospitalIcon = L.icon({
            iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        let bounds = [];
        let hospitalsWithCoords = 0;

        response.hospitals.forEach(hospital => {
            // Only show hospitals that have coordinates
            if (hospital.latitude && hospital.longitude) {
                const lat = parseFloat(hospital.latitude);
                const lng = parseFloat(hospital.longitude);

                const marker = L.marker([lat, lng], { icon: hospitalIcon })
                    .addTo(hospitalMap)
                    .bindPopup(`
                        <div class="hospital-popup">
                            <h3>🏥 ${escapeHtml(hospital.name)}</h3>
                            <p>📍 ${escapeHtml(hospital.address)}</p>
                            <p>📞 ${hospital.phone}</p>
                            <p>🚨 Emergency: ${hospital.emergency_contact}</p>
                        </div>
                    `);

                hospitalMarkers.push(marker);
                bounds.push([lat, lng]);
                hospitalsWithCoords++;
            }
        });

        // Fit map to show all hospitals
        if (bounds.length > 0) {
            hospitalMap.fitBounds(bounds, { padding: [50, 50] });
            document.getElementById('locationStatus').innerHTML =
                `🗺️ Showing ${hospitalsWithCoords} hospital${hospitalsWithCoords !== 1 ? 's' : ''}. Click "Use My Location" to see distances.`;
            document.getElementById('locationStatus').style.color = 'var(--text-secondary)';
        } else {
            document.getElementById('locationStatus').innerHTML =
                '⚠️ No hospitals with coordinates found. Admins can add hospitals with location data.';
            document.getElementById('locationStatus').style.color = 'var(--warning-color)';
        }

    } catch (error) {
        console.error('Failed to load hospitals on map:', error);
        document.getElementById('locationStatus').innerHTML =
            '❌ Failed to load hospitals. Please refresh the page.';
        document.getElementById('locationStatus').style.color = 'var(--danger-color)';
    }
}

// Get user's location
function getUserLocation() {
    const statusDiv = document.getElementById('locationStatus');

    if (!navigator.geolocation) {
        statusDiv.innerHTML = '❌ Geolocation is not supported by your browser';
        statusDiv.style.color = 'var(--danger-color)';
        return;
    }

    statusDiv.innerHTML = '📍 Getting your location...';
    statusDiv.style.color = 'var(--secondary-color)';

    const options = {
        enableHighAccuracy: false, // Use network location for faster response
        timeout: 30000, // 30 seconds timeout
        maximumAge: 300000 // Accept cached location up to 5 minutes old
    };

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            statusDiv.innerHTML = `✅ Location found: ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
            statusDiv.style.color = 'var(--success-color)';

            // Show emergency actions
            document.getElementById('emergencyActions').style.display = 'block';

            // Center map on user location
            hospitalMap.setView([userLocation.lat, userLocation.lng], 13);

            // Add/update user marker
            if (userMarker) {
                userMarker.setLatLng([userLocation.lat, userLocation.lng]);
            } else {
                const userIcon = L.icon({
                    iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-blue.png',
                    shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });

                userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
                    .addTo(hospitalMap)
                    .bindPopup('<b>📍 Your Location</b>')
                    .openPopup();
            }

            // Load and display hospitals on map with distances
            await loadHospitalsOnMap();
            // Refresh directory list to show distances
            await loadHospitals(document.getElementById('hospitalSearch').value || '');
        },
        async (error) => {
            console.warn('Browser geolocation failed:', error);

            // Try IP-based geolocation as fallback
            statusDiv.innerHTML = '📍 Trying alternative location method...';
            statusDiv.style.color = 'var(--secondary-color)';

            try {
                // Use a free IP geolocation service
                const response = await fetch('https://ipapi.co/json/');
                const data = await response.json();

                if (data.latitude && data.longitude) {
                    userLocation = {
                        lat: data.latitude,
                        lng: data.longitude
                    };

                    statusDiv.innerHTML = `✅ Location found (approximate): ${data.city}, ${data.country_name}`;
                    statusDiv.style.color = 'var(--success-color)';

                    // Show emergency actions
                    document.getElementById('emergencyActions').style.display = 'block';

                    // Center map on user location
                    hospitalMap.setView([userLocation.lat, userLocation.lng], 11);

                    // Add user marker
                    const userIcon = L.icon({
                        iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-blue.png',
                        shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    });

                    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
                        .addTo(hospitalMap)
                        .bindPopup(`<b>📍 Your Approximate Location</b><br>${data.city}, ${data.country_name}`)
                        .openPopup();

                    // Load hospitals
                    await loadHospitalsOnMap();
                    await loadHospitals(document.getElementById('hospitalSearch').value || '');
                    return;
                }
            } catch (ipError) {
                console.warn('IP geolocation also failed:', ipError);
            }

            // If all methods fail, show error message
            let errorMsg = '';
            let helpText = '';

            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '❌ Location permission denied.';
                    helpText = '<br><small>Please enable location access in your browser settings.</small>';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '⚠️ Location unavailable - showing all hospitals.';
                    helpText = '<br><small>You can still browse all hospitals on the map.</small>' +
                              '<br><small>Distance calculations are disabled.</small>';
                    break;
                case error.TIMEOUT:
                    errorMsg = '⏱️ Location request timed out.';
                    helpText = '<br><small>Showing all hospitals without distance info.</small>';
                    break;
                default:
                    errorMsg = '⚠️ Location unavailable - showing all hospitals.';
                    helpText = '<br><small>You can still browse all hospitals on the map.</small>';
            }

            statusDiv.innerHTML = errorMsg + helpText;
            statusDiv.style.color = 'var(--warning-color)';

            // Still load hospitals even without user location
            await loadHospitalsOnMap();
        },
        options
    );
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Load hospitals on map
async function loadHospitalsOnMap() {
    try {
        const response = await api.getHospitals();

        // Store all hospitals globally
        allHospitals = response.hospitals;

        // Clear existing hospital markers
        hospitalMarkers.forEach(marker => marker.remove());
        hospitalMarkers = [];

        // Add hospital markers
        const hospitalIcon = L.icon({
            iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        let hospitalsWithCoordinates = 0;
        const defaultCenter = { lat: 3.8480, lng: 11.5021 }; // Yaoundé, Cameroon

        response.hospitals.forEach(hospital => {
            let lat, lng;

            // Use real coordinates if available
            if (hospital.latitude && hospital.longitude) {
                lat = parseFloat(hospital.latitude);
                lng = parseFloat(hospital.longitude);
                hospitalsWithCoordinates++;
            } else if (userLocation) {
                // Generate random coordinates near user for demo purposes
                lat = userLocation.lat + (Math.random() - 0.5) * 0.1;
                lng = userLocation.lng + (Math.random() - 0.5) * 0.1;
            } else {
                // Use default location (Yaoundé) if no user location
                lat = defaultCenter.lat + (Math.random() - 0.5) * 0.1;
                lng = defaultCenter.lng + (Math.random() - 0.5) * 0.1;
            }

            // Calculate distance only if user location is available
            let distanceHtml = '';
            if (userLocation) {
                const distance = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
                distanceHtml = `<p class="distance">📏 ${distance.toFixed(2)} km away</p>`;
            }

            const marker = L.marker([lat, lng], { icon: hospitalIcon })
                .addTo(hospitalMap)
                .bindPopup(`
                    <div class="hospital-popup">
                        <h3>🏥 ${escapeHtml(hospital.name)}</h3>
                        <p>📍 ${escapeHtml(hospital.address)}</p>
                        <p>📞 ${hospital.phone}</p>
                        <p>🚨 Emergency: ${hospital.emergency_contact}</p>
                        ${distanceHtml}
                        ${!hospital.latitude ? '<p style="font-size: 0.8rem; color: var(--warning-color);">⚠️ Approximate location</p>' : ''}
                    </div>
                `);

            hospitalMarkers.push(marker);
        });

        // Update status message
        const statusDiv = document.getElementById('locationStatus');
        if (hospitalsWithCoordinates === 0 && statusDiv) {
            statusDiv.innerHTML += '<br><small style="color: var(--warning-color);">⚠️ Showing approximate hospital locations.</small>';
        }

    } catch (error) {
        showAlert('Failed to load hospitals on map: ' + error.message, 'error');
    }
}

// Load hospitals
async function loadHospitals(search = '') {
    try {
        const response = await api.getHospitals(search);
        allHospitals = response.hospitals;

        // Compute distances if user location is available
        if (userLocation) {
            allHospitals.forEach(h => {
                if (h.latitude && h.longitude) {
                    h.distance = calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        parseFloat(h.latitude),
                        parseFloat(h.longitude)
                    );
                }
            });
            allHospitals.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        }

        applyHospitalFilters();
    } catch (error) {
        showAlert('Failed to load hospitals: ' + error.message, 'error');
    }
}

// Populate the service filter dropdown from /api/services
async function loadHospitalServiceFilter() {
    try {
        const select = document.getElementById('hospitalServiceFilter');
        if (!select) return;
        const response = await api.getServices();
        const services = (response.services || [])
            .map(s => s.name)
            .sort((a, b) => a.localeCompare(b));
        const current = select.value;
        select.innerHTML = '<option value="">All services</option>' +
            services.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        if (current) select.value = current;
    } catch (error) {
        console.error('Failed to load services:', error);
    }
}

// Filter the cached hospitals by service and re-render
function applyHospitalFilters() {
    const serviceSel = document.getElementById('hospitalServiceFilter');
    const service = serviceSel ? serviceSel.value : '';
    let filtered = allHospitals;
    if (service) {
        const needle = service.toLowerCase();
        filtered = allHospitals.filter(h =>
            (h.services || '').toLowerCase().includes(needle)
        );
    }
    displayHospitals(filtered);
}

// Display hospitals
function displayHospitals(hospitals) {
    const hospitalsList = document.getElementById('hospitalsList');

    if (!hospitals || hospitals.length === 0) {
        hospitalsList.innerHTML = '<p style="color: var(--text-secondary);">No hospitals found.</p>';
        return;
    }

    hospitalsList.innerHTML = hospitals.map(hospital => `
        <div class="card">
            <div class="card-header">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>🏥 ${escapeHtml(hospital.name)}</span>
                    ${hospital.is_24_hours ? '<span class="badge badge-success">24/7</span>' : ''}
                </div>
            </div>
            <div class="card-body">
                <p><strong>📍 Address:</strong> ${escapeHtml(hospital.address)}</p>
                <p><strong>📞 Phone:</strong> <a href="tel:${hospital.phone}">${hospital.phone}</a></p>
                <p style="color: var(--danger-color);"><strong>🚨 Emergency:</strong>
                    <a href="tel:${hospital.emergency_contact}" style="color: var(--danger-color);">${hospital.emergency_contact}</a>
                </p>
                ${hospital.email ? `<p><strong>📧 Email:</strong> ${escapeHtml(hospital.email)}</p>` : ''}
                <p><strong>🕐 Hours:</strong> ${escapeHtml(hospital.opening_hours || 'Not specified')}</p>
                ${hospital.distance ? `<p><strong>📏 Distance:</strong> ${hospital.distance.toFixed(2)} km</p>` : ''}
                ${hospital.services ? `
                    <div style="margin-top: 0.5rem;">
                        <strong>Services:</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                            ${hospital.services.split(',').map(s => `<span class="badge badge-info" style="font-size: 0.75rem;">${escapeHtml(s.trim())}</span>`).join('')}
                        </div>
                    </div>` : ''}
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button class="btn btn-primary btn-sm" onclick="viewHospitalDetails(${hospital.id})">
                        🏥 View Details
                    </button>
                    <button class="btn btn-success btn-sm" onclick="messageHospital(${hospital.id})">
                        💬 Message
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// View hospital details - Navigate to dedicated page
function viewHospitalDetails(hospitalId) {
    window.location.href = `hospital-details.html?id=${hospitalId}`;
}

// Message hospital - Navigate to dedicated page
function messageHospital(hospitalId) {
    window.location.href = `hospital-message.html?id=${hospitalId}`;
}

// ---- Service search section (mirrors drug search) ----
let allServices = [];

// Map service name -> coarse category (used by the dropdown filter)
function categorizeService(name) {
    const n = name.toLowerCase();
    if (n.includes('x-ray') || n.includes('mri') || n.includes('ct scan') ||
        n.includes('echography') || n.includes('ultrasound') || n.includes('mammography') ||
        n.includes('endoscopy') || n.includes('radiology') || n.includes('ecg')) return 'imaging';
    if (n.includes('emergency') || n.includes('intensive')) return 'emergency';
    if (n.includes('surgery') || n.includes('orthopedic')) return 'surgery';
    if (n.includes('cardiology') || n.includes('pediatric') || n.includes('maternity') ||
        n.includes('gynecology') || n.includes('neurology') || n.includes('oncology') ||
        n.includes('dermatology') || n.includes('ophthalmology')) return 'specialty';
    return 'other';
}

async function loadServiceCards() {
    try {
        const response = await api.getServices();
        allServices = (response.services || []).map(s => ({
            ...s,
            category: categorizeService(s.name),
        }));
        applyServiceFilters();
    } catch (error) {
        showAlert('Failed to load services: ' + error.message, 'error');
    }
}

function applyServiceFilters() {
    const searchEl = document.getElementById('serviceSearch');
    const catEl = document.getElementById('serviceCategoryFilter');
    const search = (searchEl?.value || '').toLowerCase();
    const cat = catEl?.value || '';
    const filtered = allServices.filter(s => {
        const nameMatch = !search ||
            s.name.toLowerCase().includes(search) ||
            (s.description || '').toLowerCase().includes(search);
        const catMatch = !cat || s.category === cat;
        return nameMatch && catMatch;
    });
    displayServiceCards(filtered);
}

function displayServiceCards(services) {
    const container = document.getElementById('servicesList');
    if (!container) return;
    if (!services.length) {
        container.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">No services found.</p>';
        return;
    }
    const labels = { imaging: 'Imaging', emergency: 'Emergency', specialty: 'Specialty', surgery: 'Surgery', other: 'Other' };
    container.innerHTML = services.map(s => `
        <div class="card">
            <div class="card-header">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>🩺 ${escapeHtml(s.name)}</span>
                    <span class="badge badge-info">${labels[s.category] || 'Other'}</span>
                </div>
            </div>
            <div class="card-body">
                ${s.description ? `<p class="text-secondary">${escapeHtml(s.description)}</p>` : ''}
                <button class="btn btn-primary btn-sm mt-2" onclick="viewServiceHospitals(${s.id})">
                    🏥 Find in Hospitals
                </button>
            </div>
        </div>
    `).join('');
}

function viewServiceHospitals(serviceId) {
    window.location.href = `service-hospitals.html?id=${serviceId}`;
}

// Hospital search (debounced)
document.getElementById('hospitalSearch').addEventListener('input', debounce((e) => {
    loadHospitals(e.target.value);
}, 500));

// Hospital service filter
const hospitalServiceFilterEl = document.getElementById('hospitalServiceFilter');
if (hospitalServiceFilterEl) {
    hospitalServiceFilterEl.addEventListener('change', applyHospitalFilters);
}

// Service search & category filter (debounced)
const serviceSearchEl = document.getElementById('serviceSearch');
if (serviceSearchEl) {
    serviceSearchEl.addEventListener('input', debounce(applyServiceFilters, 300));
}
const serviceCatEl = document.getElementById('serviceCategoryFilter');
if (serviceCatEl) {
    serviceCatEl.addEventListener('change', applyServiceFilters);
}

// ---- AI Diagnosis (structured intake + differential UI) ----
let lastDiagnosisPayload = null;
let lastDiagnosisResult = null;

function buildDiagnosisPayload() {
    const payload = {
        symptoms: document.getElementById('symptoms').value.trim(),
        age: parseInt(document.getElementById('dxAge').value, 10) || null,
        sex: document.getElementById('dxSex').value || null,
        duration_days: parseInt(document.getElementById('dxDuration').value, 10) || null,
        severity: parseInt(document.getElementById('dxSeverity').value, 10) || null,
        current_medications: document.getElementById('dxMeds').value.trim() || null,
        pregnant: document.getElementById('dxPregnant').checked,
    };
    if (userLocation && userLocation.lat && userLocation.lng) {
        payload.latitude = userLocation.lat;
        payload.longitude = userLocation.lng;
    }
    return payload;
}

function renderEmergencyBanner(result) {
    const banner = document.getElementById('emergencyBanner');
    if (!banner) return;
    if (!result.red_flag) {
        banner.classList.add('hidden');
        banner.innerHTML = '';
        return;
    }
    const rf = result.red_flag;
    const hosp = (result.emergency_hospitals || [])[0];
    banner.classList.remove('hidden');
    banner.innerHTML = `
        <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <div style="font-size: 2rem;">🚨</div>
            <div style="flex: 1; min-width: 200px;">
                <div style="font-weight: 700; font-size: 1.1rem;">EMERGENCY: ${escapeHtml(rf.message || 'Seek immediate medical attention')}</div>
                ${hosp ? `<div style="font-size: 0.9rem; opacity: 0.95;">Nearest 24/7 hospital: <strong>${escapeHtml(hosp.name)}</strong>${hosp.distance_km ? ` — ${hosp.distance_km} km` : ''}</div>` : ''}
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <a href="tel:119" class="btn btn-sm" style="background:#fff; color:#b91c1c; font-weight:700;">📞 Call 119</a>
                ${hosp ? `<a href="tel:${hosp.emergency_contact || hosp.phone}" class="btn btn-sm" style="background:#fff; color:#b91c1c; font-weight:700;">🏥 Call Hospital</a>` : ''}
                ${hosp ? `<a href="hospital-details.html?id=${hosp.id}" class="btn btn-sm" style="background:#fff; color:#b91c1c; font-weight:700;">View Hospital</a>` : ''}
            </div>
        </div>`;
}

function confidenceBar(confidence) {
    const pct = Math.round((confidence || 0) * 100);
    const color = pct >= 70 ? 'var(--success-color, #10b981)'
                : pct >= 40 ? 'var(--warning-color, #f59e0b)'
                : 'var(--danger-color, #ef4444)';
    return `
        <div style="background: var(--bg-tertiary, #e5e7eb); border-radius: 6px; height: 10px; overflow: hidden; margin-top: 4px;">
            <div style="height: 100%; width: ${pct}%; background: ${color};"></div>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">Confidence: ${pct}%</div>`;
}

function renderDifferentialCard(d, idx) {
    const drugLinks = (d.suggested_drugs || []).map(dr =>
        `<a href="drug-pharmacies.html?id=${dr.id}" class="badge badge-info" style="text-decoration:none; margin-right:4px;">💊 ${escapeHtml(dr.name)}</a>`
    ).join('');
    const otcText = (!d.suggested_drugs || !d.suggested_drugs.length) && d.suggested_otc && d.suggested_otc.length
        ? `<p style="font-size:0.875rem;"><strong>Suggested OTC:</strong> ${d.suggested_otc.map(escapeHtml).join(', ')}</p>` : '';
    const serviceBtn = d.service_id
        ? `<a href="service-hospitals.html?id=${d.service_id}" class="btn btn-sm btn-primary">🏥 Find Hospitals (${escapeHtml(d.service_name || d.specialty)})</a>`
        : '';
    const bookBtn = `<button class="btn btn-sm btn-success" onclick="bookForSpecialty('${escapeHtml(d.specialty || '')}')">📅 Book Doctor</button>`;
    return `
        <div class="card" style="margin-bottom: 0.75rem; border-left: 4px solid ${idx === 0 ? 'var(--primary-color)' : 'var(--border-color)'};">
            <div class="card-body">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                    <div style="flex:1;">
                        <h4 style="margin:0;">${idx === 0 ? '🎯 ' : ''}${escapeHtml(d.condition)}</h4>
                        ${d.specialty ? `<p style="font-size:0.875rem; color: var(--text-secondary); margin:2px 0;">Specialty: ${escapeHtml(d.specialty)}</p>` : ''}
                    </div>
                    <span class="badge ${getRiskBadgeClass(d.risk_level)}">${(d.risk_level || 'medium').toUpperCase()}</span>
                </div>
                ${confidenceBar(d.confidence)}
                <p style="margin-top:0.5rem;">${escapeHtml(d.recommendation || '')}</p>
                ${otcText}
                ${drugLinks ? `<div style="margin-top:0.5rem;"><strong style="font-size:0.875rem;">Suggested medications:</strong><div style="margin-top:4px;">${drugLinks}</div></div>` : ''}
                <div style="display:flex; gap:0.5rem; margin-top:0.75rem; flex-wrap:wrap;">
                    ${serviceBtn}
                    ${bookBtn}
                </div>
            </div>
        </div>`;
}

function bookForSpecialty(specialty) {
    showTab('doctors');
    setTimeout(() => {
        const sel = document.getElementById('specialtyFilter');
        if (sel && specialty) {
            for (const opt of sel.options) {
                if (opt.value.toLowerCase() === specialty.toLowerCase()) {
                    sel.value = opt.value;
                    sel.dispatchEvent(new Event('change'));
                    break;
                }
            }
        }
    }, 200);
}

function renderDiagnosisResult(result) {
    lastDiagnosisResult = result;
    const resultDiv = document.getElementById('diagnosisResult');
    resultDiv.classList.remove('hidden');
    const diff = result.differential || [];
    const cards = diff.map((d, i) => renderDifferentialCard(d, i)).join('');
    const lowConf = diff.length && (diff[0].confidence || 0) < 0.7 && (result.follow_up_questions || []).length;
    resultDiv.innerHTML = `
        <h4 style="margin-bottom: 0.5rem;">Differential Diagnosis</h4>
        ${cards || '<p class="text-secondary">No matches found.</p>'}
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
            ${lowConf ? `<button class="btn btn-secondary btn-sm" id="openFollowUpBtn">❓ Answer follow-ups to refine</button>` : ''}
            <button class="btn btn-secondary btn-sm" id="downloadDxPdfBtn">📄 Download PDF</button>
        </div>
        <div class="alert alert-warning mt-3">
            <strong>⚠️ Disclaimer:</strong> ${escapeHtml(result.disclaimer || '')}
        </div>
        <p style="font-size:0.75rem; color: var(--text-secondary); margin-top:0.5rem;">Provider: ${escapeHtml(result.provider || 'rules-v2')}</p>
    `;
    const fb = document.getElementById('openFollowUpBtn');
    if (fb) fb.addEventListener('click', openFollowUpModal);
    const pb = document.getElementById('downloadDxPdfBtn');
    if (pb) pb.addEventListener('click', downloadDiagnosisPdf);
    renderEmergencyBanner(result);
}

// ---- Follow-up modal ----
function openFollowUpModal() {
    if (!lastDiagnosisResult || !(lastDiagnosisResult.follow_up_questions || []).length) return;
    const modal = document.getElementById('followUpModal');
    const list = document.getElementById('followUpQuestions');
    list.innerHTML = lastDiagnosisResult.follow_up_questions.map((q, i) => `
        <div class="form-group" style="margin-bottom:0.5rem;">
            <label style="display:flex; align-items:center; gap:0.5rem;">
                <input type="checkbox" data-keyword="${escapeHtml(q.keyword)}" data-idx="${i}">
                ${escapeHtml(q.question)}
            </label>
        </div>
    `).join('');
    modal.classList.remove('hidden');
}

function closeFollowUpModal() {
    document.getElementById('followUpModal').classList.add('hidden');
}

async function submitFollowUp() {
    const checks = document.querySelectorAll('#followUpQuestions input[type="checkbox"]');
    const answers = Array.from(checks).map(c => ({
        keyword: c.dataset.keyword,
        confirmed: c.checked,
    }));
    const payload = { ...(lastDiagnosisPayload || {}), answers };
    try {
        const result = await api.getDiagnosisFollowUp(payload);
        lastDiagnosisResult = result;
        renderDiagnosisResult(result);
        closeFollowUpModal();
        await loadDiagnosisHistory();
    } catch (err) {
        showAlert('Follow-up failed: ' + err.message, 'error');
    }
}

// ---- PDF export ----
function downloadDiagnosisPdf() {
    if (!lastDiagnosisResult) return;
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) { showAlert('PDF library not loaded', 'error'); return; }
    const doc = new jsPDF();
    const left = 14;
    let y = 18;
    doc.setFontSize(16); doc.text('HealthHub - Diagnosis Report', left, y); y += 8;
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, left, y); y += 6;
    doc.text(`Patient: ${user.full_name}`, left, y); y += 6;
    const p = lastDiagnosisPayload || {};
    doc.text(`Age: ${p.age || '-'} | Sex: ${p.sex || '-'} | Duration: ${p.duration_days || '-'} d | Severity: ${p.severity || '-'}/10`, left, y); y += 8;
    doc.setTextColor(0); doc.setFontSize(11);
    doc.text('Symptoms:', left, y); y += 5;
    doc.setFontSize(10);
    const symLines = doc.splitTextToSize(p.symptoms || '-', 180);
    doc.text(symLines, left, y); y += symLines.length * 5 + 4;
    if (lastDiagnosisResult.red_flag) {
        doc.setTextColor(185, 28, 28); doc.setFontSize(12);
        doc.text('EMERGENCY: ' + (lastDiagnosisResult.red_flag.message || ''), left, y);
        doc.setTextColor(0); y += 8;
    }
    doc.setFontSize(12); doc.text('Differential Diagnosis:', left, y); y += 6;
    doc.setFontSize(10);
    (lastDiagnosisResult.differential || []).forEach((d, i) => {
        if (y > 260) { doc.addPage(); y = 18; }
        doc.setFont(undefined, 'bold');
        doc.text(`${i + 1}. ${d.condition} [${(d.risk_level || '').toUpperCase()}, ${Math.round((d.confidence || 0) * 100)}%]`, left, y);
        doc.setFont(undefined, 'normal'); y += 5;
        if (d.specialty) { doc.text(`Specialty: ${d.specialty}`, left + 4, y); y += 5; }
        const recLines = doc.splitTextToSize(d.recommendation || '', 175);
        doc.text(recLines, left + 4, y); y += recLines.length * 5 + 2;
        if (d.suggested_otc && d.suggested_otc.length) {
            doc.text('Suggested OTC: ' + d.suggested_otc.join(', '), left + 4, y); y += 6;
        } else {
            y += 2;
        }
    });
    if (y > 250) { doc.addPage(); y = 18; }
    doc.setFontSize(8); doc.setTextColor(120);
    const disc = doc.splitTextToSize(lastDiagnosisResult.disclaimer || '', 180);
    doc.text(disc, left, y);
    doc.save(`diagnosis-${Date.now()}.pdf`);
}

// ---- Diagnosis form submit ----
document.getElementById('diagnosisForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Analyzing...';
    try {
        if (!api.getToken()) throw new Error('You are not logged in. Please refresh and login again.');
        const payload = buildDiagnosisPayload();
        if (!payload.symptoms) throw new Error('Please describe your symptoms.');
        lastDiagnosisPayload = payload;
        const result = await api.getDiagnosis(payload);
        renderDiagnosisResult(result);
        await loadDiagnosisHistory();
    } catch (err) {
        console.error('Diagnosis error:', err);
        let msg = err.message || 'Unknown error';
        if (msg.toLowerCase().includes('token')) msg = 'Authentication error. Please logout and login again.';
        showAlert('Diagnosis failed: ' + msg, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Get Diagnosis';
    }
});

// Follow-up modal buttons
document.getElementById('cancelFollowUpBtn')?.addEventListener('click', closeFollowUpModal);
document.getElementById('submitFollowUpBtn')?.addEventListener('click', submitFollowUp);

// History trend chart toggle
let _diagTrendChart = null;
document.getElementById('toggleHistoryChartBtn')?.addEventListener('click', async () => {
    const canvas = document.getElementById('diagnosisTrendChart');
    if (!canvas) return;
    if (!canvas.classList.contains('hidden')) {
        canvas.classList.add('hidden');
        return;
    }
    try {
        const resp = await api.getDiagnosisHistory();
        const history = (resp.history || []).slice().reverse();
        const labels = history.map(h => new Date(h.created_at).toLocaleDateString());
        const data = history.map(h => ({ low: 1, medium: 2, high: 3 }[h.risk_level] || 2));
        if (_diagTrendChart) _diagTrendChart.destroy();
        _diagTrendChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Risk over time', data, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.2)', tension: 0.3, fill: true }] },
            options: { scales: { y: { min: 0, max: 3, ticks: { stepSize: 1, callback: v => ['', 'low', 'medium', 'high'][v] || '' } } } },
        });
        canvas.classList.remove('hidden');
    } catch (err) {
        showAlert('Could not load trend: ' + err.message, 'error');
    }
});

// Load diagnosis history
async function loadDiagnosisHistory() {
    try {
        const response = await api.getDiagnosisHistory();
        const historyDiv = document.getElementById('diagnosisHistory');

        if (response.history.length === 0) {
            historyDiv.innerHTML = '<p style="color: var(--text-secondary);">No diagnosis history yet.</p>';
            return;
        }

        historyDiv.innerHTML = response.history.slice(0, 5).map(item => `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
                <p style="color: var(--text-secondary); font-size: 0.875rem;">${formatDateTime(item.created_at)}</p>
                <p style="margin: 0.5rem 0;"><strong>Symptoms:</strong> ${escapeHtml(item.symptoms)}</p>
                <p style="margin: 0.5rem 0;">
                    <strong>Diagnosis:</strong> ${escapeHtml(item.diagnosis_result)}
                    <span class="badge ${getRiskBadgeClass(item.risk_level)}">${item.risk_level.toUpperCase()}</span>
                </p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load diagnosis history:', error);
    }
}

// Load doctors
async function loadDoctors(specialty = '') {
    try {
        const response = await api.getDoctors(specialty);
        const doctorsList = document.getElementById('doctorsList');

        if (response.doctors.length === 0) {
            doctorsList.innerHTML = '<p style="color: var(--text-secondary);">No doctors found.</p>';
            return;
        }

        doctorsList.innerHTML = response.doctors.map(doctor => `
            <div class="card">
                <h3 style="color: var(--primary-light); margin-bottom: 0.5rem;">${escapeHtml(doctor.full_name)}</h3>
                <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
                    <strong>Specialty:</strong> ${escapeHtml(doctor.specialty)}
                </p>
                ${doctor.hospital_name ? `
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
                        <strong>Hospital:</strong> ${escapeHtml(doctor.hospital_name)}
                    </p>
                ` : ''}
                ${doctor.experience_years ? `
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
                        <strong>Experience:</strong> ${doctor.experience_years} years
                    </p>
                ` : ''}
                ${doctor.consultation_fee ? `
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">
                        <strong>Consultation Fee:</strong> $${doctor.consultation_fee}
                    </p>
                ` : ''}
                <button class="btn btn-primary btn-sm mt-2" onclick="openBookConsultation(${doctor.id}, '${escapeHtml(doctor.full_name)}')">
                    Book Consultation
                </button>
            </div>
        `).join('');

        // Populate specialty filter
        const specialties = [...new Set(response.doctors.map(d => d.specialty))];
        const specialtyFilter = document.getElementById('specialtyFilter');
        specialtyFilter.innerHTML = '<option value="">All Specialties</option>' +
            specialties.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

    } catch (error) {
        showAlert('Failed to load doctors: ' + error.message, 'error');
    }
}

// Specialty filter
document.getElementById('specialtyFilter').addEventListener('change', (e) => {
    loadDoctors(e.target.value);
});

// Open book consultation modal
function openBookConsultation(doctorId, doctorName) {
    document.getElementById('selectedDoctorId').value = doctorId;
    document.getElementById('selectedDoctorName').value = doctorName;

    // Set minimum date to today
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('appointmentDate').min = now.toISOString().slice(0, 16);

    showModal('bookConsultationModal');
}

// Book consultation form
document.getElementById('bookConsultationForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const consultationData = {
        doctor_id: document.getElementById('selectedDoctorId').value,
        appointment_date: document.getElementById('appointmentDate').value,
        symptoms: document.getElementById('consultationSymptoms').value,
        notes: document.getElementById('consultationNotes').value,
    };

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Booking...';

        await api.bookConsultation(consultationData);

        showAlert('Consultation booked successfully!', 'success');
        hideModal('bookConsultationModal');
        e.target.reset();

        submitBtn.disabled = false;
        submitBtn.textContent = 'Book Consultation';

        // Reload consultations if on that tab
        if (!document.getElementById('consultationsTab').classList.contains('hidden')) {
            await loadConsultations();
        }

    } catch (error) {
        showAlert('Failed to book consultation: ' + error.message, 'error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Book Consultation';
    }
});

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
                        <th>Doctor</th>
                        <th>Specialty</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${response.consultations.map(consultation => `
                        <tr>
                            <td>${escapeHtml(consultation.doctor_name)}</td>
                            <td>${escapeHtml(consultation.specialty)}</td>
                            <td>${formatDateTime(consultation.appointment_date)}</td>
                            <td><span class="badge ${getStatusBadgeClass(consultation.status)}">${consultation.status.toUpperCase()}</span></td>
                            <td>
                                ${consultation.status === 'accepted' || consultation.status === 'in_progress' ? `
                                    <button class="btn btn-primary btn-sm" onclick="joinVideoCall(${consultation.id})" style="background: var(--success-color);">
                                        🎥 Join Video Call
                                    </button>
                                ` : ''}
                                ${consultation.status === 'pending' ? `
                                    <button class="btn btn-danger btn-sm" onclick="cancelConsultation(${consultation.id})">Cancel</button>
                                ` : ''}
                                ${consultation.status === 'completed' || consultation.status === 'rejected' || consultation.status === 'cancelled' ? '-' : ''}
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

// Cancel consultation
async function cancelConsultation(id) {
    if (!confirm('Are you sure you want to cancel this consultation?')) {
        return;
    }

    try {
        await api.cancelConsultation(id);
        showAlert('Consultation cancelled successfully', 'success');
        await loadConsultations();
    } catch (error) {
        showAlert('Failed to cancel consultation: ' + error.message, 'error');
    }
}

// Join video call
function joinVideoCall(consultationId) {
    window.location.href = `video-call.html?consultation_id=${consultationId}`;
}

// Load tests
async function loadTests() {
    try {
        const response = await api.getMedicalTests();
        const testsList = document.getElementById('testsList');

        if (response.tests.length === 0) {
            testsList.innerHTML = '<p style="color: var(--text-secondary);">No medical tests yet.</p>';
            return;
        }

        testsList.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Test Name</th>
                        <th>Doctor</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Results</th>
                    </tr>
                </thead>
                <tbody>
                    ${response.tests.map(test => `
                        <tr>
                            <td>${escapeHtml(test.test_name)}</td>
                            <td>${escapeHtml(test.doctor_name)}</td>
                            <td>${test.test_date ? formatDate(test.test_date) : 'Not scheduled'}</td>
                            <td><span class="badge ${getStatusBadgeClass(test.status)}">${test.status.toUpperCase()}</span></td>
                            <td>${test.results ? escapeHtml(test.results) : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        showAlert('Failed to load tests: ' + error.message, 'error');
    }
}

// Load doctors for test ordering
async function loadDoctorsForTest() {
    try {
        const response = await api.getDoctors();
        const select = document.getElementById('testDoctorId');
        select.innerHTML = '<option value="">Select a doctor</option>' +
            response.doctors.map(doctor => `
                <option value="${doctor.id}">${escapeHtml(doctor.full_name)} - ${escapeHtml(doctor.specialty)}</option>
            `).join('');
    } catch (error) {
        console.error('Failed to load doctors:', error);
    }
}

// Order test form
document.getElementById('orderTestForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const testData = {
        doctor_id: document.getElementById('testDoctorId').value,
        test_name: document.getElementById('testName').value,
        test_date: document.getElementById('testDate').value,
        notes: document.getElementById('testNotes').value,
    };

    try {
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Ordering...';

        await api.orderMedicalTest(testData);

        showAlert('Medical test ordered successfully!', 'success');
        hideModal('orderTestModal');
        e.target.reset();

        submitBtn.disabled = false;
        submitBtn.textContent = 'Order Test';

        await loadTests();

    } catch (error) {
        showAlert('Failed to order test: ' + error.message, 'error');
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Order Test';
    }
});

// Load doctors when modal opens
document.querySelector('[onclick*="orderTestModal"]').addEventListener('click', loadDoctorsForTest);

// Initial load - hospitals tab is shown by default
loadHospitalServiceFilter();
loadHospitals();
loadServiceCards();

// Initialize map after a short delay to ensure DOM is ready
setTimeout(() => {
    console.log('Initializing map on page load...');
    initializeMap();
    if (hospitalMap) {
        hospitalMap.invalidateSize();
    }
}, 500);

// ============================================================================
// EMERGENCY FEATURES
// ============================================================================

// Find nearest hospital and show route
function findNearestHospital() {
    if (!userLocation) {
        showAlert('Please enable location first', 'error');
        return;
    }

    if (allHospitals.length === 0) {
        showAlert('No hospitals available', 'error');
        return;
    }

    // Calculate distances and find nearest
    let minDistance = Infinity;
    nearestHospital = null;

    allHospitals.forEach(hospital => {
        if (hospital.latitude && hospital.longitude) {
            const distance = calculateDistance(
                userLocation.lat,
                userLocation.lng,
                parseFloat(hospital.latitude),
                parseFloat(hospital.longitude)
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestHospital = {
                    ...hospital,
                    distance: distance,
                    lat: parseFloat(hospital.latitude),
                    lng: parseFloat(hospital.longitude)
                };
            }
        }
    });

    if (!nearestHospital) {
        showAlert('No hospitals with valid coordinates found', 'error');
        return;
    }

    // Show nearest hospital info
    const infoDiv = document.getElementById('nearestHospitalInfo');
    infoDiv.style.display = 'block';
    infoDiv.innerHTML = `
        <div class="card" style="background: var(--card-bg); border: 2px solid var(--primary-light);">
            <div class="card-header" style="background: var(--primary-light); color: white;">
                🏥 Nearest Hospital Found
            </div>
            <div class="card-body">
                <h3 style="color: var(--primary-light); margin-bottom: 0.5rem;">${escapeHtml(nearestHospital.name)}</h3>
                <p style="margin: 0.5rem 0;"><strong>📍 Address:</strong> ${escapeHtml(nearestHospital.address)}</p>
                <p style="margin: 0.5rem 0;"><strong>📏 Distance:</strong> ${nearestHospital.distance.toFixed(2)} km</p>
                <p style="margin: 0.5rem 0;"><strong>📞 Phone:</strong> ${nearestHospital.phone}</p>
                <p style="margin: 0.5rem 0;"><strong>🚨 Emergency:</strong> ${nearestHospital.emergency_contact}</p>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
                    <button onclick="showRoute()" class="btn btn-primary" style="flex: 1;">
                        🗺️ Show Route
                    </button>
                    <button onclick="callHospital()" class="btn" style="flex: 1; background: var(--success-color);">
                        📞 Call Hospital
                    </button>
                    <button onclick="clearRoute()" class="btn" style="flex: 1; background: var(--secondary-color);">
                        ❌ Clear Route
                    </button>
                </div>
            </div>
        </div>
    `;

    // Automatically show the route
    showRoute();
}

// Show route from user location to nearest hospital
function showRoute() {
    if (!nearestHospital || !userLocation) {
        showAlert('Please find nearest hospital first', 'error');
        return;
    }

    // Remove existing route if any
    if (routingControl) {
        hospitalMap.removeControl(routingControl);
    }

    // Create routing control
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(userLocation.lat, userLocation.lng),
            L.latLng(nearestHospital.lat, nearestHospital.lng)
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        showAlternatives: false,
        lineOptions: {
            styles: [{
                color: '#3b82f6',
                opacity: 0.8,
                weight: 6
            }]
        },
        createMarker: function() { return null; }, // Don't create default markers
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1'
        })
    }).addTo(hospitalMap);

    // Listen for route found event
    routingControl.on('routesfound', function(e) {
        const routes = e.routes;
        const summary = routes[0].summary;

        showAlert(
            `Route found! Distance: ${(summary.totalDistance / 1000).toFixed(2)} km, ` +
            `Estimated time: ${Math.round(summary.totalTime / 60)} minutes`,
            'success'
        );
    });

    routingControl.on('routingerror', function(e) {
        console.error('Routing error:', e);
        showAlert('Could not find route. Showing straight line distance instead.', 'warning');

        // Draw a simple line if routing fails
        if (routingControl) {
            hospitalMap.removeControl(routingControl);
            routingControl = null;
        }

        const polyline = L.polyline([
            [userLocation.lat, userLocation.lng],
            [nearestHospital.lat, nearestHospital.lng]
        ], {
            color: '#f59e0b',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(hospitalMap);

        hospitalMap.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    });
}

// Clear route from map
function clearRoute() {
    if (routingControl) {
        hospitalMap.removeControl(routingControl);
        routingControl = null;
        showAlert('Route cleared', 'info');
    }

    // Also clear the nearest hospital info
    const infoDiv = document.getElementById('nearestHospitalInfo');
    infoDiv.style.display = 'none';
    nearestHospital = null;
}

// Call hospital
function callHospital() {
    if (!nearestHospital) {
        showAlert('Please find nearest hospital first', 'error');
        return;
    }

    const phoneNumber = nearestHospital.phone.replace(/[^0-9+]/g, '');

    if (confirm(`Call ${nearestHospital.name}?\n\nPhone: ${nearestHospital.phone}`)) {
        window.location.href = `tel:${phoneNumber}`;
    }
}

// Call emergency services
function callEmergency() {
    const emergencyNumber = '119'; // Cameroon emergency number

    if (confirm(`Call Emergency Services?\n\nThis will dial ${emergencyNumber}\n\nOnly call if this is a real emergency!`)) {
        window.location.href = `tel:${emergencyNumber}`;
    }
}

// ============================================================================
// PHARMACY FUNCTIONS
// ============================================================================

// Initialize pharmacy map
function initializePharmacyMap() {
    const mapContainer = document.getElementById('pharmacyMap');

    if (!mapContainer) {
        console.error('Pharmacy map container not found!');
        return;
    }

    if (!pharmacyMap) {
        try {
            console.log('Initializing pharmacy map...');

            // Default center (Yaoundé, Cameroon)
            pharmacyMap = L.map('pharmacyMap').setView([3.8480, 11.5021], 12);

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(pharmacyMap);

            console.log('Pharmacy map initialized successfully');

            // Load pharmacies on map
            loadPharmaciesOnMapWithoutLocation();
        } catch (error) {
            console.error('Error initializing pharmacy map:', error);
            document.getElementById('pharmacyLocationStatus').innerHTML =
                '❌ Failed to load map. Please refresh the page.';
            document.getElementById('pharmacyLocationStatus').style.color = 'var(--danger-color)';
        }
    }
}

// Load pharmacies on map without user location
async function loadPharmaciesOnMapWithoutLocation() {
    try {
        const response = await api.getPharmacies();
        allPharmacies = response.pharmacies;

        // Clear existing markers
        pharmacyMarkers.forEach(marker => pharmacyMap.removeLayer(marker));
        pharmacyMarkers = [];

        // Pharmacy icon
        const pharmacyIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });

        let bounds = [];
        let pharmaciesWithCoords = 0;

        response.pharmacies.forEach(pharmacy => {
            if (pharmacy.latitude && pharmacy.longitude) {
                const lat = parseFloat(pharmacy.latitude);
                const lng = parseFloat(pharmacy.longitude);

                const marker = L.marker([lat, lng], { icon: pharmacyIcon })
                    .addTo(pharmacyMap)
                    .bindPopup(`
                        <div class="pharmacy-popup">
                            <h3>💊 ${escapeHtml(pharmacy.name)}</h3>
                            <p>📍 ${escapeHtml(pharmacy.address)}</p>
                            <p>📞 ${pharmacy.phone}</p>
                            <p>🕐 ${pharmacy.opening_hours || 'Hours not specified'}</p>
                            ${pharmacy.is_24_hours ? '<p style="color: var(--success-color);">✅ Open 24/7</p>' : ''}
                        </div>
                    `);

                pharmacyMarkers.push(marker);
                bounds.push([lat, lng]);
                pharmaciesWithCoords++;
            }
        });

        // Fit map to show all pharmacies
        if (bounds.length > 0) {
            pharmacyMap.fitBounds(bounds, { padding: [50, 50] });
        }

        console.log(`Loaded ${pharmaciesWithCoords} pharmacies on map`);

    } catch (error) {
        showAlert('Failed to load pharmacies on map: ' + error.message, 'error');
    }
}

// Get pharmacy user location
function getPharmacyLocation() {
    if (!navigator.geolocation) {
        showAlert('Geolocation is not supported by your browser', 'error');
        return;
    }

    const statusDiv = document.getElementById('pharmacyLocationStatus');
    statusDiv.innerHTML = '📍 Getting your location...';
    statusDiv.style.color = 'var(--primary-light)';

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            pharmacyUserLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            console.log('User location:', pharmacyUserLocation);

            // Add user marker
            if (pharmacyUserMarker) {
                pharmacyMap.removeLayer(pharmacyUserMarker);
            }

            const userIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });

            pharmacyUserMarker = L.marker([pharmacyUserLocation.lat, pharmacyUserLocation.lng], { icon: userIcon })
                .addTo(pharmacyMap)
                .bindPopup('📍 You are here')
                .openPopup();

            // Center map on user
            pharmacyMap.setView([pharmacyUserLocation.lat, pharmacyUserLocation.lng], 13);

            statusDiv.innerHTML = '✅ Location found! Showing pharmacies near you.';
            statusDiv.style.color = 'var(--success-color)';

            // Reload pharmacies with distances
            await loadPharmaciesWithLocation();
        },
        (error) => {
            console.error('Geolocation error:', error);
            statusDiv.innerHTML = '❌ Could not get your location. Please enable location services.';
            statusDiv.style.color = 'var(--danger-color)';
        }
    );
}



// Load pharmacies with user location
async function loadPharmaciesWithLocation() {
    try {
        const response = await api.getPharmacies();
        allPharmacies = response.pharmacies;

        // Calculate distances
        allPharmacies.forEach(pharmacy => {
            if (pharmacy.latitude && pharmacy.longitude && pharmacyUserLocation) {
                pharmacy.distance = calculateDistance(
                    pharmacyUserLocation.lat,
                    pharmacyUserLocation.lng,
                    parseFloat(pharmacy.latitude),
                    parseFloat(pharmacy.longitude)
                );
            }
        });

        // Sort by distance
        allPharmacies.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));

        // Display pharmacies
        displayPharmacies(allPharmacies);

    } catch (error) {
        showAlert('Failed to load pharmacies: ' + error.message, 'error');
    }
}

// Find nearest pharmacy
function findNearestPharmacy() {
    if (!pharmacyUserLocation) {
        showAlert('Please enable location first', 'error');
        return;
    }

    if (allPharmacies.length === 0) {
        showAlert('No pharmacies available', 'error');
        return;
    }

    // Find nearest pharmacy with coordinates
    nearestPharmacy = allPharmacies.find(p => p.latitude && p.longitude);

    if (!nearestPharmacy) {
        showAlert('No pharmacies with location data found', 'error');
        return;
    }

    // Show route on map
    if (pharmacyRoutingControl) {
        pharmacyMap.removeControl(pharmacyRoutingControl);
    }

    pharmacyRoutingControl = L.Routing.control({
        waypoints: [
            L.latLng(pharmacyUserLocation.lat, pharmacyUserLocation.lng),
            L.latLng(parseFloat(nearestPharmacy.latitude), parseFloat(nearestPharmacy.longitude))
        ],
        routeWhileDragging: false,
        show: false,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        showAlternatives: false
    }).addTo(pharmacyMap);

    // Display nearest pharmacy info
    const infoDiv = document.getElementById('nearestPharmacyInfo');
    infoDiv.style.display = 'block';
    infoDiv.innerHTML = `
        <div class="alert alert-success">
            <h4>💊 Nearest Pharmacy</h4>
            <p><strong>${escapeHtml(nearestPharmacy.name)}</strong></p>
            <p>📍 ${escapeHtml(nearestPharmacy.address)}</p>
            <p>📞 ${nearestPharmacy.phone}</p>
            <p>🕐 ${nearestPharmacy.opening_hours || 'Hours not specified'}</p>
            ${nearestPharmacy.is_24_hours ? '<p style="color: var(--success-color);">✅ Open 24/7</p>' : ''}
            <p>📏 Distance: ${nearestPharmacy.distance ? nearestPharmacy.distance.toFixed(2) + ' km' : 'Unknown'}</p>
            <button class="btn btn-primary btn-sm mt-2" onclick="callPharmacy()">📞 Call Pharmacy</button>
        </div>
    `;

    showAlert('Route to nearest pharmacy displayed on map', 'success');
}

// Call pharmacy
function callPharmacy() {
    if (!nearestPharmacy) {
        showAlert('Please find nearest pharmacy first', 'error');
        return;
    }

    const phoneNumber = nearestPharmacy.phone.replace(/[^0-9+]/g, '');

    if (confirm(`Call ${nearestPharmacy.name}?\n\nPhone: ${nearestPharmacy.phone}`)) {
        window.location.href = `tel:${phoneNumber}`;
    }
}

// Load pharmacies
async function loadPharmacies() {
    try {
        const response = await api.getPharmacies();
        allPharmacies = response.pharmacies;
        displayPharmacies(response.pharmacies);
    } catch (error) {
        showAlert('Failed to load pharmacies: ' + error.message, 'error');
    }
}

// Display pharmacies
function displayPharmacies(pharmacies) {
    const container = document.getElementById('pharmaciesList');

    if (!pharmacies || pharmacies.length === 0) {
        container.innerHTML = '<p class="text-center">No pharmacies found</p>';
        return;
    }

    container.innerHTML = pharmacies.map(pharmacy => `
        <div class="card">
            <div class="card-header">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>💊 ${escapeHtml(pharmacy.name)}</span>
                    ${pharmacy.is_24_hours ? '<span class="badge badge-success">24/7</span>' : ''}
                </div>
            </div>
            <div class="card-body">
                <p><strong>📍 Address:</strong> ${escapeHtml(pharmacy.address)}</p>
                <p><strong>📞 Phone:</strong> <a href="tel:${pharmacy.phone}">${pharmacy.phone}</a></p>
                ${pharmacy.email ? `<p><strong>📧 Email:</strong> ${pharmacy.email}</p>` : ''}
                <p><strong>🕐 Hours:</strong> ${pharmacy.opening_hours || 'Not specified'}</p>
                ${pharmacy.distance ? `<p><strong>📏 Distance:</strong> ${pharmacy.distance.toFixed(2)} km</p>` : ''}
                ${pharmacy.description ? `<p class="text-secondary">${escapeHtml(pharmacy.description)}</p>` : ''}
                <div style="display: flex; gap: 8px; margin-top: 12px;">
                    <button class="btn btn-primary btn-sm" onclick="viewPharmacyDetails(${pharmacy.id})">
                        💊 View Drugs
                    </button>
                    <button class="btn btn-success btn-sm" onclick="messagePharmacy(${pharmacy.id}, '${escapeHtml(pharmacy.name).replace(/'/g, "\\'")}')">
                        💬 Message
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// View pharmacy details - Navigate to dedicated page
function viewPharmacyDetails(pharmacyId) {
    window.location.href = `pharmacy-drugs.html?id=${pharmacyId}`;
}

// Message pharmacy - Navigate to dedicated page
function messagePharmacy(pharmacyId, pharmacyName) {
    window.location.href = `pharmacy-message.html?id=${pharmacyId}`;
}

// Load drugs
async function loadDrugs(search = '', category = '') {
    try {
        const response = await api.getDrugs(search, category);
        displayDrugs(response.drugs);
    } catch (error) {
        showAlert('Failed to load drugs: ' + error.message, 'error');
    }
}

// Display drugs
function displayDrugs(drugs) {
    const container = document.getElementById('drugsList');

    if (!drugs || drugs.length === 0) {
        container.innerHTML = '<p class="text-center">No drugs found</p>';
        return;
    }

    container.innerHTML = drugs.map(drug => `
        <div class="card">
            <div class="card-header">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>💊 ${escapeHtml(drug.name)}</span>
                    ${drug.requires_prescription ? '<span class="badge badge-warning">Rx</span>' : '<span class="badge badge-success">OTC</span>'}
                </div>
            </div>
            <div class="card-body">
                ${drug.generic_name ? `<p><strong>Generic:</strong> ${escapeHtml(drug.generic_name)}</p>` : ''}
                ${drug.category ? `<p><strong>Category:</strong> ${drug.category}</p>` : ''}
                ${drug.dosage_form ? `<p><strong>Form:</strong> ${drug.dosage_form}</p>` : ''}
                ${drug.strength ? `<p><strong>Strength:</strong> ${drug.strength}</p>` : ''}
                ${drug.manufacturer ? `<p><strong>Manufacturer:</strong> ${drug.manufacturer}</p>` : ''}
                ${drug.description ? `<p class="text-secondary">${escapeHtml(drug.description)}</p>` : ''}
                <button class="btn btn-primary btn-sm mt-2" onclick="viewDrugPharmacies(${drug.id})">
                    Find in Pharmacies
                </button>
            </div>
        </div>
    `).join('');
}

// View drug pharmacies - Navigate to dedicated page
function viewDrugPharmacies(drugId) {
    window.location.href = `drug-pharmacies.html?id=${drugId}`;
}

// Search event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Pharmacy search
    const pharmacySearch = document.getElementById('pharmacySearch');
    if (pharmacySearch) {
        pharmacySearch.addEventListener('input', debounce(async (e) => {
            const search = e.target.value;
            try {
                const response = await api.getPharmacies(search);
                displayPharmacies(response.pharmacies);
            } catch (error) {
                showAlert('Search failed: ' + error.message, 'error');
            }
        }, 500));
    }

    // Drug search
    const drugSearch = document.getElementById('drugSearch');
    const drugCategoryFilter = document.getElementById('drugCategoryFilter');

    if (drugSearch) {
        drugSearch.addEventListener('input', debounce(async (e) => {
            const search = e.target.value;
            const category = drugCategoryFilter ? drugCategoryFilter.value : '';
            await loadDrugs(search, category);
        }, 500));
    }

    if (drugCategoryFilter) {
        drugCategoryFilter.addEventListener('change', async (e) => {
            const category = e.target.value;
            const search = drugSearch ? drugSearch.value : '';
            await loadDrugs(search, category);
        });
    }

    // Save profile button
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveHealthProfile);

    // Add vital form
    const addVitalForm = document.getElementById('addVitalForm');
    if (addVitalForm) {
        addVitalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addVital();
        });
    }

    // SOS button
    const sosButton = document.getElementById('sosButton');
    if (sosButton) sosButton.addEventListener('click', sendSOS);

    // Notification bell
    const notifBell = document.getElementById('notifBell');
    const notifDropdown = document.getElementById('notifDropdown');
    if (notifBell && notifDropdown) {
        notifBell.addEventListener('click', (e) => {
            e.stopPropagation();
            notifDropdown.classList.toggle('hidden');
            if (!notifDropdown.classList.contains('hidden')) loadNotifications();
        });
        document.addEventListener('click', () => notifDropdown.classList.add('hidden'));
        notifDropdown.addEventListener('click', e => e.stopPropagation());
    }

    // Mark all notifications read
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', async () => {
            try { await api.markAllNotificationsRead(); loadNotifications(); updateNotifBadge(); } catch(e) {}
        });
    }

    // Global search
    const globalSearchInput = document.getElementById('globalSearchInput');
    const globalSearchResults = document.getElementById('globalSearchResults');
    if (globalSearchInput && globalSearchResults) {
        globalSearchInput.addEventListener('input', debounce(async (e) => {
            const q = e.target.value.trim();
            if (!q) { globalSearchResults.classList.add('hidden'); return; }
            try {
                const data = await api.globalSearch(q);
                renderGlobalSearchResults(data, globalSearchResults);
            } catch(err) { globalSearchResults.classList.add('hidden'); }
        }, 400));
        document.addEventListener('click', () => globalSearchResults.classList.add('hidden'));
        globalSearchInput.addEventListener('click', e => e.stopPropagation());
    }

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const saved = localStorage.getItem('theme');
        if (saved === 'light') document.body.classList.add('light-theme');
        themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            themeToggle.textContent = isLight ? '🌙' : '🌙';
        });
    }

    // Initial notification badge + public alert banner
    updateNotifBadge();
    loadPublicAlertBanner();
});

// ─────────────────────────── Health Profile ───────────────────────────
async function loadHealthProfile() {
    try {
        const data = await api.getProfile();
        const p = data.health || data.health_profile || {};
        const u = data.user || {};
        const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
        set('profileBloodType', p.blood_type);
        set('profileHeight', p.height_cm);
        set('profileWeight', p.weight_kg);
        set('profileDob', p.date_of_birth);
        set('profileSex', p.sex);
        set('profileSmoker', p.smoker != null ? String(Number(p.smoker)) : '0');
        set('profileAllergies', p.allergies);
        set('profileChronic', p.chronic_conditions);
        set('profileMedications', p.current_medications);
        set('profileVaccinations', p.vaccinations);
        set('profileFamilyHistory', p.family_history);
        set('profileEmergencyName', u.emergency_contact_name);
        set('profileEmergencyPhone', u.emergency_contact_phone);
    } catch (err) {
        console.error('Profile load error:', err);
    }
}

async function saveHealthProfile() {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const payload = {
        blood_type: g('profileBloodType'),
        height_cm: g('profileHeight') ? Number(g('profileHeight')) : null,
        weight_kg: g('profileWeight') ? Number(g('profileWeight')) : null,
        date_of_birth: g('profileDob'),
        sex: g('profileSex'),
        smoker: g('profileSmoker') === '1',
        allergies: g('profileAllergies'),
        chronic_conditions: g('profileChronic'),
        current_medications: g('profileMedications'),
        vaccinations: g('profileVaccinations'),
        family_history: g('profileFamilyHistory'),
        emergency_contact_name: g('profileEmergencyName'),
        emergency_contact_phone: g('profileEmergencyPhone'),
    };
    try {
        await api.updateProfile(payload);
        showAlert('Health profile saved!', 'success');
    } catch (err) {
        showAlert('Save failed: ' + err.message, 'error');
    }
}

async function exportMyData() {
    try {
        const data = await api.exportMyData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'my-health-data.json';
        a.click();
    } catch (err) {
        showAlert('Export failed: ' + err.message, 'error');
    }
}

// ─────────────────────────── Vitals Tracker ───────────────────────────
let vitalsChartInst = null;

// Map a vitals DB row to a {label, value, unit} for display
function vitalRowDisplay(v) {
    if (v.systolic != null)      return { label: '🩺 Blood Pressure',    value: `${v.systolic}/${v.diastolic}`, unit: 'mmHg' };
    if (v.heart_rate != null)    return { label: '❤️ Heart Rate',         value: v.heart_rate,  unit: 'bpm' };
    if (v.temperature_c != null) return { label: '🌡️ Temperature',        value: v.temperature_c, unit: '°C' };
    if (v.glucose_mg_dl != null) return { label: '💉 Blood Glucose',      value: v.glucose_mg_dl, unit: 'mg/dL' };
    if (v.weight_kg != null)     return { label: '⚖️ Weight',             value: v.weight_kg,  unit: 'kg' };
    if (v.spo2 != null)          return { label: '💨 O₂ Saturation',      value: v.spo2,       unit: '%' };
    return { label: '📊 Vital', value: '—', unit: '' };
}

async function loadVitals() {
    const container = document.getElementById('vitalsList');
    container.innerHTML = '<p class="text-secondary">Loading…</p>';
    try {
        const data = await api.listVitals();
        const vitals = data.vitals || [];
        renderVitalsChart(vitals);
        if (!vitals.length) { container.innerHTML = '<p class="text-secondary">No vitals recorded yet.</p>'; return; }
        container.innerHTML = vitals.map(v => {
            const d = vitalRowDisplay(v);
            return `
            <div class="card mb-2" style="padding:0.75rem 1rem; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong>${d.label}</strong>
                    <span style="margin-left:0.75rem; font-size:1.1rem;">${d.value} <small>${d.unit}</small></span>
                    ${v.notes ? `<span class="text-secondary" style="font-size:0.82rem; margin-left:0.5rem;">(${v.notes})</span>` : ''}
                    <div class="text-secondary" style="font-size:0.8rem;">${formatDate(v.recorded_at)}</div>
                </div>
                <button class="btn btn-sm btn-danger" onclick="deleteVital(${v.id})">🗑</button>
            </div>`;
        }).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

function renderVitalsChart(vitals) {
    const canvas = document.getElementById('vitalsChart');
    if (!canvas) return;
    const colMap = { heart_rate: { label: '❤️ HR (bpm)', col: 'heart_rate' },
                     glucose_mg_dl: { label: '💉 Glucose', col: 'glucose_mg_dl' },
                     weight_kg: { label: '⚖️ Weight (kg)', col: 'weight_kg' },
                     spo2: { label: '💨 SpO₂ (%)', col: 'spo2' },
                     temperature_c: { label: '🌡️ Temp (°C)', col: 'temperature_c' } };
    const colors = ['#38bdf8','#f472b6','#34d399','#fbbf24','#a78bfa'];
    const datasets = Object.values(colMap).map(({ label, col }, i) => {
        const pts = vitals
            .filter(v => v[col] != null)
            .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
            .map(v => ({ x: new Date(v.recorded_at).toLocaleDateString(), y: parseFloat(v[col]) }));
        return pts.length ? { label, data: pts, borderColor: colors[i], backgroundColor: colors[i] + '33', tension: 0.3, fill: false } : null;
    }).filter(Boolean);

    if (vitalsChartInst) vitalsChartInst.destroy();
    if (!datasets.length) { canvas.style.display = 'none'; return; }
    canvas.style.display = '';
    vitalsChartInst = new Chart(canvas, {
        type: 'line',
        data: { datasets },
        options: { parsing: { xAxisKey: 'x', yAxisKey: 'y' }, scales: { x: { type: 'category' } }, responsive: true }
    });
}

async function addVital() {
    const type = document.getElementById('vitalType').value;
    const value = document.getElementById('vitalValue').value.trim();
    const notes = document.getElementById('vitalNotes').value.trim();
    if (!type || !value) { showAlert('Please fill in type and value.', 'error'); return; }
    // Map UI type → specific DB columns
    const payload = { notes };
    switch (type) {
        case 'blood_pressure': {
            const parts = value.replace(/\s/g, '').split('/');
            payload.systolic = parseInt(parts[0]) || null;
            payload.diastolic = parseInt(parts[1]) || null;
            break;
        }
        case 'heart_rate':        payload.heart_rate    = parseFloat(value) || null; break;
        case 'temperature':       payload.temperature_c = parseFloat(value) || null; break;
        case 'glucose':           payload.glucose_mg_dl = parseFloat(value) || null; break;
        case 'weight':            payload.weight_kg     = parseFloat(value) || null; break;
        case 'oxygen_saturation': payload.spo2          = parseFloat(value) || null; break;
        default: showAlert('Unknown vital type', 'error'); return;
    }
    try {
        await api.addVital(payload);
        hideModal('addVitalModal');
        document.getElementById('addVitalForm').reset();
        showAlert('Vital recorded!', 'success');
        await loadVitals();
    } catch (err) {
        showAlert('Error: ' + err.message, 'error');
    }
}

async function deleteVital(id) {
    if (!confirm('Delete this vital entry?')) return;
    try {
        await api.deleteVital(id);
        await loadVitals();
    } catch (err) {
        showAlert('Error: ' + err.message, 'error');
    }
}

// ─────────────────────────── Prescriptions ───────────────────────────
async function loadPrescriptions() {
    const container = document.getElementById('prescriptionsList');
    container.innerHTML = '<p class="text-secondary">Loading…</p>';
    try {
        const data = await api.listMyPrescriptions();
        const rxs = data.prescriptions || [];
        if (!rxs.length) { container.innerHTML = '<p class="text-secondary">No prescriptions yet.</p>'; return; }
        container.innerHTML = rxs.map(rx => `
            <div class="card mb-2" style="padding:1rem;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <strong>Rx #${rx.code}</strong>
                        <span class="badge" style="margin-left:0.5rem; background:${rx.status==='active'?'var(--success-color)':'var(--text-secondary)'}; color:#fff; padding:2px 8px; border-radius:10px; font-size:0.75rem;">${rx.status}</span>
                        <div class="text-secondary" style="font-size:0.82rem; margin-top:0.25rem;">Issued: ${formatDate(rx.issued_at)} by Dr. ${rx.doctor_name || 'N/A'}</div>
                        ${rx.notes ? `<div class="text-secondary" style="font-size:0.82rem;">${rx.notes}</div>` : ''}
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="showRxQR('${rx.code}')">📱 QR</button>
                </div>
                <div style="margin-top:0.5rem;">
                    ${(rx.items || []).map(item => `
                        <div style="font-size:0.9rem; padding:0.25rem 0; border-bottom:1px solid var(--border-color,#334155);">
                            💊 <strong>${item.drug_name || item.drug_id}</strong> — ${item.dosage || ''} ${item.frequency || ''} × ${item.duration_days || '?'} days
                            ${item.instructions ? `<span class="text-secondary">(${item.instructions})</span>` : ''}
                        </div>`).join('')}
                </div>
            </div>`).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

async function lookupPrescription() {
    const code = document.getElementById('rxLookupCode').value.trim().toUpperCase();
    if (!code) { showAlert('Enter a prescription code.', 'error'); return; }
    const card = document.getElementById('rxDetailCard');
    const body = document.getElementById('rxDetailBody');
    card.classList.add('hidden');
    try {
        const data = await api.getPrescriptionByCode(code);
        const rx = data.prescription;
        body.innerHTML = `
            <p><strong>Code:</strong> ${rx.code} &nbsp; <strong>Status:</strong> ${rx.status}</p>
            <p><strong>Patient:</strong> ${rx.patient_name} &nbsp; <strong>Doctor:</strong> Dr. ${rx.doctor_name}</p>
            <p><strong>Issued:</strong> ${formatDate(rx.issued_at)}</p>
            <hr style="border-color:var(--border-color,#334155);">
            ${(rx.items||[]).map(i => `<div>💊 <strong>${i.drug_name||i.drug_id}</strong> — ${i.dosage||''} ${i.frequency||''} × ${i.duration_days||'?'} days</div>`).join('')}
            <div style="margin-top:1rem; text-align:center;" id="rxDetailQr"></div>`;
        card.classList.remove('hidden');
        if (typeof QRCode !== 'undefined') {
            new QRCode(document.getElementById('rxDetailQr'), { text: rx.code, width: 160, height: 160 });
        }
    } catch (err) {
        showAlert('Prescription not found: ' + err.message, 'error');
    }
}

function showRxQR(code) {
    document.getElementById('rxQrCode').textContent = code;
    const canvas = document.getElementById('rxQrCanvas');
    canvas.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        new QRCode(canvas, { text: code, width: 180, height: 180 });
    }
    showModal('rxQrModal');
}

// ─────────────────────────── Public Alerts Tab ───────────────────────────
async function loadAlertsTab() {
    const container = document.getElementById('alertsList');
    container.innerHTML = '<p class="text-secondary">Loading…</p>';
    try {
        const data = await api.listAlerts();
        const alerts = data.alerts || [];
        if (!alerts.length) { container.innerHTML = '<p class="text-secondary">No active public health alerts.</p>'; return; }
        container.innerHTML = alerts.map(a => `
            <div class="card mb-2" style="border-left: 4px solid var(--warning-color,#d97706); padding:1rem;">
                <strong>${a.title}</strong>
                <p style="margin:0.5rem 0 0;">${a.body || a.message || ''}</p>
                <div class="text-secondary" style="font-size:0.8rem; margin-top:0.5rem;">
                    Severity: <strong>${a.severity || 'info'}</strong> &nbsp;|&nbsp; ${formatDate(a.created_at)}
                </div>
            </div>`).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

// ─────────────────────────── File Uploads ───────────────────────────
async function loadUploads() {
    const container = document.getElementById('uploadsList');
    container.innerHTML = '<p class="text-secondary">Loading…</p>';
    try {
        const data = await api.listMyUploads();
        const files = data.files || [];
        if (!files.length) { container.innerHTML = '<p class="text-secondary">No files uploaded yet.</p>'; return; }
        container.innerHTML = files.map(f => `
            <div class="card mb-2" style="padding:0.75rem 1rem; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-size:1.3rem;">📄</span>
                    <strong style="margin-left:0.5rem;">${f.filename || f.original_name || 'File'}</strong>
                    <div class="text-secondary" style="font-size:0.8rem;">${((f.size_bytes || f.file_size || 0)/1024).toFixed(1)} KB &nbsp;|&nbsp; ${formatDate(f.uploaded_at)}</div>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <a href="http://localhost:5000/api/v2/uploads/${f.id}" target="_blank" class="btn btn-sm btn-secondary">⬇ View</a>
                    <button class="btn btn-sm btn-danger" onclick="deleteUpload(${f.id})">🗑</button>
                </div>
            </div>`).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-secondary">Error: ${err.message}</p>`;
    }
}

async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    try {
        showAlert('Uploading…', 'info');
        await api.uploadFile(file);
        showAlert('File uploaded!', 'success');
        input.value = '';
        await loadUploads();
    } catch (err) {
        showAlert('Upload failed: ' + err.message, 'error');
    }
}

async function deleteUpload(id) {
    if (!confirm('Delete this file?')) return;
    try {
        await api.deleteUpload(id);
        await loadUploads();
    } catch (err) {
        showAlert('Error: ' + err.message, 'error');
    }
}

// ─────────────────────────── Notifications ───────────────────────────
async function loadNotifications() {
    const list = document.getElementById('notifList');
    if (!list) return;
    try {
        const data = await api.listNotifications();
        const notifs = data.notifications || [];
        if (!notifs.length) {
            list.innerHTML = '<p style="padding:0.75rem 1rem; color:var(--text-secondary);">No notifications</p>';
            return;
        }
        list.innerHTML = notifs.map(n => `
            <div onclick="markNotifRead(${n.id}, this)"
                 style="padding:0.75rem 1rem; cursor:pointer; border-bottom:1px solid var(--border-color,#334155);
                        background:${n.read_at ? 'transparent' : 'rgba(56,189,248,0.08)'};">
                <div style="font-size:0.9rem; font-weight:${n.read_at ? 'normal' : '600'};">${n.title || ''}</div>
                ${n.body ? `<div style="font-size:0.85rem; color:var(--text-secondary);">${n.body}</div>` : ''}
                <div class="text-secondary" style="font-size:0.75rem; margin-top:2px;">${formatDate(n.created_at)}</div>
            </div>`).join('');
    } catch (err) {
        list.innerHTML = '<p style="padding:0.75rem 1rem; color:var(--text-secondary);">Unable to load notifications</p>';
    }
}

async function markNotifRead(id, el) {
    try {
        await api.markNotificationRead(id);
        if (el) el.style.background = 'transparent';
        updateNotifBadge();
    } catch(e) {}
}

async function updateNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    try {
        const data = await api.listNotifications();
        const unread = (data.notifications || []).filter(n => !n.read_at).length;
        if (unread > 0) {
            badge.textContent = unread;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch(e) { badge.classList.add('hidden'); }
}

// ─────────────────────────── Public Alert Banner ───────────────────────────
async function loadPublicAlertBanner() {
    const banner = document.getElementById('publicAlertBanner');
    if (!banner) return;
    try {
        const data = await api.listAlerts();
        const alerts = data.alerts || [];
        if (!alerts.length) { banner.classList.add('hidden'); return; }
        const top = alerts[0];
        banner.textContent = `⚠️ ${top.title}: ${top.body || top.message || ''}`;
        banner.classList.remove('hidden');
    } catch(e) { banner.classList.add('hidden'); }
}

// ─────────────────────────── SOS ───────────────────────────
async function sendSOS() {
    if (!confirm('Send SOS alert to your emergency contact and nearby hospitals?')) return;
    try {
        const pos = userLocation || await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej, { timeout: 5000 })
        );
        const payload = { latitude: pos.lat, longitude: pos.lng };
        await api.sendSOS(payload);
        showAlert('🚨 SOS sent! Emergency contact and nearby hospitals have been notified.', 'success');
    } catch (err) {
        // Still attempt without coords
        try {
            await api.sendSOS({});
            showAlert('🚨 SOS sent! (Location unavailable — sent without coordinates)', 'success');
        } catch (e2) {
            showAlert('SOS failed: ' + e2.message, 'error');
        }
    }
}

// ─────────────────────────── Global Search ───────────────────────────
function renderGlobalSearchResults(data, container) {
    const sections = [];
    if (data.hospitals && data.hospitals.length) {
        sections.push(`<div style="padding:0.5rem 1rem; font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase;">Hospitals</div>`
            + data.hospitals.map(h => `
                <div onclick="window.location='hospital-details.html?id=${h.id}'" style="padding:0.6rem 1rem; cursor:pointer; border-bottom:1px solid var(--border-color,#334155);">
                    🏥 <strong>${h.name}</strong> <span class="text-secondary" style="font-size:0.82rem;">${h.address||''}</span>
                </div>`).join(''));
    }
    if (data.pharmacies && data.pharmacies.length) {
        sections.push(`<div style="padding:0.5rem 1rem; font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase;">Pharmacies</div>`
            + data.pharmacies.map(p => `
                <div onclick="window.location='pharmacy-drugs.html?id=${p.id}'" style="padding:0.6rem 1rem; cursor:pointer; border-bottom:1px solid var(--border-color,#334155);">
                    💊 <strong>${p.name}</strong> <span class="text-secondary" style="font-size:0.82rem;">${p.address||''}</span>
                </div>`).join(''));
    }
    if (data.drugs && data.drugs.length) {
        sections.push(`<div style="padding:0.5rem 1rem; font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase;">Medications</div>`
            + data.drugs.map(d => `
                <div style="padding:0.6rem 1rem; border-bottom:1px solid var(--border-color,#334155);">
                    💉 <strong>${d.name}</strong> <span class="text-secondary" style="font-size:0.82rem;">${d.category||''}</span>
                </div>`).join(''));
    }
    if (data.services && data.services.length) {
        sections.push(`<div style="padding:0.5rem 1rem; font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase;">Services</div>`
            + data.services.map(s => `
                <div onclick="window.location='service-hospitals.html?id=${s.id}'" style="padding:0.6rem 1rem; cursor:pointer; border-bottom:1px solid var(--border-color,#334155);">
                    🔬 <strong>${s.name}</strong>
                </div>`).join(''));
    }
    if (!sections.length) {
        container.innerHTML = '<p style="padding:0.75rem 1rem; color:var(--text-secondary);">No results found.</p>';
    } else {
        container.innerHTML = sections.join('');
    }
    container.classList.remove('hidden');
}

// ─────────────────────────── Utility ───────────────────────────
function formatDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' }); }
    catch(e) { return iso; }
}

