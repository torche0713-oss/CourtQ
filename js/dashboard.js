// ============================================================
// PICKLESPOT PH - OWNER DASHBOARD
// ============================================================

const ADMIN_EMAIL = 'torche0713@gmail.com';
let currentUser = null;
let userProfile = null;
let editingCourtId = null;
let addCourtMap = null;
let addCourtMarker = null;
let addCourtMapInitialized = false;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Dark mode init
  const darkToggle = document.getElementById('darkModeToggle');
  const darkSaved = localStorage.getItem('psp_darkMode');
  if (darkSaved === 'true') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (darkToggle) darkToggle.innerHTML = '<i class="fas fa-sun"></i>';
  }
  if (darkToggle) {
    darkToggle.addEventListener('click', function() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        darkToggle.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('psp_darkMode', 'false');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        darkToggle.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('psp_darkMode', 'true');
      }
    });
  }

  // Set batch import counts dynamically
  const cc = document.getElementById('batchCourtCount');
  if (cc) cc.textContent = IMPORT_COURTS.length;
  const tc = document.getElementById('batchTourneyCount');
  if (tc) tc.textContent = IMPORT_TOURNAMENTS.length;

  let authFired = false;

  // Fallback: if Firebase Auth never fires, force login modal
  const fbTimeout = setTimeout(() => {
    if (!authFired) {
      showLoginModal();
    }
  }, 3000);

  // Handle redirect auth result (Google sign-in)
  if (typeof PickleAuth !== 'undefined') {
    PickleAuth.handleRedirectResult().catch(() => {});
  }

  const wantsAdd = new URLSearchParams(window.location.search).get('add') === '1';
  if (wantsAdd) {
    history.replaceState(null, '', window.location.pathname);
  }

  if (typeof PickleAuth !== 'undefined') {
    PickleAuth.onAuthChanged(async (user) => {
      authFired = true;
      clearTimeout(fbTimeout);
      if (user) {
        currentUser = user;
        userProfile = await PickleAuth.getUserProfile(user.uid).catch(() => null);
        renderDashboard();
        if (wantsAdd) {
          switchSection('add-court');
          showToast('You\'re logged in! Add your court below.', 3000);
        }
      } else {
        showLoginModal();
      }
    });
  } else {
    // Firebase not loaded — show login modal immediately
    showLoginModal();
  }

  setupEventListeners();
});

// ============================================================
// RENDER DASHBOARD
// ============================================================
function renderDashboard() {
  document.getElementById('dashUserName').textContent = userProfile?.displayName || 'Owner';
  document.getElementById('dashUserEmail').textContent = currentUser.email;

  const badge = document.getElementById('dashPlanBadge');
  if (userProfile?.plan === 'pro') {
    badge.textContent = 'Pro';
    badge.className = 'plan-badge plan-pro';
  } else {
    badge.textContent = 'Basic';
    badge.className = 'plan-badge plan-basic';
  }

  loadMyCourts();
  loadReviews();
  initChat();

  const isPro = userProfile?.plan === 'pro';
  const isAdmin = currentUser.email === ADMIN_EMAIL;
  document.querySelector('[data-section="bookings"]').style.display = isPro ? 'flex' : 'none';
  document.querySelector('[data-section="owner-courts"]').style.display = isAdmin ? 'flex' : 'none';
  document.querySelector('[data-section="schedules"]').style.display = isPro ? 'flex' : 'none';
  document.querySelector('[data-section="tournaments"]').style.display = (isPro || isAdmin) ? 'flex' : 'none';
  document.querySelector('[data-section="claims"]').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('dashUnclaimedGroup').style.display = isAdmin ? 'block' : 'none';
  document.querySelector('[data-section="payments"]').style.display = isAdmin ? 'flex' : 'none';
  document.querySelector('[data-section="admin-analytics"]').style.display = isAdmin ? 'flex' : 'none';
  document.querySelector('[data-section="batch-import"]').style.display = isAdmin ? 'flex' : 'none';
  document.querySelector('[data-section="email-campaign"]').style.display = isAdmin ? 'flex' : 'none';
  document.querySelector('[data-section="outreach"]').style.display = isAdmin ? 'flex' : 'none';
  document.querySelector('[data-section="analytics"]').style.display = isPro ? 'flex' : 'none';
  document.querySelector('[data-section="mailing"]').style.display = isAdmin ? 'flex' : 'none';
  if (isPro) loadBookings();
}

// ============================================================
// NAVIGATION
// ============================================================
function switchSection(sectionId) {
  const adminOnly = ['payments', 'admin-analytics', 'owner-courts', 'claims', 'email-campaign', 'mailing', 'outreach'];
  if (adminOnly.includes(sectionId) && currentUser.email !== ADMIN_EMAIL) {
    showToast('Access denied.');
    return;
  }
  if (sectionId === 'tournaments' && currentUser.email !== ADMIN_EMAIL && userProfile?.plan !== 'pro') {
    showToast('Access denied.');
    return;
  }
  document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.dash-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`section-${sectionId}`).classList.add('active');
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');

  if (sectionId === 'batch-import') showBatchImportSection();
  if (sectionId === 'availability') loadAvailabilitySection();
  if (sectionId === 'mailing') loadMailingList();
  if (sectionId === 'add-court') initAddCourtMap();
  if (sectionId === 'bookings') loadBookings();
  if (sectionId === 'payments') loadPayments();
  if (sectionId === 'admin-analytics') loadAdminAnalytics();
  if (sectionId === 'owner-courts') loadOwnerCourts();
  if (sectionId === 'schedules') loadSchedules();
  if (sectionId === 'tournaments') loadTournaments();
  if (sectionId === 'claims') loadClaims();
  if (sectionId === 'analytics') loadAnalytics();
  if (sectionId === 'email-campaign') loadSubscriberCount();
  if (sectionId === 'outreach') { loadOutreachEntries(); loadOutreachSuggestions(); }
}

// ============================================================
// MY COURTS
// ============================================================
async function loadMyCourts() {
  const container = document.getElementById('myCourtsList');
  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const courts = await PickleCourts.getByOwner(currentUser.uid);
    if (courts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-map-pin"></i>
          <h3>No courts yet</h3>
          <p>Add your first court listing to get started!</p>
          <button class="btn-dash btn-dash-primary" onclick="switchSection('add-court')" style="margin-top:16px">
            <i class="fas fa-plus"></i> Add Your First Court
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = courts.map(court => `
      <div class="court-card-owner">
        <div class="card-header">
          <div>
            <h3>${court.name} ${court.verified ? '<i class="fas fa-check-circle" style="color:#1565c0" title="Verified"></i>' : ''} ${court.featured ? '<span class="status-badge" style="background:var(--accent);color:#fff">★ Featured</span>' : ''}</h3>
            <span style="font-size:12px;color:var(--text-muted)">${court.city}, ${court.region}</span>
          </div>
          <div>
            <span class="status-badge status-approved">Approved</span>
          </div>
        </div>
        <div class="card-body" style="font-size:13px;color:var(--text-muted)">
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <span>🏓 ${court.courts || 1} court(s)</span>
            <span>📋 ${court.type}</span>
            <span>🔑 ${court.access}</span>
            ${court.rate ? `<span>💰 ${court.rate}</span>` : ''}
          </div>
          ${court.photos && court.photos.length > 0 ? `
          <div class="photo-grid">
            ${court.photos.slice(0, 3).map(url => `<img src="${url}" alt=""/>`).join('')}
            ${court.photos.length > 3 ? `<div style="display:flex;align-items:center;justify-content:center;background:#f5f5f5;border-radius:8px;height:120px;font-size:13px;color:var(--text-muted)">+${court.photos.length - 3} more</div>` : ''}
          </div>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn-dash btn-dash-primary" onclick="openEditCourt('${court.id}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn-dash btn-dash-outline" onclick="openPhotoManager('${court.id}')">
            <i class="fas fa-images"></i> Photos (${court.photos?.length || 0})
          </button>
          ${court.ownerPlan === 'pro' ? `<span class="status-badge" style="background:var(--accent);color:#fff">★ Pro Court</span>` : userProfile?.plan === 'pro' ? `<button class="btn-dash btn-dash-accent" onclick="upgradeCourtToPro('${court.id}')"><i class="fas fa-crown"></i> Upgrade to Pro</button>` : ''}
          ${userProfile?.plan === 'pro' ? `
          <button class="btn-dash btn-dash-accent" onclick="toggleFeatured('${court.id}', ${court.featured})">
            <i class="fas fa-star"></i> ${court.featured ? 'Unfeature' : 'Feature'}
          </button>` : ''}
          <button class="btn-dash btn-dash-danger" onclick="deleteCourt('${court.id}')">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error loading courts: ${err.message}</p>`;
  }
}

// ============================================================
// ADD COURT
// ============================================================
document.getElementById('dashAddCourtForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const amenities = [...document.querySelectorAll('.dash-amenity:checked')].map(cb => cb.value);

  const courtData = {
    name: document.getElementById('dashCourtName').value,
    city: document.getElementById('dashCourtCity').value,
    province: document.getElementById('dashCourtProvince').value,
    region: document.getElementById('dashCourtRegion').value,
    featured: userProfile?.plan === 'pro',
    type: document.getElementById('dashCourtType').value,
    access: document.getElementById('dashCourtAccess').value,
    rate: document.getElementById('dashCourtRate').value,
    courts: parseInt(document.getElementById('dashCourtCount').value) || 1,
    contact: document.getElementById('dashCourtContact').value,
    address: document.getElementById('dashCourtAddress').value,
    hours: document.getElementById('dashCourtHours').value,
    lat: parseFloat(document.getElementById('dashCourtLat').value) || null,
    lng: parseFloat(document.getElementById('dashCourtLng').value) || null,
    amenities,
    ownerPlan: 'basic'
  };

  const isUnclaimed = document.getElementById('dashUnclaimedCheck').checked;

  // Duplicate check
  try {
    const existing = await db.collection('courts')
      .where('name', '==', courtData.name)
      .get();
    const match = existing.docs.find(d => {
      const data = d.data();
      const sameCity = data.city?.toLowerCase() === courtData.city?.toLowerCase();
      const sameProvince = !courtData.province || data.province?.toLowerCase() === courtData.province?.toLowerCase();
      return sameCity && sameProvince;
    });
    if (match) {
      const data = match.data();
      if (!data.ownerId) {
        showToast('This court already exists and is unclaimed! Go to the main page and click "Is this your court? Claim it!" to take ownership.', 6000);
      } else {
        showToast('This court is already listed by another owner. Check the site map to view it.', 5000);
      }
      e.target.reset();
      return;
    }
  } catch {}

  try {
    const ownerId = isUnclaimed ? null : currentUser.uid;
    await PickleCourts.add(courtData, ownerId);
    showToast(isUnclaimed ? 'Court listed as unclaimed — owners can now claim it!' : 'Thank you! Your court has been added and is now live! 🎉');
    e.target.reset();
    document.getElementById('dashCourtProvinceGroup').style.display = 'none';
    document.getElementById('dashCourtCityGroup').style.display = 'none';
    document.getElementById('dashUnclaimedCheck').checked = false;
    loadMyCourts();
    switchSection('my-courts');
    try {
      if (!isUnclaimed) await PickleNotifications.notifyOwnerCourtAdded(currentUser.email, userProfile?.displayName, courtData.name);
      await PickleNotifications.notifyAdminNewCourt(courtData, userProfile);
    } catch {}
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
});

// ============================================================
// EDIT COURT
// ============================================================
async function openEditCourt(courtId) {
  const court = await PickleCourts.getById(courtId);
  if (!court) return;

  editingCourtId = courtId;
  document.getElementById('editCourtName').value = court.name;
  document.getElementById('editCourtRegion').value = court.region || '';

  // Cascade: populate province + city selects
  const region = court.region || '';
  const provGroup = document.getElementById('editCourtProvinceGroup');
  const provSelect = document.getElementById('editCourtProvince');
  const cityGroup = document.getElementById('editCourtCityGroup');
  const citySelect = document.getElementById('editCourtCity');

  if (region && PH_LOCATIONS[region]) {
    const provinces = Object.keys(PH_LOCATIONS[region]).sort();
    provSelect.innerHTML = '<option value="">Select Province</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
    provSelect.value = court.province || '';
    provGroup.style.display = 'block';

    if (court.province && PH_LOCATIONS[region][court.province]) {
      const cities = [...PH_LOCATIONS[region][court.province]].sort();
      citySelect.innerHTML = '<option value="">Select City</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
      citySelect.value = court.city || '';
      cityGroup.style.display = 'block';
    } else {
      cityGroup.style.display = 'none';
    }
  } else {
    provGroup.style.display = 'none';
    cityGroup.style.display = 'none';
  }

  document.getElementById('editCourtType').value = court.type;
  document.getElementById('editCourtAccess').value = court.access;
  document.getElementById('editCourtRate').value = court.rate || '';
  document.getElementById('editCourtContact').value = court.contact || '';
  document.getElementById('editCourtAddress').value = court.address || '';
  document.getElementById('editCourtHours').value = court.hours || '';

  document.getElementById('editCourtModal').style.display = 'flex';

  // Init map picker
  setTimeout(() => {
    const existing = document.getElementById('editCourtMap')._leafletMap;
    if (existing) existing.remove();
    const lat = court.lat || 12.8797;
    const lng = court.lng || 121.7740;
    const map = L.map('editCourtMap', {
      center: [lat, lng],
      zoom: court.lat ? 15 : 6,
      zoomControl: true
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
    document.getElementById('editCourtMap')._leafletMap = map;

    let marker = null;
    if (court.lat && court.lng) {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      document.getElementById('editCourtLat').value = lat;
      document.getElementById('editCourtLng').value = lng;
      document.getElementById('editLatDisplay').textContent = lat.toFixed(5);
      document.getElementById('editLngDisplay').textContent = lng.toFixed(5);
      marker.on('dragend', () => updateEditCoords(marker));
    }

    map.on('click', function(e) {
      if (marker) map.removeLayer(marker);
      marker = L.marker([e.latlng.lat, e.latlng.lng], { draggable: true }).addTo(map);
      updateEditCoords(marker);
      marker.on('dragend', () => updateEditCoords(marker));
    });

    setTimeout(() => map.invalidateSize(), 200);
  }, 200);
}

function updateEditCoords(marker) {
  const pos = marker.getLatLng();
  document.getElementById('editCourtLat').value = pos.lat.toFixed(6);
  document.getElementById('editCourtLng').value = pos.lng.toFixed(6);
  document.getElementById('editLatDisplay').textContent = pos.lat.toFixed(5);
  document.getElementById('editLngDisplay').textContent = pos.lng.toFixed(5);
}

document.getElementById('editCourtForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingCourtId) return;

  try {
    await PickleCourts.update(editingCourtId, {
      name: document.getElementById('editCourtName').value,
      city: document.getElementById('editCourtCity').value,
      province: document.getElementById('editCourtProvince').value,
      region: document.getElementById('editCourtRegion').value,
      type: document.getElementById('editCourtType').value,
      access: document.getElementById('editCourtAccess').value,
      rate: document.getElementById('editCourtRate').value,
      contact: document.getElementById('editCourtContact').value,
      address: document.getElementById('editCourtAddress').value,
      hours: document.getElementById('editCourtHours').value,
      lat: parseFloat(document.getElementById('editCourtLat').value) || null,
      lng: parseFloat(document.getElementById('editCourtLng').value) || null
    });
    showToast('Court updated!');
    closeModal('editCourtModal');
    cleanupEditMap();
    loadMyCourts();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
});

document.getElementById('editCancelBtn').addEventListener('click', () => { closeModal('editCourtModal'); cleanupEditMap(); });
document.getElementById('editModalClose').addEventListener('click', () => { closeModal('editCourtModal'); cleanupEditMap(); });

function cleanupEditMap() {
  const map = document.getElementById('editCourtMap')._leafletMap;
  if (map) { map.remove(); document.getElementById('editCourtMap')._leafletMap = null; }
}

// ============================================================
// DELETE COURT
// ============================================================
async function deleteCourt(courtId) {
  if (!confirm('Are you sure you want to delete this court?')) return;
  try {
    await PickleCourts.delete(courtId);
    showToast('Court deleted.');
    loadMyCourts();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
}

async function adminDeleteCourt(courtId) {
  if (!confirm('Delete this court permanently?')) return;
  try {
    await PickleCourts.delete(courtId);
    showToast('Court deleted.');
    loadOwnerCourts();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
}

// ============================================================
// PHOTO MANAGER
// ============================================================
let photoCourtId = null;

async function openPhotoManager(courtId) {
  photoCourtId = courtId;
  const court = await PickleCourts.getById(courtId);
  if (!court) return;

  const isPro = userProfile?.plan === 'pro';
  const maxPhotos = isPro ? 999 : 3;

  document.getElementById('photoLimitInfo').textContent = `Photos: ${court.photos?.length || 0} uploaded | ${isPro ? 'Unlimited (Pro)' : 'Up to 3 (Basic)'}`;

  const grid = document.getElementById('photoGrid');
  if (court.photos && court.photos.length > 0) {
    grid.innerHTML = court.photos.map(url => `
      <div style="position:relative">
        <img src="${url}" alt="Court photo"/>
        <button onclick="deletePhoto('${courtId}', '${url}')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:12px">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
  } else {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1;text-align:center">No photos yet</p>';
  }

  const uploadArea = document.getElementById('photoUploadArea');
  if (!isPro && court.photos && court.photos.length >= 3) {
    uploadArea.style.display = 'none';
  } else {
    uploadArea.style.display = 'block';
  }

  document.getElementById('photoModal').style.display = 'flex';
}

document.getElementById('photoUploadArea').addEventListener('click', () => {
  document.getElementById('photoFileInput').click();
});

document.getElementById('photoFileInput').addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files.length || !photoCourtId) return;

  try {
    showToast('Uploading photos...');
    const urls = await PickleStorage.uploadMultiple(photoCourtId, files);
    const court = await PickleCourts.getById(photoCourtId);
    const existing = court.photos || [];
    await PickleCourts.update(photoCourtId, { photos: [...existing, ...urls] });
    showToast(`${urls.length} photo(s) uploaded!`);
    openPhotoManager(photoCourtId);
  } catch (err) {
    showToast('Upload failed: ' + err.message, 4000);
  }
});

