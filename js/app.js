// ============================================================
// PICKLESPOT PH - MAIN APPLICATION
// ============================================================

let allCourts = [...COURTS_DATA];
let filteredCourts = [...COURTS_DATA];
let currentView = 'map';
let listPage = 1;
let sidebarCollapsed = false;
let mainAddCourtMap = null;
let mainAddCourtMarker = null;
let mainAddCourtMapInitialized = false;
let currentUser = null;
let favoriteIds = new Set();
let savedOnly = false;

// ============================================================
// ADD COURT MAP PICKER
// ============================================================
function initMainAddCourtMap() {
  if (mainAddCourtMapInitialized) {
    setTimeout(() => mainAddCourtMap?.invalidateSize(), 100);
    return;
  }

  const container = document.getElementById('addCourtMap');
  if (!container) return;

  mainAddCourtMap = L.map('addCourtMap', { zoomControl: true }).setView([12.8797, 121.7740], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(mainAddCourtMap);

  mainAddCourtMap.on('click', function (e) {
    placeMainMarker(e.latlng.lat, e.latlng.lng);
  });

  mainAddCourtMapInitialized = true;
  setTimeout(() => mainAddCourtMap.invalidateSize(), 200);
}

function placeMainMarker(lat, lng) {
  document.getElementById('courtLat').value = lat.toFixed(4);
  document.getElementById('courtLng').value = lng.toFixed(4);

  if (mainAddCourtMarker) {
    mainAddCourtMarker.setLatLng([lat, lng]);
  } else {
    mainAddCourtMarker = L.marker([lat, lng], { draggable: true }).addTo(mainAddCourtMap);
    mainAddCourtMarker.on('dragend', function () {
      const pos = mainAddCourtMarker.getLatLng();
      document.getElementById('courtLat').value = pos.lat.toFixed(4);
      document.getElementById('courtLng').value = pos.lng.toFixed(4);
    });
  }

  mainAddCourtMap.setView([lat, lng], Math.max(mainAddCourtMap.getZoom(), 12));
}

// ============================================================
// INIT
// ============================================================
// Dark mode toggle
function initDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  const saved = localStorage.getItem('psp_darkMode');
  if (saved === 'true') {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (toggle) toggle.innerHTML = '<i class="fas fa-sun"></i>';
  }
  if (toggle) {
    toggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        toggle.innerHTML = '<i class="fas fa-moon"></i>';
        localStorage.setItem('psp_darkMode', 'false');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        toggle.innerHTML = '<i class="fas fa-sun"></i>';
        localStorage.setItem('psp_darkMode', 'true');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initMap();
  renderMarkers(allCourts);
  renderSidebarList(allCourts);
  updateStats(allCourts);
  setupEventListeners();
  showView('map');
  initCustomerChatWidget();
  loadRecentlyAdded();
  loadFirestoreCourts();
  // Auth state listener
  if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged(user => {
      currentUser = user;
      if (user) {
        loadFavorites(user.uid);
      } else {
        favoriteIds = new Set();
        refreshFavoritesUI();
      }
    });
  }
});

async function loadFirestoreCourts() {
  try {
    if (typeof PickleCourts === 'undefined') return;
    const firestoreCourts = await PickleCourts.getAll();
    if (!firestoreCourts.length) return;
    const ownerIds = [...new Set(firestoreCourts.map(c => c.ownerId).filter(Boolean))];
    const ownerPlans = {};
    await Promise.all(ownerIds.map(async uid => {
      try {
        const prof = await PickleAuth.getUserProfile(uid);
        if (prof) ownerPlans[uid] = prof.plan;
      } catch {}
    }));
    for (const fc of firestoreCourts) {
      if (!allCourts.find(c => c.id === fc.id)) {
        fc.ownerPlan = ownerPlans[fc.ownerId] || fc.ownerPlan || 'basic';
        allCourts.push(fc);
      }
    }
    filteredCourts = [...allCourts];
    renderMarkers(allCourts);
    renderSidebarList(allCourts);
    updateStats(allCourts);
  } catch {}
  loadRecentlyAdded();
  loadTournamentTicker();
}

let carouselTimer = null;

function loadRecentlyAdded() {
  const section = document.getElementById('recentSection');
  const track = document.getElementById('recentScroll');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  const dotsEl = document.getElementById('carouselDots');
  if (!section || !track) return;

  if (!allCourts.length) { section.style.display = 'none'; return; }

  const sorted = [...allCourts].sort((a, b) => {
    const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.dateAdded || 0);
    const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.dateAdded || 0);
    return bDate - aDate;
  });

  const recent = sorted.slice(0, 10);
  track.innerHTML = recent.map(c => {
    const isFav = favoriteIds.has(String(c.id));
    return `
    <div class="recent-card" onclick="openCourtModal('${c.id}')">
      <div class="rc-type">${c.type || 'Outdoor'} · ${c.access || 'Public'}</div>
      <div class="rc-name">${c.name}</div>
      <div class="rc-location"><i class="fas fa-map-marker-alt"></i> ${c.city}, ${c.province}</div>
      <div class="rc-meta">
        <span><i class="fas fa-table-tennis-paddle-ball"></i> ${c.courts}</span>
        ${c.verified ? '<span><i class="fas fa-check-circle" style="color:var(--primary)"></i> Verified</span>' : ''}
      </div>
      <span class="recent-heart ${isFav ? 'hearted' : ''}" onclick="event.stopPropagation(); toggleFavorite('${c.id}','${encodeURIComponent(c.name)}')">
        <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
      </span>
    </div>
  `}).join('');

  section.style.display = 'block';

  let currentPage = 0;
  let totalPages = 0;

  function getCardWidth() {
    const first = track.querySelector('.recent-card');
    if (!first) return 240;
    return first.offsetWidth + 14;
  }

  function getVisible() {
    const cw = track.offsetWidth;
    const gw = getCardWidth();
    return Math.max(1, Math.floor(cw / gw));
  }

  function getTotalPages() {
    const total = track.children.length;
    const perPage = getVisible();
    return Math.max(1, Math.ceil(total / perPage));
  }

  function goToPage(page) {
    const perPage = getVisible();
    totalPages = getTotalPages();
    currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const scrollTo = currentPage * perPage * getCardWidth();
    track.scrollTo({ left: scrollTo, behavior: 'smooth' });
    updateDots();
  }

  function updateDots() {
    totalPages = getTotalPages();
    prevBtn.style.display = totalPages <= 1 ? 'none' : '';
    nextBtn.style.display = totalPages <= 1 ? 'none' : '';
    dotsEl.innerHTML = '';
    if (totalPages <= 1) { dotsEl.style.display = 'none'; return; }
    dotsEl.style.display = '';
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot' + (i === currentPage ? ' active' : '');
      dot.setAttribute('aria-label', 'Go to page ' + (i + 1));
      dot.addEventListener('click', () => goToPage(i));
      dotsEl.appendChild(dot);
    }
  }

  prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
  nextBtn.addEventListener('click', () => goToPage(currentPage + 1));

  window.addEventListener('resize', () => {
    const maxP = getTotalPages() - 1;
    if (currentPage > maxP) { goToPage(maxP); }
    else { updateDots(); }
  });

  function startAuto() {
    stopAuto();
    carouselTimer = setInterval(() => {
      totalPages = getTotalPages();
      const next = currentPage + 1;
      if (next >= totalPages) { goToPage(0); }
      else { goToPage(next); }
    }, 4000);
  }

  function stopAuto() { clearInterval(carouselTimer); }

  updateDots();
  setTimeout(startAuto, 500);
  section.addEventListener('mouseenter', stopAuto);
  section.addEventListener('mouseleave', startAuto);
}

