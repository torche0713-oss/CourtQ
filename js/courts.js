// ============================================================
// COURTS DATA - Philippine Pickleball Courts Database
// ============================================================

const COURTS_DATA = [];

// Amenity icons mapping
const AMENITY_ICONS = {
  parking: { icon: 'fa-car', label: 'Parking' },
  lights: { icon: 'fa-lightbulb', label: 'Night Lights' },
  rental: { icon: 'fa-table-tennis-paddle-ball', label: 'Equipment Rental' },
  shower: { icon: 'fa-shower', label: 'Shower/Locker' },
  cafe: { icon: 'fa-mug-hot', label: 'Café/Food' },
  ac: { icon: 'fa-snowflake', label: 'A/C' }
};

// Get unique cities
function getUniqueCities(courts) {
  return [...new Set(courts.map(c => c.city))];
}

// Get unique regions
function getUniqueRegions(courts) {
  return [...new Set(courts.map(c => c.region))];
}

// Filter courts
function filterCourts(courts, filters) {
  return courts.filter(court => {
    // Search filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !(court.name || '').toLowerCase().includes(q) &&
        !(court.city || '').toLowerCase().includes(q) &&
        !(court.province || '').toLowerCase().includes(q) &&
        !(court.region || '').toLowerCase().includes(q)
      ) return false;
    }

    // Region filter
    if (filters.region && court.region !== filters.region) return false;

    // Province filter
    if (filters.province && court.province !== filters.province) return false;

    // City filter
    if (filters.city && court.city !== filters.city) return false;

    // Type filter
    if (filters.types && filters.types.length > 0) {
      if (!filters.types.includes(court.type)) return false;
    }

    // Access filter
    if (filters.access && filters.access.length > 0) {
      if (!filters.access.includes(court.access)) return false;
    }

    // Amenities filter
    if (filters.amenities && filters.amenities.length > 0) {
      if (!filters.amenities.every(a => court.amenities.includes(a))) return false;
    }

    return true;
  });
}

let userLocation = null;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Sort courts
function sortCourts(courts, sortBy) {
  return [...courts].sort((a, b) => {
    // Featured courts always first
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    switch (sortBy) {
      case 'name':
        return (a.name || '').localeCompare(b.name || '');
      case 'region':
        return (a.region || '').localeCompare(b.region || '');
      case 'type':
        return (a.type || '').localeCompare(b.type || '');
      case 'newest':
        return new Date(b.dateAdded) - new Date(a.dateAdded);
      case 'nearest':
        if (!userLocation) return 0;
        const dA = a.lat && a.lng ? haversine(userLocation.lat, userLocation.lng, a.lat, a.lng) : Infinity;
        const dB = b.lat && b.lng ? haversine(userLocation.lat, userLocation.lng, b.lat, b.lng) : Infinity;
        return dA - dB;
      default:
        return 0;
    }
  });
}