async function deletePhoto(courtId, url) {
  if (!confirm('Remove this photo?')) return;
  try {
    const court = await PickleCourts.getById(courtId);
    const updated = (court.photos || []).filter(p => p !== url);
    await PickleCourts.update(courtId, { photos: updated });
    openPhotoManager(courtId);
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
}

document.getElementById('photoModalClose').addEventListener('click', () => {
  closeModal('photoModal');
  loadMyCourts();
});

// ============================================================
// FEATURED TOGGLE (Pro only)
// ============================================================
async function toggleFeatured(courtId, current) {
  try {
    await PickleCourts.setFeatured(courtId, !current);
    showToast(current ? 'Featured removed' : 'Court is now featured!');
    loadMyCourts();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
}

window.upgradeCourtToPro = async function(courtId) {
  if (!confirm('Upgrade this court to Pro? It will unlock booking, analytics, and inquiries in your dashboard.')) return;
  try {
    await db.collection('courts').doc(courtId).update({ ownerPlan: 'pro' });
    showToast('✅ Court upgraded to Pro!');
    loadMyCourts();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
};

// ============================================================
// BOOKINGS
// ============================================================
async function loadBookings() {
  const container = document.getElementById('bookingsList');

  try {
    // Get owned courts + Pro-flagged courts (for unclaimed Pro courts)
    const ownedCourts = await PickleCourts.getByOwner(currentUser.uid);
    const proCourts = await db.collection('courts')
      .where('ownerPlan', '==', 'pro')
      .get();
    const proCourtList = proCourts.docs
      .filter(d => !d.data().ownerId || d.data().ownerId !== currentUser.uid)
      .map(d => ({ id: d.id, ...d.data() }));
    const courts = [...ownedCourts, ...proCourtList];

    if (courts.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-check"></i><h3>No bookings yet</h3><p>Add a court first to receive booking requests.</p></div>';
      return;
    }

    let allBookings = [];
    for (const court of courts) {
      const bookings = await PickleBookings.getByCourt(court.id);
      allBookings = [...allBookings, ...bookings.map(b => ({ ...b, courtName: court.name }))];
    }

    if (allBookings.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-check"></i><h3>No bookings yet</h3><p>When players send booking inquiries, they will appear here.</p></div>';
      return;
    }

    container.innerHTML = allBookings.map(b => `
      <div class="booking-item">
        <div class="booking-header">
          <span class="booking-name">${b.name}</span>
          <span class="status-badge ${b.status === 'confirmed' ? 'status-approved' : b.status === 'cancelled' ? 'status-pending' : 'status-pending'}">${b.status}</span>
        </div>
        <div class="booking-detail">📋 ${b.courtName} · 📅 ${b.date || 'No date'} · 🕐 ${b.time || 'No time'}</div>
        <div class="booking-detail">📞 ${b.contact || 'No contact'} · 💬 ${b.message || ''}</div>
        ${b.status === 'pending' ? `
        <div class="booking-actions">
          <button class="btn-dash btn-dash-primary" onclick="updateBooking('${b.id}', 'confirmed')">
            <i class="fas fa-check"></i> Confirm
          </button>
          <button class="btn-dash btn-dash-danger" onclick="updateBooking('${b.id}', 'cancelled')">
            <i class="fas fa-times"></i> Decline
          </button>
        </div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

function toMinutes(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
function timeOverlap(timeA, timeB) {
  const parse = (t) => {
    if (t.includes('-')) {
      const [s, e] = t.split('-');
      return [toMinutes(s), toMinutes(e)];
    }
    const m = toMinutes(t);
    return [m, m + 60];
  };
  const [aStart, aEnd] = parse(timeA);
  const [bStart, bEnd] = parse(timeB);
  return aStart < bEnd && bStart < aEnd;
}

async function updateBooking(bookingId, status) {
  // If confirming, check for double-booking first
  if (status === 'confirmed') {
    const allBookings = await loadAllBookingsFlat();
    const thisBooking = allBookings.find(b => b.id === bookingId);
    if (thisBooking && thisBooking.date) {
      const conflict = allBookings.find(b =>
        b.id !== bookingId &&
        b.status === 'confirmed' &&
        b.courtId === thisBooking.courtId &&
        b.date === thisBooking.date &&
        b.time && thisBooking.time &&
        timeOverlap(b.time, thisBooking.time)
      );
      if (conflict) {
        showToast('⚠️ Conflict! Another confirmed booking overlaps this time slot.', 5000);
        return;
      }
    }
  }

  try {
    await PickleBookings.updateStatus(bookingId, status);
    showToast(`Booking ${status}!`);

    // Send chat notification to the customer
    try {
      const booking = await PickleBookings.getById(bookingId);
      let courtName = 'Court';
      let court = null;
      try {
        court = await PickleCourts.getById(booking.courtId);
        if (court) courtName = court.name;
      } catch {}
      if (booking && booking.chatId) {
        const emoji = status === 'confirmed' ? '✅' : status === 'rejected' ? '❌' : '⏳';
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        let msg = `${emoji} Your booking at ${courtName} has been ${label}.`;
        if (status === 'confirmed' && booking.date && booking.time) {
          const calUrl = generateCalendarUrl(`Pickleball at ${courtName}`, booking.date, booking.time, court?.address || '');
          msg += `\n\n📅 Add to Calendar: ${calUrl}`;
        }
        await PickleChat.sendMessage(booking.chatId, 'system', courtName, msg);
      }
      // Email notification to customer
      if (booking && booking.email) {
        await PickleNotifications.notifyCustomerBookingStatus(booking.email, booking.name, courtName, status, booking.date, booking.time, court?.address || '');
      }
      // Email notification to owner with calendar link when confirmed
      if (status === 'confirmed' && currentUser && currentUser.email) {
        const ownerBody = `✅ Booking confirmed at ${courtName}!\n\nCustomer: ${booking.name}\nContact: ${booking.contact}\nDate: ${booking.date}\nTime: ${booking.time}\nPlayers: ${booking.players}`;
        const ownerCalUrl = generateCalendarUrl(`Pickleball at ${courtName}`, booking.date, booking.time, court?.address || '');
        await PickleNotifications.send(currentUser.email, currentUser.displayName || 'Owner', `Booking Confirmed: ${courtName}`, ownerBody + `\n\nAdd to Google Calendar: ${ownerCalUrl}`);
      }
    } catch {}

    loadBookings();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
}

async function loadAllBookingsFlat() {
  const ownedCourts = await PickleCourts.getByOwner(currentUser.uid);
  const proCourts = await db.collection('courts')
    .where('ownerPlan', '==', 'pro')
    .get();
  const proCourtList = proCourts.docs
    .filter(d => !d.data().ownerId || d.data().ownerId !== currentUser.uid)
    .map(d => ({ id: d.id, ...d.data() }));
  const courts = [...ownedCourts, ...proCourtList];
  let all = [];
  for (const court of courts) {
    const bookings = await PickleBookings.getByCourt(court.id);
    all = [...all, ...bookings.map(b => ({ ...b, courtName: court.name }))];
  }
  return all;
}

// ============================================================
// REVIEWS
// ============================================================
async function loadReviews() {
  const container = document.getElementById('reviewsList');

  try {
    const courts = await PickleCourts.getByOwner(currentUser.uid);
    if (courts.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-star"></i><h3>No reviews yet</h3><p>Add a court to start collecting reviews.</p></div>';
      return;
    }

    let html = '';
    for (const court of courts) {
      const reviews = await PickleReviews.getByCourt(court.id);
      const rating = await PickleReviews.getAverageRating(court.id);

      html += `
        <div class="court-card-owner">
          <div class="card-header">
            <h3>${court.name} ${rating.count > 0 ? `<span style="font-size:14px;color:var(--accent);font-weight:600">★ ${rating.average} (${rating.count} reviews)</span>` : ''}</h3>
          </div>
          <div class="card-body">
            ${reviews.length === 0 ? '<p style="color:var(--text-muted);font-size:13px">No reviews yet.</p>' :
              reviews.map(r => `
                <div style="padding:10px 0;border-bottom:1px solid #f0f0f0">
                  <div style="display:flex;justify-content:space-between;font-size:13px">
                    <strong>${r.userName || 'Anonymous'}</strong>
                    <span style="color:var(--accent)">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                  </div>
                  ${r.comment ? `<p style="font-size:13px;color:var(--text-muted);margin-top:4px">${r.comment}</p>` : ''}
                </div>
              `).join('')
            }
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

// ============================================================
// ANALYTICS (Pro only)
// ============================================================
async function loadAnalytics() {
  const container = document.getElementById('analyticsContainer');
  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const courts = await PickleCourts.getByOwner(currentUser.uid);
    if (courts.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-chart-bar"></i><h3>No courts yet</h3><p>Add a court to start tracking analytics.</p></div>';
      return;
    }

    let totalViews = 0;
    let totalBookings = 0;
    let html = '';

    for (const court of courts) {
      const views = await PickleAnalytics.getViews(court.id);
      const bookings = await PickleAnalytics.getBookingCount(court.id);
      totalViews += views;
      totalBookings += bookings;

      html += `
        <div class="analytics-card">
          <div class="analytics-card-header">
            <strong>${court.name}</strong>
            <span class="tag" style="background:#e3f2fd;color:#1565c0">${court.city}</span>
          </div>
          <div class="analytics-stats">
            <div class="analytics-stat">
              <div class="analytics-number">${views}</div>
              <div class="analytics-label"><i class="fas fa-eye"></i> Views</div>
            </div>
            <div class="analytics-stat">
              <div class="analytics-number">${bookings}</div>
              <div class="analytics-label"><i class="fas fa-calendar-check"></i> Inquiries</div>
            </div>
          </div>
        </div>
      `;
    }

    html = `
      <div class="analytics-totals">
        <div class="analytics-total-card">
          <div class="analytics-number">${totalViews}</div>
          <div class="analytics-label">Total Views</div>
        </div>
        <div class="analytics-total-card">
          <div class="analytics-number">${totalBookings}</div>
          <div class="analytics-label">Total Inquiries</div>
        </div>
      </div>
      ${html}
    `;

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

// ============================================================
// PAYMENTS (Admin view)
// ============================================================
async function loadPayments() {
  const container = document.getElementById('paymentsList');
  if (currentUser.email !== ADMIN_EMAIL) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><h3>Access Denied</h3></div>';
    return;
  }

  try {
    const payments = await PicklePayments.getAll();

    if (payments.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-credit-card"></i><h3>No payments yet</h3><p>When owners submit Pro upgrade payments, they will appear here.</p></div>';
      return;
    }

    // Fetch user profiles to show names/emails
    const userCache = {};
    async function getUser(uid) {
      if (!userCache[uid]) {
        userCache[uid] = await PickleAuth.getUserProfile(uid);
      }
      return userCache[uid];
    }

    container.innerHTML = payments.map(p => {
      const user = userCache[p.userId];
      return `
        <div class="booking-item">
          <div class="booking-header">
            <span class="booking-name">${p.method?.toUpperCase() || 'N/A'} — ${p.reference}</span>
            <span class="status-badge ${p.status === 'verified' ? 'status-approved' : p.status === 'failed' ? 'status-pending' : 'status-pending'}">${p.status}</span>
          </div>
          <div class="booking-detail">👤 User ID: ${p.userId}</div>
          <div class="booking-detail">💰 ₱${p.amount} · 📅 ${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : 'Just now'}</div>
          ${p.status === 'pending' ? `
          <div class="booking-actions">
            <button class="btn-dash btn-dash-primary" onclick="verifyPayment('${p.id}', '${p.userId}')">
              <i class="fas fa-check"></i> Verify & Upgrade
            </button>
            <button class="btn-dash btn-dash-danger" onclick="failPayment('${p.id}')">
              <i class="fas fa-times"></i> Mark Failed
            </button>
          </div>` : ''}
        </div>
      `;
    }).join('');

    // Fetch user profiles in background
    const uniqueUids = [...new Set(payments.map(p => p.userId))];
    await Promise.all(uniqueUids.map(getUser));
    // Re-render with names
    container.innerHTML = payments.map(p => {
      const user = userCache[p.userId];
      const name = user?.displayName || 'Unknown';
      const email = user?.email || p.userId;
      return `
        <div class="booking-item">
          <div class="booking-header">
            <span class="booking-name">${name}</span>
            <span class="status-badge ${p.status === 'verified' ? 'status-approved' : p.status === 'failed' ? 'status-pending' : 'status-pending'}">${p.status}</span>
          </div>
          <div class="booking-detail">📧 ${email}</div>
          <div class="booking-detail">💳 ${p.method?.toUpperCase() || 'N/A'} · Ref: ${p.reference} · ₱${p.amount}</div>
          <div class="booking-detail">📅 ${p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : 'Just now'}</div>
          ${p.status === 'pending' ? `
          <div class="booking-actions">
            <button class="btn-dash btn-dash-primary" onclick="verifyPayment('${p.id}', '${p.userId}')">
              <i class="fas fa-check"></i> Verify & Upgrade
            </button>
            <button class="btn-dash btn-dash-danger" onclick="failPayment('${p.id}')">
              <i class="fas fa-times"></i> Mark Failed
            </button>
          </div>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

// ============================================================
// ADMIN SITE ANALYTICS
// ============================================================
async function loadAdminAnalytics() {
  const container = document.getElementById('adminAnalyticsContainer');
  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const [usersSnap, courts, bookingsSnap, subscribers] = await Promise.all([
      db.collection('users').get(),
      PickleCourts.getAll(),
      db.collection('bookings').get(),
      PickleMailing.getAll()
    ]);

    const totalUsers = usersSnap.docs.length;
    const totalCourts = courts.length;
    const totalBookings = bookingsSnap.docs.length;
    const totalSubscribers = subscribers.length;
    const totalViews = courts.reduce((sum, c) => sum + (c.views || 0), 0);

    let proCount = 0, basicCount = 0;
    usersSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.plan === 'pro') proCount++;
      else basicCount++;
    });
    const proPct = totalUsers ? Math.round((proCount / totalUsers) * 100) : 0;

    const courtsByOwner = {};
    courts.forEach(c => {
      if (c.ownerId) {
        if (!courtsByOwner[c.ownerId]) courtsByOwner[c.ownerId] = [];
        courtsByOwner[c.ownerId].push(c.name);
      }
    });

    const allUsers = usersSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(u => u.createdAt)
      .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
    window._allRegUsers = allUsers;
    window._courtsByOwner = courtsByOwner;

    container.innerHTML = `
      <div class="admin-grid">
        <div class="admin-card">
          <div class="admin-icon"><i class="fas fa-map-pin"></i></div>
          <div class="admin-number">${totalCourts}</div>
          <div class="admin-label">Total Courts</div>
        </div>
        <div class="admin-card">
          <div class="admin-icon"><i class="fas fa-users"></i></div>
          <div class="admin-number">${totalUsers}</div>
          <div class="admin-label">Registered Owners</div>
        </div>
        <div class="admin-card">
          <div class="admin-icon"><i class="fas fa-calendar-check"></i></div>
          <div class="admin-number">${totalBookings}</div>
          <div class="admin-label">Total Bookings</div>
        </div>
        <div class="admin-card accent">
          <div class="admin-icon"><i class="fas fa-eye"></i></div>
          <div class="admin-number">${totalViews}</div>
          <div class="admin-label">Total Page Views</div>
        </div>
        <div class="admin-card">
          <div class="admin-icon"><i class="fas fa-mail-bulk"></i></div>
          <div class="admin-number">${totalSubscribers}</div>
          <div class="admin-label">Mailing List</div>
        </div>
      </div>

      <div class="admin-breakdown">
        <h3>Plan Breakdown</h3>
        <div class="bar">
          <div class="bar-pro" style="flex:${proCount}"></div>
          <div class="bar-basic" style="flex:${basicCount || 1}"></div>
        </div>
        <div class="bar-label">
          <span><strong>Pro:</strong> ${proCount} (${proPct}%)</span>
          <span><strong>Basic:</strong> ${basicCount} (${100 - proPct}%)</span>
        </div>
      </div>

      <div class="admin-breakdown">
        <h3>User Registrations <span style="font-weight:400;font-size:12px;color:var(--text-muted)">(${allUsers.length} total)</span></h3>
        <input type="text" id="userSearchInput" placeholder="Search by name or email..." oninput="filterRegistrations()" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;margin-bottom:10px;box-sizing:border-box;background:var(--bg);color:var(--text)">
        <div id="userRegistrationList">
          ${allUsers.slice(0, 50).map(u => {
            const userCourts = courtsByOwner[u.id] || [];
            return renderUserRow(u, userCourts);
          }).join('')}
          ${allUsers.length > 50 ? '<div style="color:var(--text-muted);font-size:12px;padding:8px 0;text-align:center">Showing 50 of ' + allUsers.length + ' — type to filter</div>' : ''}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

// ============================================================
// REGISTRATION SEARCH HELPERS
// ============================================================
function renderUserRow(u, userCourts) {
  return '<div style="padding:6px 0;border-bottom:1px solid var(--border,#eee);font-size:13px">' +
    '<div style="display:flex;justify-content:space-between">' +
      '<span><strong>' + (u.displayName || 'Unknown') + '</strong></span>' +
      '<span style="color:var(--text-muted);font-size:11px">' + (u.createdAt?.toDate?.() ? u.createdAt.toDate().toLocaleDateString() : '') + ' · ' + (u.plan === 'pro' ? '&#11088; Pro' : 'Basic') + '</span>' +
    '</div>' +
    '<div style="color:var(--text-muted);font-size:11px">' + (u.email || '') + '</div>' +
    (userCourts.length ? '<div style="color:var(--primary);font-size:11px;margin-top:2px">&#127963; ' + userCourts.join(', ') + '</div>' : '<div style="color:#999;font-size:11px;margin-top:2px">No court added</div>') +
  '</div>';
}

window.filterRegistrations = function() {
  const q = (document.getElementById('userSearchInput').value || '').toLowerCase();
  const list = document.getElementById('userRegistrationList');
  const users = window._allRegUsers || [];
  const courtsByOwner = window._courtsByOwner || {};
  const filtered = q ? users.filter(u => (u.displayName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)) : users;
  list.innerHTML = filtered.length
    ? filtered.map(u => renderUserRow(u, courtsByOwner[u.id] || [])).join('')
    : '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;text-align:center">No users match "' + q + '"</div>';
};

// ============================================================
// OWNER COURTS (Admin View)
// ============================================================
async function loadOwnerCourts() {
  const container = document.getElementById('ownerCourtsList');
  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const courts = await PickleCourts.getAll();
    if (courts.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-map-pin"></i><h3>No courts added yet</h3></div>';
      return;
    }

    const ownerIds = [...new Set(courts.map(c => c.ownerId).filter(Boolean))];
    const ownerCache = {};
    await Promise.all(ownerIds.map(async uid => {
      try {
        const prof = await PickleAuth.getUserProfile(uid);
        if (prof) ownerCache[uid] = prof;
      } catch {}
    }));

    container.innerHTML = courts.map(court => {
      const owner = ownerCache[court.ownerId] || {};
      return `
        <div class="court-card-owner">
          <div class="card-header">
            <div>
              <h3>${court.name} ${court.verified ? '<i class="fas fa-check-circle" style="color:#1565c0" title="Verified"></i>' : ''} ${court.featured ? '<span class="status-badge" style="background:var(--accent);color:#fff">★ Featured</span>' : ''}</h3>
              <span style="font-size:12px;color:var(--text-muted)">${court.city}, ${court.region}</span>
            </div>
            <button onclick="adminDeleteCourt('${court.id}')" title="Delete this court" style="background:none;border:none;color:#d32f2f;cursor:pointer;font-size:16px;padding:4px 8px"><i class="fas fa-trash"></i></button>
          </div>
          <div class="card-body" style="font-size:13px;color:var(--text-muted)">
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              <span>🏓 ${court.courts || 1} court(s)</span>
              <span>📋 ${court.type}</span>
              <span>🔑 ${court.access}</span>
              ${court.rate ? `<span>💰 ${court.rate}</span>` : ''}
            </div>
            <div style="margin-top:8px;padding:8px;background:#f9f9f9;border-radius:6px;font-size:12px">
              <strong>Owner:</strong> ${owner.displayName || 'Unknown'} · ${owner.email || ''} · ${owner.plan === 'pro' ? '⭐ Pro' : 'Basic'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

// ============================================================
// OPEN PLAY SCHEDULES
// ============================================================
let editingScheduleId = null;
const SCHEDULE_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

async function loadSchedules() {
  const container = document.getElementById('schedulesList');
  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const myCourts = await PickleCourts.getByOwner(currentUser.uid);
    const allSchedules = await PickleSchedules.getByOwner(currentUser.uid);

    const formHtml = `
      <div style="background:var(--white);border-radius:16px;padding:24px;margin-bottom:24px;box-shadow:var(--card-shadow)">
        <h3 style="margin-bottom:16px;font-size:16px">${editingScheduleId ? 'Edit Schedule' : 'Add Open Play Schedule'}</h3>
        <form id="scheduleForm">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label>Court *</label>
              <select id="schedCourtId" required>
                <option value="">Select a court</option>
                ${myCourts.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label>Day *</label>
              <select id="schedDay" required>
                <option value="">Select day</option>
                ${SCHEDULE_DAYS.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:1">
              <label>Start *</label>
              <input type="time" id="schedStart" required/>
            </div>
            <div class="form-group" style="flex:1">
              <label>End *</label>
              <input type="time" id="schedEnd" required/>
            </div>
            <div class="form-group" style="flex:1">
              <label>Cost</label>
              <input type="text" id="schedCost" placeholder="e.g. P250/head"/>
            </div>
          </div>
          <div class="form-group">
            <label>Notes (optional)</label>
            <input type="text" id="schedNotes" placeholder="e.g. All levels welcome, bring own paddle"/>
          </div>
          <div class="form-actions">
            ${editingScheduleId ? `<button type="button" class="btn-cancel" onclick="cancelEditSchedule()">Cancel</button>` : ''}
            <button type="submit" class="btn-submit"><i class="fas fa-save"></i> ${editingScheduleId ? 'Update' : 'Add'} Schedule</button>
          </div>
        </form>
        ${myCourts.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;margin-top:8px">You need to <a href="#" onclick="switchSection(\'add-court\')">add a court first</a>.</p>' : ''}
      </div>
    `;

    const listHtml = allSchedules.length ? allSchedules.map(s => {
      const court = myCourts.find(c => c.id === s.courtId);
      return `
        <div style="background:var(--white);border-radius:12px;padding:16px 20px;margin-bottom:12px;box-shadow:var(--card-shadow);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <strong>${s.day}</strong> · ${s.startTime} - ${s.endTime}
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              📍 ${court ? court.name : s.courtId}
            </div>
            ${s.cost ? `<div style="font-size:12px;color:var(--text-muted)">💰 ${s.cost}</div>` : ''}
            ${s.notes ? `<div style="font-size:12px;color:var(--text-muted)">📝 ${s.notes}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button class="btn-dash btn-dash-primary" onclick="editSchedule('${s.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-dash btn-dash-danger" onclick="deleteSchedule('${s.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty-state"><i class="fas fa-calendar-alt"></i><h3>No schedules</h3><p>Add your first open play schedule above.</p></div>';

    container.innerHTML = formHtml + listHtml;

    document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        courtId: document.getElementById('schedCourtId').value,
        courtName: myCourts.find(c => c.id === document.getElementById('schedCourtId').value)?.name || '',
        day: document.getElementById('schedDay').value,
        startTime: document.getElementById('schedStart').value,
        endTime: document.getElementById('schedEnd').value,
        cost: document.getElementById('schedCost').value,
        notes: document.getElementById('schedNotes').value,
        ownerId: currentUser.uid
      };
      try {
        if (editingScheduleId) {
          await PickleSchedules.update(editingScheduleId, data);
          showToast('Schedule updated!');
        } else {
          await PickleSchedules.add(data);
          showToast('Open play schedule added!');
        }
        editingScheduleId = null;
        loadSchedules();
      } catch (err) {
        showToast('Error: ' + err.message, 4000);
      }
    });

    if (editingScheduleId) {
      const s = allSchedules.find(x => x.id === editingScheduleId);
      if (s) {
        document.getElementById('schedCourtId').value = s.courtId || '';
        document.getElementById('schedDay').value = s.day || '';
        document.getElementById('schedStart').value = s.startTime || '';
        document.getElementById('schedEnd').value = s.endTime || '';
        document.getElementById('schedCost').value = s.cost || '';
        document.getElementById('schedNotes').value = s.notes || '';
      }
    }
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

window.editSchedule = function(id) {
  editingScheduleId = id;
  loadSchedules();
};

window.cancelEditSchedule = function() {
  editingScheduleId = null;
  loadSchedules();
};

window.deleteSchedule = async function(id) {
  if (!confirm('Delete this schedule?')) return;
  try {
    await PickleSchedules.delete(id);
    showToast('Schedule deleted.');
    loadSchedules();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
};

// ============================================================
// TOURNAMENTS
// ============================================================
let editingTournamentId = null;

async function loadTournaments() {
  const container = document.getElementById('tournamentsList');
  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const isAdmin = currentUser.email === ADMIN_EMAIL;
    const allTournaments = await PickleTournaments.getAll();
    const tournaments = isAdmin ? allTournaments : allTournaments.filter(t => t.ownerId === currentUser.uid);
    const now = new Date();

    const formHtml = `
      <div style="background:var(--white);border-radius:16px;padding:24px;margin-bottom:24px;box-shadow:var(--card-shadow)">
        <h3 style="margin-bottom:16px;font-size:16px">${editingTournamentId ? 'Edit Tournament' : 'Add Tournament'}</h3>
        <form id="tournamentForm">
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label>Tournament Name</label>
              <input type="text" id="tournName" required/>
            </div>
            <div class="form-group" style="flex:1">
              <label>Date</label>
              <input type="date" id="tournDate" required/>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="flex:2">
              <label>Location</label>
              <input type="text" id="tournLocation" placeholder="City, Venue"/>
            </div>
            <div class="form-group" style="flex:1">
              <label>Link (optional)</label>
              <input type="url" id="tournLink" placeholder="https://..."/>
            </div>
          </div>
          <div class="form-group">
            <label>Details</label>
            <textarea id="tournDetails" rows="3" placeholder="Format, prizes, registration info..."></textarea>
          </div>
          <div class="form-actions">
            ${editingTournamentId ? `<button type="button" class="btn-cancel" onclick="cancelEditTournament()">Cancel</button>` : ''}
            <button type="submit" class="btn-submit"><i class="fas fa-save"></i> ${editingTournamentId ? 'Update' : 'Add'} Tournament</button>
          </div>
        </form>
      </div>
    `;

    const listHtml = tournaments.length ? tournaments.map(t => {
      const d = new Date(t.date);
      const past = d < now;
      const canModify = isAdmin || t.ownerId === currentUser.uid;
      return `
        <div style="background:var(--white);border-radius:12px;padding:16px 20px;margin-bottom:12px;box-shadow:var(--card-shadow);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;opacity:${past ? 0.5 : 1}">
          <div>
            <strong>${t.name}</strong> ${past ? '<span style="color:#999;font-size:11px">(past)</span>' : ''}
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              📅 ${d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })} · 📍 ${t.location || 'N/A'}
            </div>
            ${t.details ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">${t.details}</div>` : ''}
            ${t.link ? `<a href="${t.link}" target="_blank" style="font-size:12px;color:var(--primary)">🔗 More info</a>` : ''}
          </div>
          ${canModify ? `
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button class="btn-dash btn-dash-primary" onclick="editTournament('${t.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn-dash btn-dash-danger" onclick="deleteTournament('${t.id}')"><i class="fas fa-trash"></i></button>
          </div>` : ''}
        </div>
      `;
    }).join('') : '<div class="empty-state"><i class="fas fa-trophy"></i><h3>No tournaments</h3><p>Add your first tournament above.</p></div>';

    container.innerHTML = formHtml + listHtml;

    document.getElementById('tournamentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: document.getElementById('tournName').value,
        date: document.getElementById('tournDate').value,
        location: document.getElementById('tournLocation').value,
        link: document.getElementById('tournLink').value,
        details: document.getElementById('tournDetails').value,
        ownerId: currentUser.uid
      };
      try {
        if (editingTournamentId) {
          const updateData = { ...data };
          delete updateData.ownerId;
          await PickleTournaments.update(editingTournamentId, updateData);
          showToast('Tournament updated!');
        } else {
          await PickleTournaments.add(data);
          showToast('Tournament added and will appear in RSS feed!');
        }
        editingTournamentId = null;
        loadTournaments();
      } catch (err) {
        showToast('Error: ' + err.message, 4000);
      }
    });

    if (editingTournamentId) {
      const t = tournaments.find(x => x.id === editingTournamentId);
      if (t) {
        document.getElementById('tournName').value = t.name;
        document.getElementById('tournDate').value = t.date;
        document.getElementById('tournLocation').value = t.location || '';
        document.getElementById('tournLink').value = t.link || '';
        document.getElementById('tournDetails').value = t.details || '';
      }
    }
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

window.editTournament = function(id) {
  editingTournamentId = id;
  loadTournaments();
};

window.cancelEditTournament = function() {
  editingTournamentId = null;
  loadTournaments();
};

window.deleteTournament = async function(id) {
  if (!confirm('Delete this tournament?')) return;
  try {
    await PickleTournaments.delete(id);
    showToast('Tournament deleted.');
    loadTournaments();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
};

window.verifyPayment = async function(paymentId, userId) {
  if (!confirm('Verify this payment and upgrade the user to Pro?')) return;
  try {
    await PicklePayments.verifyPayment(paymentId);
    await PickleAuth.upgradeToPro(userId);
    const userCourts = await PickleCourts.getByOwner(userId);
    const batch = db.batch();
    userCourts.forEach(court => {
      const ref = db.collection(COLLECTIONS.COURTS).doc(court.id);
      batch.update(ref, { ownerPlan: 'pro' });
    });
    if (userCourts.length) await batch.commit();
    showToast(`Payment verified! User + ${userCourts.length} court(s) upgraded to Pro.`);
    loadPayments();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
};

window.failPayment = async function(paymentId) {
  if (!confirm('Mark this payment as failed?')) return;
  try {
    await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({ status: 'failed' });
    showToast('Payment marked as failed.');
    loadPayments();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
};

// ============================================================
// AVAILABILITY (Weekly Schedule)
// ============================================================
const AVAIL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

let availCourtId = null;

function loadAvailabilitySection() {
  const selector = document.getElementById('availabilityCourtSelector');
  const editor = document.getElementById('availabilityEditor');

  PickleCourts.getByOwner(currentUser.uid).then(courts => {
    if (courts.length === 0) {
      selector.innerHTML = '<p style="color:var(--text-muted)">Add a court first to set availability.</p>';
      editor.innerHTML = '';
      return;
    }

    selector.innerHTML = `
      <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Select Court</label>
      <select class="avail-court-select" id="availCourtSelect">
        ${courts.map(c => `<option value="${c.id}">${c.name} — ${c.city}</option>`).join('')}
      </select>
    `;

    document.getElementById('availCourtSelect').addEventListener('change', () => {
      availCourtId = document.getElementById('availCourtSelect').value;
      renderAvailabilityEditor();
    });

    availCourtId = courts[0].id;
    renderAvailabilityEditor();
  });
}

async function renderAvailabilityEditor() {
  if (!availCourtId) return;
  const court = await PickleCourts.getById(availCourtId);
  if (!court) return;

  const avail = court.availability || getDefaultAvailability();
  const editor = document.getElementById('availabilityEditor');

  editor.innerHTML = `
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Toggle days on/off and set operating hours. Customers will only see available slots within these hours.</p>
    ${AVAIL_DAYS.map(day => {
      const d = avail[day] || { enabled: false, start: '06:00', end: '22:00' };
      return `
        <div class="avail-day ${d.enabled ? '' : 'avail-slot-disabled'}">
          <div style="display:flex;align-items:center;gap:16px;flex:1;flex-wrap:wrap">
            <span class="day-name">${DAY_LABELS[day]}</span>
            <label class="day-toggle">
              <input type="checkbox" class="avail-toggle" data-day="${day}" ${d.enabled ? 'checked' : ''}/>
              Open
            </label>
            <div class="day-time">
              <input type="time" class="avail-start" data-day="${day}" value="${d.start}" ${d.enabled ? '' : 'disabled'}/>
              <span>to</span>
              <input type="time" class="avail-end" data-day="${day}" value="${d.end}" ${d.enabled ? '' : 'disabled'}/>
            </div>
          </div>
        </div>
      `;
    }).join('')}
    <div style="display:flex;gap:12px;margin-top:16px">
      <button class="btn-dash btn-dash-primary" id="saveAvailBtn"><i class="fas fa-save"></i> Save Schedule</button>
      <button class="btn-dash btn-dash-outline" id="resetAvailBtn"><i class="fas fa-undo"></i> Reset</button>
    </div>
  `;

  // Toggle enable/disable time inputs
  editor.querySelectorAll('.avail-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      const day = cb.dataset.day;
      const row = cb.closest('.avail-day');
      row.classList.toggle('avail-slot-disabled', !cb.checked);
      row.querySelector('.avail-start').disabled = !cb.checked;
      row.querySelector('.avail-end').disabled = !cb.checked;
    });
  });

  document.getElementById('saveAvailBtn').addEventListener('click', async () => {
    const availability = {};
    AVAIL_DAYS.forEach(day => {
      const enabled = document.querySelector(`.avail-toggle[data-day="${day}"]`).checked;
      const start = document.querySelector(`.avail-start[data-day="${day}"]`).value;
      const end = document.querySelector(`.avail-end[data-day="${day}"]`).value;
      availability[day] = { enabled, start, end };
    });

    try {
      await PickleCourts.update(availCourtId, { availability });
      showToast('Schedule saved!');
    } catch (err) {
      showToast('Error: ' + err.message, 4000);
    }
  });

  document.getElementById('resetAvailBtn').addEventListener('click', () => renderAvailabilityEditor());
}

function getDefaultAvailability() {
  const avail = {};
  AVAIL_DAYS.forEach(day => {
    avail[day] = { enabled: day !== 'sunday', start: '06:00', end: '22:00' };
  });
  return avail;
}

// ============================================================
// CHAT / MESSAGES
// ============================================================
let chatUnsub = null;
let activeChatId = null;

function initChat() {
  // Listen to chats in real-time
  if (chatUnsub) chatUnsub();
  chatUnsub = PickleChat.onOwnerChats(currentUser.uid, (chats) => {
    renderChatList(chats);
    if (activeChatId) {
      const stillExists = chats.find(c => c.id === activeChatId);
      if (!stillExists) {
        closeChatThread();
      }
    }
    // Update unread badge
    const totalUnread = chats.reduce((sum, c) => sum + (c.unreadOwner || 0), 0);
    const badge = document.getElementById('chatUnreadBadge');
    if (totalUnread > 0) {
      badge.textContent = totalUnread;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  });
}

function renderChatList(chats) {
  const container = document.getElementById('chatList');
  if (!chats.length) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><h3>No messages yet</h3><p>When players send inquiries, chat threads will appear here.</p></div>';
    return;
  }
  container.innerHTML = chats.map(c => `
    <div class="chat-thread" onclick="openChatThread('${c.id}')">
      <div class="chat-thread-header">
        <div>
          <div class="chat-name">${c.customerName}</div>
          <div class="chat-court">📋 ${c.courtName} · ${c.customerContact}</div>
        </div>
        ${(c.unreadOwner || 0) > 0 ? `<span class="chat-unread">${c.unreadOwner}</span>` : ''}
      </div>
      <div class="chat-preview">
        <span>${c.lastMessage ? (c.lastSender + ': ' + c.lastMessage) : 'No messages yet'}</span>
      </div>
    </div>
  `).join('');
}

let msgUnsub = null;

window.openChatThread = async function(chatId) {
  activeChatId = chatId;
  const chat = await db.collection('chats').doc(chatId).get();
  const data = chat.data();
  document.getElementById('chatThreadName').textContent = data.customerName;
  document.getElementById('chatThreadCourt').textContent = '📋 ' + data.courtName;

  document.getElementById('chatListView').classList.remove('active');
  document.getElementById('chatThreadView').classList.add('active');

  // Mark as read by owner
  await PickleChat.markOwnerRead(chatId);

  // Listen to messages
  if (msgUnsub) msgUnsub();
  msgUnsub = PickleChat.onMessages(chatId, (msgs) => {
    renderMessages(msgs);
  });
};

function renderMessages(msgs) {
  const container = document.getElementById('chatMessages');
  if (!msgs.length) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No messages yet. Say hello!</div>';
    return;
  }
  container.innerHTML = msgs.map(m => {
    const isOwner = m.senderId === currentUser.uid;
    const time = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="chat-msg ${isOwner ? 'owner' : 'customer'}">
        <div class="chat-bubble">${m.text}</div>
        <div class="chat-time">${m.senderName} · ${time}</div>
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !activeChatId) return;

  input.value = '';
  try {
    await PickleChat.sendMessage(
      activeChatId,
      currentUser.uid,
      userProfile?.displayName || 'Owner',
      text
    );
    // Notify customer via email
    try {
      if (typeof PickleNotifications !== 'undefined') {
        const chat = await PickleChat.getById(activeChatId);
        if (chat && chat.customerEmail) {
          PickleNotifications.send(chat.customerEmail, chat.customerName, `New Message: ${chat.courtName}`, `You have a new reply from ${chat.courtName}:\n\n"${text}"`);
        }
      }
    } catch {}
  } catch (err) {
    showToast('Error sending message: ' + err.message, 4000);
  }
}

document.getElementById('chatBackBtn').addEventListener('click', closeChatThread);

function closeChatThread() {
  activeChatId = null;
  if (msgUnsub) { msgUnsub(); msgUnsub = null; }
  document.getElementById('chatListView').classList.add('active');
  document.getElementById('chatThreadView').classList.remove('active');
}

// ============================================================
// UPGRADE TO PRO
// ============================================================
document.getElementById('upgradeNowBtn').addEventListener('click', () => {
  document.getElementById('paymentModal').style.display = 'flex';
});

document.getElementById('paymentSubmitBtn').addEventListener('click', async () => {
  const method = document.getElementById('paymentMethod').value;
  const ref = document.getElementById('paymentRef').value.trim();

  if (!ref) {
    showToast('Please enter your payment reference number.');
    return;
  }

  try {
    await PicklePayments.recordPayment(currentUser.uid, {
      amount: 399,
      method,
      reference: ref
    });
    showToast('Payment submitted! Your Pro account will be verified within 24 hours.');
    closeModal('paymentModal');

    // Notify admin via email
    try {
      if (typeof PickleNotifications !== 'undefined') {
        await PickleNotifications.notifyAdminNewPayment(currentUser.email, currentUser.displayName || 'Owner', { amount: 399, method, reference: ref });
      }
    } catch {}
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
});

document.getElementById('paymentCancelBtn').addEventListener('click', () => closeModal('paymentModal'));
document.getElementById('paymentModalClose').addEventListener('click', () => closeModal('paymentModal'));

// ============================================================
// AUTH MODALS
// ============================================================
function showLoginModal() {
  document.getElementById('loginModal').style.display = 'flex';
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    await PickleAuth.login(email, password);
    closeModal('loginModal');
  } catch (err) {
    showToast('Login failed: ' + err.message, 4000);
  }
});

// Google sign-in
document.getElementById('googleLoginBtn').addEventListener('click', async () => {
  try {
    const result = await PickleAuth.signInWithGoogle();
    if (result) closeModal('loginModal');
  } catch (err) {
    showToast('Google sign-in failed: ' + err.message, 4000);
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;

  try {
    await PickleAuth.register(email, password, name);
    closeModal('registerModal');
    showToast('Account created! Welcome to PickleSpotPH!');
  } catch (err) {
    showToast('Registration failed: ' + err.message, 4000);
  }
});

document.getElementById('showRegisterLink').addEventListener('click', (e) => {
  e.preventDefault();
  closeModal('loginModal');
  document.getElementById('registerModal').style.display = 'flex';
});

document.getElementById('showLoginLink').addEventListener('click', (e) => {
  e.preventDefault();
  closeModal('registerModal');
  document.getElementById('loginModal').style.display = 'flex';
});

// Modal close buttons
document.getElementById('loginModalClose').addEventListener('click', () => closeModal('loginModal'));
document.getElementById('registerModalClose').addEventListener('click', () => closeModal('registerModal'));

// ============================================================
// LOGOUT
// ============================================================
function setupLogout() {
  const logoutBtns = ['dashLogout', 'dashLogoutBtn'];
  logoutBtns.forEach(id => {
    document.getElementById(id).addEventListener('click', async () => {
      if (typeof PickleAuth !== 'undefined') {
        await PickleAuth.logout();
      } else {
        // Force clear any Firebase persistence
        try { indexedDB.deleteDatabase('firebaseLocalStorageDb'); } catch(_) {}
        try { localStorage.removeItem('firebase:authUser'); } catch(_) {}
      }
      window.location.reload();
    });
  });
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  // Sidebar navigation
  document.querySelectorAll('.dash-nav-item[data-section]').forEach(item => {
    item.addEventListener('click', () => switchSection(item.dataset.section));
  });

  // Hamburger menu
  document.getElementById('dashHamburger').addEventListener('click', () => {
    const sidebar = document.querySelector('.dashboard-sidebar');
    sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
  });

  // Add court province/city cascade
  document.getElementById('dashCourtRegion').addEventListener('change', populateDashAddCourtProvinces);
  document.getElementById('dashCourtProvince').addEventListener('change', populateDashAddCourtCities);

  // Edit court province/city cascade
  document.getElementById('editCourtRegion').addEventListener('change', populateEditCourtProvinces);
  document.getElementById('editCourtProvince').addEventListener('change', populateEditCourtCities);

  setupLogout();
}

// ============================================================
// MAILING LIST
// ============================================================
async function loadMailingList() {
  const container = document.getElementById('mailingListContainer');
  try {
    const [subscribers, usersSnap] = await Promise.all([
      PickleMailing.getAll(),
      db.collection('users').get()
    ]);

    const proOwners = [];
    const basicOwners = [];
    usersSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.plan === 'pro') proOwners.push(d);
      else basicOwners.push(d);
    });

    const allEmails = [
      ...subscribers.map(s => ({ name: s.name, email: s.email, date: s.subscribedAt?.toDate?.(), group: 'Player' })),
      ...proOwners.map(u => ({ name: u.displayName, email: u.email, date: u.createdAt?.toDate?.(), group: 'Pro Owner' })),
      ...basicOwners.map(u => ({ name: u.displayName, email: u.email, date: u.createdAt?.toDate?.(), group: 'Basic Owner' }))
    ];

    if (allEmails.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-mail-bulk"></i><h3>No contacts yet</h3><p>Emails will appear here when players subscribe or owners register.</p></div>';
      return;
    }

    const sections = [
      { title: 'Players', icon: 'fa-user', data: subscribers.map(s => ({ name: s.name, email: s.email, date: s.subscribedAt?.toDate?.() })) },
      { title: 'Pro Owners', icon: 'fa-crown', accent: true, data: proOwners.map(u => ({ name: u.displayName, email: u.email, date: u.createdAt?.toDate?.() })) },
      { title: 'Basic Owners', icon: 'fa-user', data: basicOwners.map(u => ({ name: u.displayName, email: u.email, date: u.createdAt?.toDate?.() })) }
    ];

    container.innerHTML = sections.map(section => `
      <div style="background:var(--white);border-radius:var(--radius);box-shadow:var(--card-shadow);overflow:hidden;margin-bottom:20px">
        <div style="padding:14px 16px;background:${section.accent ? 'var(--accent)' : 'var(--primary)'};color:white;display:flex;justify-content:space-between;align-items:center">
          <strong><i class="fas ${section.icon}"></i> ${section.title}</strong>
          <span style="font-size:12px;opacity:0.9">${section.data.length}</span>
        </div>
        ${section.data.length === 0 ? '<p style="padding:16px;color:var(--text-muted);font-size:13px">No contacts</p>' : `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="text-align:left;background:#fafafa">
              <th style="padding:10px 16px">Name</th>
              <th style="padding:10px 16px">Email</th>
              <th style="padding:10px 16px">Since</th>
            </tr>
          </thead>
          <tbody>
            ${section.data.map(d => `
              <tr style="border-bottom:1px solid #f0f0f0">
                <td style="padding:9px 16px">${d.name || '—'}</td>
                <td style="padding:9px 16px">${d.email}</td>
                <td style="padding:9px 16px;color:var(--text-muted)">${d.date ? d.date.toLocaleDateString() : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`}
      </div>
    `).join('') + `
      <p style="font-size:13px;color:var(--text-muted);margin-top:12px">
        ${allEmails.length} total contacts (${subscribers.length} players · ${proOwners.length} pro · ${basicOwners.length} basic)
      </p>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

window.exportMailingList = async function() {
  try {
    const [subscribers, usersSnap] = await Promise.all([
      PickleMailing.getAll(),
      db.collection('users').get()
    ]);

    const proOwners = [];
    const basicOwners = [];
    usersSnap.docs.forEach(doc => {
      const d = doc.data();
      if (d.plan === 'pro') proOwners.push(d);
      else basicOwners.push(d);
    });

    const allContacts = [
      ...subscribers.map(s => ({ name: s.name || '', email: s.email, date: s.subscribedAt?.toDate?.(), group: 'Player' })),
      ...proOwners.map(u => ({ name: u.displayName || '', email: u.email, date: u.createdAt?.toDate?.(), group: 'Pro Owner' })),
      ...basicOwners.map(u => ({ name: u.displayName || '', email: u.email, date: u.createdAt?.toDate?.(), group: 'Basic Owner' }))
    ];

    if (allContacts.length === 0) {
      showToast('No contacts to export.');
      return;
    }

    const rows = [['Name', 'Email', 'Group', 'Date']];
    allContacts.forEach(c => {
      rows.push([c.name, c.email, c.group, c.date ? c.date.toISOString().split('T')[0] : '']);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mailing-list.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Error exporting: ' + err.message, 4000);
  }
};

// ============================================================
// HELPERS
// ============================================================
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showToast(message, duration = 3000) {
  const toast = document.getElementById('dashToast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ============================================================
// MAP PICKER FOR ADD COURT
// ============================================================
function populateDashAddCourtProvinces() {
  const region = document.getElementById('dashCourtRegion').value;
  const provGroup = document.getElementById('dashCourtProvinceGroup');
  const provSelect = document.getElementById('dashCourtProvince');
  const cityGroup = document.getElementById('dashCourtCityGroup');
  const citySelect = document.getElementById('dashCourtCity');

  citySelect.value = '';
  cityGroup.style.display = 'none';
  provSelect.value = '';

  if (!region) {
    provGroup.style.display = 'none';
    return;
  }

  const provinces = PH_LOCATIONS[region] ? Object.keys(PH_LOCATIONS[region]).sort() : [];
  provSelect.innerHTML = '<option value="">Select Province</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  provGroup.style.display = 'block';
}

function populateDashAddCourtCities() {
  const region = document.getElementById('dashCourtRegion').value;
  const province = document.getElementById('dashCourtProvince').value;
  const cityGroup = document.getElementById('dashCourtCityGroup');
  const citySelect = document.getElementById('dashCourtCity');

  citySelect.value = '';

  if (!region || !province) {
    cityGroup.style.display = 'none';
    return;
  }

  const cities = PH_LOCATIONS[region] && PH_LOCATIONS[region][province] ? [...PH_LOCATIONS[region][province]].sort() : [];
  citySelect.innerHTML = '<option value="">Select City</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
  cityGroup.style.display = 'block';
}

function populateEditCourtProvinces() {
  const region = document.getElementById('editCourtRegion').value;
  const provGroup = document.getElementById('editCourtProvinceGroup');
  const provSelect = document.getElementById('editCourtProvince');
  const cityGroup = document.getElementById('editCourtCityGroup');
  const citySelect = document.getElementById('editCourtCity');

  citySelect.value = '';
  cityGroup.style.display = 'none';
  provSelect.value = '';

  if (!region) {
    provGroup.style.display = 'none';
    return;
  }

  const provinces = PH_LOCATIONS[region] ? Object.keys(PH_LOCATIONS[region]).sort() : [];
  provSelect.innerHTML = '<option value="">Select Province</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  provGroup.style.display = 'block';
}

function populateEditCourtCities() {
  const region = document.getElementById('editCourtRegion').value;
  const province = document.getElementById('editCourtProvince').value;
  const cityGroup = document.getElementById('editCourtCityGroup');
  const citySelect = document.getElementById('editCourtCity');

  citySelect.value = '';

  if (!region || !province) {
    cityGroup.style.display = 'none';
    return;
  }

  const cities = PH_LOCATIONS[region] && PH_LOCATIONS[region][province] ? [...PH_LOCATIONS[region][province]].sort() : [];
  citySelect.innerHTML = '<option value="">Select City</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
  cityGroup.style.display = 'block';
}

function initAddCourtMap() {
  if (addCourtMapInitialized) {
    setTimeout(() => addCourtMap?.invalidateSize(), 100);
    return;
  }

  const container = document.getElementById('addCourtMap');
  if (!container) return;

  addCourtMap = L.map('addCourtMap', { zoomControl: true }).setView([12.8797, 121.7740], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(addCourtMap);

  addCourtMap.on('click', function (e) {
    placeMarker(e.latlng.lat, e.latlng.lng);
  });

  addCourtMapInitialized = true;
  setTimeout(() => addCourtMap.invalidateSize(), 200);
}

function placeMarker(lat, lng) {
  document.getElementById('dashCourtLat').value = lat.toFixed(4);
  document.getElementById('dashCourtLng').value = lng.toFixed(4);

  if (addCourtMarker) {
    addCourtMarker.setLatLng([lat, lng]);
  } else {
    addCourtMarker = L.marker([lat, lng], { draggable: true }).addTo(addCourtMap);
    addCourtMarker.on('dragend', function () {
      const pos = addCourtMarker.getLatLng();
      document.getElementById('dashCourtLat').value = pos.lat.toFixed(4);
      document.getElementById('dashCourtLng').value = pos.lng.toFixed(4);
    });
  }

  addCourtMap.setView([lat, lng], Math.max(addCourtMap.getZoom(), 12));
}

// ============================================================
// CLAIMS MANAGEMENT (Admin)
// ============================================================
async function loadClaims() {
  const container = document.getElementById('claimsList');
  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const claims = await PickleClaims.getAll();
    if (!claims.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-hand-paper"></i><h3>No claims yet</h3><p>When owners claim courts, they will appear here.</p></div>';
      return;
    }

    const courtIds = [...new Set(claims.filter(c => c.courtId).map(c => c.courtId))];
    const courtNames = {};
    await Promise.all(courtIds.map(async id => {
      try {
        const court = await PickleCourts.getById(id);
        if (court) courtNames[id] = court.name;
      } catch {}
    }));

    container.innerHTML = claims.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    }).map(c => `
      <div style="background:var(--white);border-radius:12px;padding:16px 20px;margin-bottom:12px;box-shadow:var(--card-shadow)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <strong>${c.name}</strong> · <span style="font-size:12px;color:var(--text-muted)">${c.email}</span>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
              📍 ${courtNames[c.courtId] || 'Unknown court'}
              ${c.contact ? `· 📞 ${c.contact}` : ''}
            </div>
            ${c.message ? `<div style="font-size:12px;color:#555;margin-top:6px;padding:8px;background:#f9f9f9;border-radius:6px">${c.message}</div>` : ''}
          </div>
          <span style="font-size:11px;padding:3px 10px;border-radius:10px;font-weight:600;background:${c.status === 'approved' ? '#e8f5e9' : c.status === 'rejected' ? '#ffebee' : '#fff3e0'};color:${c.status === 'approved' ? '#2e7d32' : c.status === 'rejected' ? '#c62828' : '#e65100'}">${c.status}</span>
        </div>
        ${c.status === 'pending' ? `
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-dash btn-dash-primary" onclick="approveClaim('${c.id}')"><i class="fas fa-check"></i> Approve</button>
          <button class="btn-dash btn-dash-danger" onclick="rejectClaim('${c.id}')"><i class="fas fa-times"></i> Reject</button>
        </div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p style="color:#d32f2f">Error: ${err.message}</p>`;
  }
}

window.approveClaim = async function(claimId) {
  if (!confirm('Approve this claim? The claimant will become the owner and the court will be verified.')) return;
  try {
    const claim = (await PickleClaims.getAll()).find(c => c.id === claimId);
    if (!claim) return;
    let usersSnap = await db.collection('users').where('email', '==', claim.email).get();
    let userId = usersSnap.docs[0]?.id;

    if (!userId) {
      // Create a user profile for the claimant so the claim can be approved
      const newUserRef = db.collection('users').doc();
      await newUserRef.set({
        email: claim.email,
        displayName: claim.name || '',
        contact: claim.contact || '',
        plan: 'basic',
        role: 'owner',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      userId = newUserRef.id;
    }

    await PickleClaims.approve(claimId, userId);
    await PickleNotifications.notifyClaimantApproved(claim.email, claim.name, 'their court');
    showToast('Claim approved! Owner notified.');
    loadClaims();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
};

window.rejectClaim = async function(claimId) {
  if (!confirm('Reject this claim?')) return;
  try {
    await PickleClaims.reject(claimId);
    showToast('Claim rejected.');
    loadClaims();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
};

// ============================================================
// BATCH IMPORT (Admin Only)
// ============================================================
function showBatchImportSection() {
  document.getElementById('batchImportLog').textContent = 'Ready. Click a button above to start importing.';
}

const IMPORT_COURTS = [
  {name:'Tierra Pickleball Club',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0969 085 7204',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM',notes:'Contact via Facebook: facebook.com/tierrapickleball'},
  {name:'CVJ Pickleball Park',city:'Marikina',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'0917 531 2952',address:'Marikina City',lat:14.6346,lng:121.0970,hours:'6:00 AM - 10:00 PM'},
  {name:'24/7 Pickle Mandaluyong',city:'Mandaluyong',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'0936 949 0815',address:'Mandaluyong City',lat:14.5790,lng:121.0354,hours:'Open 24 hours'},
  {name:'Ground Game Pickleball Court',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'0962 554 5953',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Veterans Memorial Medical Center Pickleball Club',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1200/hr',courts:2,contact:'(02) 8926 1315',address:'VMMC, Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 8:00 PM'},
  {name:'Standout Pickleball Arena',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0917 776 0909',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Javaj Pickleball',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'0966 340 4512',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Arvo Pickleball',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0917 140 8549',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM',notes:'Website: arvopickleball.com'},
  {name:'Hemady Sports Plaza',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:8,contact:'(02) 8726 6351',address:'Hemady St., Quezon City',lat:14.6080,lng:121.0330,hours:'6:00 AM - 10:00 PM'},
  {name:'Tierra Pura Pickleball Court',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0917 000 0000',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Activate One',city:'Makati',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'0995 055 0333',address:'Makati City',lat:14.5547,lng:121.0244,hours:'6:00 AM - 10:00 PM'},
  {name:'Dink & Shot',city:'Marikina',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'marketing@dinkandshot.com',address:'Marikina City',lat:14.6346,lng:121.0970,hours:'6:00 AM - 10:00 PM'},
  {name:'RallyPoint Pickleball',city:'Marikina',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'0968 439 0934',address:'Marikina City',lat:14.6346,lng:121.0970,hours:'6:00 AM - 10:00 PM'},
  {name:'Alset Pickleball',city:'Makati',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'0917 537 7878',address:'Makati City',lat:14.5547,lng:121.0244,hours:'6:00 AM - 10:00 PM',notes:'Website: alsetpickleball.ph/'},
  {name:'Neopolitan Brittany Pickleball Courts',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1300/hr',courts:10,contact:'(02) 8461 3534',address:'Neopolitan Brittany, QC',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'TECNIQ X Dink & Drive',city:'Las Pi\u00F1as',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0945 653 5470',address:'Las Pi\u00F1as City',lat:14.4708,lng:120.9827,hours:'6:00 AM - 10:00 PM'},
  {name:'Blue Ridge Covered Courts',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'0917 182 2272',address:'Blue Ridge, Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Gameville Double Play',city:'Pasig',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0932 208 6138',address:'Pasig City',lat:14.5764,lng:121.0851,hours:'6:00 AM - 10:00 PM'},
  {name:'Makati Sports Club',city:'Makati',province:'Metro Manila',region:'NCR',type:'indoor',access:'membership',rate:'Membership required',courts:2,contact:'(02) 8817 8731',address:'Makati City',lat:14.5547,lng:121.0244,hours:'6:00 AM - 10:00 PM'},
  {name:'Vatic Pro Pickleball PH',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0915 266 1178',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Divine Light Pickleball Club',city:'Las Pi\u00F1as',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'0999 876 3285',address:'Las Pi\u00F1as City',lat:14.4708,lng:120.9827,hours:'6:00 AM - 10:00 PM'},
  {name:'Penalosa Sports Center',city:'Para\u00F1aque',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0906 485 2960',address:'Para\u00F1aque City',lat:14.4795,lng:120.9836,hours:'6:00 AM - 10:00 PM'},
  {name:'New Manila Rolling Hills Clubhouse',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'(02) 8240 3907',address:'New Manila, Quezon City',lat:14.6080,lng:121.0330,hours:'6:00 AM - 10:00 PM'},
  {name:'ProServe Manila',city:'Manila',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'0956 299 5981',address:'Manila',lat:14.5995,lng:120.9842,hours:'6:00 AM - 10:00 PM'},
  {name:'The Smash City',city:'Valenzuela',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1200-400/hr',courts:4,contact:'0952 479 9139',address:'30 F. Alarcon St., Malabo, Maysan Road, Valenzuela',lat:14.7029,lng:120.9719,hours:'7:00 AM - 12:00 MN',notes:'Website: thesmashcity.com/ \u00B7 USAPA-standard courts, LED lighting'},
  {name:'Quezon City Sports Club',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'membership',rate:'Membership required',courts:4,contact:'',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'HD Pickleball',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:4,contact:'',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Match Grounds Pickleball',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Zone Sports Center',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:6,contact:'',address:'Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 10:00 PM'},
  {name:'Picklebees VMMC-UHTPC',city:'Quezon City',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1200/hr',courts:3,contact:'',address:'VMMC, Quezon City',lat:14.6507,lng:121.0483,hours:'6:00 AM - 8:00 PM'},
  {name:'Paddiemates Pickleball Hub',city:'Manila',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'',address:'Malate, Manila',lat:14.5667,lng:120.9933,hours:'6:00 AM - 10:00 PM'},
  {name:'SM Center Shaw Pickleball Court',city:'Mandaluyong',province:'Metro Manila',region:'NCR',type:'outdoor',access:'pay',rate:'\u20B1500/hr',courts:3,contact:'',address:'514 Shaw Boulevard, Mandaluyong',lat:14.5790,lng:121.0354,hours:'Mall hours',notes:'Partner: Paloo \u00B7 3 permanent outdoor courts'},
  {name:'SM Center Muntinlupa Pickleball Court',city:'Muntinlupa',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1500/hr',courts:4,contact:'',address:'SM Center Muntinlupa',lat:14.4185,lng:121.0412,hours:'Mall hours',notes:'Partner: Paloo \u00B7 4 permanent indoor courts \u00B7 Open play \u20B1280'},
  {name:'Nomads Pickleball Cebu',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1450-500/hr',courts:2,contact:'0998 841 8485',address:'070 R. Duterte St, Cebu City',lat:10.3157,lng:123.8854,hours:'Open 24 hours',notes:'Indoor painted courts \u00B7 Paddle rental \u20B1100'},
  {name:'Pickaball Sports Center',city:'Mandaue',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1600/hr',courts:7,contact:'',address:'Tabok, Mandaue City, Cebu',lat:10.3301,lng:123.9318,hours:'Open 24 hours',notes:'US-standard acrylic+silica sand \u00B7 Paddle rental \u20B1100 \u00B7 Showers & parking'},
  {name:'The Courts of Cebu',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1550-700/hr',courts:8,contact:'',address:'Pres. Magsaysay St., Cebu City',lat:10.3157,lng:123.8854,hours:'10:00 AM - 10:00 PM',notes:'US-standard acrylic+silica sand \u00B7 Open play \u00B7 Booking: app.onda.fit'},
  {name:'Qusina PIQLE QLUB',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'',address:'Banilad, Cebu City',lat:10.3264,lng:123.9062,hours:'Open 24 hours',notes:'Outdoor painted courts \u00B7 Open play \u00B7 Parking'},
  {name:'The Pickle Point Cebu',city:'Mandaue',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'',address:'Mandaue City, Cebu',lat:10.3301,lng:123.9318,hours:'Open 24 hours',notes:'Outdoor painted courts \u00B7 Parking & CR'},
  {name:'HQ Pickleball Cebu',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1500/hr',courts:3,contact:'0917 701 9131',address:'Archbishop Reyes Ave, Cebu City (near Grand Convention Center)',lat:10.3145,lng:123.9032,hours:'Open 24 hours',notes:'Expanding to 9 covered courts Feb 2026 \u00B7 Paddle rental \u20B1200/4hrs \u00B7 GCash accepted'},
  {name:'Pickle at The Kiln',city:'Mandaue',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1550/hr',courts:4,contact:'',address:'Banilad, Mandaue City, Cebu',lat:10.3264,lng:123.9062,hours:'Daily',notes:'Indoor US-standard courts \u00B7 Parking & CR'},
  {name:'Sayson\'s Place Private Pickleball Court',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1200/hr',courts:1,contact:'',address:'Tisa, Cebu City',lat:10.3046,lng:123.8745,hours:'6:00 AM - 12:00 MN',notes:'Private outdoor painted court \u00B7 Parking & CR'},
  {name:'Net and Paddle Pickleball Club',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1450/hr',courts:2,contact:'',address:'Cebu City',lat:10.3157,lng:123.8854,hours:'Daily',notes:'Indoor US-standard courts'},
  {name:'CitiLoft Pickleball Cebu',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'',address:'Cebu City',lat:10.3157,lng:123.8854,hours:'Afternoon/Evening',notes:'Indoor painted courts \u00B7 Member & walk-in rates'},
  {name:'DH Sports Hub',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'',address:'Cebu City',lat:10.3157,lng:123.8854,hours:'Daily',notes:'Indoor wood flooring \u00B7 On-site parking'},
  {name:'Pino Pickleball Court',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'',address:'Cebu City',lat:10.3157,lng:123.8854,hours:'Daily',notes:'Outdoor painted courts \u00B7 On-site parking'},
  {name:'SweetSpot Pickleball',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'',address:'Cebu City',lat:10.3157,lng:123.8854,hours:'Daily',notes:'Indoor courts'},

  // ===== BATCH 2 — Added Jun 22, 2026 =====

  {name:'The Pickle Yard Para\u00F1aque',city:'Para\u00F1aque',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1500/hr',courts:3,contact:'(+63) 936-959-5004 / pickleyardph@gmail.com',address:'Warehouse 1, Emram Holdings Compound, West Service Road, Sun Valley, Bicutan, Para\u00F1aque City',lat:14.4889,lng:121.0419,hours:'Mon-Fri 7:00 AM - 12:00 MN',notes:'P500/hr court rental. P250/head open play (9PM-1AM Thu). Acrylic courts. 3 USAPA-standard courts. Sports bar & restaurant.'},
  {name:'The Pickle Yard Dasmari\u00F1as',city:'Dasmari\u00F1as',province:'Cavite',region:'Luzon',type:'indoor',access:'pay',rate:'\u20B1500/hr',courts:3,contact:'(+63) 953-882-6297 / pickleyardph@gmail.com',address:'AON Warehouse, Governor\'s Drive, Sampaloc Uno, Dasmari\u00F1as, Cavite',lat:14.3281,lng:120.9598,hours:'Mon-Fri 7:00 AM - 12:00 MN',notes:'Branch of The Pickle Yard. P500/hr.'},
  {name:'SMASH Sports Facilities',city:'Mandaue',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1500-600/hr',courts:3,contact:'FB: facebook.com/profile.php?id=61587611789121',address:'Near Guizo Barangay Hall, Mandaue City, Cebu',lat:10.3245,lng:123.9350,hours:'7:00 AM - 12:00 MN',notes:'US Standard (Acrylic + Silica Sand). Open play & paddle rental. Booking via sports360.ph.'},
  {name:'Orosia Pickleball Court',city:'Consolacion',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1400-450/hr',courts:3,contact:'FB: facebook.com/profile.php?id=61589354993750',address:'Orosia Food Park, Cansaga, Consolacion, Cebu',lat:10.3766,lng:123.9592,hours:'10:00 AM - 12:00 MN',notes:'US Standard (Acrylic + Silica Sand). Located within Orosia Food Park.'},
  {name:'Paduwa PickleBall Club',city:'Consolacion',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1300-350/hr',courts:7,contact:'FB: facebook.com/people/Paduwa-PickleBall-Club/61577662757877',address:'Diversion Road, Consolacion, Cebu',lat:10.3734,lng:123.9575,hours:'8:00 AM - 12:00 MN',notes:'US Standard (Acrylic + Silica Sand). Open play & paddle rental. Booking via courtsync.co.'},
  {name:'BTC Pickleball Lapu-Lapu',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1500/hr',courts:10,contact:'0917 321 5781',address:'1851 Pool Street, Bankal, Lapu-Lapu City, Cebu',lat:10.3080,lng:123.9830,hours:'4:00 PM - 2:00 AM',notes:'10 outdoor concrete courts. Coffee shop, food stalls, parking.'},
  {name:'DA\' Pickle CLAN',city:'Naga',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1300-350/hr',courts:1,contact:'0927 796 7996',address:'Daclan Compound, Tuyan, Naga, Cebu (beside Seaoil Gas Station)',lat:10.2270,lng:123.7500,hours:'6:00 AM - 12:00 MN (Mon-Fri)',notes:'1 outdoor concrete court. Coffee shop. Mon-Fri only.'},
  {name:'Double A Rally Court',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1350/hr',courts:1,contact:'0966 365 6628 / 0995 438 9006',address:'New Sangi Rd, Lapu-Lapu City, Cebu',lat:10.3150,lng:123.9650,hours:'3:00 PM - 12:00 MN',notes:'1 outdoor concrete court.'},
  {name:'Lapu-Lapu City Cebu Pickleball Club',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1400-450/hr',courts:1,contact:'FB page',address:'Provident Homes Kinalumsan, Canjulao, Lapu-Lapu City, Cebu',lat:10.3100,lng:123.9700,hours:'6:00 AM - 12:00 MN',notes:'1 outdoor concrete court.'},
  {name:'Cebu Sports Hub',city:'Mandaue',province:'Cebu',region:'Central Visayas',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:3,contact:'',address:'Mardonio Ceniza, Mandaue, Cebu',lat:10.3260,lng:123.9280,hours:'Daily',notes:'3 indoor hard courts with permanent lines & portable nets. Lights.'},
  {name:'Paddle Point Club',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1400/hr',courts:1,contact:'',address:'Lapu-Lapu City, Cebu',lat:10.3100,lng:123.9800,hours:'Open 24 hours',notes:'1 outdoor painted court. CR available.'},

  // ===== BATCH 3 — Added Jun 24, 2026 =====

  // --- DAVAO ---
  {name:'PickleTown Davao',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'indoor',access:'pay',rate:'\u20B1400-500/hr',courts:10,contact:'',address:'Carmelite Road, Belisario, Davao City',lat:7.1155,lng:125.6290,hours:'Daily',notes:'10 premium indoor courts. First 10 indoor courts in Mindanao. Food, restrooms, lights, lessons.'},
  {name:'Matina Town Square Pickleball',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'outdoor',access:'pay',rate:'\u20B1150-200/hr',courts:3,contact:'(082) 297 1780 / 0953 952 6626',address:'Matina Town Square, Matina, Davao City',lat:7.0741,lng:125.5955,hours:'6:00 AM - 12:00 MN',notes:'Covered outdoor courts. Open play, coaching & private lessons available.'},
  {name:'FPB Sports Complex',city:'Malita',province:'Davao Occidental',region:'Davao Region',type:'outdoor',access:'pay',rate:'\u20B1200/hr',courts:2,contact:'',address:'FPB Sports Complex, Malita, Davao Occidental',lat:6.4123,lng:125.6095,hours:'Daily',notes:'2 outdoor courts with permanent lines. Host venue of Mindanao Pickleball League.'},
  {name:'Crisron Pickleball',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'indoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'',address:'FEP Building Corp, Km 6 Don Julian Rodriguez Sr. Ave, Davao City',lat:7.1080,lng:125.6370,hours:'Daily',notes:'Indoor courts. Parking available.'},
  {name:'Prime Pickleball Davao',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'',address:'C.P. Garcia Hwy, Buhangin, Davao City',lat:7.1180,lng:125.6460,hours:'Daily',notes:'Indoor pickleball facility.'},
  {name:'SwishCourt Pickleball Club Davao',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'',address:'Matina Aplaya Road, Brgy. Matina Aplaya, Davao City',lat:7.0700,lng:125.5970,hours:'Daily',notes:'Indoor courts. Parking available.'},
  {name:'Guadalupe Pickleball',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'outdoor',access:'pay',rate:'\u20B1150/hr',courts:2,contact:'',address:'1st Street, Guadalupe Village, Lanang, Davao City',lat:7.1020,lng:125.6560,hours:'Daily',notes:'Outdoor community courts.'},
  {name:'Dink Spot Davao',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'indoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'',address:'Km 13 Panacan Ave, Buhangin, Davao City',lat:7.1350,lng:125.6700,hours:'Daily',notes:'Indoor pickleball court.'},
  {name:'Baseline-Pickle Hub Davao',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:6,contact:'',address:'JCP Warehouse #9 Punad Bypass Rd, Brgy. Angliongto, Davao City',lat:7.0980,lng:125.6130,hours:'Daily',notes:'6 indoor courts. Booking via baseline.ph.'},

  // --- BACOLOD / NEGROS OCCIDENTAL ---
  {name:'Paddle City Bacolod',city:'Bacolod',province:'Negros Occidental',region:'Western Visayas',type:'indoor',access:'pay',rate:'\u20B1400-500/hr',courts:7,contact:'',address:'Magsaysay Ave, Barangay Singcang-Airport, Bacolod City',lat:10.6695,lng:122.9513,hours:'Daily',notes:'Just opened May 2026. 7 international-standard courts. Co-working spaces, food court, indoor carwash. Largest pickleball venue in Visayas.'},
  {name:'Bacolod Pickleball HQ',city:'Bacolod',province:'Negros Occidental',region:'Western Visayas',type:'outdoor',access:'pay',rate:'\u20B1200-300/hr',courts:2,contact:'0908 885 3555',address:'P. Hernaez St., Brgy. 31, Bacolod City (Green Gate entrance w/ CCTV)',lat:10.6695,lng:122.9488,hours:'Daily',notes:'Beginner-friendly. Outdoor seating. Viber: 0908 885 3555 / Email: bacolodpickleball@gmail.com.'},
  {name:'Paddle Ground Bacolod',city:'Bacolod',province:'Negros Occidental',region:'Western Visayas',type:'indoor',access:'pay',rate:'\u20B1300-400/hr',courts:2,contact:'',address:'Circumferential Rd, Bacolod City',lat:10.6543,lng:122.9653,hours:'Daily',notes:'Covered courts.'},
  {name:'The Pickleball Hideout Bacolod',city:'Bacolod',province:'Negros Occidental',region:'Western Visayas',type:'indoor',access:'pay',rate:'\u20B1300-400/hr',courts:1,contact:'0908 861 6564',address:'Bacolod City',lat:10.6330,lng:122.9371,hours:'Daily',notes:'Private covered court for rent. Instagram: @the.pickleball.hideout.'},

  // --- ILOILO ---
  {name:'NetPlay 360 Iloilo',city:'Iloilo City',province:'Iloilo',region:'Western Visayas',type:'indoor',access:'pay',rate:'\u20B1400-550/hr',courts:4,contact:'',address:'Diversion Rd., Jaro, Iloilo City',lat:10.7298,lng:122.5620,hours:'Daily',notes:'Premium indoor pickleball venue. Open play, court reservation, corporate events, founding memberships. Website: netplay360.com.'},

  // --- BAGUIO / CAR ---
  {name:'John Hay Sports Pavilion',city:'Baguio',province:'Benguet',region:'Cordillera Administrative Region',type:'indoor',access:'pay',rate:'\u20B1600/hr',courts:4,contact:'',address:'Behind John Hay Convention Center, Camp John Hay, Baguio City',lat:16.3992,lng:120.6103,hours:'8:00 AM - 11:00 PM',notes:'USAP-spec courts. Open play P250/head. Paddle rental P100. Free parking. First dedicated pickleball facility in Baguio.'},
  {name:'YWAM Baguio Pickleball Court',city:'Baguio',province:'Benguet',region:'Cordillera Administrative Region',type:'outdoor',access:'free',rate:'Free',courts:1,contact:'',address:'YWAM Baguio, Loakan Proper, Baguio City',lat:16.3890,lng:120.6210,hours:'By arrangement',notes:'Community court. Part of YWAM Baguio ministry. Open to local youth & outreach.'},

  // --- PAMPANGA / CLARK / CENTRAL LUZON ---
  {name:'RECA Resort Pickleball Court',city:'Porac',province:'Pampanga',region:'Central Luzon',type:'outdoor',access:'pay',rate:'Free for in-house guests',courts:1,contact:'',address:'RECA Resort Philippines, Porac, Pampanga (near Clark)',lat:15.0980,lng:120.5300,hours:'Resort hours',notes:'Free use for checked-in guests. Bali-inspired resort setting. Also hosts tournaments.'},
  {name:'Clark Pickleball+',city:'Clark Freeport',province:'Pampanga',region:'Central Luzon',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:8,contact:'',address:'Former Clark Trading Warehouse, Centennial Road, Clark Freeport Zone',lat:15.1855,lng:120.5600,hours:'Coming soon',notes:'P12M facility by Bandjag Sports & Leisure. 8 public courts + 1 tournament court + 4 convertible from bball court. Cafe, pro shop, locker rooms.'},
  {name:'Terra Courts',city:'San Fernando',province:'Pampanga',region:'Central Luzon',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:3,contact:'0966 807 3599',address:'Freluz Bldg, Jose Abad Santos Ave, San Fernando City, Pampanga',lat:15.0280,lng:120.6900,hours:'Daily - 11:00 PM',notes:'3 indoor courts. Booking via terracourts.setmore.com.'},
  {name:'KingCourts Pickleball',city:'San Fernando',province:'Pampanga',region:'Central Luzon',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:4,contact:'',address:'San Fernando, Pampanga',lat:15.0300,lng:120.6950,hours:'Daily',notes:'4 indoor courts. Host of The Dink Minor League North Luzon.'},
  {name:'Dink District PH',city:'Bocaue',province:'Bulacan',region:'Central Luzon',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:3,contact:'',address:'Bocaue, Bulacan',lat:14.7950,lng:120.9300,hours:'Daily',notes:'2 full courts + 1 skinny court. Community-focused club. Open play, coaching, tournaments. FB: @dinkdistrictph.'},
  {name:'Match Point Racket Club',city:'Malolos',province:'Bulacan',region:'Central Luzon',type:'indoor',access:'pay',rate:'\u20B1400-500/hr',courts:3,contact:'',address:'Malolos, Bulacan',lat:14.8450,lng:120.9600,hours:'Daily',notes:'3 premium indoor standard courts. 2 toilet & bath, free water refills. Website: matchpointracketclub.com.'},
  {name:'Mighty Sports Center',city:'Guiguinto',province:'Bulacan',region:'Central Luzon',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:4,contact:'',address:'AcroCity, Guiguinto, Bulacan',lat:14.8350,lng:120.8800,hours:'Daily',notes:'Newest sports hub in Bulacan. Pickleball + badminton courts. By Czark Mak Corp. & Wongchuking family.'},

  // --- CALABARZON ---
  {name:'ACE & E Resort Pickleball',city:'Los Ba\u00F1os',province:'Laguna',region:'Calabarzon',type:'outdoor',access:'pay',rate:'\u20B1200/hr',courts:1,contact:'',address:'Block 5, Lot 8, Springdale Garden Subdivision, Victoria St., Los Ba\u00F1os, Laguna',lat:14.1700,lng:121.2400,hours:'Resort hours',notes:'Resort court. Great for groups and weekend getaways.'},
  {name:'Pickleball HQ Bi\u00F1an',city:'Bi\u00F1an',province:'Laguna',region:'Calabarzon',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'',address:'Bi\u00F1an, Laguna',lat:14.3360,lng:121.0870,hours:'Daily',notes:'Indoor pickleball facility.'},
  {name:'Powerhouse Pickleball and Badminton Center',city:'Silang',province:'Cavite',region:'Calabarzon',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:4,contact:'',address:'Km 39 Aguinaldo Hwy, Biga, Silang, Cavite',lat:14.2180,lng:120.9720,hours:'Daily',notes:'4 indoor courts. Pickleball & badminton.'},
  {name:'Dink Central PH',city:'Silang',province:'Cavite',region:'Calabarzon',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'',address:'Silang, Cavite',lat:14.2200,lng:120.9750,hours:'Daily',notes:'Indoor pickleball facility.'},
  {name:'Smash & Brew Antipolo',city:'Antipolo',province:'Rizal',region:'Calabarzon',type:'indoor',access:'pay',rate:'\u20B1350-400/hr',courts:2,contact:'',address:'Antipolo City, Rizal',lat:14.5860,lng:121.1760,hours:'Daily',notes:'Indoor court + cafe concept.'},
  {name:'Athlete Central Cainta',city:'Cainta',province:'Rizal',region:'Calabarzon',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'',address:'Cainta, Rizal',lat:14.5690,lng:121.1230,hours:'Daily',notes:'Indoor sports facility with pickleball.'},
  {name:'The Pickler Pod Angono',city:'Angono',province:'Rizal',region:'Calabarzon',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'',address:'Angono, Rizal',lat:14.5240,lng:121.1520,hours:'Daily',notes:'Indoor pickleball court.'},
  {name:'Palm Pickleball Club',city:'Muntinlupa',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'',address:'1410 Laguna Heights Drive, Alabang, Muntinlupa',lat:14.4190,lng:121.0370,hours:'Daily',notes:'Premium indoor club.'},

  // ===== BATCH 4 — Added Jun 25, 2026 =====

  // --- CDO / NORTHERN MINDANAO ---
  {name:'Unity Sports Facility (Misor Capitol)',city:'Cagayan de Oro',province:'Misamis Oriental',region:'Northern Mindanao',type:'outdoor',access:'pay',rate:'\u20B150-150',courts:4,contact:'',address:'De Lara Park, Capitol Grounds, Cagayan de Oro City',lat:8.4850,lng:124.6470,hours:'Daily',notes:'Opened June 19, 2026. Public courts with night lighting, Wi-Fi, lounge, locker rooms. Provincial govt facility. Affordable rates P50-P150.'},
  {name:'Dink Xcape Picklehub',city:'Cagayan de Oro',province:'Misamis Oriental',region:'Northern Mindanao',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:3,contact:'',address:'Bontong, Camaman-an, Cagayan de Oro City (near AGT Petroleum)',lat:8.4720,lng:124.6460,hours:'9:00 AM - 12:00 MN',notes:'Opened June 8, 2026. 3 indoor courts. Indoor facility.'},
  {name:'0-0-2 Pickle Courts',city:'Cagayan de Oro',province:'Misamis Oriental',region:'Northern Mindanao',type:'indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'',address:'JV Serina St., Carmen, Cagayan de Oro (across Madonna & Child Medical Center)',lat:8.4820,lng:124.6530,hours:'Open 24 hours',notes:'Opened June 1, 2026. 24/7 access. All skill levels welcome.'},

  // --- NEGROS ORIENTAL ---
  {name:'Hacienda Pickleball Club',city:'Bais',province:'Negros Oriental',region:'Central Visayas',type:'outdoor',access:'pay',rate:'\u20B1200-300/hr',courts:2,contact:'',address:'Bais City, Negros Oriental',lat:9.5900,lng:123.1220,hours:'Daily',notes:'New club opened June 2026. Part of growing Negros Oriental pickleball scene.'},

  // --- ORMOC / LEYTE ---
  {name:'PG Pickle Gym',city:'Ormoc',province:'Leyte',region:'Eastern Visayas',type:'indoor',access:'pay',rate:'\u20B1350-450/hr',courts:3,contact:'',address:'Ormoc City, Leyte',lat:11.0064,lng:124.6075,hours:'Daily',notes:'Opened June 19, 2026. World-class indoor pickleball facility. Ormoc Pickleball Club home court.'},
  {name:'Uptown Pickleball Yard (UPY)',city:'Ormoc',province:'Leyte',region:'Eastern Visayas',type:'outdoor',access:'pay',rate:'\u20B1200/hr',courts:2,contact:'',address:'Brgy. San Pablo, Ormoc City, Leyte',lat:11.0020,lng:124.6130,hours:'Daily',notes:'Renovated and reopened April 15, 2026. By Zelda Ogario and family. Supported by Ormoc LGU.'},

  // --- TAGUIG / METRO MANILA ---
  {name:'Pickle Lane Taguig',city:'Taguig',province:'Metro Manila',region:'NCR',type:'indoor',access:'pay',rate:'\u20B1400/hr',courts:3,contact:'+63 976 288 3770',address:'18-A Elisco Road, Brgy. Ibayo-Tipas, Taguig City',lat:14.5170,lng:121.0670,hours:'Daily',notes:'Soft opening July 4, 2026 with free play. FB: Pickle Lane / IG: @picklelane_ph.'},

  // --- BACOLOD ---
  {name:'Northill Courtyard Pickleball',city:'Bacolod',province:'Negros Occidental',region:'Western Visayas',type:'outdoor',access:'pay',rate:'\u20B1400/hr',courts:4,contact:'',address:'Northill Gateway, Bacolod-Silay Airport Access Road, Bacolod City',lat:10.7390,lng:122.9800,hours:'Opening July 2026',notes:'By Megawand. 4 tournament-standard courts. Lounge, Northill Cafe by Quino\'s. Open play + membership.'},

  // --- NUEVA ECIJA ---
  {name:'The Prime at Highland Bali',city:'Pantabangan',province:'Nueva Ecija',region:'Central Luzon',type:'outdoor',access:'pay',rate:'\u20B1200-300/hr',courts:2,contact:'',address:'Highland Bali Villas Resort & Spa, Pantabangan, Nueva Ecija',lat:15.5900,lng:121.1420,hours:'6:00 AM - 10:00 AM / 4:00 PM - 10:00 PM',notes:'Soft opened May 29, 2026. Open-air court with mountain views. Annual membership P1,750. Resort setting.'},
  {name:'Naawan Pickleball Courts',city:'Naawan',province:'Misamis Oriental',region:'Northern Mindanao',type:'outdoor',access:'pay',rate:'\u20B1175-250/hr',courts:3,contact:'',address:'Linangkayan, Naawan, Misamis Oriental',lat:8.4349,lng:124.2925,hours:'6:00 AM - 10:00 PM',notes:'Opened June 2026. 3 multi-purpose courts doubling as emergency shelter. 29 toilet bowls, 26 shower rooms, parking for 30, on-site cafe. P175/hr (6AM-2PM), P250/hr (3PM-10PM). Paddle rental P25/hr.'},

  // ===== BATCH 5 — PickleHub.ph (ACTIVE Davao City area, Jul 17, 2026) =====
  {name:'MTS Davao Pickleball',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0701,lng:125.6051,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Paddle Yard',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0752,lng:125.5982,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle Space',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0651,lng:125.6102,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Azuela Play Courts',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0822,lng:125.6252,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Court 88',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0612,lng:125.6152,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Da-Hub Paddle Court',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0902,lng:125.5902,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Davao Pickleyard',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0712,lng:125.6182,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'DinkLab',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0852,lng:125.6082,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'DINKZ PICKLEBALL HUB',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0562,lng:125.5952,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'MatchPoint Pickleball',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0952,lng:125.6152,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Mergrande Pickleball Court',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0452,lng:125.5852,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'The Pink Paddle Club',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0732,lng:125.5882,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'The Premier Court (Air-conditioned)',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Indoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0842,lng:125.6152,hours:'Check PickleHub',notes:'Air-conditioned indoor court. Listed on PickleHub.ph.'},
  {name:'Pickle World Limketkai',city:'Cagayan de Oro',province:'Misamis Oriental',region:'Northern Mindanao',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Cagayan de Oro, Misamis Oriental',lat:8.48,lng:124.65,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Third Shot Pickleground Gensan',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Dink & Dunk Sports Center',city:'Zamboanga City',province:'Zamboanga del Sur',region:'Zamboanga Peninsula',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Zamboanga City, Zamboanga del Sur',lat:6.91,lng:122.07,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'City Pickle Grounds',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Paddle Point Tagum',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'The Rally Point',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Picklezone Tagum',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'M Central Pickleball Club',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Big J paddle grounds Apokon',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Big J paddlegrounds Mankilam',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Hideaway Pickleball Hub',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Paddle Hour',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Play 77 Sports Court',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'PMAX',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum, Davao del Norte',lat:7.45,lng:125.81,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Cabin Pickle Club GenSan',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle World Gensan - Downtown',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Court Zero Racquet Club',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'KWIKY MART PICKLE BULL',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle Barn GSC',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle Panic by Lagare Farms&Parks',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'V-Park',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'O2 Kidapawan',city:'Kidapawan',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kidapawan, Cotabato',lat:7.01,lng:125.09,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Primecourt Kidapawan',city:'Kidapawan',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kidapawan, Cotabato',lat:7.01,lng:125.09,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'PICKLE FARM 9400',city:'Kidapawan',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kidapawan, Cotabato',lat:7.01,lng:125.09,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Panabo Paddle House',city:'Panabo',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Panabo City, Davao del Norte',lat:7.31,lng:125.68,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle Power Nabunturan',city:'Nabunturan',province:'Davao de Oro',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Nabunturan, Davao de Oro',lat:7.61,lng:125.97,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'AEON PICKLE YARD',city:'Koronadal',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Koronadal City, South Cotabato',lat:6.50,lng:124.85,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:"Antonio's Highway Dinks",city:'Maco',province:'Davao de Oro',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Maco, Davao de Oro',lat:7.36,lng:125.86,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Courtside Brew',city:'Midsayap',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Midsayap, Cotabato',lat:7.19,lng:124.53,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'DPickleZone',city:'Tacurong',province:'Sultan Kudarat',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tacurong City, Sultan Kudarat',lat:6.69,lng:124.68,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:"Elijah's Pickle Place",city:'Braulio E. Dujali',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Braulio E. Dujali, Davao del Norte',lat:7.40,lng:125.70,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'MBH Pickleball Corner',city:'Maco',province:'Davao de Oro',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Maco, Davao de Oro',lat:7.36,lng:125.86,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Monica Del Sol Resort',city:'Cagwait',province:'Surigao del Sur',region:'Caraga',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Cagwait, Surigao del Sur',lat:8.92,lng:126.30,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Paraiso Verde Picklehall',city:'Koronadal',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Koronadal City, South Cotabato',lat:6.50,lng:124.85,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pick And Paddle Pickleball Court',city:'Cotabato City',province:'Cotabato',region:'Bangsamoro',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Cotabato City, Cotabato',lat:7.22,lng:124.25,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle at the Barn',city:'Tacurong',province:'Sultan Kudarat',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tacurong City, Sultan Kudarat',lat:6.69,lng:124.68,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle Heart Court',city:'Samal',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Samal City, Davao del Norte',lat:7.06,lng:125.75,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'PickleBoy Kabacan',city:'Kabacan',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kabacan, Cotabato',lat:7.11,lng:124.83,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Prime Pickle Point Midsayap',city:'Midsayap',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Midsayap, Cotabato',lat:7.19,lng:124.53,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'PRIMO Pickleball',city:'Banga',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Banga, South Cotabato',lat:6.42,lng:124.78,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Smashwin Pickleball Courts',city:'Midsayap',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Midsayap, Cotabato',lat:7.19,lng:124.53,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'The Pickle Mill',city:'New Corella',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'New Corella, Davao del Norte',lat:7.59,lng:125.75,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'FPB Sports Complex',city:'Malita',province:'Davao Occidental',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Malita, Davao Occidental',lat:6.40,lng:125.61,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pick-A-Boo Pickleball Davao',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0762,lng:125.6172,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle Blue',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0982,lng:125.5972,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickle Ground',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0542,lng:125.6082,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Pickleball Kitchen Monsta Davao',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0812,lng:125.6352,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'THE FORGE',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0722,lng:125.5952,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Tierra Sports Hub',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.0882,lng:125.6182,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Vista Court Pickleball',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.1052,lng:125.6122,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Paddle Rush',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Cebu City, Cebu',lat:10.32,lng:123.89,hours:'Check PickleHub',notes:'Listed on PickleHub.ph. ACTIVE.'},
  {name:'Picklerange',city:'San Fernando',province:'Pampanga',region:'Central Luzon',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'San Fernando City, Pampanga',lat:15.03,lng:120.69,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Metro Pickle Club',city:'San Jose de Buenavista',province:'Antique',region:'Western Visayas',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'San Jose de Buenavista, Antique',lat:10.74,lng:121.94,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Sideout Pickleball Courts',city:'Dumaguete',province:'Negros Oriental',region:'Central Visayas',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Dumaguete City, Negros Oriental',lat:9.31,lng:123.31,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},

  // ===== BATCH 5b — PickleHub.ph (COMING SOON, Jul 17, 2026) =====
  {name:'0-0-2 Pickleball Court',city:'Kidapawan',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kidapawan City, Cotabato',lat:7.01,lng:125.09,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'929 PICKLEYARD',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum City, Davao del Norte',lat:7.45,lng:125.81,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Ace PickleYard Sports Center',city:'Bislig',province:'Surigao del Sur',region:'Caraga',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Bislig City, Surigao del Sur',lat:8.21,lng:126.32,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'After five - pickle hub',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:"Dink n' Dine - South",city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Dinkstiny Sport Center',city:'Kapatagan',province:'Lanao del Norte',region:'Northern Mindanao',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kapatagan, Lanao del Norte',lat:7.90,lng:123.77,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Dinkwondo Pickleball Hub',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:"Elle Square Lily's Pickle Club",city:'Valencia',province:'Bukidnon',region:'Northern Mindanao',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Valencia City, Bukidnon',lat:7.91,lng:125.09,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'FLYING PICKLE SPORTS CENTER',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Hacienda Grande Assoc - Pickle Court',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Hapak Court by Pantukan Water World',city:'Pantukan',province:'Davao de Oro',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Pantukan, Davao de Oro',lat:7.13,lng:125.90,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Island Pickleball Hub',city:'Samal',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Samal City, Davao del Norte',lat:7.06,lng:125.75,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Jorge Pickle Town',city:'Montevista',province:'Davao de Oro',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Montevista, Davao de Oro',lat:7.70,lng:125.98,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'MALVAR Dinkerz',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'MIMIC Courtyard',city:'Kidapawan',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kidapawan City, Cotabato',lat:7.01,lng:125.09,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Neon Paddle Club',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:"Norberto's Pickle Kitchen",city:'Banaybanay',province:'Davao Oriental',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Banaybanay, Davao Oriental',lat:6.97,lng:126.01,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'PaddlePals Recreational Hub',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Padel More Davao',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'PADEL Smash Grounds',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Pickle Bliss',city:'Monkayo',province:'Davao de Oro',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Monkayo, Davao de Oro',lat:7.81,lng:126.06,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Pickle Pals',city:'Digos',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Digos City, Davao del Sur',lat:6.75,lng:125.35,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Pickle Pirates',city:'Cagayan de Oro',province:'Misamis Oriental',region:'Northern Mindanao',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Cagayan de Oro City, Misamis Oriental',lat:8.48,lng:124.65,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Pickle Spot - Samal',city:'Samal',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Samal City, Davao del Norte',lat:7.06,lng:125.75,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Pickleball Hideout',city:'Kabacan',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kabacan, Cotabato',lat:7.11,lng:124.83,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Pickleholics',city:'General Santos',province:'South Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'General Santos City, South Cotabato',lat:6.11,lng:125.17,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'PickleYam Kabacan',city:'Kabacan',province:'Cotabato',region:'Soccsksargen',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Kabacan, Cotabato',lat:7.11,lng:124.83,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:"Sam's Pickleball Court",city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum City, Davao del Norte',lat:7.45,lng:125.81,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'Slide Two Pickleball',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'SOSYAL DINKERS PICKLEBALL COURT',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'The Dink Spot',city:'Cotabato City',province:'Cotabato',region:'Bangsamoro',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Cotabato City, Cotabato',lat:7.22,lng:124.25,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'THE MQZ COURT',city:'Cotabato City',province:'Cotabato',region:'Bangsamoro',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Cotabato City, Cotabato',lat:7.22,lng:124.25,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'The Paddle Hideout',city:'Davao City',province:'Davao del Sur',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Davao City, Davao del Sur',lat:7.08,lng:125.60,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},
  {name:'The Pinkle Zone',city:'Tagum',province:'Davao del Norte',region:'Davao Region',type:'Outdoor',access:'Paid',rate:'',courts:2,contact:'PickleHub.ph listing',address:'Tagum City, Davao del Norte',lat:7.45,lng:125.81,hours:'Coming soon',notes:'Coming soon. Listed on PickleHub.ph.'},

  // ===== BATCH 6 — Picklers.website Cebu (Jul 17, 2026) =====
  // --- CEBU CITY ---
  {name:'88th Avenue Cebu',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1500/hr (6AM-4PM), \u20B1800/hr (4PM-12AM)',courts:2,contact:'Book online',address:'88th Pickleclub, 88th Avenue, Gov. M. Cuenco, Banilad',lat:10.3264,lng:123.8900,hours:'6:00 AM - 12:00 MN',notes:'Source: picklers.website'},
  {name:'Andot Pickle Court',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1450-500/hr',courts:2,contact:'Book online',address:'38-B Jade St., Buena Hills, Guadalupe',lat:10.3050,lng:123.8700,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Archangel Pickleball Center',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Facebook',address:'Gualandi Mission for the Deaf School, Kasambagan',lat:10.3200,lng:123.8950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Blush Court Club',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'Book online',address:'Cogon Pardo',lat:10.2900,lng:123.8600,hours:'Daily',notes:'Source: picklers.website'},
  {name:'BSP Pickleball',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Facebook',address:'BSP, Capitol Hills Scout Camp, Lahug',lat:10.3300,lng:123.8900,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Cadahuan Outdoor Court',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1200/hr',courts:1,contact:'Walk-in',address:'Cadahuan, Talamban',lat:10.3350,lng:123.9100,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Crown Hoops',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Facebook',address:'191 L. Gabuya Street, Cogon Pardo',lat:10.2900,lng:123.8600,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Friendship Point',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1350-450/hr',courts:2,contact:'Book online',address:'16, Friendship Village, Basak San Nicolas',lat:10.2800,lng:123.8500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'GJ Paddle Clvb',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Book online',address:'826 Bayabas, Mambaling',lat:10.2850,lng:123.8550,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Homecourt Cebu',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1400-450/hr',courts:2,contact:'Facebook',address:'2353 Santol St, Banawa',lat:10.3050,lng:123.8750,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Just Dink\'d Pickleball',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1200-300/hr',courts:2,contact:'Book online',address:'Quarter St., Horseshoe Hills, Banawa',lat:10.3050,lng:123.8750,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Lark & Paddle',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Call',address:'Andres Abellana St., Guadalupe',lat:10.3050,lng:123.8700,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Let\'s Pickle ball (Mall)',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Call',address:'City Mall, 2nd Floor, N. Bacalso St., Pahina Central',lat:10.2950,lng:123.8550,hours:'Mall hours',notes:'Source: picklers.website'},
  {name:'Linkers Pickleball Court',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1450/hr',courts:2,contact:'Book online',address:'Childlink Learning Center, Zodiacville, Guadalupe',lat:10.3050,lng:123.8700,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Metro Park Hotel',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Call',address:'Saint Lawrence St., La Guardia, Lahug',lat:10.3300,lng:123.8900,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Metro Sports Center',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1200-500/hr',courts:2,contact:'Facebook',address:'Salinas Drive, Lahug',lat:10.3300,lng:123.8950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'ML Lifestyle Park',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400-500/hr',courts:2,contact:'Book online',address:'San Jose Rd, Talamban',lat:10.3350,lng:123.9100,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Newtown Estate Subdivision',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1100/entry',courts:1,contact:'',address:'Newtown Estate Subdivision, Bulacao',lat:10.2800,lng:123.8500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Northview Pickleball',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Book online',address:'Lower Bacayan, Talamban',lat:10.3400,lng:123.9200,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Outlook Cafe',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Book online',address:'Dungawan Restaurant, Parking lot, Tisa',lat:10.2850,lng:123.8450,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Paddle Ground',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Sitio Ylaya, Talamban',lat:10.3350,lng:123.9100,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Paddlestack Pickleball Courts',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1500-550/hr',courts:2,contact:'Book online',address:'Lahug-Guadalupe Road, Capitol Site',lat:10.3200,lng:123.8850,hours:'Daily',notes:'Source: picklers.website'},
  {name:'JPZR Pickleball Court',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Facebook',address:'Aguila Village, Basak San Nicolas',lat:10.2800,lng:123.8500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Piknik Premier Pickleball',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1600-650/hr',courts:2,contact:'Facebook',address:'A. Abellana Ext., Guadalupe',lat:10.3050,lng:123.8700,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pickle Pop',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Book online',address:'529a Natalio B. Bacalso Ave, Kinasang-an Pardo',lat:10.2900,lng:123.8550,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Prime Rally PH',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1400-500/hr',courts:2,contact:'Book online',address:'1221 L. Gabuya St, Cogon Pardo',lat:10.2900,lng:123.8600,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pulangbato Pickle Play',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1100-350/hr',courts:2,contact:'Facebook',address:'Candarong - Pulangbato Road',lat:10.3500,lng:123.9200,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Ralhdakz Pickleball',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Facebook',address:'E. Sabellano, Quiot Pardo',lat:10.2850,lng:123.8500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'SOotK Pickleball Hub',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Facebook',address:'Siakoy Street, Lahug',lat:10.3300,lng:123.8900,hours:'Daily',notes:'Source: picklers.website'},
  {name:'SouthCourt Paddle',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1380/hr',courts:2,contact:'Book online',address:'IL Corso Filinvest Malls, SRP, Mambaling',lat:10.2800,lng:123.8500,hours:'Mall hours',notes:'Source: picklers.website'},
  {name:'Stomping Grounds',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1400-700/hr',courts:2,contact:'Book online',address:'Pres. Roxas St., Mabolo',lat:10.3200,lng:123.8950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Sip & Serve',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Book online',address:'Upper Genes Compound, Quiot Pardo',lat:10.2850,lng:123.8500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Reactor Cebu',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1400/hr (wkend)',courts:2,contact:'Facebook',address:'137 E Sabellano Street, Quiot Pardo',lat:10.2850,lng:123.8500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Paddle House',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1400-500/hr',courts:2,contact:'Book online',address:'Katipunan Extension, Tisa',lat:10.2850,lng:123.8450,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Thetopfloorpicklrs (Rooftop)',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Book online',address:'Mountainview, Quiot Pardo',lat:10.2850,lng:123.8500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'ULRAK Pickleball Hub - Tambayan District',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'Facebook',address:'Tambayan District, Bulacao',lat:10.2800,lng:123.8500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Velocity Pickleball Hub',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1550-600/hr',courts:2,contact:'Book online',address:'Beside QC Pavilion, Gorordo Ave, Kamputhaw',lat:10.3200,lng:123.8950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Your Neighborhood Court',city:'Cebu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Facebook',address:'Tres De Abril, Labangon',lat:10.3000,lng:123.8700,hours:'Daily',notes:'Source: picklers.website'},
  // --- MANDAUE CITY ---
  {name:'BELOU\'s Covered Court',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'',courts:2,contact:'Book online',address:'UNIT-II Zone Kamunggay, Paknaan',lat:10.3350,lng:123.9400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'BRB Pickleball Courts',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1450-500/hr',courts:2,contact:'Book online',address:'Hernan Cortes, Tipolo',lat:10.3250,lng:123.9250,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Choi Sports Center',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Book online',address:'Mantuyong',lat:10.3200,lng:123.9300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Dula Pickleball Courts',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1600-650/hr',courts:2,contact:'Book online',address:'Big Blue Distribution Center, F.E. Zuellig Ave, Subangdaku',lat:10.3250,lng:123.9350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'ECCON Pickleball',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Consolacion area',lat:10.3766,lng:123.9592,hours:'Daily',notes:'Source: picklers.website'},
  {name:'FA Sports Center',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Facebook',address:'Pagsabungan',lat:10.3300,lng:123.9350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Fairplay',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Tipolo',lat:10.3250,lng:123.9250,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Groundzero Sports & Fitness Hub',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'Facebook',address:'Lopez Jaena Street, Tipolo',lat:10.3250,lng:123.9250,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Hoops & Racket',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1550/hr',courts:2,contact:'Facebook',address:'A. S. Fortuna St.',lat:10.3300,lng:123.9300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Jump Serve Sports Center',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Facebook',address:'Riverside, Canduman',lat:10.3350,lng:123.9400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Matchpoint 2.0',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1450-500/hr',courts:2,contact:'Facebook',address:'Mandaue City',lat:10.3301,lng:123.9318,hours:'Daily',notes:'Source: picklers.website'},
  {name:'MYM Sports Hub',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1600/hr',courts:2,contact:'Book online',address:'G Ouano St., Opao',lat:10.3250,lng:123.9350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'North Point Pickleball Court',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1350-500/hr',courts:2,contact:'Facebook',address:'Maguikay',lat:10.3300,lng:123.9300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Patts',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Facebook',address:'Cabancalan',lat:10.3350,lng:123.9400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pckld Fctry',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Maguikay',lat:10.3300,lng:123.9300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'PICKL at Pilit',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1400-600/hr',courts:2,contact:'Facebook',address:'Cabancalan',lat:10.3350,lng:123.9400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'PUMPD Cebu',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Subangdaku',lat:10.3250,lng:123.9350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Rocket Pickle Cebu (RPC)',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1500-600/hr',courts:2,contact:'Book online',address:'8 block 4, North Reclamation, Subangdaku',lat:10.3250,lng:123.9350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Side-out Pickleball Center',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'Facebook',address:'Canduman',lat:10.3350,lng:123.9400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'SideOut Premier Pickleball - Cebu',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Mandaue City',lat:10.3301,lng:123.9318,hours:'Daily',notes:'Source: picklers.website'},
  {name:'State of Mind',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1750/hr',courts:2,contact:'Facebook',address:'Hernan Cortes',lat:10.3250,lng:123.9250,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Sweet Spot Pickleball Courts',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1450/hr',courts:2,contact:'Facebook',address:'Tipolo',lat:10.3250,lng:123.9250,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Royall Courts',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'E.O. Perez St.',lat:10.3250,lng:123.9250,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pickle Up Mandaue',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Cambaro',lat:10.3300,lng:123.9300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'VYBE Picklehaus',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1450-550/hr',courts:2,contact:'Facebook',address:'B. Suico St., Tingub',lat:10.3250,lng:123.9350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'WW. Pickleball',city:'Mandaue City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Herces Drive, Banilad',lat:10.3300,lng:123.9350,hours:'Daily',notes:'Source: picklers.website'},
  // --- TALISAY CITY ---
  {name:'9.10.',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Book online',address:'Z3-214, San Isidro Village',lat:10.2447,lng:123.8368,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Adventist Academy Cebu (AAC Pickle)',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1120/entry',courts:2,contact:'Book online',address:'Natalio Bacalso Avenue, Bulacao',lat:10.2500,lng:123.8400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Antara',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Facebook',address:'Antara, Lawaan III',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Aulga Night Dinkers',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1125/entry',courts:2,contact:'Facebook',address:'Aulga Sports Gym, Lawaan II',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Chibs N\' Dink',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Facebook',address:'P. Labuca St., Cansojong',lat:10.2450,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Dink and Rally',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1400-450/hr',courts:2,contact:'Book online',address:'Mansueto Road, Bulacao',lat:10.2500,lng:123.8400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Dink at Gracelle\'s (Rooftop)',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1250-300/hr',courts:2,contact:'Facebook',address:'530 Peace Valley Homes, Bulacao',lat:10.2500,lng:123.8400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Dink City Cebu',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1450-550/hr',courts:2,contact:'Book online',address:'Laray, San Roque',lat:10.2400,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Dinkers Pickleball Hub',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Facebook',address:'Rabaya St., Kimba, Cansojong',lat:10.2450,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'DJ\'s Backyard Pickleball Court',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Book online',address:'Sacred Heart Village, San Isidro',lat:10.2447,lng:123.8368,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Gentlepeace Residences',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Call',address:'Lower Mohon',lat:10.2450,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Go Zone Sports Center',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Book online',address:'Zone 3 Canizares St., Dumlog',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'JB Pickleball Court',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1220-300/hr',courts:2,contact:'Facebook',address:'C. Sedetanrio, Sitio San Antonio, Linao',lat:10.2450,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Light House Pickleball Court',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1180-200/hr',courts:2,contact:'Facebook',address:'Sitio Caduldulan, Lawaan III',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Lucky Peak',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250-300/hr',courts:2,contact:'Facebook',address:'Kishanta, Lagtang',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Mood Coffee',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Facebook',address:'P. Del Rosario St., Poblacion',lat:10.2447,lng:123.8368,hours:'Daily',notes:'Source: picklers.website'},
  {name:'NICkleball Avenue',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250-300/hr',courts:2,contact:'Facebook',address:'Sitio Ilang-ilang, Lagtang',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pick & Dink',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Facebook',address:'Sitio 5B Tambis, Pooc',lat:10.2450,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pickaboo a.k.a PickleFarm',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1400-500/hr',courts:2,contact:'Book online',address:'Zafra Compound, Tabunok',lat:10.2450,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pickle Social',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1400-450/hr',courts:2,contact:'Book online',address:'Pang Pang St., Tabunok',lat:10.2450,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pickleball Court at Breakpoint',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300-350/hr',courts:2,contact:'Facebook',address:'Sta. Rita Ville, Dumlog',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pkell Grounds',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1310-360/hr',courts:2,contact:'Book online',address:'28 Galaxy St., Tangke',lat:10.2450,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  {name:'RallyX',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1450-500/hr',courts:2,contact:'Book online',address:'General Luna St., Poblacion',lat:10.2447,lng:123.8368,hours:'Daily',notes:'Source: picklers.website'},
  {name:'South Agora Pickleball Court',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Facebook',address:'South Agora, San Isidro',lat:10.2447,lng:123.8368,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Southscape',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Facebook',address:'Southscape, Lawaan I',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Talisay Paddle Court',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'free',rate:'Free',courts:2,contact:'',address:'Beside Talisay City Hall, Lawaan II',lat:10.2447,lng:123.8368,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Courtside Cebu',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Book online',address:'2F, Starmall, Lawaan III',lat:10.2400,lng:123.8300,hours:'Mall hours',notes:'Source: picklers.website'},
  {name:'Topspin Pickleball Court',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250-300/hr',courts:2,contact:'Book online',address:'Dumlog Food Park',lat:10.2400,lng:123.8300,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Updraft Coffee',city:'Talisay City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Book online',address:"Perry's, Laray, San Roque",lat:10.2400,lng:123.8350,hours:'Daily',notes:'Source: picklers.website'},
  // --- MINGLANILLA ---
  {name:'Around the Post',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Facebook',address:'Sitio Tabay, Tunghaan',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Jacob\'s Pickleball Open Court',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Facebook',address:"Jacob's Commercial Building, Tungkop",lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Jomara',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'',address:'Poblacion Ward III',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Belmont Village Pickleball Court',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1150/hr',courts:2,contact:'Facebook',address:'Belmont Village, Linao-Lipata',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pals\' Pickleball Court',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1300-350/hr',courts:2,contact:'Facebook',address:'18 De Julio Street, Poblacion Ward III',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'PARQLINKS Pickleball Court',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Facebook',address:'A. Apostol St., Calajo-an',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'SLT Court',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300-350/hr',courts:2,contact:'Book online',address:"Kingswood Village, Tupas St., Lipata",lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'PickleHaus',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250-300/hr',courts:2,contact:'Facebook',address:'Purok 2, Upper Tunghaan',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Pickle Pod',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1500/hr (wkend)',courts:2,contact:'Book online',address:'Villa Rammelyn Garden, M. Selma St., Calajo-an',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Tig\'s Rally Zone',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Book online',address:'Highway, Upper Tulay Rd, Tulay',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Topsouth Pickleball (Rooftop)',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1190-240/hr',courts:2,contact:'Book online',address:'LABSCOR Commercial Bldg, Tunghaan',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  {name:'ULRAK Pickleball Hub - Minglanilla',city:'Minglanilla',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1500/hr or \u20B1150/entry',courts:2,contact:'Book online',address:'Anjo World Theme Park, Calajo-an',lat:10.2265,lng:123.7965,hours:'Daily',notes:'Source: picklers.website'},
  // --- LAPU-LAPU CITY ---
  {name:'ALT Gymnasium',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Kinalumsan St., Gun-ob',lat:10.3100,lng:123.9650,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Dink Island Pickleball Mactan',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400-500/hr',courts:2,contact:'Facebook',address:'Pak-Pakan Rd, Basak',lat:10.3050,lng:123.9600,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Kenzo Pickleball Court',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1410-510/hr',courts:2,contact:'Facebook',address:'Maximo V. Patalinjug Jr. Ave, Pajo',lat:10.3100,lng:123.9650,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pickle Pares Hub',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Book online',address:'Pajo',lat:10.3100,lng:123.9650,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Pickle Grounds',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Book online',address:'Pajo Street',lat:10.3100,lng:123.9650,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Pickle Park at Mactan',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400-450/hr',courts:2,contact:'Facebook',address:'Humay Humay Road, Pajo',lat:10.3100,lng:123.9650,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Picklers Camp Lapu-Lapu',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'Book online',address:'Kinalumsan, Canjulao',lat:10.3100,lng:123.9700,hours:'Daily',notes:'Source: picklers.website'},
  {name:'PickleBear Pickleball Court',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Mactan Airport Road',lat:10.3050,lng:123.9600,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Supreme Pickleball Court',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1500/hr',courts:2,contact:'Book online',address:'Sitio Kalubihan 1, Pajac',lat:10.3100,lng:123.9650,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Villa del Rio Pickleball Court',city:'Lapu-Lapu City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Walk-in',address:'Villa del Rio, Babag II',lat:10.3100,lng:123.9700,hours:'Daily',notes:'Source: picklers.website'},
  // --- CONSOLACION ---
  {name:'Highland Mango Ecofarm',city:'Consolacion',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Consolacion',lat:10.3766,lng:123.9592,hours:'Daily',notes:'Source: picklers.website'},
  {name:'CSports Pickleball',city:'Consolacion',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Facebook',address:'Purok 4 Libo Street',lat:10.3766,lng:123.9592,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Gab\'s Playground',city:'Consolacion',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Consolacion',lat:10.3766,lng:123.9592,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Matchpoint 2.0',city:'Consolacion',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1450-500/hr',courts:2,contact:'Facebook',address:'Consolacion',lat:10.3766,lng:123.9592,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Smash Yard',city:'Consolacion',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Jugan, Consolacion',lat:10.3766,lng:123.9592,hours:'Daily',notes:'Source: picklers.website'},
  // --- NAGA CITY ---
  {name:'Cebu Pickle Club',city:'Naga City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1400-500/hr',courts:2,contact:'Book online',address:'Lot 20, Uling Rd., Pangdan',lat:10.2082,lng:123.7582,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Spinix',city:'Naga City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300-350/hr',courts:2,contact:'Facebook',address:'Tapon 3, Tinaan',lat:10.2082,lng:123.7582,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Sunset Volley Pickleball',city:'Naga City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250-300/hr',courts:2,contact:'Book online',address:'Balili, Tinaan',lat:10.2082,lng:123.7582,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Wolfpax HQ Pickleball Court',city:'Naga City',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1200-250/hr',courts:2,contact:'Book online',address:'Brgy. Tinaan',lat:10.2082,lng:123.7582,hours:'Daily',notes:'Source: picklers.website'},
  // --- CORDOVA ---
  {name:'Casa Rugina Pickleball Club',city:'Cordova',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1200-400/hr',courts:2,contact:'Facebook',address:'Day-as',lat:10.2500,lng:123.9500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Paddle Co',city:'Cordova',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1400/hr',courts:2,contact:'Book online',address:'Mahayahay, Gabi',lat:10.2500,lng:123.9500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Picklers Camp Cebu',city:'Cordova',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Sitio Camino, Gabi',lat:10.2500,lng:123.9500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'TonerPro Pickleball Yard',city:'Cordova',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1150-300/hr',courts:2,contact:'Facebook',address:'Purok Mahogany 2, Pilipog',lat:10.2500,lng:123.9500,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Zions Pickleball',city:'Cordova',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1450-500/hr',courts:2,contact:'Book online',address:'Celadon Town, Pajac',lat:10.2500,lng:123.9500,hours:'Daily',notes:'Source: picklers.website'},
  // --- LILOAN ---
  {name:'B&J Pickleball Court',city:'Liloan',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Kawayanan, Yati',lat:10.3950,lng:123.9950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Budz Pickleball Court',city:'Liloan',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1300-350/hr',courts:2,contact:'Call',address:'Purok Mangga 2',lat:10.3950,lng:123.9950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'CEH Gym',city:'Liloan',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Call',address:'San Vicente',lat:10.3950,lng:123.9950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Matchpoint Liloan',city:'Liloan',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B1299/hr',courts:2,contact:'Facebook',address:'Liloan',lat:10.3950,lng:123.9950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Paddle Alley',city:'Liloan',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Purok Sambag, Catarman',lat:10.3950,lng:123.9950,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Playground by Hillhouse',city:'Liloan',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Facebook',address:'Purok Monggos, Mahayahay 2, Catarman',lat:10.3950,lng:123.9950,hours:'Daily',notes:'Source: picklers.website'},
  // --- DUMANJUG ---
  {name:'Clav22 Pickleball Lounge',city:'Dumanjug',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'\u20B198-150/hr',courts:2,contact:'Book online',address:'Doldol',lat:10.0520,lng:123.4550,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Hillside Pickleball',city:'Dumanjug',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1200/hr',courts:2,contact:'Book online',address:'Purok 6, Doldol',lat:10.0520,lng:123.4550,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pickle.D Pickleball',city:'Dumanjug',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1150/hr',courts:2,contact:'Book online',address:'Purok 1, Doldol',lat:10.0520,lng:123.4550,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Treeshade',city:'Dumanjug',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300/hr',courts:2,contact:'Call',address:'Panagdait, Poblacion Sima',lat:10.0520,lng:123.4550,hours:'Daily',notes:'Source: picklers.website'},
  // --- DAANBANTAYAN ---
  {name:'Arrojado Farm and Sports Park',city:'Daanbantayan',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1150/hr',courts:2,contact:'Book online',address:'Poblacion',lat:11.1800,lng:124.0100,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Gracefields Pickleball & More',city:'Daanbantayan',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Daanbantayan',lat:11.1800,lng:124.0100,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Payag pickleyard',city:'Daanbantayan',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Facebook',address:'Sitio Malaumon, Tinubdan',lat:11.1800,lng:124.0100,hours:'Daily',notes:'Source: picklers.website'},
  // --- SOGOD ---
  {name:'LaValle PH',city:'Sogod',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300-350/hr',courts:2,contact:'Facebook',address:'Pansoy',lat:10.0220,lng:124.0800,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Paddle Yard',city:'Sogod',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1150-180/hr',courts:2,contact:'Call',address:'San Isidro, Poblacion',lat:10.0220,lng:124.0800,hours:'Daily',notes:'Source: picklers.website'},
  // --- OTHER CEBU ---
  {name:'Corner Pickleball Court',city:'Argao',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1250/hr',courts:2,contact:'Book online',address:'Canbanua',lat:9.8810,lng:123.5870,hours:'Daily',notes:'Source: picklers.website'},
  {name:'HomeCourt Yard',city:'Balamban',province:'Cebu',region:'Central Visayas',type:'Indoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Book online',address:'Cambuhawe Rd., Tubod, Pondol',lat:10.3750,lng:123.7900,hours:'Daily',notes:'Source: picklers.website'},
  {name:'The Pickle Pub',city:'Carcar City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'',courts:2,contact:'Facebook',address:'Situo Camagayan, Perrelos',lat:10.0950,lng:123.6400,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Orange Pickleball Courts',city:'Danao City',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1350/hr',courts:2,contact:'Book online',address:'Rizal Street, Poblacion',lat:10.5200,lng:123.9900,hours:'Daily',notes:'Source: picklers.website'},
  {name:'KennyDink Pickleball Court',city:'Moalboal',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1250-300/hr',courts:2,contact:'Book online',address:'Tunga',lat:9.9400,lng:123.3800,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Lowcal Grounds',city:'Samboan',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1300-350/hr',courts:2,contact:'Book online',address:'Lower Calin-ay, Poblacion',lat:9.5250,lng:123.3200,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Pitalo Bangers Court',city:'San Fernando',province:'Cebu',region:'Central Visayas',type:'Covered',access:'pay',rate:'',courts:2,contact:'Book online',address:'Across The Shoe Cafe, Pitalo',lat:10.1560,lng:123.7040,hours:'Daily',notes:'Source: picklers.website'},
  {name:'Front Yard Pickle',city:'Cordova',province:'Cebu',region:'Central Visayas',type:'Outdoor',access:'pay',rate:'\u20B1200-300/hr',courts:2,contact:'Facebook',address:'736 San Miguel Road',lat:10.2500,lng:123.9500,hours:'Daily',notes:'Source: picklers.website'}
];

const IMPORT_TOURNAMENTS = [
  {name:'PPL Visayas Open 2026',location:'PlayPro Active Courts, Sibulan, Negros Oriental',date:'2026-07-15',endDate:'2026-07-19',type:'Open',format:'Doubles & Mixed',description:'The Visayas leg of the Philippine Pickleball League. Powered by PlayPro Active Courts.',contact:'phpickleballleague@gmail.com',link:'https://www.phpickleballleague.com/',ownerId:null},
  {name:'PPL Mindanao Open 2026',location:'Pickle Town, Davao City',date:'2026-05-01',endDate:'2026-05-08',type:'Open',format:'Doubles & Mixed',description:'The biggest PPL tournament to date with \u20B11.8M prize pool.',contact:'phpickleballleague@gmail.com',link:'https://www.phpickleballleague.com/',ownerId:null},
  {name:'PPL Luzon Open 2026',location:'TBD, Luzon',date:'2026-08-01',endDate:'2026-08-04',type:'Open',format:'Doubles & Mixed',description:'The Luzon leg of the Philippine Pickleball League.',contact:'phpickleballleague@gmail.com',link:'https://www.phpickleballleague.com/',ownerId:null},
  {name:'Rising Stars: Cebu \u2014 U19 Team Event',location:'Cebu City',date:'2026-06-20',endDate:'2026-06-21',type:'Junior',format:'Team',description:'The Cebu leg of the Rising Stars U19 Team Event, part of Pickle Fest 2026 youth pathway.',contact:'',link:'https://pickleballchampionsleague.org/tournament/rising-stars-cebu',ownerId:null},
  {name:'PlanOut Pickleball Open',location:'Dumaguete City',date:'2026-05-15',endDate:'2026-05-17',type:'Open',format:'Doubles & Mixed',description:'The biggest pickleball tournament in the Philippines with a \u20B11M prize pool.',contact:'',link:'',ownerId:null},
  {name:'GenSan Pickleball Tournament',location:'GMall of GenSan, General Santos City',date:'2026-04-11',endDate:'2026-04-12',type:'Open',format:'Doubles',description:'Pickleball tournament at GMall of GenSan.',contact:'',link:'',ownerId:null},
  {name:'PPL MMC Season 1 - Metro Manila Championships',location:'Metro Manila',date:'2026-06-01',endDate:'2026-06-07',type:'Open',format:'Doubles & Mixed',description:'Philippine Pickleball League Metro Manila Championships Season 1. Covered by One Sports (Cignal).',contact:'phpickleballleague@gmail.com',link:'https://www.phpickleballleague.com/',ownerId:null},
  {name:'1st Philippine Pickleball Amateur Nationals by SKECHERS',location:'Metro Manila',date:'2026-03-26',endDate:'2026-03-29',type:'Amateur',format:'Doubles & Mixed',description:'First official National Rankings event for Filipino amateur players. Pathway toward SEA Games, Asian Games, and beyond.',contact:'',link:'https://www.pickleball.ph/',ownerId:null},
  {name:'Baguio League Pickleball Season 1',location:'John Hay Sports Pavilion, Baguio City',date:'2026-01-09',endDate:'2026-01-11',type:'Open',format:'Doubles & Mixed',description:'First ever Baguio pickleball league. Novice, 50+, Advanced, and Open divisions. P570K in season operations & prizes.',contact:'',link:'https://johnhaysportspavilion.com',ownerId:null},
  {name:'RECA Resort Pickleball Tournament',location:'RECA Resort, Porac, Pampanga',date:'2026-02-07',endDate:'2026-02-08',type:'Open',format:'Doubles & Mixed',description:'Weekend tournament at the Bali-inspired RECA Resort near Clark. Competitive play + resort atmosphere.',contact:'',link:'https://www.recaresort.com/',ownerId:null},
  {name:'Kosmas Pickle Fest Davao',location:'PickleTown, Davao City',date:'2026-02-25',endDate:'2026-02-28',type:'Open',format:'Doubles & Mixed',description:'Multi-leg pickleball festival in Davao. Newbie, Intermediate & Open divisions. Part of PCL Asia Rising Stars.',contact:'',link:'https://picklefest.kosmas.com.ph/',ownerId:null},
  {name:'Kosmas Pickle Fest Cebu',location:'Net and Paddle, Cebu City',date:'2026-03-11',endDate:'2026-03-15',type:'Open',format:'Doubles & Mixed',description:'Multi-leg pickleball festival in Cebu. U19 Rising Stars + adult categories. Part of PCL Asia.',contact:'',link:'https://picklefest.kosmas.com.ph/',ownerId:null},
  {name:'Mindanao Pickleball League Leg 1',location:'FPB Sports Complex, Malita, Davao Occidental',date:'2026-03-06',endDate:'2026-03-08',type:'Open',format:'Doubles & Mixed',description:'First leg of the 7-leg Mindanao Pickleball League Season 1. Cash prizes + season prizes.',contact:'',link:'',ownerId:null},
  {name:'2026 PPF Championship',location:'Tela Park Pickleball Center, Las Pi\u00F1as',date:'2026-03-28',endDate:'2026-03-30',type:'National',format:'Doubles & Mixed',description:'Philippine Pickleball Federation Nationals. Qualifier for EPIC World Amateur Championships. Golden Tickets for select division winners.',contact:'',link:'https://www.pickleball.ph/',ownerId:null},
  {name:'Mindanao Pickleball League Leg 2',location:'FPB Sports Complex, Malita, Davao Occidental',date:'2026-05-29',endDate:'2026-05-31',type:'Open',format:'Doubles & Mixed',description:'Leg 2 of the 7-leg Mindanao Pickleball League Season 1.',contact:'',link:'',ownerId:null},
  {name:'Nelson Sports Pickleball Series - Cavite Leg',location:'The PickleGround PH, Cavite',date:'2026-05-30',endDate:'2026-06-07',type:'Open',format:'Doubles & Mixed',description:'Pickleball tournament series by Nelson Sports. Hosted at The PickleGround PH.',contact:'',link:'',ownerId:null},
  {name:'Mindanao Pickleball League Leg 3',location:'FPB Sports Complex, Malita, Davao Occidental',date:'2026-07-24',endDate:'2026-07-26',type:'Open',format:'Doubles & Mixed',description:'Leg 3 of the 7-leg Mindanao Pickleball League Season 1.',contact:'',link:'',ownerId:null},
  {name:'The Dink Minor League North Luzon',location:'KingCourts Pickleball, San Fernando, Pampanga',date:'2026-07-25',endDate:'2026-07-25',type:'Team',format:'Team Event (MLPlay)',description:'The Dink Minor League Pickleball — innovative team format (2M+2W per team). DUPR-based brackets. $37/player.',contact:'',link:'https://swishtournaments.com/',ownerId:null},
  {name:'Pickleball World Cup 2026',location:'Da Nang, Vietnam',date:'2026-08-30',endDate:'2026-09-05',type:'International',format:'Open Category',description:'Inaugural Pickleball World Cup. 80+ countries expected. Philippine delegation organized by PPF.',contact:'',link:'https://www.pickleball.ph/',ownerId:null},
  {name:'Mindanao Pickleball League Main Event',location:'FPB Sports Complex, Malita, Davao Occidental',date:'2026-12-11',endDate:'2026-12-13',type:'Open',format:'Doubles & Mixed',description:'Grand final of the 7-leg Mindanao Pickleball League Season 1. Main event with top prizes.',contact:'',link:'',ownerId:null},
  {name:'G Coffee Anniversary Pickleball Event',location:'Tunasan, Muntinlupa',date:'2026-07-04',endDate:'2026-07-04',type:'Social',format:'Open Play',description:'Pickleball event hosted by G Coffee. Open play for all skill levels.',contact:'',link:'',ownerId:null},
  {name:'ActiveSync Pickleball Open Tournament',location:'Bacolod Multi-Purpose Covered Court, Lanao del Norte',date:'2026-07-10',endDate:'2026-07-12',type:'Open',format:'Doubles',description:'Novice, Beginner, Intermediate divisions. Cash prizes up to P8,000. GCash/GoTyme payment.',contact:'0963 663 8939',link:'',ownerId:null},
  {name:'Southline Paddle Point 1st Tournament',location:'Purok 3 Oca\u00F1a, Carcar, Cebu',date:'2026-07-10',endDate:'2026-07-12',type:'Open',format:'Doubles',description:'Beginner Men\'s/Women\'s Doubles and Intermediate Men\'s/Women\'s Doubles. Contingency day on July 12.',contact:'',link:'',ownerId:null},
  {name:'SM Active Hub Pickleball Trio Challenge Grand Finals',location:'Four E-Com Center, SM Active Hub, Metro Manila',date:'2026-07-01',endDate:'2026-07-31',type:'Open',format:'Team (3-player)',description:'Grand Finals of SM\'s inaugural tournament series. Qualifying legs held at SM City Bicutan, Sta. Mesa, Santa Rosa, Marikina & Muntinlupa. Top teams compete for championship title.',contact:'',link:'https://gosm.link/LetsPlayPickleballAtSM',ownerId:null}
];

async function batchImportCourts() {
  const log = document.getElementById('batchImportLog');
  const btn = document.getElementById('batchImportCourtsBtn');
  btn.disabled = true; btn.textContent = 'Importing...';
  log.textContent = '';

  function logMsg(m) { log.textContent += m + '\n'; log.scrollTop = log.scrollHeight; }

  logMsg('Starting import of ' + IMPORT_COURTS.length + ' courts...\n');
  let added = 0, skipped = 0, errors = 0;

  for (const court of IMPORT_COURTS) {
    try {
      const existing = await db.collection('courts').where('name', '==', court.name).get();
      if (!existing.empty) { skipped++; logMsg('\u23ED Skipped (duplicate): ' + court.name); continue; }
      await db.collection('courts').add({...court, verified:false, approved:true, featured:false, photos:[], amenities:[], createdAt: firebase.firestore.FieldValue.serverTimestamp()});
      added++; logMsg('\u2705 Added: ' + court.name);
    } catch (e) { errors++; logMsg('\u274C Error: ' + court.name + ' - ' + e.message); }
  }

  logMsg('\n\u2500\u2500\u2500 Complete \u2500\u2500\u2500');
  logMsg('Added: ' + added + ' | Skipped: ' + skipped + ' | Errors: ' + errors);
  btn.disabled = false; btn.textContent = 'Import ' + IMPORT_COURTS.length + ' New Courts';
}

async function batchImportTournaments() {
  const log = document.getElementById('batchImportLog');
  const btn = document.getElementById('batchImportTournamentsBtn');
  btn.disabled = true; btn.textContent = 'Importing...';
  log.textContent = '';

  function logMsg(m) { log.textContent += m + '\n'; log.scrollTop = log.scrollHeight; }

  logMsg('Starting import of ' + IMPORT_TOURNAMENTS.length + ' tournaments...\n');
  let added = 0, skipped = 0, errors = 0;

  for (const t of IMPORT_TOURNAMENTS) {
    try {
      const existing = await db.collection('tournaments').where('name', '==', t.name).get();
      if (!existing.empty) { skipped++; logMsg('\u23ED Skipped (duplicate): ' + t.name); continue; }
      await db.collection('tournaments').add({...t, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
      added++; logMsg('\u2705 Added: ' + t.name);
    } catch (e) { errors++; logMsg('\u274C Error: ' + t.name + ' - ' + e.message); }
  }

  logMsg('\n\u2500\u2500\u2500 Complete \u2500\u2500\u2500');
  logMsg('Added: ' + added + ' | Skipped: ' + skipped + ' | Errors: ' + errors);
  btn.disabled = false; btn.textContent = 'Import ' + IMPORT_TOURNAMENTS.length + ' Tournaments';
}

// ============================================================
// EMAIL CAMPAIGN
// ============================================================
async function loadSubscriberCount() {
  try {
    const subs = await PickleMailing.getAll();
    const el = document.getElementById('campaignSubscriberCount');
    if (el) el.textContent = subs.length + ' subscriber(s) on the mailing list.';
  } catch {}
}

async function sendCampaign() {
  const btn = document.getElementById('sendCampaignBtn');
  const log = document.getElementById('campaignLog');
  const senderName = document.getElementById('campaignSenderName').value.trim();
  const senderEmail = document.getElementById('campaignSenderEmail').value.trim();
  const subject = document.getElementById('campaignSubject').value.trim();
  const htmlBody = document.getElementById('campaignBody').value.trim();

  if (!subject || !htmlBody || !senderEmail) {
    log.textContent = 'Please fill in Subject, Message, and Sender Email.';
    return;
  }

  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  log.textContent = '';

  function logMsg(m) { log.textContent += m + '\n'; log.scrollTop = log.scrollHeight; }

  try {
    logMsg('Sending campaign via serverless API...\n');
    const res = await fetch('/api/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, htmlBody, senderName, senderEmail })
    });
    const data = await res.json();

    if (res.ok) {
      logMsg('\u2705 ' + data.message);
      if (data.emails) {
        logMsg('\nSubscriber list (' + data.emails.length + '):');
        data.emails.forEach(e => logMsg('  \u2022 ' + e));
      }
    } else {
      logMsg('\u274C Error: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    logMsg('\u274C Failed: ' + err.message);
  }

  btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Campaign';
}

// ============================================================
// OUTREACH TRACKER
// ============================================================
async function addOutreachEntry() {
  const name = document.getElementById('outreachName').value.trim();
  const type = document.getElementById('outreachType').value;
  const url = document.getElementById('outreachUrl').value.trim();
  const status = document.getElementById('outreachStatus').value;
  const notes = document.getElementById('outreachNotes').value.trim();

  if (!name) { showToast('Please enter a group/club name.'); return; }

  try {
    await db.collection('outreach').add({
      name, type, url, status, notes,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.email
    });
    showToast('Outreach entry added!');
    document.getElementById('outreachName').value = '';
    document.getElementById('outreachUrl').value = '';
    document.getElementById('outreachNotes').value = '';
    document.getElementById('outreachStatus').value = 'pending';
    loadOutreachEntries();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
}

async function loadOutreachEntries() {
  const container = document.getElementById('outreachList');
  const filterText = document.getElementById('outreachFilter').value.toLowerCase().trim();
  const filterStatus = document.getElementById('outreachStatusFilter').value;

  container.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    let query = db.collection('outreach').orderBy('createdAt', 'desc').limit(100);
    const snapshot = await query.get();
    let entries = [];
    snapshot.forEach(doc => entries.push({ id: doc.id, ...doc.data() }));

    if (filterText) {
      entries = entries.filter(e =>
        (e.name || '').toLowerCase().includes(filterText) ||
        (e.url || '').toLowerCase().includes(filterText)
      );
    }
    if (filterStatus) {
      entries = entries.filter(e => e.status === filterStatus);
    }

    if (!entries.length) {
      container.innerHTML = '<p style="color:var(--text-muted)">No entries yet. Add your first outreach target above.</p>';
      return;
    }

    const statusColors = {
      pending: '#f59e0b', contacted: '#3b82f6', linked: '#10b981',
      'no-response': '#6b7280', declined: '#ef4444'
    };
    const statusLabels = {
      pending: 'Pending', contacted: 'Contacted', linked: 'Got Link',
      'no-response': 'No Response', declined: 'Declined'
    };

    container.innerHTML = entries.map(e => {
      const dateStr = e.createdAt ? new Date(e.createdAt.seconds * 1000).toLocaleDateString() : '—';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;margin-bottom:8px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px">
        <div style="flex:1">
          <strong style="color:var(--text)">${escHtml(e.name)}</strong>
          <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;color:#fff;background:${statusColors[e.status] || '#6b7280'}">${statusLabels[e.status] || e.status}</span>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
            ${e.type ? escHtml(e.type) : ''}
            ${e.url ? ' | <a href="' + escHtml(e.url) + '" target="_blank" style="color:var(--primary)">' + escHtml(e.url) + '</a>' : ''}
            ${e.notes ? ' | ' + escHtml(e.notes) : ''}
            <span style="margin-left:8px;opacity:0.6">' + dateStr + '</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px">
          <select onchange="updateOutreachStatus('${e.id}',this.value)" style="padding:4px 8px;border:1px solid var(--border-color);border-radius:4px;font-size:11px;background:var(--input-bg);color:var(--text)">
            ${Object.entries(statusLabels).map(([k,v]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <button onclick="deleteOutreachEntry('${e.id}')" style="padding:4px 8px;border:1px solid #ef4444;border-radius:4px;background:transparent;color:#ef4444;cursor:pointer;font-size:11px"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:#ef4444">Error: ' + err.message + '</p>';
  }
}

async function updateOutreachStatus(id, status) {
  try {
    await db.collection('outreach').doc(id).update({ status });
    showToast('Status updated!');
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
}

async function deleteOutreachEntry(id) {
  if (!confirm('Delete this outreach entry?')) return;
  try {
    await db.collection('outreach').doc(id).delete();
    showToast('Entry deleted.');
    loadOutreachEntries();
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
}

async function loadOutreachSuggestions() {
  const el = document.getElementById('outreachSuggestions');
  try {
    const res = await fetch('outreach-suggestions.json');
    const data = await res.json();
    el.innerHTML = '<strong>Suggested Groups to Contact:</strong>\n' +
      '(Click a group to auto-fill the form above)\n\n' +
      data.groups.map((g, i) =>
        `${i + 1}. ${g.name} (${g.type})\n   ${g.url}\n   ${g.notes || ''}`
      ).join('\n\n') +
      '\n\n--- ' + data.groups.length + ' groups loaded ---';
  } catch (e) {
    // silently handle — file may not exist yet
  }
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Click-to-fill from suggestions
document.addEventListener('click', function(e) {
  const pre = document.getElementById('outreachSuggestions');
  if (pre && pre.contains(e.target) && e.target.tagName !== 'A') {
    const text = e.target.textContent.trim();
    // Only fill if it looks like a group name
    if (text && text.length > 2 && !text.startsWith('http') && !text.startsWith('(') && !text.startsWith('-')) {
      document.getElementById('outreachName').value = text.replace(/^\d+\.\s*/, '');
    }
  }
});