// ============================================================
// TOURNAMENT TICKER
// ============================================================
async function loadTournamentTicker() {
  const wrap = document.getElementById('tickerWrap');
  const track = document.getElementById('tickerTrack');
  if (!wrap || !track) return;
  try {
    if (typeof PickleTournaments === 'undefined') return;
    const tournaments = await PickleTournaments.getUpcoming();
    if (!tournaments.length) return;
    const items = tournaments.map(t => {
      const d = new Date(t.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      return `<span class="ticker-item"><span class="date">${d}</span> ${t.name} ${t.location ? '· ' + t.location : ''}</span>`;
    }).join('');
    track.innerHTML = `<span class="ticker-content">${items}${items}</span>`;
    wrap.style.display = 'flex';
  } catch {}
}

// ============================================================
// FAVORITES
// ============================================================
async function loadFavorites(uid) {
  try {
    if (typeof PickleFavorites === 'undefined') return;
    const ids = await PickleFavorites.getByUser(uid);
    favoriteIds = new Set(ids.map(String));
  } catch { favoriteIds = new Set(); }
  refreshFavoritesUI();
}

window.toggleFavorite = async function(courtId, courtName) {
  if (!currentUser) {
    showToast('Please log in to save favorites.');
    return;
  }
  const sid = String(courtId);
  const wasFav = favoriteIds.has(sid);
  if (!wasFav) favoriteIds.add(sid); else favoriteIds.delete(sid);
  refreshFavoritesUI();
  try {
    const result = await PickleFavorites.toggle(currentUser.uid, courtId, courtName);
    if (!result) favoriteIds.delete(sid); else favoriteIds.add(sid);
  } catch { if (wasFav) favoriteIds.add(sid); else favoriteIds.delete(sid); }
  refreshFavoritesUI();
};

function refreshFavoritesUI() {
  const view = document.getElementById('listView');
  if (view && view.style.display !== 'none') renderCourtsList(filteredCourts);
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.style.display !== 'none') renderSidebarList(filteredCourts);
  renderMarkers(allCourts);
  updateFavCount();
}

function updateFavCount() {
  const count = favoriteIds.size;
  const el = document.getElementById('favCount');
  if (el) el.textContent = count > 0 ? `Saved (${count})` : 'Saved';
}

function showView(view) {
  currentView = view;

  const mapContainer = document.querySelector('.app-container');
  const listView = document.getElementById('listView');
  const aboutView = document.getElementById('aboutView');
  const footer = document.querySelector('footer');

  // Hide all
  mapContainer.style.display = 'none';
  listView.style.display = 'none';
  aboutView.style.display = 'none';

  // Update nav active state
  document.querySelectorAll('.nav-link, .mobile-link').forEach(link => {
    link.classList.remove('active');
    if (link.dataset.view === view) link.classList.add('active');
  });

  switch (view) {
    case 'map':
      mapContainer.style.display = 'flex';
      setTimeout(() => map.invalidateSize(), 100);
      break;
    case 'list':
      listView.style.display = 'block';
      footer.style.display = 'block';
      renderCourtsList(filteredCourts);
      break;
    case 'about':
      aboutView.style.display = 'block';
      footer.style.display = 'block';
      break;
  }
}

// ============================================================
// SIDEBAR
// ============================================================
function renderSidebarList(courts) {
  const container = document.getElementById('sidebarCourtList');
  document.getElementById('resultsCount').textContent = courts.length;

  if (courts.length === 0) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center;color:#999">
        <i class="fas fa-search" style="font-size:32px;margin-bottom:12px;display:block"></i>
        <p>No courts found.<br>Try adjusting your filters.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = courts.map(court => {
    const isFav = favoriteIds.has(String(court.id));
    return `
    <div class="sidebar-court-item" data-id="${court.id}"
         onclick="handleSidebarCourtClick('${court.id}')">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <div class="court-item-name">
          ${court.name}
          ${court.verified ? '<i class="fas fa-check-circle" style="color:var(--primary);font-size:12px" title="Verified"></i>' : ''}
          ${court.featured ? '<span style="font-size:9px;background:var(--accent);color:white;padding:1px 6px;border-radius:8px;margin-left:4px">★</span>' : ''}
        </div>
        <span class="sidebar-heart ${isFav ? 'hearted' : ''}" onclick="event.stopPropagation(); toggleFavorite('${court.id}','${encodeURIComponent(court.name)}')" style="font-size:14px;cursor:pointer;flex-shrink:0">
          <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
        </span>
      </div>
      <div class="court-item-location">
        <i class="fas fa-map-marker-alt" style="font-size:10px"></i>
        ${court.city}, ${court.region}
      </div>
      <div class="court-item-tags">
        <span class="tag tag-${(court.type || 'Outdoor').toLowerCase()}">${court.type}</span>
        <span class="tag ${
          court.access === 'Free' ? 'tag-free' :
          court.access === 'Paid' ? 'tag-paid' : 'tag-members'
        }">
          ${court.access}
        </span>
        <span class="tag" style="background:#f5f5f5;color:#555">
          ${court.courts} court${court.courts > 1 ? 's' : ''}
        </span>
        ${court.rate ? `
        <span class="tag" style="background:#fff3e0;color:#e65100;border:1px solid #ffe0b2">
          ${court.rate}
        </span>` : ''}
      </div>
    </div>
  `}).join('');
}

function handleSidebarCourtClick(courtId) {
  const court = allCourts.find(c => c.id == courtId);
  if (!court) return;
  if (court.lat && court.lng) {
    flyToMarker(courtId);
    highlightSidebarItem(courtId);
    showView('map');
  } else {
    openCourtModal(courtId);
  }
}

