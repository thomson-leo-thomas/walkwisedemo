/**
 * Hereabouts - Visitor Client Application
 * Handles GPS tracking, 3-point smoothing, 20m path snapping,
 * "What next?" scoring engine, bottom sheet, and Dijkstra navigation.
 */

(function () {
  'use strict';

  // State
  let venue = {
    venueName: 'Hereabouts',
    broadcast: '',
    center: [37.7695, -122.4465],
    zoom: 17,
    places: [],
    paths: [],
    zones: [],
    events: []
  };

  let mapInstance = null;
  let map = null;

  // Layer groups
  let placesLayer = null;
  let pathsLayer = null;
  let zonesLayer = null;
  let userGpsLayer = null;
  let activeRouteLayer = null;

  // GPS & Smoothing State
  let rawGps = null;
  let smoothedGps = null;
  let activeDotGps = null; // Either snapped or smoothed
  const gpsBuffer = []; // Last 3 readings
  let isSnapToPaths = true;
  let gpsWatchId = null;

  // Navigation State
  let currentNavTargetPlace = null;
  let activeRouteData = null;
  let pedestrianGraph = null;

  // UI State
  let activeCategoryFilter = 'all';
  let activeWhatNextTarget = null;
  let isSheetExpanded = false;

  // DOM Elements
  const venueTitle = document.getElementById('venueTitle');
  const broadcastBanner = document.getElementById('broadcastBanner');
  const broadcastMessage = document.getElementById('broadcastMessage');
  const btnCloseBroadcastBanner = document.getElementById('btnCloseBroadcastBanner');

  const snapToggle = document.getElementById('snapToggle');
  const snapStateText = document.getElementById('snapStateText');
  const btnRecenter = document.getElementById('btnRecenter');

  const whatNextCard = document.getElementById('whatNextCard');
  const whatNextBody = document.getElementById('whatNextBody');

  const routingHUD = document.getElementById('routingHUD');
  const hudDestName = document.getElementById('hudDestName');
  const hudDistance = document.getElementById('hudDistance');
  const hudMinutes = document.getElementById('hudMinutes');
  const hudTags = document.getElementById('hudTags');
  const btnClearRoute = document.getElementById('btnClearRoute');

  const bottomSheet = document.getElementById('bottomSheet');
  const sheetHeader = document.getElementById('sheetHeader');
  const eventCountBadge = document.getElementById('eventCountBadge');
  const categoryChips = document.getElementById('categoryChips');
  const placesList = document.getElementById('placesList');
  const visitorEventsList = document.getElementById('visitorEventsList');

  const placeDetailModal = document.getElementById('placeDetailModal');
  const btnCloseDetail = document.getElementById('btnCloseDetail');
  const detailPhotoWrap = document.getElementById('detailPhotoWrap');
  const detailPhoto = document.getElementById('detailPhoto');
  const detailCatBadge = document.getElementById('detailCatBadge');
  const detailStatusPill = document.getElementById('detailStatusPill');
  const detailName = document.getElementById('detailName');
  const detailDesc = document.getElementById('detailDesc');
  const detailDistance = document.getElementById('detailDistance');
  const detailWalkTime = document.getElementById('detailWalkTime');
  const detailWaitTime = document.getElementById('detailWaitTime');
  const btnTakeMeThere = document.getElementById('btnTakeMeThere');

  // =========================================================================
  // 1. Initialization
  // =========================================================================

  async function init() {
    await fetchVenueData();
    initMap();
    initCategoryChips();
    initBottomSheetEvents();
    startGpsTracking();
    renderVenueEntities();
    updateVisitorUI();

    // Periodic refresh for "What next?" and events every 30 seconds
    setInterval(() => {
      updateWhatNext();
      renderEventsList();
    }, 30000);
  }

  async function fetchVenueData() {
    try {
      const res = await fetch('/api/venue');
      if (res.ok) {
        venue = await res.json();
        venueTitle.textContent = venue.venueName || 'Hereabouts';

        // Check broadcast banner
        if (venue.broadcast && venue.broadcast.trim().length > 0) {
          broadcastMessage.textContent = venue.broadcast;
          broadcastBanner.classList.remove('hidden');
        } else {
          broadcastBanner.classList.add('hidden');
        }

        // Initialize Graph
        pedestrianGraph = new Hereabouts.PedestrianGraph();
        pedestrianGraph.loadPaths(venue.paths || []);
      }
    } catch (e) {
      console.error('Error fetching venue data:', e);
    }
  }

  function initMap() {
    const center = venue.center && venue.center.length === 2 ? venue.center : [37.7695, -122.4465];
    const zoom = venue.zoom || 17;

    mapInstance = Hereabouts.initHereaboutsMap('map', center, zoom);
    map = mapInstance.map;

    zonesLayer = L.layerGroup().addTo(map);
    pathsLayer = L.layerGroup().addTo(map);
    placesLayer = L.layerGroup().addTo(map);
    activeRouteLayer = L.layerGroup().addTo(map);
    userGpsLayer = L.layerGroup().addTo(map);

    // Desktop testing / simulation click handler
    map.on('click', (e) => {
      updateVisitorLocation(e.latlng.lat, e.latlng.lng, 5);
    });
  }

  // =========================================================================
  // 2. GPS Tracking, 3-Point Smoothing & 20m Path Snapping
  // =========================================================================

  function startGpsTracking() {
    if (!('geolocation' in navigator)) {
      useFallbackCenterLocation();
      return;
    }

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        updateVisitorLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        console.warn('Visitor geolocation error:', err.message);
        if (!smoothedGps) {
          useFallbackCenterLocation();
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  function useFallbackCenterLocation() {
    const center = venue.center || [37.7695, -122.4465];
    updateVisitorLocation(center[0], center[1], 10);
  }

  function updateVisitorLocation(lat, lng, accuracy) {
    rawGps = { lat, lng, accuracy: Math.round(accuracy || 5) };

    // 1. Maintain buffer of last 3 fixes
    gpsBuffer.push({ lat, lng });
    if (gpsBuffer.length > 3) {
      gpsBuffer.shift();
    }

    // 2. Calculate smoothed coordinate (average of last 3)
    const avgLat = gpsBuffer.reduce((sum, pt) => sum + pt.lat, 0) / gpsBuffer.length;
    const avgLng = gpsBuffer.reduce((sum, pt) => sum + pt.lng, 0) / gpsBuffer.length;
    smoothedGps = { lat: avgLat, lng: avgLng, accuracy: rawGps.accuracy };

    // 3. Apply Path Snapping (20m threshold)
    calculateSnappedLocation();

    // 4. Render Blue Dot
    renderUserDot();

    // 5. If route active, recalculate or update progress
    if (currentNavTargetPlace) {
      recalculateActiveRoute();
    }

    // 6. Update lists & "What next?"
    updateVisitorUI();
  }

  function calculateSnappedLocation() {
    if (!smoothedGps) return;

    if (!isSnapToPaths || !venue.paths || venue.paths.length === 0) {
      activeDotGps = { lat: smoothedGps.lat, lng: smoothedGps.lng, isSnapped: false };
      return;
    }

    // Project onto nearest path
    const pt = Hereabouts.toTurfPoint(smoothedGps.lat, smoothedGps.lng);
    let minDistance = Infinity;
    let nearestCoords = null;

    venue.paths.forEach(p => {
      if (!p.coordinates || p.coordinates.length < 2) return;
      const line = turf.lineString(p.coordinates);
      const snapped = turf.nearestPointOnLine(line, pt, { units: 'kilometers' });
      const distMeters = snapped.properties.dist * 1000;

      if (distMeters < minDistance) {
        minDistance = distMeters;
        nearestCoords = snapped.geometry.coordinates; // [lng, lat]
      }
    });

    if (minDistance <= 20 && nearestCoords) {
      // Snapped to path!
      activeDotGps = {
        lat: nearestCoords[1],
        lng: nearestCoords[0],
        isSnapped: true,
        snapDistance: minDistance
      };
    } else {
      // Too far from paths (> 20m), show raw smoothed location
      activeDotGps = {
        lat: smoothedGps.lat,
        lng: smoothedGps.lng,
        isSnapped: false
      };
    }
  }

  function renderUserDot() {
    if (!activeDotGps) return;

    userGpsLayer.clearLayers();

    // Subtle accuracy circle
    const accRadius = Math.min(smoothedGps ? smoothedGps.accuracy : 10, 30);
    const circle = L.circle([activeDotGps.lat, activeDotGps.lng], {
      radius: accRadius,
      color: '#0284c7',
      fillColor: '#0284c7',
      fillOpacity: 0.1,
      weight: 1
    });
    userGpsLayer.addLayer(circle);

    // Live blue dot
    const dotIcon = L.divIcon({
      html: '<div class="visitor-blue-dot"></div>',
      className: 'visitor-gps-marker',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker([activeDotGps.lat, activeDotGps.lng], {
      icon: dotIcon,
      zIndexOffset: 1000
    });

    userGpsLayer.addLayer(marker);
  }

  // Snap Toggle Event
  snapToggle.addEventListener('change', (e) => {
    isSnapToPaths = e.target.checked;
    snapStateText.textContent = isSnapToPaths ? 'ON' : 'OFF';
    calculateSnappedLocation();
    renderUserDot();
  });

  // Recenter Button
  btnRecenter.addEventListener('click', () => {
    if (activeDotGps) {
      map.setView([activeDotGps.lat, activeDotGps.lng], 18, { animate: true });
    } else {
      map.setView(venue.center || [37.7695, -122.4465], 17, { animate: true });
    }
  });

  // Close Broadcast Banner
  btnCloseBroadcastBanner.addEventListener('click', () => {
    broadcastBanner.classList.add('hidden');
  });

  // =========================================================================
  // 3. Map Entity Rendering (Places, Paths, Zones)
  // =========================================================================

  function renderVenueEntities() {
    renderZones();
    renderPaths();
    renderPlaces();
  }

  function renderZones() {
    zonesLayer.clearLayers();
    (venue.zones || []).forEach(z => {
      if (!z.coordinates || z.coordinates.length < 3) return;
      const latLngs = z.coordinates.map(c => [c[1], c[0]]);

      const poly = L.polygon(latLngs, {
        color: z.color || '#8b5cf6',
        fillColor: z.color || '#8b5cf6',
        fillOpacity: 0.18,
        weight: 1.5,
        dashArray: '3, 4'
      });

      poly.bindTooltip(`<b>${z.name}</b>`, { permanent: false, direction: 'center' });
      zonesLayer.addLayer(poly);
    });
  }

  function renderPaths() {
    pathsLayer.clearLayers();
    (venue.paths || []).forEach(p => {
      if (!p.coordinates || p.coordinates.length < 2) return;
      const latLngs = p.coordinates.map(c => [c[1], c[0]]);

      // Faintly drawn walking paths
      const line = L.polyline(latLngs, {
        color: '#64748b',
        weight: 3.5,
        opacity: 0.6,
        dashArray: '5, 8'
      });

      pathsLayer.addLayer(line);
    });
  }

  function renderPlaces() {
    placesLayer.clearLayers();
    (venue.places || []).forEach(place => {
      const isClosed = place.status === 'closed';
      const icon = Hereabouts.createPlaceIcon(place.category, isClosed);

      const marker = L.marker([place.lat, place.lng], { icon: icon });

      marker.on('click', () => {
        openPlaceDetail(place);
      });

      marker.bindTooltip(`<b>${place.name}</b>`, {
        direction: 'top',
        offset: [0, -38]
      });

      placesLayer.addLayer(marker);
    });
  }

  // =========================================================================
  // 4. "What next?" Recommendation Engine
  // =========================================================================

  function updateWhatNext() {
    if (!activeDotGps || !venue.places || venue.places.length === 0) {
      whatNextBody.textContent = 'Welcome! Tap any place to explore the grounds.';
      activeWhatNextTarget = null;
      return;
    }

    const now = new Date();
    const visitorLat = activeDotGps.lat;
    const visitorLng = activeDotGps.lng;

    // Check Events First
    const eligibleEvents = [];
    (venue.events || []).forEach(evt => {
      const place = venue.places.find(p => p.id === evt.placeId);
      if (!place || place.status === 'closed') return;

      const startTime = new Date(evt.startTime);
      const endTime = new Date(evt.endTime);

      // Event already ended?
      if (now >= endTime) return;

      // Distance and walk time
      const distMeters = Hereabouts.getDistanceMeters(visitorLat, visitorLng, place.lat, place.lng);
      const walkMins = Hereabouts.getWalkingMinutes(distMeters);

      // Will visitor reach before event ends?
      const arrivalTime = new Date(now.getTime() + walkMins * 60 * 1000);
      if (arrivalTime >= endTime) return; // Cannot reach in time!

      // Time until start
      const minsUntilStart = Math.round((startTime - now) / (60 * 1000));

      // Scoring: Urgency + Closeness
      let urgencyScore = 0;
      if (minsUntilStart <= 0) {
        // Happening right now
        urgencyScore = 90;
      } else if (minsUntilStart <= 60) {
        // Starting soon
        urgencyScore = Math.max(0, 100 - minsUntilStart);
      } else {
        urgencyScore = 20;
      }

      const closenessScore = Math.max(0, 60 - walkMins * 5);
      const totalScore = urgencyScore + closenessScore;

      eligibleEvents.push({
        event: evt,
        place: place,
        walkMins: walkMins,
        distMeters: distMeters,
        minsUntilStart: minsUntilStart,
        score: totalScore
      });
    });

    if (eligibleEvents.length > 0) {
      eligibleEvents.sort((a, b) => b.score - a.score);
      const best = eligibleEvents[0];
      activeWhatNextTarget = best.place;

      if (best.minsUntilStart <= 0) {
        whatNextBody.innerHTML = `<strong>${best.event.title}</strong>, ${best.place.name}. Happening now (${best.walkMins} min away). Go now.`;
      } else {
        whatNextBody.innerHTML = `<strong>${best.event.title}</strong>, ${best.place.name}. ${best.walkMins} min away, starts in ${best.minsUntilStart} min. Go now.`;
      }
      return;
    }

    // Fallback: Pick nearest popular open place (food, stage, building, etc.)
    const openPlaces = venue.places.filter(p => p.status !== 'closed');
    if (openPlaces.length > 0) {
      openPlaces.forEach(p => {
        p._dist = Hereabouts.getDistanceMeters(visitorLat, visitorLng, p.lat, p.lng);
      });
      openPlaces.sort((a, b) => a._dist - b._dist);
      const nearest = openPlaces[0];
      const mins = Hereabouts.getWalkingMinutes(nearest._dist);
      activeWhatNextTarget = nearest;

      whatNextBody.innerHTML = `<strong>${nearest.name}</strong> is open (${mins} min away). Tap for walking route.`;
      return;
    }

    whatNextBody.textContent = 'Explore the venue grounds using the map below.';
    activeWhatNextTarget = null;
  }

  whatNextCard.addEventListener('click', () => {
    if (activeWhatNextTarget) {
      navigateToPlace(activeWhatNextTarget);
    }
  });

  // =========================================================================
  // 5. Bottom Sheet & Nearby Places List
  // =========================================================================

  function initCategoryChips() {
    categoryChips.innerHTML = '<button class="filter-chip active" data-cat="all">All</button>';
    const cats = Hereabouts.CATEGORIES;
    Object.keys(cats).forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'filter-chip';
      btn.dataset.cat = key;
      btn.textContent = cats[key].label;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        activeCategoryFilter = key;
        renderPlacesList();
      });
      categoryChips.appendChild(btn);
    });

    categoryChips.querySelector('[data-cat="all"]').addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      categoryChips.querySelector('[data-cat="all"]').classList.add('active');
      activeCategoryFilter = 'all';
      renderPlacesList();
    });
  }

  function initBottomSheetEvents() {
    // Header click to toggle expanded / collapsed
    sheetHeader.addEventListener('click', () => {
      isSheetExpanded = !isSheetExpanded;
      if (isSheetExpanded) {
        bottomSheet.classList.remove('collapsed');
        bottomSheet.classList.add('expanded');
      } else {
        bottomSheet.classList.remove('expanded');
        bottomSheet.classList.add('collapsed');
      }
    });

    // Sheet Tabs toggle
    document.querySelectorAll('.sheet-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sheet-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.dataset.tab === 'nearby' ? 'tabNearby' : 'tabEvents';
        document.getElementById(targetId).classList.add('active');

        // Automatically expand sheet when tab clicked
        bottomSheet.classList.remove('collapsed');
        bottomSheet.classList.add('expanded');
        isSheetExpanded = true;
      });
    });
  }

  function updateVisitorUI() {
    renderPlacesList();
    renderEventsList();
    updateWhatNext();
  }

  function renderPlacesList() {
    placesList.innerHTML = '';
    const places = venue.places || [];
    if (places.length === 0) {
      placesList.innerHTML = `<div class="text-subtle text-sm text-center py-4">No places mapped for this venue yet.</div>`;
      return;
    }

    const visitorLat = activeDotGps ? activeDotGps.lat : (venue.center ? venue.center[0] : 0);
    const visitorLng = activeDotGps ? activeDotGps.lng : (venue.center ? venue.center[1] : 0);

    // Compute distance for each place
    const computedPlaces = places.map(p => {
      const dist = Hereabouts.getDistanceMeters(visitorLat, visitorLng, p.lat, p.lng);
      return {
        ...p,
        _distanceMeters: dist,
        _walkMins: Hereabouts.getWalkingMinutes(dist)
      };
    });

    // Filter by category
    const filtered = activeCategoryFilter === 'all'
      ? computedPlaces
      : computedPlaces.filter(p => p.category === activeCategoryFilter);

    // Sort by distance (nearest first)
    filtered.sort((a, b) => a._distanceMeters - b._distanceMeters);

    filtered.forEach(place => {
      const cat = Hereabouts.CATEGORIES[place.category] || Hereabouts.CATEGORIES.other;
      const isClosed = place.status === 'closed';

      const card = document.createElement('div');
      card.className = `place-card ${isClosed ? 'is-closed' : ''}`;

      card.innerHTML = `
        <div class="card-left">
          <div class="card-icon" style="background: ${isClosed ? '#475569' : cat.color}20; color: ${isClosed ? '#94a3b8' : cat.color}">
            ${cat.iconSvg}
          </div>
          <div class="card-info">
            <div class="card-title">${place.name}</div>
            <div class="card-sub">
              <span class="status-pill-sm status-${place.status}">${place.status}</span>
              ${place.waitTime > 0 ? `<span>&bull; ${place.waitTime}m wait</span>` : ''}
            </div>
          </div>
        </div>
        <div class="card-right">
          <div class="card-distance">${Hereabouts.formatDistance(place._distanceMeters)}</div>
          <div class="card-walk">${Hereabouts.formatWalkingTime(place._distanceMeters)}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        openPlaceDetail(place);
      });

      placesList.appendChild(card);
    });
  }

  function renderEventsList() {
    visitorEventsList.innerHTML = '';
    const events = venue.events || [];
    const now = new Date();
    const in60Mins = new Date(now.getTime() + 60 * 60 * 1000);

    // Filter events happening soon (next 60 mins or ongoing)
    const upcoming = events.filter(evt => {
      const end = new Date(evt.endTime);
      const start = new Date(evt.startTime);
      return end > now && start <= in60Mins;
    });

    eventCountBadge.textContent = upcoming.length;

    if (upcoming.length === 0) {
      visitorEventsList.innerHTML = `<div class="text-subtle text-sm text-center py-4">No events scheduled in the next 60 minutes.</div>`;
      return;
    }

    upcoming.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    upcoming.forEach(evt => {
      const place = venue.places.find(p => p.id === evt.placeId);
      const placeName = place ? place.name : 'Unknown Place';
      const start = new Date(evt.startTime);
      const end = new Date(evt.endTime);

      const isOngoing = now >= start && now <= end;
      const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &ndash; ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      const card = document.createElement('div');
      card.className = 'event-card';

      card.innerHTML = `
        <div class="card-left">
          <div class="card-icon" style="background: rgba(139, 92, 246, 0.2); color: #a78bfa">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div class="card-info">
            <div class="card-title">${evt.title}</div>
            <div class="card-sub">
              <span>📍 ${placeName}</span>
              ${isOngoing ? '<span class="status-pill-sm status-open">NOW</span>' : ''}
            </div>
          </div>
        </div>
        <div class="card-right">
          <div class="card-distance">${timeStr}</div>
        </div>
      `;

      if (place) {
        card.addEventListener('click', () => {
          openPlaceDetail(place);
        });
      }

      visitorEventsList.appendChild(card);
    });
  }

  // =========================================================================
  // 6. Place Detail View & "Take me there" Navigation
  // =========================================================================

  function openPlaceDetail(place) {
    currentNavTargetPlace = place;

    detailName.textContent = place.name;
    detailDesc.textContent = place.description || 'No additional details provided.';

    const cat = Hereabouts.CATEGORIES[place.category] || Hereabouts.CATEGORIES.other;
    detailCatBadge.textContent = cat.label;
    detailCatBadge.style.background = `${cat.color}25`;
    detailCatBadge.style.color = cat.color;

    detailStatusPill.className = `detail-status-pill status-${place.status}`;
    detailStatusPill.textContent = place.status.toUpperCase();

    detailWaitTime.textContent = place.waitTime > 0 ? `${place.waitTime} min` : 'None';

    const visitorLat = activeDotGps ? activeDotGps.lat : (venue.center ? venue.center[0] : 0);
    const visitorLng = activeDotGps ? activeDotGps.lng : (venue.center ? venue.center[1] : 0);
    const dist = Hereabouts.getDistanceMeters(visitorLat, visitorLng, place.lat, place.lng);

    detailDistance.textContent = Hereabouts.formatDistance(dist);
    detailWalkTime.textContent = `${Hereabouts.getWalkingMinutes(dist)} min`;

    if (place.photo) {
      detailPhoto.src = place.photo;
      detailPhotoWrap.classList.remove('hidden');
    } else {
      detailPhotoWrap.classList.add('hidden');
    }

    placeDetailModal.classList.remove('hidden');
  }

  btnCloseDetail.addEventListener('click', () => {
    placeDetailModal.classList.add('hidden');
  });

  btnTakeMeThere.addEventListener('click', () => {
    if (!currentNavTargetPlace) return;
    placeDetailModal.classList.add('hidden');
    navigateToPlace(currentNavTargetPlace);
  });

  function navigateToPlace(place) {
    currentNavTargetPlace = place;

    // Collapse bottom sheet
    bottomSheet.classList.remove('expanded');
    bottomSheet.classList.add('collapsed');
    isSheetExpanded = false;

    recalculateActiveRoute();
  }

  function recalculateActiveRoute() {
    if (!currentNavTargetPlace || !activeDotGps) return;

    if (!pedestrianGraph) {
      pedestrianGraph = new Hereabouts.PedestrianGraph();
      pedestrianGraph.loadPaths(venue.paths || []);
    }

    const route = pedestrianGraph.findRoute(
      activeDotGps.lat,
      activeDotGps.lng,
      currentNavTargetPlace.lat,
      currentNavTargetPlace.lng,
      venue.paths || []
    );

    activeRouteData = route;
    renderActiveRouteLine(route);

    // Update HUD
    hudDestName.textContent = currentNavTargetPlace.name;
    hudDistance.textContent = Hereabouts.formatDistance(route.totalDistance);
    hudMinutes.textContent = `~${route.walkingMinutes} min`;

    if (route.tagsEncountered && route.tagsEncountered.length > 0) {
      hudTags.textContent = route.tagsEncountered.join(', ');
      hudTags.classList.remove('hidden');
    } else {
      hudTags.classList.add('hidden');
    }

    routingHUD.classList.remove('hidden');
  }

  function renderActiveRouteLine(route) {
    activeRouteLayer.clearLayers();
    if (!route || !route.pathCoordinates || route.pathCoordinates.length < 2) return;

    // Glowing casing polyline
    const casing = L.polyline(route.pathCoordinates, {
      color: '#1d4ed8',
      weight: 8,
      opacity: 0.5
    });
    activeRouteLayer.addLayer(casing);

    // Main route polyline
    const line = L.polyline(route.pathCoordinates, {
      color: '#38bdf8',
      weight: 5,
      opacity: 0.95,
      dashArray: route.isDirectLine ? '6, 6' : null
    });
    activeRouteLayer.addLayer(line);

    // Fit map bounds to encompass user and route
    map.fitBounds(line.getBounds(), { padding: [80, 80] });
  }

  btnClearRoute.addEventListener('click', () => {
    currentNavTargetPlace = null;
    activeRouteData = null;
    activeRouteLayer.clearLayers();
    routingHUD.classList.add('hidden');
  });

  // Start app
  init();

})();
