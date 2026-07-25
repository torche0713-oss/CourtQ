// ============================================================
// MAP MODULE
// ============================================================

let map;
let markers = [];
let markerLayer;

// Court type colors
const MARKER_COLORS = {
  'Indoor': '#1565c0',
  'Outdoor': '#2e7d32',
  'Covered': '#f57c00'
};

const ACCESS_COLORS = {
  'Free': '#2e7d32',
  'Paid': '#e65100',
  'Members Only': '#7b1fa2'
};

function initMap() {
  map = L.map('map', {
    center: [12.8797, 121.7740], // Center of Philippines
    zoom: 6,
    zoomControl: true
  });

  // OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // Marker cluster group replacement (simple layergroup)
  markerLayer = L.layerGroup().addTo(map);
}

function createCustomIcon(court) {
  const color = MARKER_COLORS[court.type] || '#2e7d32';
  const accessColor = ACCESS_COLORS[court.access] || '#2e7d32';

  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
        </filter>
      </defs>
      <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 26 16 26S32 27 32 16C32 7.163 24.837 0 16 0z"
            fill="${color}" filter="url(#shadow)"/>
      <circle cx="16" cy="16" r="8" fill="white" opacity="0.9"/>
      <text x="16" y="20" text-anchor="middle" font-size="10" font-weight="bold"
            fill="${color}" font-family="Arial">
        ${court.type === 'Indoor' ? '🏢' : court.type === 'Covered' ? '🏗️' : '🌿'}
      </text>
    </svg>
  `;

  return L.divIcon({
    html: `<div style="
      background: ${color};
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      width: 22px;
      height: 22px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      cursor: pointer;
      transition: transform 0.2s;
    "></div>`,
    className: 'custom-court-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22]
  });
}

function createPopupContent(court) {
  const courtType = court.type || 'Outdoor';
  const typeTag = `<span class="tag tag-${courtType.toLowerCase()}">${courtType}</span>`;
  const accessClass = court.access === 'Free' ? 'tag-free' :
                      court.access === 'Paid' ? 'tag-paid' : 'tag-members';
  const accessTag = `<span class="tag ${accessClass}">${court.access || 'Public'}</span>`;

  const amenityIcons = (court.amenities || []).map(a => {
    const info = AMENITY_ICONS[a];
    return info ? `<i class="fas ${info.icon}" title="${info.label}" style="color:#2e7d32;font-size:13px"></i>` : '';
  }).join(' ');

  const isFav = typeof favoriteIds !== 'undefined' && favoriteIds.has(String(court.id));
  return `
    <div>
      <div class="popup-header">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <div class="popup-name">
            ${court.name}
            ${court.featured ? '<span style="font-size:9px;background:var(--accent);color:#fff;padding:1px 6px;border-radius:8px;margin-left:4px">★ Featured</span>' : ''}
          </div>
          <span style="font-size:16px;cursor:pointer;flex-shrink:0;color:${isFav ? '#e74c3c' : '#ccc'}" onclick="toggleFavorite('${court.id}','${encodeURIComponent(court.name)}')" title="${isFav ? 'Remove from saved' : 'Save court'}">
            <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
          </span>
        </div>
        <div class="popup-location">
          <i class="fas fa-map-marker-alt" style="font-size:10px"></i>
          ${court.city}, ${court.region}
        </div>
      </div>
      <div class="popup-body">
        <div class="popup-detail">
          <i class="fas fa-table-tennis-paddle-ball"></i>
          <span>${court.courts} court${court.courts > 1 ? 's' : ''}</span>
        </div>
        ${court.rate ? `
        <div class="popup-detail">
          <i class="fas fa-tag"></i>
          <span>${court.rate}</span>
        </div>` : ''}
        <div class="popup-detail">
          <i class="fas fa-clock"></i>
          <span>${court.hours}</span>
        </div>
        <div class="popup-tags">
          ${typeTag}
          ${accessTag}
          ${court.verified ? '<span class="tag" style="background:#e3f2fd;color:#1565c0">✓ Verified</span>' : ''}
          ${typeof court.id === 'number' ? '<span class="tag" style="background:#f5f5f5;color:#999">Sample</span>' : ''}
        </div>
        ${amenityIcons ? `<div style="margin:6px 0;display:flex;gap:6px">${amenityIcons}</div>` : ''}
        <button class="popup-btn" onclick="window.openCourtModal('${court.id}')">
          View Details
        </button>
      </div>
    </div>
  `;
}

function renderMarkers(courts) {
  // Clear existing markers
  markerLayer.clearLayers();
  markers = [];

  courts.forEach(court => {
    try {
      if (!court.lat || !court.lng) return;

      const icon = createCustomIcon(court);
      const marker = L.marker([court.lat, court.lng], { icon })
        .bindPopup(createPopupContent(court), {
          maxWidth: 280,
          minWidth: 220
        });

      marker.courtId = court.id;

      marker.on('click', () => {
        highlightSidebarItem(court.id);
      });

      markerLayer.addLayer(marker);
      markers.push(marker);
    } catch (e) {
      console.warn('[PickleSpot] Skipping marker for court:', court?.id, court?.name, e.message);
    }
  });
}

function highlightSidebarItem(courtId) {
  document.querySelectorAll('.sidebar-court-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id == courtId);
  });

  const activeItem = document.querySelector(`.sidebar-court-item[data-id="${courtId}"]`);
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function flyToMarker(courtId) {
  const marker = markers.find(m => m.courtId == courtId);
  if (marker) {
    map.flyTo(marker.getLatLng(), 16, { duration: 1 });
    setTimeout(() => marker.openPopup(), 1000);
  } else {
    const court = allCourts.find(c => c.id == courtId);
    if (court && !court.lat && !court.lng) {
      showToast('This court has no map location yet.');
    } else if (court) {
      showToast('Court not visible on current map view.');
    }
  }
}

function fitMapToCourts(courts) {
  const validCourts = courts.filter(c => c.lat && c.lng);
  if (validCourts.length === 0) return;

  const bounds = L.latLngBounds(validCourts.map(c => [c.lat, c.lng]));
  map.fitBounds(bounds, { padding: [40, 40] });
}

function locateUser() {
  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by your browser');
    return;
  }

  map.locate({ setView: true, maxZoom: 14 });

  map.on('locationfound', (e) => {
    const radius = e.accuracy / 2;
    L.circle(e.latlng, { radius, color: '#2e7d32', fillOpacity: 0.15 })
      .addTo(map);

    L.marker(e.latlng, {
      icon: L.divIcon({
        html: '<div style="background:#2e7d32;border:3px solid white;border-radius:50%;width:16px;height:16px;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })
    }).addTo(map).bindPopup('📍 You are here').openPopup();

    showToast('📍 Location found!');
  });

  map.on('locationerror', () => {
    showToast('Unable to find your location');
  });
}