// ============================================================
// COURTS LIST VIEW
// ============================================================
function renderCourtsList(courts) {
  const container = document.getElementById('courtsGrid');
  const countEl = document.getElementById('listCourtCount');
  if (countEl) countEl.textContent = courts.length;

  if (courts.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;padding:48px;text-align:center;color:#999">
        <i class="fas fa-search" style="font-size:48px;margin-bottom:16px;display:block"></i>
        <h3>No courts found</h3>
        <p>Try a different search term</p>
      </div>
    `;
    return;
  }

  const PAGE_SIZE = 12;
  const totalPages = Math.ceil(courts.length / PAGE_SIZE);
  const page = listPage || 1;
  const start = (page - 1) * PAGE_SIZE;
  const pageCourts = courts.slice(start, start + PAGE_SIZE);

  container.innerHTML = pageCourts.map((court, idx) => {
    const globalIdx = start + idx + 1;
    const amenityBadges = (court.amenities || []).map(a => {
      const info = AMENITY_ICONS[a];
      return info ? `
        <span class="amenity-badge">
          <i class="fas ${info.icon}"></i> ${info.label}
        </span>
      ` : '';
    }).join('');

    const accessClass =
      court.access === 'Free' ? 'tag-free' :
      court.access === 'Paid' ? 'tag-paid' : 'tag-members';

    const isFav = favoriteIds.has(String(court.id));
    return `
      <div class="court-card" onclick="openCourtModal('${court.id}')">
        <div class="court-card-header">
          <div class="court-number">${String(globalIdx).padStart(2, '0')}</div>
          <div class="heart-btn ${isFav ? 'hearted' : ''}" onclick="event.stopPropagation(); toggleFavorite('${court.id}','${encodeURIComponent(court.name)}')" title="${isFav ? 'Remove from saved' : 'Save court'}">
            <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
          </div>
          <div class="court-card-name">
            ${court.name}
            ${court.verified ? '<i class="fas fa-check-circle" style="color:#FFD700;font-size:14px" title="Verified"></i>' : ''}
          </div>
          ${court.featured ? '<div style="position:absolute;top:12px;left:12px;background:var(--accent);color:white;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">★ Featured</div>' : ''}
          <div class="court-card-location">
            <i class="fas fa-map-marker-alt" style="font-size:11px"></i>
            ${court.city}, ${court.province}
          </div>
        </div>
        <div class="court-card-body">
          <div class="court-detail-row">
            <i class="fas fa-table-tennis-paddle-ball"></i>
            <span>${court.courts} Pickleball Court${court.courts > 1 ? 's' : ''}</span>
          </div>
          ${court.rate ? `
          <div class="court-detail-row">
            <i class="fas fa-tag"></i>
            <span>${court.rate}</span>
          </div>` : ''}
          <div class="court-detail-row">
            <i class="fas fa-clock"></i>
            <span>${court.hours}</span>
          </div>
          ${court.contact ? `
          <div class="court-detail-row">
            <i class="fas fa-phone"></i>
            <span>${court.contact}</span>
          </div>
          ` : ''}
          <div class="court-card-tags">
            <span class="tag tag-${(court.type || 'Outdoor').toLowerCase()}">${court.type}</span>
            <span class="tag ${accessClass}">${court.access}</span>
            ${court.verified
              ? '<span class="tag" style="background:#e3f2fd;color:#1565c0">✓ Verified</span>'
              : ''}
          </div>
          ${court.amenities.length > 0 ? `
          <div class="court-amenities">${amenityBadges}</div>
          ` : ''}
          ${court.photos && court.photos.length > 0 ? `
          <div style="display:flex;gap:4px;margin-top:8px">
            ${court.photos.slice(0, 3).map(url => `
              <img src="${url}" alt="" style="width:60px;height:50px;object-fit:cover;border-radius:4px"/>
            `).join('')}
            ${court.photos.length > 3 ? `<span style="font-size:11px;color:var(--text-muted);display:flex;align-items:center">+${court.photos.length - 3}</span>` : ''}
          </div>` : ''}
        </div>
        <div class="court-card-footer">
          <button class="btn-view-map"
            onclick="event.stopPropagation(); viewOnMap('${court.id}')">
            <i class="fas fa-map-marked-alt"></i> View on Map
          </button>
          <button class="btn-directions"
            onclick="event.stopPropagation(); openDirections(${court.lat}, ${court.lng})">
            <i class="fas fa-directions"></i> Directions
          </button>
        </div>
      </div>
    `;
  }).join('') + buildPagination(totalPages, page);
}

function buildPagination(totalPages, current) {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination">';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  return html + '</div>';
}

function goToPage(page) {
  listPage = page;
  const sortBy = document.getElementById('sortSelect')?.value || 'name';
  renderCourtsList(sortCourts(filteredCourts, sortBy));
}

// ============================================================
// COURT MODAL
// ============================================================
window.openCourtModal = async function(courtId) {
  const court = allCourts.find(c => c.id == courtId);
  if (!court) return;

  // Track view for Firestore courts
  if (typeof court.id === 'string' && typeof PickleAnalytics !== 'undefined') {
    PickleAnalytics.trackView(court.id);
  }

  // Load open play schedules
  let schedulesHtml = '';
  if (typeof PickleSchedules !== 'undefined' && court.id) {
    try {
      const schedules = await PickleSchedules.getByCourt(String(court.id));
      if (schedules.length > 0) {
        const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        const sorted = [...schedules].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
        schedulesHtml = `
          <div class="court-detail-section">
            <h3><i class="fas fa-calendar-alt"></i> Open Play Schedule</h3>
            ${sorted.map(s => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px">
                <span style="font-weight:600;min-width:80px">${s.day}</span>
                <span style="color:var(--text-muted)">${s.startTime} - ${s.endTime}</span>
                ${s.cost ? `<span style="color:var(--accent);font-weight:600">${s.cost}</span>` : ''}
                ${s.notes ? `<span style="color:var(--text-muted);font-size:12px">· ${s.notes}</span>` : ''}
              </div>
            `).join('')}
          </div>`;
      }
    } catch (e) {}
  }
  court.schedulesHtml = schedulesHtml;

  const modal = document.getElementById('courtModal');
  const header = document.getElementById('modalHeader');
  const body = document.getElementById('modalBody');
  const footer = document.getElementById('modalFooter');

  const accessClass =
    court.access === 'Free' ? 'tag-free' :
    court.access === 'Paid' ? 'tag-paid' : 'tag-members';

  header.innerHTML = `
    <div style="padding:24px">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="background:rgba(255,255,255,0.2);border-radius:10px;
                    padding:10px;font-size:24px">
          ${court.type === 'Indoor' ? '🏢' : court.type === 'Covered' ? '🏗️' : '🌿'}
        </div>
        <div>
          <h2 style="font-size:18px;font-weight:700;color:white;margin-bottom:4px">
            ${court.name}
            ${court.verified ? '<i class="fas fa-check-circle" style="color:#FFD700;font-size:16px" title="Verified"></i>' : ''}
            ${court.featured ? '<span style="font-size:12px;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:10px;margin-left:4px">★ Featured</span>' : ''}
            ${typeof court.id === 'number' ? '<span style="font-size:10px;background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);padding:2px 8px;border-radius:8px;margin-left:4px;font-weight:500">Sample Listing</span>' : ''}
          </h2>
          <p style="font-size:13px;color:rgba(255,255,255,0.85)">
            <i class="fas fa-map-marker-alt"></i>
            ${court.city}, ${court.province} · ${court.region}
          </p>
          <div style="display:flex;gap:6px;margin-top:8px">
            <span class="tag tag-${(court.type || 'Outdoor').toLowerCase()}">${court.type}</span>
            <span class="tag ${accessClass}">${court.access}</span>
            ${court.verified
              ? '<span class="tag" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.4)">✓ Verified</span>'
              : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  const photosHtml = court.photos && court.photos.length > 0 ? `
    <div class="court-detail-section">
      <h3>Photos</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">
        ${court.photos.map(url => `
          <img src="${url}" alt="Court photo" style="width:100%;height:120px;object-fit:cover;border-radius:8px;cursor:pointer" onclick="window.open('${url}','_blank')"/>
        `).join('')}
      </div>
    </div>
  ` : '';

  const amenityChips = (court.amenities || []).map(a => {
    const info = AMENITY_ICONS[a];
    return info ? `
      <span class="amenity-chip">
        <i class="fas ${info.icon}"></i> ${info.label}
      </span>
    ` : '';
  }).join('');

  body.innerHTML = (typeof court.id === 'number' ? `
    <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--text)">
      <i class="fas fa-info-circle" style="color:var(--accent)"></i>
      <strong>Sample Listing</strong> — This court is shown as a preview. Once owners register and add their courts,
      they will appear here with a verified badge.
      <a href="dashboard.html" style="color:var(--accent);font-weight:600">Add your court now</a>.
    </div>
    ` : '') + `
    <div class="court-detail-section">
      <h3>Court Information</h3>
      <div class="detail-item">
        <i class="fas fa-table-tennis-paddle-ball"></i>
        <span><strong>${court.courts}</strong> Pickleball Court${court.courts > 1 ? 's' : ''}</span>
      </div>
      <div class="detail-item">
        <i class="fas fa-building"></i>
        <span>${court.type} Court</span>
      </div>
      <div class="detail-item">
        <i class="fas fa-lock-open"></i>
        <span>Access: ${court.access}</span>
      </div>
      ${court.rate ? `
      <div class="detail-item">
        <i class="fas fa-tag"></i>
        <span>Rate: ${court.rate}</span>
      </div>` : ''}
    </div>

    ${court.schedulesHtml || ''}

    <div class="court-detail-section">
      <h3>Location & Schedule</h3>
      <div class="detail-item">
        <i class="fas fa-location-dot"></i>
        <span>${court.address}</span>
      </div>
      <div class="detail-item">
        <i class="fas fa-clock"></i>
        <span>${court.hours}</span>
      </div>
      ${court.contact ? `
      <div class="detail-item">
        <i class="fas fa-phone"></i>
        <span>${court.contact}</span>
      </div>
      ` : ''}
    </div>

    ${court.amenities.length > 0 ? `
    <div class="court-detail-section">
      <h3>Amenities</h3>
      <div class="amenities-list">${amenityChips}</div>
    </div>
    ` : ''}

    ${photosHtml}

    ${court.notes ? `
    <div class="court-detail-section">
      <h3>Notes</h3>
      <p style="font-size:13px;color:#555;line-height:1.6">${court.notes}</p>
    </div>
    ` : ''}

    <div class="court-detail-section" style="margin-bottom:0">
      <p style="font-size:11px;color:#999">
        Added on PickleSpotPH:
        ${new Date(court.dateAdded).toLocaleDateString('en-PH', {
          year: 'numeric', month: 'long', day: 'numeric'
        })}
      </p>
    </div>
  `;

  footer.innerHTML = `
    <div class="modal-action-btns">
      <button class="btn-modal-map" onclick="viewOnMap('${court.id}')">
        <i class="fas fa-map-marked-alt"></i> View on Map
      </button>
      ${court.lat && court.lng ? `
      <button class="btn-modal-directions"
        onclick="openDirections(${court.lat}, ${court.lng})">
        <i class="fas fa-directions"></i> Get Directions
      </button>
      ` : ''}
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      ${court.ownerPlan === 'pro' ? `
      <button class="btn-submit" style="flex:1" onclick="openBookingModal('${court.id}')">
        <i class="fas fa-calendar-check"></i> Book / Inquire
      </button>` : ''}
      <button class="btn-submit" style="flex:1;background:var(--accent)" onclick="openReviewModal('${court.id}')">
        <i class="fas fa-star"></i> Write Review
      </button>
    </div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Share this court</p>
      <div class="share-buttons">
        <button class="share-btn share-fb" onclick="shareCourt('fb', '${encodeURIComponent(court.name)}', '${court.id}')" title="Share on Facebook"><i class="fab fa-facebook"></i></button>
        <button class="share-btn share-x" onclick="shareCourt('x', '${encodeURIComponent(court.name)}', '${court.id}')" title="Share on X"><i class="fab fa-x-twitter"></i></button>
        <button class="share-btn share-wa" onclick="shareCourt('wa', '${encodeURIComponent(court.name)}', '${court.id}')" title="Share on WhatsApp"><i class="fab fa-whatsapp"></i></button>
        <button class="share-btn share-tg" onclick="shareCourt('tg', '${encodeURIComponent(court.name)}', '${court.id}')" title="Share on Telegram"><i class="fab fa-telegram"></i></button>
        <button class="share-btn share-msg" onclick="shareCourt('msg', '${encodeURIComponent(court.name)}', '${court.id}')" title="Share on Messenger"><i class="fab fa-facebook-messenger"></i></button>
        <button class="share-btn share-copy" onclick="shareCourt('copy', '${encodeURIComponent(court.name)}', '${court.id}')" title="Copy link"><i class="fas fa-link"></i></button>
      </div>
    </div>
    ${typeof court.id === 'string' && !court.ownerId ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;text-align:center">
      <button class="btn-modal-map" onclick="openClaimModal('${court.id}','${encodeURIComponent(court.name)}')" style="color:var(--accent);border-color:var(--accent)">
        <i class="fas fa-hand-paper"></i> Is this your court? Claim it!
      </button>
    </div>` : ''}
  `;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

function viewOnMap(courtId) {
  closeModal('courtModal');
  showView('map');
  setTimeout(() => {
    flyToMarker(courtId);
    highlightSidebarItem(courtId);
  }, 400);
}

function openDirections(lat, lng) {
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    '_blank'
  );
}

function shareCourt(platform, courtNameEncoded, courtId) {
  const url = `https://picklespotph.site/?court=${courtId}`;
  const name = decodeURIComponent(courtNameEncoded);
  const text = `Check out ${name} on PickleSpotPH! 🏓`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);

  switch (platform) {
    case 'fb':
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`, '_blank', 'width=600,height=400');
      break;
    case 'x':
      window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, '_blank', 'width=600,height=400');
      break;
    case 'wa':
      window.open(`https://wa.me/?text=${encodedText}+${encodedUrl}`, '_blank');
      break;
    case 'tg':
      window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, '_blank');
      break;
    case 'msg':
      window.open(`https://www.facebook.com/dialog/send?link=${encodedUrl}&app_id=&redirect_uri=${encodedUrl}`, '_blank', 'width=600,height=400');
      break;
    case 'copy':
      navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard!');
      }).catch(() => {
        showToast('Failed to copy link');
      });
      break;
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
  document.body.style.overflow = '';
  if (modalId === 'claimModal' && claimLeafletMap) {
    claimLeafletMap.remove();
    claimLeafletMap = null;
    claimMarker = null;
  }
}

// ============================================================
// CLAIM COURT MODAL
// ============================================================
let claimCourtId = null;
let claimLeafletMap = null;
let claimMarker = null;

window.openClaimModal = function(courtId, courtName) {
  claimCourtId = courtId;
  document.getElementById('claimCourtName').textContent = decodeURIComponent(courtName);
  document.getElementById('claimForm').reset();
  document.getElementById('claimModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    if (claimLeafletMap) claimLeafletMap.remove();
    const court = allCourts.find(c => c.id == courtId);
    const lat = court?.lat || 12.8797;
    const lng = court?.lng || 121.7740;

    claimLeafletMap = L.map('claimMap', {
      center: [lat, lng],
      zoom: court?.lat ? 15 : 6,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(claimLeafletMap);

    if (court?.lat && court?.lng) {
      claimMarker = L.marker([lat, lng], { draggable: true }).addTo(claimLeafletMap);
      document.getElementById('claimLat').value = lat;
      document.getElementById('claimLng').value = lng;
      document.getElementById('claimLatDisplay').textContent = lat.toFixed(5);
      document.getElementById('claimLngDisplay').textContent = lng.toFixed(5);
      claimMarker.on('dragend', function() {
        const pos = claimMarker.getLatLng();
        document.getElementById('claimLat').value = pos.lat.toFixed(6);
        document.getElementById('claimLng').value = pos.lng.toFixed(6);
        document.getElementById('claimLatDisplay').textContent = pos.lat.toFixed(5);
        document.getElementById('claimLngDisplay').textContent = pos.lng.toFixed(5);
      });
    }

    claimLeafletMap.on('click', function(e) {
      if (claimMarker) claimLeafletMap.removeLayer(claimMarker);
      claimMarker = L.marker([e.latlng.lat, e.latlng.lng], { draggable: true }).addTo(claimLeafletMap);
      document.getElementById('claimLat').value = e.latlng.lat.toFixed(6);
      document.getElementById('claimLng').value = e.latlng.lng.toFixed(6);
      document.getElementById('claimLatDisplay').textContent = e.latlng.lat.toFixed(5);
      document.getElementById('claimLngDisplay').textContent = e.latlng.lng.toFixed(5);
      claimMarker.on('dragend', function() {
        const pos = claimMarker.getLatLng();
        document.getElementById('claimLat').value = pos.lat.toFixed(6);
        document.getElementById('claimLng').value = pos.lng.toFixed(6);
        document.getElementById('claimLatDisplay').textContent = pos.lat.toFixed(5);
        document.getElementById('claimLngDisplay').textContent = pos.lng.toFixed(5);
      });
    });

    setTimeout(() => claimLeafletMap.invalidateSize(), 200);
  }, 200);
};

document.getElementById('claimForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const court = allCourts.find(c => c.id === claimCourtId);
  const data = {
    courtId: claimCourtId,
    courtName: court?.name || 'Unknown',
    courtCity: court?.city || '',
    courtProvince: court?.province || '',
    courtRegion: court?.region || '',
    courtType: court?.type || '',
    courtAccess: court?.access || '',
    courtRate: court?.rate || '',
    courtContact: court?.contact || '',
    courtAddress: court?.address || '',
    courtHours: court?.hours || '',
    courtLat: document.getElementById('claimLat').value || court?.lat || null,
    courtLng: document.getElementById('claimLng').value || court?.lng || null,
    courtCourts: court?.courts || 1,
    courtAmenities: court?.amenities || [],
    name: document.getElementById('claimName').value,
    email: document.getElementById('claimEmail').value,
    contact: document.getElementById('claimContact').value,
    message: document.getElementById('claimMessage').value
  };
  try {
    await PickleClaims.add(data);
    await PickleNotifications.notifyAdminNewClaim(data, data.courtName);
    try { await PickleMailing.subscribe(data.email, data.name); } catch {}
    closeModal('claimModal');
    showToast('Claim submitted! The admin will review and notify you.');
  } catch (err) {
    showToast('Error: ' + err.message, 4000);
  }
});

document.getElementById('claimModalClose').onclick = () => closeModal('claimModal');
document.getElementById('claimCancelBtn').onclick = () => closeModal('claimModal');

// ============================================================
// BOOKING MODAL
// ============================================================
// ============================================================
// BOOKING: MULTI-COURT + DAY NAV
// ============================================================
let bookingMainCourtId = null;
let bookingViewDate = getPHDate();
// Multi-court selection: { courtId: { court, slots: ['08:00','09:00'] } }
let multiSelected = {};

function getPHDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 8 * 3600000);
}

function formatDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(d) {
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];
  return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`;
}

window.openBookingModal = function(courtId) {
  const court = allCourts.find(c => c.id == courtId);
  if (!court) return;
  bookingMainCourtId = courtId;
  multiSelected = {};
  document.getElementById('bookingCourtName').textContent = court.name + ' — ' + court.city;
  document.getElementById('bookingModal').style.display = 'flex';
  document.getElementById('bookingForm').reset();
  bookingViewDate = getPHDate();
  updateDayNav();
  loadCourtSlots();
  updateSummary();
};

function updateDayNav() {
  document.getElementById('bDayLabel').textContent = formatDateLabel(bookingViewDate);
  document.getElementById('bookingDate').value = formatDateStr(bookingViewDate);
}

document.getElementById('bDayPrev').addEventListener('click', function() {
  bookingViewDate.setDate(bookingViewDate.getDate() - 1);
  updateDayNav();
  loadCourtSlots();
});

document.getElementById('bDayNext').addEventListener('click', function() {
  bookingViewDate.setDate(bookingViewDate.getDate() + 1);
  updateDayNav();
  loadCourtSlots();
});

async function loadCourtSlots() {
  const scroll = document.getElementById('bCourtsScroll');
  const dateVal = document.getElementById('bookingDate').value;
  if (!dateVal || !bookingMainCourtId) { scroll.innerHTML = ''; return; }

  // Collect courts: main court + others in same city
  const main = allCourts.find(c => c.id === bookingMainCourtId);
  if (!main) { scroll.innerHTML = ''; return; }
  const nearby = allCourts.filter(c =>
    c.id !== bookingMainCourtId &&
    c.city === main.city &&
    c.lat && c.lng &&
    Math.abs(Number(c.lat) - Number(main.lat)) < 0.5 &&
    Math.abs(Number(c.lng) - Number(main.lng)) < 0.5
  ).slice(0, 5);
  const courtsToShow = [main, ...nearby];

  scroll.innerHTML = courtsToShow.map(c => `
    <div class="b-court-card" data-court-id="${c.id}">
      <div class="b-court-name">${c.name}</div>
      <div class="b-court-location">${c.city}${c.access ? ' · ' + c.access : ''}</div>
      <div class="b-slot-grid" id="bSlotGrid_${c.id}">
        <div class="b-slot-loading">Loading...</div>
      </div>
    </div>
  `).join('');

  // Load slots for each court
  for (const c of courtsToShow) {
    await loadCourtSlotGrid(c.id, dateVal);
  }
}

async function loadCourtSlotGrid(courtId, dateVal) {
  const grid = document.getElementById(`bSlotGrid_${courtId}`);
  if (!grid) return;
  const court = allCourts.find(c => c.id === courtId);
  if (!court) { grid.innerHTML = ''; return; }

  // Check court availability
  let dayAvail;
  if (court.availability) {
    const parts = dateVal.split('-').map(Number);
    const phtDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 4, 0, 0));
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][phtDate.getUTCDay()];
    dayAvail = court.availability[dayName];
  }
  if (!dayAvail || !dayAvail.enabled) dayAvail = { start: '06:00', end: '22:00' };

  // Generate 1-hour slots
  const slots = [];
  const [startH, startM] = dayAvail.start.split(':').map(Number);
  const [endH, endM] = dayAvail.end.split(':').map(Number);
  for (let m = startH * 60 + startM; m + 60 <= endH * 60 + endM; m += 60) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }

  if (slots.length === 0) {
    grid.innerHTML = '<div class="b-no-slots">No available slots</div>';
    return;
  }

  // Check taken slots
  try {
    if (typeof PickleBookings !== 'undefined') {
      const existing = await PickleBookings.getByCourt(courtId);
      const confirmed = existing.filter(b => b.status === 'confirmed' && b.date === dateVal);
      grid.innerHTML = slots.map(s => {
        const slotEnd = `${String(Math.floor((toMinutes(s) + 60) / 60)).padStart(2, '0')}:${String((toMinutes(s) + 60) % 60).padStart(2, '0')}`;
        const conflict = confirmed.find(b => timeOverlap(b.time, `${s}-${slotEnd}`));
        const isTaken = !!conflict;
        const selKey = `${courtId}_${s}`;
        const isSelected = multiSelected[courtId] && multiSelected[courtId].slots.includes(s);

        if (isTaken) {
          return `<div class="b-slot b-taken" onclick="showTakenInfo(this,'${conflict.time}')">${s}</div>`;
        }
        return `<div class="b-slot ${isSelected ? 'b-sel' : ''}" onclick="toggleMultiSlot('${courtId}','${s}')">${s}</div>`;
      }).join('');
    } else {
      grid.innerHTML = slots.map(s => {
        const selKey = `${courtId}_${s}`;
        const isSelected = multiSelected[courtId] && multiSelected[courtId].slots.includes(s);
        return `<div class="b-slot ${isSelected ? 'b-sel' : ''}" onclick="toggleMultiSlot('${courtId}','${s}')">${s}</div>`;
      }).join('');
    }
  } catch {
    grid.innerHTML = slots.map(s => {
      return `<div class="b-slot ${isSelected ? 'b-sel' : ''}" onclick="toggleMultiSlot('${courtId}','${s}')">${s}</div>`;
    }).join('');
  }
}

window.toggleMultiSlot = function(courtId, slot) {
  const court = allCourts.find(c => c.id === courtId);
  if (!court) return;

  if (!multiSelected[courtId]) {
    multiSelected[courtId] = { court, slots: [] };
  }

  const idx = multiSelected[courtId].slots.indexOf(slot);
  if (idx !== -1) {
    multiSelected[courtId].slots.splice(idx, 1);
    if (multiSelected[courtId].slots.length === 0) delete multiSelected[courtId];
  } else {
    multiSelected[courtId].slots.push(slot);
    multiSelected[courtId].slots.sort();
  }

  // Update UI for this court's grid
  const grid = document.getElementById(`bSlotGrid_${courtId}`);
  if (grid) {
    grid.querySelectorAll('.b-slot').forEach(el => {
      if (multiSelected[courtId] && multiSelected[courtId].slots.includes(el.textContent.trim())) {
        el.classList.add('b-sel');
      } else {
        el.classList.remove('b-sel');
      }
    });
  }
  updateSummary();
  document.removeEventListener('click', dismissSlotPopover);
  document.addEventListener('click', dismissSlotPopover);
};

function updateSummary() {
  const container = document.getElementById('bSummary');
  const list = document.getElementById('bSummaryList');
  const entries = Object.entries(multiSelected);
  if (entries.length === 0) {
    container.style.display = 'none';
    return;
  }
  let html = '';
  for (const [id, data] of entries) {
    const start = data.slots[0];
    const last = data.slots[data.slots.length - 1];
    const [sh, sm] = last.split(':').map(Number);
    const endM = sh * 60 + sm + 60;
    const endStr = `${String(Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`;
    html += `<div class="b-summary-item">
      <span class="b-summary-court">${data.court.name}</span>
      <span class="b-summary-time">${start}-${endStr}${data.slots.length > 1 ? ' (' + data.slots.length + 'h)' : ''}</span>
      <span class="b-summary-rm" onclick="removeMultiCourt('${id}')">&times;</span>
    </div>`;
  }
  list.innerHTML = html;
  container.style.display = 'block';
}

window.removeMultiCourt = function(courtId) {
  delete multiSelected[courtId];
  // Reset visual
  const grid = document.getElementById(`bSlotGrid_${courtId}`);
  if (grid) grid.querySelectorAll('.b-slot').forEach(el => el.classList.remove('b-sel'));
  updateSummary();
};

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!bookingMainCourtId) return;
  const entries = Object.entries(multiSelected);
  if (entries.length === 0) {
    showToast('Please select at least one time slot.', 4000);
    return;
  }

  const customerName = document.getElementById('bookingName').value;
  const customerContact = document.getElementById('bookingContact').value;
  const customerEmail = document.getElementById('bookingEmail').value;
  const message = document.getElementById('bookingMessage').value;
  const players = document.getElementById('bookingPlayers').value;
  const dateVal = document.getElementById('bookingDate').value;

  const btn = document.getElementById('bSubmitBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

  let success = 0, errors = 0;

  for (const [courtId, data] of entries) {
    const start = data.slots[0];
    const last = data.slots[data.slots.length - 1];
    const [sh, sm] = last.split(':').map(Number);
    const timeRange = `${start}-${String(Math.floor((sh * 60 + sm + 60) / 60)).padStart(2, '0')}:${String((sh * 60 + sm + 60) % 60).padStart(2, '0')}`;

    // Double-booking check
    try {
      if (typeof PickleBookings !== 'undefined') {
        const existing = await PickleBookings.getByCourt(courtId);
        const conflict = existing.find(b =>
          b.status === 'confirmed' && b.date === dateVal && b.time && timeOverlap(b.time, timeRange)
        );
        if (conflict) {
          showToast('⚠️ ' + data.court.name + ' — time slot no longer available. Skipping.', 5000);
          errors++;
          continue;
        }
      }
    } catch {}

    try {
      let chatId = null;
      if (typeof PickleChat !== 'undefined') {
        chatId = await PickleChat.createRoom({
          courtId, courtName: data.court.name,
          ownerId: data.court.ownerId || 'unknown',
          customerName, customerContact, customerEmail,
          lastMessage: message || 'Inquiry sent',
          lastSender: customerName
        });
        await PickleChat.sendMessage(chatId, 'customer', customerName, message || 'New booking inquiry');
      }
      if (typeof PickleBookings !== 'undefined') {
        await PickleBookings.create({
          courtId, name: customerName, contact: customerContact,
          email: customerEmail, date: dateVal, time: timeRange,
          players, message, status: 'pending', chatId,
          userId: currentUser?.uid || null
        });
      }

      if (chatId) {
        const chats = JSON.parse(localStorage.getItem('psp_chats') || '[]');
        if (!chats.find(c => c.id == chatId)) {
          chats.push({ id: chatId, name: data.court.name, customerName, customerContact });
          localStorage.setItem('psp_chats', JSON.stringify(chats));
        }
      }

      try {
        if (typeof PickleNotifications !== 'undefined' && data.court.ownerId) {
          await PickleNotifications.notifyOwnerNewBooking(data.court.ownerId, {
            courtId, name: customerName, contact: customerContact,
            email: customerEmail, date: dateVal, time: timeRange,
            players, message
          }, data.court.name);
        }
      } catch {}
      success++;
    } catch (err) {
      console.error('Booking error for', data.court.name, err);
      errors++;
    }
  }

  try {
    if (typeof PickleMailing !== 'undefined' && customerEmail) {
      await PickleMailing.subscribe(customerEmail, customerName);
    }
  } catch {}

  btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Booking';

  if (success > 0) {
    showToast(`✅ ${success} booking(s) sent! Check Messages to chat with owners.`);
    document.getElementById('bookingForm').reset();
    multiSelected = {};
    closeModal('bookingModal');
  } else {
    showToast('❌ All bookings failed. Please try again.', 5000);
  }
});

function toMinutes(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function showTakenInfo(el, conflictTime) {
  dismissSlotPopover();
  const popover = document.createElement('div');
  popover.className = 'slot-taken-popover';
  popover.textContent = `⏰ Already booked (${conflictTime})`;
  document.body.appendChild(popover);
  const rect = el.getBoundingClientRect();
  const top = rect.top - popover.offsetHeight - 8;
  const left = Math.min(rect.left + rect.width / 2 - popover.offsetWidth / 2, window.innerWidth - popover.offsetWidth - 10);
  popover.style.top = Math.max(top, 4) + 'px';
  popover.style.left = Math.max(left, 4) + 'px';
  popover.dataset.active = 'true';
}

function dismissSlotPopover(e) {
  const popover = document.querySelector('.slot-taken-popover[data-active="true"]');
  if (!popover) return;
  if (e && e.target.closest('.slot-taken-popover')) return;
  popover.remove();
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

document.getElementById('bookingCancelBtn').addEventListener('click', () => closeModal('bookingModal'));
document.getElementById('bookingModalClose').addEventListener('click', () => closeModal('bookingModal'));

// ============================================================
// REVIEW MODAL
// ============================================================
let reviewCourtId = null;
let selectedRating = 0;

window.openReviewModal = function(courtId) {
  const court = allCourts.find(c => c.id == courtId);
  if (!court) return;
  reviewCourtId = courtId;
  selectedRating = 0;
  document.getElementById('reviewCourtName').textContent = court.name;
  document.getElementById('reviewForm').reset();
  updateStarDisplay();
  document.getElementById('reviewModal').style.display = 'flex';
};

function updateStarDisplay() {
  const stars = document.querySelectorAll('#starRating span');
  stars.forEach(span => {
    const val = parseInt(span.dataset.star);
    span.textContent = val <= selectedRating ? '★' : '☆';
  });
}

document.getElementById('starRating').addEventListener('click', (e) => {
  if (e.target.dataset.star) {
    selectedRating = parseInt(e.target.dataset.star);
    updateStarDisplay();
  }
});

document.getElementById('reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!reviewCourtId || selectedRating === 0) {
    showToast('Please select a rating.');
    return;
  }

  const reviewData = {
    courtId: reviewCourtId,
    rating: selectedRating,
    userName: document.getElementById('reviewName').value || 'Anonymous',
    comment: document.getElementById('reviewComment').value
  };

  try {
    if (typeof PickleReviews !== 'undefined') {
      await PickleReviews.add(reviewData);
    }
  } catch {}

  showToast('⭐ Review submitted! Salamat!');
  document.getElementById('reviewForm').reset();
  closeModal('reviewModal');
});

document.getElementById('reviewCancelBtn').addEventListener('click', () => closeModal('reviewModal'));
document.getElementById('reviewModalClose').addEventListener('click', () => closeModal('reviewModal'));

// ============================================================
// FILTERS
// ============================================================
function getActiveFilters() {
  const search = document.getElementById('searchInput').value.trim();
  const region = document.getElementById('regionFilter').value;
  const province = document.getElementById('provinceFilter')?.value || '';
  const city = document.getElementById('cityFilter')?.value || '';

  const types = [...document.querySelectorAll('.type-filter:checked')]
    .map(cb => cb.value);
  const access = [...document.querySelectorAll('.access-filter:checked')]
    .map(cb => cb.value);
  const amenities = [...document.querySelectorAll('.amenity-filter:checked')]
    .map(cb => cb.value);

  return { search, region, province, city, types, access, amenities };
}

function populateProvinces() {
  const region = document.getElementById('regionFilter').value;
  const provinceSelect = document.getElementById('provinceFilter');
  const provinceGroup = document.getElementById('provinceFilterGroup');
  const citySelect = document.getElementById('cityFilter');
  const cityGroup = document.getElementById('cityFilterGroup');

  citySelect.value = '';
  cityGroup.style.display = 'none';
  provinceSelect.value = '';

  if (!region) {
    provinceGroup.style.display = 'none';
    applyFilters();
    return;
  }

  const provinces = PH_LOCATIONS[region] ? Object.keys(PH_LOCATIONS[region]).sort() : [];
  provinceSelect.innerHTML = '<option value="">All Provinces</option>' + provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  provinceGroup.style.display = 'block';
  applyFilters();
}

function populateCities() {
  const region = document.getElementById('regionFilter').value;
  const province = document.getElementById('provinceFilter').value;
  const citySelect = document.getElementById('cityFilter');
  const cityGroup = document.getElementById('cityFilterGroup');

  citySelect.value = '';

  if (!region || !province) {
    cityGroup.style.display = 'none';
    applyFilters();
    return;
  }

  const cities = PH_LOCATIONS[region] && PH_LOCATIONS[region][province] ? [...PH_LOCATIONS[region][province]].sort() : [];
  citySelect.innerHTML = '<option value="">All Cities</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
  cityGroup.style.display = 'block';
  applyFilters();
}

function applyFilters() {
  const filters = getActiveFilters();
  filteredCourts = filterCourts(allCourts, filters);
  if (savedOnly && currentUser) {
    filteredCourts = filteredCourts.filter(c => favoriteIds.has(String(c.id)));
  }
  renderMarkers(filteredCourts);
  renderSidebarList(filteredCourts);

  if (currentView === 'list') {
    listPage = 1;
    const sortBy = document.getElementById('sortSelect')?.value || 'name';
    renderCourtsList(sortCourts(filteredCourts, sortBy));
  }
}

window.toggleSavedFilter = function() {
  if (!currentUser) {
    showToast('Please log in to view saved courts.');
    return;
  }
  savedOnly = !savedOnly;
  const btn = document.getElementById('btnSaved');
  if (btn) btn.classList.toggle('active', savedOnly);
  applyFilters();
};

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('regionFilter').value = '';
  document.getElementById('provinceFilter').value = '';
  document.getElementById('provinceFilterGroup').style.display = 'none';
  document.getElementById('cityFilter').value = '';
  document.getElementById('cityFilterGroup').style.display = 'none';
  document.getElementById('clearSearch').style.display = 'none';

  document.querySelectorAll('.type-filter, .access-filter')
    .forEach(cb => { cb.checked = true; });
  document.querySelectorAll('.amenity-filter')
    .forEach(cb => { cb.checked = false; });
  savedOnly = false;
  const btn = document.getElementById('btnSaved');
  if (btn) btn.classList.remove('active');

  applyFilters();
  showToast('✅ Filters reset');
}

// ============================================================
// NEAR ME
// ============================================================
window.locateAndShowNearby = function() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser.');
    return;
  }
  showToast('📍 Locating you...');
  navigator.geolocation.getCurrentPosition(function(pos) {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    showToast('📍 Found you! Sorting by nearest...');
    document.querySelector('[data-view="list"]')?.click();
    document.getElementById('sortSelect').value = 'nearest';
    applyFilters();
    // Also fly on map
    if (typeof map !== 'undefined') {
      map.flyTo([userLocation.lat, userLocation.lng], 12, { duration: 1.5 });
    }
  }, function() {
    showToast('Could not get your location. Check location permissions.');
  }, { enableHighAccuracy: true, timeout: 10000 });
};

// ============================================================
// STATS
// ============================================================
function updateStats(courts) {
  document.getElementById('totalCourts').textContent = courts.length;
  document.getElementById('totalCities').textContent =
    getUniqueCities(courts).length;
  document.getElementById('totalRegions').textContent =
    getUniqueRegions(courts).length;

  // Hero stats
  const heroCourts = document.getElementById('statCourts');
  if (heroCourts) heroCourts.textContent = courts.length;
  const heroCities = document.getElementById('statCities');
  if (heroCities) heroCities.textContent = getUniqueCities(courts).length;
}

// ============================================================
// ADD COURT FORM
// ============================================================
function submitCourtForm(e) {
  e.preventDefault();

  const amenities = [...document.querySelectorAll('.court-amenity:checked')]
    .map(cb => cb.value);

  const newCourt = {
    id: allCourts.length + 1,
    name: document.getElementById('courtName').value,
    city: document.getElementById('courtCity').value,
    province: document.getElementById('courtProvince').value,
    region: document.getElementById('courtRegion').value,
    type: document.getElementById('courtType').value,
    access: document.getElementById('courtAccess').value,
    rate: document.getElementById('courtRate').value,
    courts: parseInt(document.getElementById('courtCount').value) || 1,
    address: document.getElementById('courtAddress').value,
    hours: document.getElementById('courtHours').value,
    contact: document.getElementById('courtContact').value,
    lat: parseFloat(document.getElementById('courtLat').value) || null,
    lng: parseFloat(document.getElementById('courtLng').value) || null,
    amenities,
    notes: document.getElementById('courtNotes').value,
    verified: false,
    dateAdded: new Date().toISOString().split('T')[0]
  };

  allCourts.push(newCourt);
  filteredCourts = [...allCourts];

  renderMarkers(filteredCourts);
  renderSidebarList(filteredCourts);
  updateStats(allCourts);

  if (newCourt.lat && newCourt.lng) {
    flyToMarker(newCourt.id);
  }

  // Save to Firestore if user is logged in
  const user = PickleAuth.getCurrentUser();
  if (user) {
    PickleCourts.add(newCourt, user.uid).catch(err => {
      console.warn('Failed to save court to Firestore:', err);
    });
  }

  closeModal('addCourtModal');
  document.getElementById('addCourtForm').reset();
  document.getElementById('courtProvinceGroup').style.display = 'none';
  document.getElementById('courtCityGroup').style.display = 'none';
  showToast('🎉 Court added to PickleSpotPH! Salamat! 🇵🇭');
}

function populateAddCourtProvinces() {
  const region = document.getElementById('courtRegion').value;
  const provGroup = document.getElementById('courtProvinceGroup');
  const provSelect = document.getElementById('courtProvince');
  const cityGroup = document.getElementById('courtCityGroup');
  const citySelect = document.getElementById('courtCity');

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

function populateAddCourtCities() {
  const region = document.getElementById('courtRegion').value;
  const province = document.getElementById('courtProvince').value;
  const cityGroup = document.getElementById('courtCityGroup');
  const citySelect = document.getElementById('courtCity');

  citySelect.value = '';

  if (!region || !province) {
    cityGroup.style.display = 'none';
    return;
  }

  const cities = PH_LOCATIONS[region] && PH_LOCATIONS[region][province] ? [...PH_LOCATIONS[region][province]].sort() : [];
  citySelect.innerHTML = '<option value="">Select City</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
  cityGroup.style.display = 'block';
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  // Nav links
  document.querySelectorAll('.nav-link, .mobile-link').forEach(link => {
    if (link.dataset.view) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        showView(link.dataset.view);
        document.getElementById('mobileMenu').classList.remove('open');
      });
    }
  });

  // Hamburger menu
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('mobileMenu').classList.toggle('open');
  });

  // Sidebar search
  const searchInput = document.getElementById('searchInput');
  const clearSearch = document.getElementById('clearSearch');

  searchInput.addEventListener('input', () => {
    clearSearch.style.display = searchInput.value ? 'block' : 'none';
    applyFilters();
  });

  clearSearch.addEventListener('click', () => {
    searchInput.value = '';
    clearSearch.style.display = 'none';
    applyFilters();
  });

  // Filters
  document.getElementById('regionFilter').addEventListener('change', populateProvinces);
  document.getElementById('provinceFilter').addEventListener('change', populateCities);
  document.getElementById('cityFilter').addEventListener('change', applyFilters);
  document.querySelectorAll('.type-filter, .access-filter, .amenity-filter')
    .forEach(cb => cb.addEventListener('change', applyFilters));
  document.getElementById('resetFilters').addEventListener('click', resetFilters);

  // Map buttons
  document.getElementById('locateMe').addEventListener('click', locateUser);
  document.getElementById('toggleSidebar').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);

  // Add court — show plans first
  document.getElementById('addCourtBtn').addEventListener('click', openPlansModal);
  document.getElementById('heroAddBtn').addEventListener('click', openPlansModal);

  function openPlansModal() {
    document.getElementById('plansModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function openAddCourtModal() {
    document.getElementById('addCourtModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.getElementById('courtProvinceGroup').style.display = 'none';
    document.getElementById('courtCityGroup').style.display = 'none';
    initMainAddCourtMap();
  }

  document.getElementById('basicPlanCta').addEventListener('click', () => {
    closeModal('plansModal');
    const user = PickleAuth.getCurrentUser();
    if (!user) {
      showToast('Please log in to add a court — create a free account to save it permanently!');
      setTimeout(() => window.location.href = 'dashboard.html?add=1', 2500);
      return;
    }
    openAddCourtModal();
  });

  document.getElementById('mobileAddCourt').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('mobileMenu').classList.remove('open');
    openPlansModal();
  });

  // Close modals
  document.getElementById('modalClose')
    .addEventListener('click', () => closeModal('courtModal'));
  document.getElementById('addModalClose')
    .addEventListener('click', () => closeModal('addCourtModal'));
  document.getElementById('cancelAdd')
    .addEventListener('click', () => closeModal('addCourtModal'));
  document.getElementById('plansModalClose')
    .addEventListener('click', () => closeModal('plansModal'));

  // Close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Form submit
  document.getElementById('addCourtForm')
    .addEventListener('submit', submitCourtForm);

  // Add court cascade
  document.getElementById('courtRegion').addEventListener('change', populateAddCourtProvinces);
  document.getElementById('courtProvince').addEventListener('change', populateAddCourtCities);

  // List search
  document.getElementById('listSearchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allCourts.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.province || '').toLowerCase().includes(q)
    );
    listPage = 1;
    renderCourtsList(filtered);
  });

  // Sort
  document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    listPage = 1;
    renderCourtsList(sortCourts(filteredCourts, e.target.value));
  });

  // ESC key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay')
        .forEach(m => { m.style.display = 'none'; });
      document.body.style.overflow = '';
    }
  });
}

// ============================================================
// SIDEBAR TOGGLE
// ============================================================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebarCollapsed = !sidebarCollapsed;

  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open', !sidebarCollapsed);
  } else {
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
    setTimeout(() => map.invalidateSize(), 350);
  }
}

// ============================================================
// CUSTOMER CHAT WIDGET
// ============================================================
let customerChatId = null;
let customerChatUnsub = null;

function initCustomerChatWidget() {
  const stored = JSON.parse(localStorage.getItem('psp_chats') || '[]');
  if (stored.length === 0) return;

  document.getElementById('customerChatWidget').style.display = 'block';
  renderChatThreadsList();
}

function renderChatThreadsList() {
  const stored = JSON.parse(localStorage.getItem('psp_chats') || '[]');
  const container = document.getElementById('chatThreadsList');
  if (!container) return;

  container.style.display = '';
  container.style.flexDirection = '';
  container.style.gap = '';

  if (stored.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No conversations</div>';
    return;
  }

  container.innerHTML = stored.map(c => `
    <div class="cht-thread" onclick="openCustomerChat('${c.id}')">
      <div class="cht-name">${c.name}</div>
      <div class="cht-preview">${c.customerName} · ${c.customerContact}</div>
    </div>
  `).join('');
}

window.openCustomerChat = async function(chatId) {
  customerChatId = chatId;

  const threadsEl = document.getElementById('chatThreadsList');
  if (threadsEl) threadsEl.innerHTML = '';
  document.getElementById('chatPopupInputArea').style.display = 'flex';

  // Get chat info
  const stored = JSON.parse(localStorage.getItem('psp_chats') || '[]');
  const chat = stored.find(c => c.id === chatId);
  document.getElementById('chatPopupTitle').textContent = chat ? chat.name : 'Chat';

  // Listen to messages
  if (customerChatUnsub) customerChatUnsub();
  customerChatUnsub = PickleChat.onMessages(chatId, (msgs) => {
    renderCustomerMessages(msgs);
    // Mark as read by customer
    PickleChat.markCustomerRead(chatId);
  });
};

function renderCustomerMessages(msgs) {
  const container = document.getElementById('chatThreadsList');
  if (!container) return;

  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';
  container.innerHTML = msgs.map(m => {
    const isCustomer = m.senderId === 'customer';
    const time = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="cmsg ${isCustomer ? 'customer' : 'owner'}">
        ${m.text}
        <div class="ctime">${m.senderName} · ${time}</div>
      </div>
    `;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chatPopupSend').addEventListener('click', sendCustomerMessage);
document.getElementById('chatPopupInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCustomerMessage();
});

async function sendCustomerMessage() {
  const input = document.getElementById('chatPopupInput');
  const text = input.value.trim();
  if (!text || !customerChatId) return;

  input.value = '';
  try {
    await PickleChat.sendMessage(customerChatId, 'customer', 'You', text);
    // Notify the owner via email
    try {
      if (typeof PickleNotifications !== 'undefined') {
        PickleNotifications.notifyOwnerNewMessage(customerChatId, 'You', text);
      }
    } catch {}
  } catch (err) {
    showToast('Error sending message');
  }
}

// Chat widget UI controls
document.getElementById('chatWidgetBtn').addEventListener('click', () => {
  const popup = document.getElementById('chatPopup');
  if (popup.style.display === 'flex') {
    popup.style.display = 'none';
  } else {
    popup.style.display = 'flex';
    renderChatThreadsList();
    document.getElementById('chatPopupInputArea').style.display = 'none';
    document.getElementById('chatPopupTitle').textContent = 'Messages';
  }
});

document.getElementById('chatPopupClose').addEventListener('click', () => {
  document.getElementById('chatPopup').style.display = 'none';
  if (customerChatUnsub) { customerChatUnsub(); customerChatUnsub = null; }
  customerChatId = null;
});