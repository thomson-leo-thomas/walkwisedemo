/**
 * Hereabouts - Organizer Client Logic
 * Handles GPS tracking, 5s averaging, 3m path recording, 8m snapping/splitting,
 * zone drawing, editing, autosave, and the quality checklist.
 */

(function () {
  'use strict';

  // State
  let venue = {
    venueName: 'Hereabouts Venue',
    broadcast: '',
    center: [37.7695, -122.4465],
    zoom: 17,
    places: [],
    paths: [],
    zones: [],
    events: []
  };

  let organizerPin = sessionStorage.getItem('org_pin') || '';
  let mapInstance = null;
  let map = null;

  // Layer groups
  let placesLayer = null;
  let pathsLayer = null;
  let zonesLayer = null;
  let junctionsLayer = null;
  let userGpsLayer = null;
  let tempDrawingLayer = null;

  // GPS State
  let currentGps = null; // { lat, lng, accuracy }
  let isSimMode = false;
  let gpsWatchId = null;

  // Path Recording State
  let isRecordingPath = false;
  let recordedPoints = []; // [[lng, lat], ...]
  let recordingPolyline = null;
  let recordedPathDistanceMeters = 0;

  // Zone Drawing State
  let isDrawingZone = false;
  let drawnZonePoints = []; // [[lng, lat], ...]
  let tempZonePolygon = null;

  // 5s Sampling State
  let samplingTimer = null;
  let samplingCountdownVal = 5;
  let sampledReadings = [];

  // Temporary selected object for editing
  let activeEditingPlace = null;
  let activeEditingPath = null;

  // DOM Elements
  const headerVenueName = document.getElementById('headerVenueName');
  const saveIndicator = document.getElementById('saveIndicator');
  const gpsPill = document.getElementById('gpsPill');
  const gpsAccuracyText = document.getElementById('gpsAccuracyText');
  const topNoticeBanner = document.getElementById('topNoticeBanner');
  const topNoticeMessage = document.getElementById('topNoticeMessage');
  const btnDismissNotice = document.getElementById('btnDismissNotice');
  const qualityAlertBadge = document.getElementById('qualityAlertBadge');

  const btnAddPlace = document.getElementById('btnAddPlace');
  const btnRecordPath = document.getElementById('btnRecordPath');
  const btnDrawZone = document.getElementById('btnDrawZone');
  const btnManageEvents = document.getElementById('btnManageEvents');
  const btnOpenQuality = document.getElementById('btnOpenQuality');
  const btnOpenBroadcast = document.getElementById('btnOpenBroadcast');
  const simModeCheckbox = document.getElementById('simModeCheckbox');

  // Modals & HUDs
  const pinModal = document.getElementById('pinModal');
  const pinInput = document.getElementById('pinInput');
  const pinError = document.getElementById('pinError');
  const btnSubmitPin = document.getElementById('btnSubmitPin');

  const gpsSamplingModal = document.getElementById('gpsSamplingModal');
  const samplingCountdown = document.getElementById('samplingCountdown');
  const sampleCount = document.getElementById('sampleCount');
  const sampleAccuracy = document.getElementById('sampleAccuracy');
  const btnCancelSampling = document.getElementById('btnCancelSampling');

  const placeModal = document.getElementById('placeModal');
  const placeModalTitle = document.getElementById('placeModalTitle');
  const placeForm = document.getElementById('placeForm');
  const btnClosePlaceModal = document.getElementById('btnClosePlaceModal');
  const btnDeletePlace = document.getElementById('btnDeletePlace');
  const categoryPicker = document.getElementById('categoryPicker');

  const recordingHUD = document.getElementById('recordingHUD');
  const recPointsCount = document.getElementById('recPointsCount');
  const recDistance = document.getElementById('recDistance');
  const btnStopRecordPath = document.getElementById('btnStopRecordPath');

  const pathTagModal = document.getElementById('pathTagModal');
  const tagModalLength = document.getElementById('tagModalLength');
  const pathNameInput = document.getElementById('pathNameInput');
  const btnDiscardPath = document.getElementById('btnDiscardPath');
  const btnSavePath = document.getElementById('btnSavePath');

  const pathEditModal = document.getElementById('pathEditModal');
  const btnClosePathEdit = document.getElementById('btnClosePathEdit');
  const btnDeleteCurrentPath = document.getElementById('btnDeleteCurrentPath');
  const btnSaveEditedPath = document.getElementById('btnSaveEditedPath');

  const drawingZoneHUD = document.getElementById('drawingZoneHUD');
  const zoneVertexCount = document.getElementById('zoneVertexCount');
  const btnCancelZone = document.getElementById('btnCancelZone');
  const btnFinishZone = document.getElementById('btnFinishZone');

  const zoneModal = document.getElementById('zoneModal');
  const zoneName = document.getElementById('zoneName');
  const zoneColor = document.getElementById('zoneColor');
  const btnDiscardZone = document.getElementById('btnDiscardZone');
  const btnSaveZone = document.getElementById('btnSaveZone');

  const broadcastModal = document.getElementById('broadcastModal');
  const broadcastInput = document.getElementById('broadcastInput');
  const btnCloseBroadcast = document.getElementById('btnCloseBroadcast');
  const btnClearBroadcast = document.getElementById('btnClearBroadcast');
  const btnSaveBroadcast = document.getElementById('btnSaveBroadcast');

  const eventsModal = document.getElementById('eventsModal');
  const btnCloseEvents = document.getElementById('btnCloseEvents');
  const eventsList = document.getElementById('eventsList');
  const eventForm = document.getElementById('eventForm');
  const eventPlace = document.getElementById('eventPlace');
  const btnCancelEventEdit = document.getElementById('btnCancelEventEdit');

  const qualityDrawer = document.getElementById('qualityDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const btnCloseQuality = document.getElementById('btnCloseQuality');
  const venueNameInput = document.getElementById('venueNameInput');
  const btnSetMapCenter = document.getElementById('btnSetMapCenter');

  // =========================================================================
  // 1. Initialization & PIN Authentication
  // =========================================================================

  async function checkPinAuth(pin) {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin })
      });
      const data = await res.json();
      return data.success;
    } catch (e) {
      console.error('Auth error:', e);
      return false;
    }
  }

  async function initAuth() {
    if (organizerPin) {
      const ok = await checkPinAuth(organizerPin);
      if (ok) {
        pinModal.classList.add('hidden');
        initApp();
        return;
      }
    }
    // Show PIN modal
    pinModal.classList.remove('hidden');
    pinInput.focus();
  }

  btnSubmitPin.addEventListener('click', async () => {
    const entered = pinInput.value.trim();
    if (!entered) return;
    btnSubmitPin.textContent = 'Verifying...';
    const ok = await checkPinAuth(entered);
    btnSubmitPin.textContent = 'Unlock Studio';

    if (ok) {
      organizerPin = entered;
      sessionStorage.setItem('org_pin', entered);
      pinModal.classList.add('hidden');
      initApp();
    } else {
      pinError.classList.remove('hidden');
      pinInput.select();
    }
  });

  pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSubmitPin.click();
  });

  // =========================================================================
  // 2. Load Venue & Initialize Map
  // =========================================================================

  async function initApp() {
    await fetchVenueData();
    initMap();
    initCategoryPicker();
    startGpsTracking();
    renderAllLayers();
    updateQualityChecklist();
  }

  async function fetchVenueData() {
    try {
      const res = await fetch('/api/venue');
      if (res.ok) {
        venue = await res.json();
        headerVenueName.textContent = venue.venueName || 'Hereabouts';
        venueNameInput.value = venue.venueName || 'Hereabouts';
      }
    } catch (e) {
      console.error('Error fetching venue:', e);
    }
  }

  function initMap() {
    const center = venue.center && venue.center.length === 2 ? venue.center : [37.7695, -122.4465];
    const zoom = venue.zoom || 17;

    mapInstance = Hereabouts.initHereaboutsMap('map', center, zoom);
    map = mapInstance.map;

    // Layer groups for organizing venue entities
    zonesLayer = L.layerGroup().addTo(map);
    pathsLayer = L.layerGroup().addTo(map);
    junctionsLayer = L.layerGroup().addTo(map);
    placesLayer = L.layerGroup().addTo(map);
    userGpsLayer = L.layerGroup().addTo(map);
    tempDrawingLayer = L.layerGroup().addTo(map);

    // Map Click Handler (for Desktop simulation or zone drawing)
    map.on('click', handleMapClick);
  }

  // =========================================================================
  // 3. GPS Tracking & Accuracy Meter
  // =========================================================================

  function startGpsTracking() {
    if (!('geolocation' in navigator)) {
      showNotice('Geolocation not supported on this browser.');
      enableSimMode();
      return;
    }

    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (isSimMode) return; // Ignore if user enabled desktop simulator
        updateGpsState(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        console.warn('Geolocation warning/error:', err.message);
        if (!currentGps) {
          updateGpsPill(null, 'No GPS fix');
          // Offer simulation fallback notice
          showNotice('GPS signal unavailable. Enable "Simulate GPS" below to test.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  function updateGpsState(lat, lng, accuracy) {
    currentGps = { lat, lng, accuracy: Math.round(accuracy) };

    // Update Pill & Buttons
    updateGpsPill(currentGps.accuracy);

    // Render User Dot & Accuracy Circle
    renderUserGpsMarker(lat, lng, accuracy);

    // If recording path, handle new GPS position
    if (isRecordingPath) {
      handleRecordedGpsPoint(lat, lng, accuracy);
    }
  }

  function updateGpsPill(accuracy, fallbackText) {
    gpsPill.className = 'status-pill';

    if (accuracy === null || accuracy === undefined) {
      gpsPill.classList.add('gps-poor');
      gpsAccuracyText.textContent = fallbackText || 'Searching GPS...';
      setAddButtonsDisabled(true, 'Wait for better GPS');
      return;
    }

    gpsAccuracyText.textContent = `±${accuracy} m`;

    if (accuracy <= 10) {
      gpsPill.classList.add('gps-good');
      setAddButtonsDisabled(false);
      hideNotice();
    } else if (accuracy <= 25) {
      gpsPill.classList.add('gps-moderate');
      setAddButtonsDisabled(false);
      hideNotice();
    } else {
      gpsPill.classList.add('gps-poor');
      setAddButtonsDisabled(true, `Accuracy ±${accuracy}m too low (>25m). Wait for better GPS.`);
      showNotice(`GPS accuracy is ±${accuracy}m. Move away from tall buildings for a better fix.`);
    }
  }

  function setAddButtonsDisabled(disabled, reason = '') {
    if (isSimMode) {
      // Never disable in simulation mode
      btnAddPlace.disabled = false;
      btnRecordPath.disabled = false;
      btnAddPlace.removeAttribute('title');
      btnRecordPath.removeAttribute('title');
      return;
    }

    btnAddPlace.disabled = disabled;
    btnRecordPath.disabled = disabled && !isRecordingPath;

    if (disabled) {
      btnAddPlace.title = reason;
      btnRecordPath.title = reason;
    } else {
      btnAddPlace.removeAttribute('title');
      btnRecordPath.removeAttribute('title');
    }
  }

  function renderUserGpsMarker(lat, lng, accuracy) {
    userGpsLayer.clearLayers();

    // Accuracy Circle
    const circle = L.circle([lat, lng], {
      radius: accuracy,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 1.5
    });
    userGpsLayer.addLayer(circle);

    // User Blue Dot
    const dotIcon = L.divIcon({
      html: '<div class="gps-user-dot"></div>',
      className: 'gps-user-marker',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    const marker = L.marker([lat, lng], { icon: dotIcon, zIndexOffset: 1000 });
    userGpsLayer.addLayer(marker);
  }

  // Simulation Mode Toggle
  simModeCheckbox.addEventListener('change', (e) => {
    isSimMode = e.target.checked;
    if (isSimMode) {
      showNotice('Simulation Mode ON: Click anywhere on the map to set organizer GPS position.');
      if (!currentGps) {
        const center = map.getCenter();
        updateGpsState(center.lat, center.lng, 4);
      } else {
        updateGpsPill(4);
      }
    } else {
      hideNotice();
      if (currentGps) updateGpsPill(currentGps.accuracy);
    }
  });

  function enableSimMode() {
    isSimMode = true;
    simModeCheckbox.checked = true;
    const center = map.getCenter();
    updateGpsState(center.lat, center.lng, 4);
  }

  function handleMapClick(e) {
    // If drawing zone
    if (isDrawingZone) {
      addZoneVertex(e.latlng.lat, e.latlng.lng);
      return;
    }

    // If simulating GPS
    if (isSimMode) {
      updateGpsState(e.latlng.lat, e.latlng.lng, 3);
    }
  }

  // =========================================================================
  // 4. "Add Place Here" & 5-Second GPS Sampling
  // =========================================================================

  btnAddPlace.addEventListener('click', () => {
    if (!currentGps) {
      alert('Waiting for initial GPS location. Please wait or turn on Simulation Mode.');
      return;
    }

    if (!isSimMode && currentGps.accuracy > 25) {
      alert('GPS accuracy is worse than 25m. Please wait for a clearer sky signal.');
      return;
    }

    startPlaceSampling();
  });

  function startPlaceSampling() {
    gpsSamplingModal.classList.remove('hidden');
    sampledReadings = [];
    samplingCountdownVal = 5;
    samplingCountdown.textContent = samplingCountdownVal;
    sampleCount.textContent = '0';
    sampleAccuracy.textContent = currentGps ? `±${currentGps.accuracy} m` : '±-- m';

    // Record initial point if valid
    if (currentGps && currentGps.accuracy <= 25) {
      sampledReadings.push({ lat: currentGps.lat, lng: currentGps.lng, acc: currentGps.accuracy });
      sampleCount.textContent = '1';
    }

    // Interval to sample every 1 second
    samplingTimer = setInterval(() => {
      samplingCountdownVal--;
      samplingCountdown.textContent = samplingCountdownVal;

      if (currentGps && (isSimMode || currentGps.accuracy <= 25)) {
        sampledReadings.push({ lat: currentGps.lat, lng: currentGps.lng, acc: currentGps.accuracy });
        sampleCount.textContent = sampledReadings.length;
        const bestAcc = Math.min(...sampledReadings.map(r => r.acc));
        sampleAccuracy.textContent = `±${bestAcc} m`;
      }

      if (samplingCountdownVal <= 0) {
        clearInterval(samplingTimer);
        gpsSamplingModal.classList.add('hidden');
        finishSamplingAndOpenForm();
      }
    }, 1000);
  }

  btnCancelSampling.addEventListener('click', () => {
    if (samplingTimer) clearInterval(samplingTimer);
    gpsSamplingModal.classList.add('hidden');
  });

  function finishSamplingAndOpenForm() {
    if (sampledReadings.length === 0) {
      alert('Could not acquire GPS readings with accuracy better than 25m. Please move to an open area.');
      return;
    }

    // Calculate arithmetic mean of coordinates
    const sumLat = sampledReadings.reduce((sum, r) => sum + r.lat, 0);
    const sumLng = sampledReadings.reduce((sum, r) => sum + r.lng, 0);
    const avgLat = Number((sumLat / sampledReadings.length).toFixed(7));
    const avgLng = Number((sumLng / sampledReadings.length).toFixed(7));

    openAddPlaceModal(avgLat, avgLng);
  }

  function initCategoryPicker() {
    categoryPicker.innerHTML = '';
    const cats = Hereabouts.CATEGORIES;
    Object.keys(cats).forEach((key, index) => {
      const cat = cats[key];
      const div = document.createElement('div');
      div.className = `category-option ${index === 0 ? 'selected' : ''}`;
      div.dataset.category = key;
      div.innerHTML = `
        <div class="cat-icon-wrap" style="color: ${cat.color}">${cat.iconSvg}</div>
        <div class="cat-label">${cat.label}</div>
      `;
      div.addEventListener('click', () => {
        document.querySelectorAll('.category-option').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        document.getElementById('placeCategory').value = key;
      });
      categoryPicker.appendChild(div);
    });
  }

  function openAddPlaceModal(lat, lng) {
    activeEditingPlace = null;
    placeModalTitle.textContent = 'Add Place Here';
    placeForm.reset();
    document.getElementById('placeId').value = 'p_' + Date.now().toString(36);
    document.getElementById('placeLat').value = lat;
    document.getElementById('placeLng').value = lng;
    document.getElementById('displayLat').textContent = lat.toFixed(6);
    document.getElementById('displayLng').textContent = lng.toFixed(6);
    document.getElementById('placeCategory').value = 'entrance';
    document.getElementById('placeStatus').value = 'open';
    document.getElementById('placeWaitTime').value = '0';
    btnDeletePlace.classList.add('hidden');

    resetPhotoPreview();
    selectCategoryInPicker('entrance');

    placeModal.classList.remove('hidden');
  }

  function openEditPlaceModal(place) {
    activeEditingPlace = place;
    placeModalTitle.textContent = 'Edit Place';
    document.getElementById('placeId').value = place.id;
    document.getElementById('placeLat').value = place.lat;
    document.getElementById('placeLng').value = place.lng;
    document.getElementById('displayLat').textContent = Number(place.lat).toFixed(6);
    document.getElementById('displayLng').textContent = Number(place.lng).toFixed(6);
    document.getElementById('placeName').value = place.name || '';
    document.getElementById('placeCategory').value = place.category || 'other';
    document.getElementById('placeStatus').value = place.status || 'open';
    document.getElementById('placeWaitTime').value = place.waitTime || 0;
    document.getElementById('placeDescription').value = place.description || '';

    btnDeletePlace.classList.remove('hidden');
    selectCategoryInPicker(place.category || 'other');

    if (place.photo) {
      showPhotoPreview(place.photo);
    } else {
      resetPhotoPreview();
    }

    placeModal.classList.remove('hidden');
  }

  function selectCategoryInPicker(categoryKey) {
    document.querySelectorAll('.category-option').forEach(el => {
      if (el.dataset.category === categoryKey) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
    document.getElementById('placeCategory').value = categoryKey;
  }

  btnClosePlaceModal.addEventListener('click', () => {
    placeModal.classList.add('hidden');
  });

  // Photo Handling (base64)
  const placePhotoInput = document.getElementById('placePhotoInput');
  const btnTriggerPhoto = document.getElementById('btnTriggerPhoto');
  const photoPreviewWrap = document.getElementById('photoPreviewWrap');
  const photoPreviewImg = document.getElementById('photoPreviewImg');
  const btnRemovePhoto = document.getElementById('btnRemovePhoto');
  let currentBase64Photo = '';

  btnTriggerPhoto.addEventListener('click', () => placePhotoInput.click());

  placePhotoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Resize and convert to small base64
    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scale = MAX_WIDTH / img.width;
        canvas.width = Math.min(img.width, MAX_WIDTH);
        canvas.height = img.height * (canvas.width / img.width);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        currentBase64Photo = canvas.toDataURL('image/jpeg', 0.7);
        showPhotoPreview(currentBase64Photo);
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });

  btnRemovePhoto.addEventListener('click', () => resetPhotoPreview());

  function showPhotoPreview(src) {
    currentBase64Photo = src;
    photoPreviewImg.src = src;
    photoPreviewWrap.classList.remove('hidden');
  }

  function resetPhotoPreview() {
    currentBase64Photo = '';
    placePhotoInput.value = '';
    photoPreviewImg.src = '';
    photoPreviewWrap.classList.add('hidden');
  }

  // Save Place form submit
  placeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('placeId').value;
    const name = document.getElementById('placeName').value.trim();
    const category = document.getElementById('placeCategory').value;
    const status = document.getElementById('placeStatus').value;
    const waitTime = parseInt(document.getElementById('placeWaitTime').value, 10) || 0;
    const description = document.getElementById('placeDescription').value.trim();
    const lat = parseFloat(document.getElementById('placeLat').value);
    const lng = parseFloat(document.getElementById('placeLng').value);

    const placeData = {
      id: id,
      name: name,
      category: category,
      status: status,
      waitTime: waitTime,
      description: description,
      photo: currentBase64Photo,
      lat: lat,
      lng: lng,
      updatedAt: new Date().toISOString()
    };

    // Update or Insert
    const existingIndex = venue.places.findIndex(p => p.id === id);
    if (existingIndex !== -1) {
      venue.places[existingIndex] = { ...venue.places[existingIndex], ...placeData };
    } else {
      placeData.createdAt = new Date().toISOString();
      venue.places.push(placeData);
    }

    placeModal.classList.add('hidden');
    renderPlaces();
    autosave();
    updateQualityChecklist();
  });

  // Delete Place
  btnDeletePlace.addEventListener('click', () => {
    if (!activeEditingPlace) return;
    if (confirm(`Delete place "${activeEditingPlace.name}"?`)) {
      venue.places = venue.places.filter(p => p.id !== activeEditingPlace.id);
      placeModal.classList.add('hidden');
      renderPlaces();
      autosave();
      updateQualityChecklist();
    }
  });

  // =========================================================================
  // 5. "Record Path" (3m movement filter, simplify, 8m snap & split)
  // =========================================================================

  btnRecordPath.addEventListener('click', () => {
    if (isRecordingPath) return;

    if (!currentGps) {
      alert('GPS location not ready. Please wait or enable Simulation Mode.');
      return;
    }

    if (!isSimMode && currentGps.accuracy > 25) {
      alert('GPS accuracy is worse than 25m. Please wait for better signal before recording paths.');
      return;
    }

    startPathRecording();
  });

  function startPathRecording() {
    isRecordingPath = true;
    recordedPoints = [];
    recordedPathDistanceMeters = 0;

    // Show HUD
    recordingHUD.classList.remove('hidden');
    recPointsCount.textContent = '0 pts';
    recDistance.textContent = '0 m';

    // Start polyline on map
    if (recordingPolyline) map.removeLayer(recordingPolyline);
    recordingPolyline = L.polyline([], {
      color: '#00e5ff',
      weight: 5,
      opacity: 0.9,
      dashArray: '4, 8'
    }).addTo(map);

    // Save initial point
    if (currentGps) {
      recordedPoints.push([currentGps.lng, currentGps.lat]);
      recordingPolyline.addLatLng([currentGps.lat, currentGps.lng]);
      recPointsCount.textContent = '1 pts';
    }
  }

  function handleRecordedGpsPoint(lat, lng, accuracy) {
    if (!isSimMode && accuracy > 25) return; // Discard readings > 25m

    if (recordedPoints.length === 0) {
      recordedPoints.push([lng, lat]);
      recordingPolyline.addLatLng([lat, lng]);
      recPointsCount.textContent = '1 pts';
      return;
    }

    // Check distance from previous point (must be >= 3 meters)
    const prevPt = recordedPoints[recordedPoints.length - 1];
    const distMeters = Hereabouts.getDistanceMeters(prevPt[1], prevPt[0], lat, lng);

    if (distMeters >= 3) {
      recordedPoints.push([lng, lat]);
      recordingPolyline.addLatLng([lat, lng]);
      recordedPathDistanceMeters += distMeters;

      recPointsCount.textContent = `${recordedPoints.length} pts`;
      recDistance.textContent = Hereabouts.formatDistance(recordedPathDistanceMeters);
    }
  }

  btnStopRecordPath.addEventListener('click', () => {
    if (!isRecordingPath) return;
    isRecordingPath = false;
    recordingHUD.classList.add('hidden');

    if (recordedPoints.length < 2) {
      alert('Path recording was too short (< 2 points). Discarded.');
      if (recordingPolyline) map.removeLayer(recordingPolyline);
      return;
    }

    // Simplify path using Turf
    const lineGeo = turf.lineString(recordedPoints);
    const simplified = turf.simplify(lineGeo, { tolerance: 0.000005, highQuality: true });
    recordedPoints = simplified.geometry.coordinates;

    const finalLength = Hereabouts.calculatePolylineLength(recordedPoints);
    tagModalLength.textContent = Hereabouts.formatDistance(finalLength);
    pathNameInput.value = '';
    document.querySelectorAll('.pathTagCheckbox').forEach(cb => cb.checked = false);

    pathTagModal.classList.remove('hidden');
  });

  btnDiscardPath.addEventListener('click', () => {
    pathTagModal.classList.add('hidden');
    if (recordingPolyline) map.removeLayer(recordingPolyline);
    recordedPoints = [];
  });

  btnSavePath.addEventListener('click', () => {
    const selectedTags = [];
    document.querySelectorAll('.pathTagCheckbox:checked').forEach(cb => {
      selectedTags.push(cb.value);
    });

    const customName = pathNameInput.value.trim() || `Path ${venue.paths.length + 1}`;

    // Apply automatic path network snapping (8m) and line-splitting
    const snapResult = Hereabouts.snapAndIntegratePath(recordedPoints, venue.paths, 8);

    const newPath = {
      id: 'path_' + Date.now().toString(36),
      name: customName,
      tags: selectedTags,
      coordinates: snapResult.newPathCoords,
      lengthMeters: Hereabouts.calculatePolylineLength(snapResult.newPathCoords),
      createdAt: new Date().toISOString()
    };

    // Update venue paths with split lines + new path
    venue.paths = snapResult.updatedPaths;
    venue.paths.push(newPath);

    pathTagModal.classList.add('hidden');
    if (recordingPolyline) map.removeLayer(recordingPolyline);
    recordedPoints = [];

    renderPaths();
    autosave();
    updateQualityChecklist();
  });

  // Edit / Delete Existing Path
  function openEditPathModal(path) {
    activeEditingPath = path;
    document.getElementById('editPathId').value = path.id;
    document.getElementById('editPathName').value = path.name || '';
    document.querySelectorAll('.editPathTagCheckbox').forEach(cb => {
      cb.checked = (path.tags || []).includes(cb.value);
    });
    pathEditModal.classList.remove('hidden');
  }

  btnClosePathEdit.addEventListener('click', () => pathEditModal.classList.add('hidden'));

  btnSaveEditedPath.addEventListener('click', () => {
    if (!activeEditingPath) return;
    const name = document.getElementById('editPathName').value.trim();
    const tags = [];
    document.querySelectorAll('.editPathTagCheckbox:checked').forEach(cb => tags.push(cb.value));

    activeEditingPath.name = name;
    activeEditingPath.tags = tags;

    pathEditModal.classList.add('hidden');
    renderPaths();
    autosave();
  });

  btnDeleteCurrentPath.addEventListener('click', () => {
    if (!activeEditingPath) return;
    if (confirm(`Delete path "${activeEditingPath.name || 'Path'}"?`)) {
      venue.paths = venue.paths.filter(p => p.id !== activeEditingPath.id);
      pathEditModal.classList.add('hidden');
      renderPaths();
      autosave();
      updateQualityChecklist();
    }
  });

  // =========================================================================
  // 6. "Draw Zone" (Polygon tapping & naming)
  // =========================================================================

  btnDrawZone.addEventListener('click', () => {
    if (isDrawingZone) return;
    startDrawingZone();
  });

  function startDrawingZone() {
    isDrawingZone = true;
    drawnZonePoints = [];
    zoneVertexCount.textContent = '0';
    drawingZoneHUD.classList.remove('hidden');

    if (tempZonePolygon) map.removeLayer(tempZonePolygon);
    tempZonePolygon = L.polygon([], {
      color: '#8b5cf6',
      fillColor: '#8b5cf6',
      fillOpacity: 0.25,
      weight: 2,
      dashArray: '5, 5'
    }).addTo(map);
  }

  function addZoneVertex(lat, lng) {
    drawnZonePoints.push([lng, lat]);
    tempZonePolygon.addLatLng([lat, lng]);
    zoneVertexCount.textContent = drawnZonePoints.length;
  }

  btnCancelZone.addEventListener('click', () => {
    isDrawingZone = false;
    drawingZoneHUD.classList.add('hidden');
    if (tempZonePolygon) map.removeLayer(tempZonePolygon);
    drawnZonePoints = [];
  });

  btnFinishZone.addEventListener('click', () => {
    if (drawnZonePoints.length < 3) {
      alert('A zone polygon requires at least 3 points. Tap more points on the map.');
      return;
    }

    isDrawingZone = false;
    drawingZoneHUD.classList.add('hidden');
    zoneName.value = '';
    zoneModal.classList.remove('hidden');
  });

  btnDiscardZone.addEventListener('click', () => {
    zoneModal.classList.add('hidden');
    if (tempZonePolygon) map.removeLayer(tempZonePolygon);
    drawnZonePoints = [];
  });

  btnSaveZone.addEventListener('click', () => {
    const name = zoneName.value.trim() || `Zone ${venue.zones.length + 1}`;
    const color = zoneColor.value || '#8b5cf6';

    const newZone = {
      id: 'zone_' + Date.now().toString(36),
      name: name,
      color: color,
      coordinates: drawnZonePoints,
      createdAt: new Date().toISOString()
    };

    venue.zones.push(newZone);
    zoneModal.classList.add('hidden');
    if (tempZonePolygon) map.removeLayer(tempZonePolygon);
    drawnZonePoints = [];

    renderZones();
    autosave();
    updateQualityChecklist();
  });

  // =========================================================================
  // 7. Broadcast Message
  // =========================================================================

  btnOpenBroadcast.addEventListener('click', () => {
    broadcastInput.value = venue.broadcast || '';
    broadcastModal.classList.remove('hidden');
  });

  btnCloseBroadcast.addEventListener('click', () => broadcastModal.classList.add('hidden'));

  btnClearBroadcast.addEventListener('click', () => {
    broadcastInput.value = '';
    venue.broadcast = '';
    broadcastModal.classList.add('hidden');
    autosave();
  });

  btnSaveBroadcast.addEventListener('click', () => {
    venue.broadcast = broadcastInput.value.trim();
    broadcastModal.classList.add('hidden');
    autosave();
  });

  // =========================================================================
  // 8. Events Management
  // =========================================================================

  btnManageEvents.addEventListener('click', () => {
    renderEventsManager();
    eventsModal.classList.remove('hidden');
  });

  btnCloseEvents.addEventListener('click', () => eventsModal.classList.add('hidden'));

  function renderEventsManager() {
    // Populate place options
    eventPlace.innerHTML = '';
    venue.places.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.category})`;
      eventPlace.appendChild(opt);
    });

    // Populate events list
    eventsList.innerHTML = '';
    if (!venue.events || venue.events.length === 0) {
      eventsList.innerHTML = `<div class="text-subtle text-sm text-center py-4">No events scheduled yet. Add one below!</div>`;
      return;
    }

    venue.events.forEach(evt => {
      const card = document.createElement('div');
      card.className = 'event-mgmt-card';
      const place = venue.places.find(p => p.id === evt.placeId);
      const placeName = place ? place.name : 'Unknown Place';

      card.innerHTML = `
        <div class="event-mgmt-info">
          <strong>${evt.title}</strong>
          <div class="text-subtle text-sm">📍 ${placeName} &bull; ⏰ ${new Date(evt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &ndash; ${new Date(evt.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <button class="btn btn-danger btn-sm" data-id="${evt.id}">Delete</button>
      `;

      card.querySelector('button').addEventListener('click', () => {
        if (confirm(`Delete event "${evt.title}"?`)) {
          venue.events = venue.events.filter(e => e.id !== evt.id);
          renderEventsManager();
          autosave();
          updateQualityChecklist();
        }
      });

      eventsList.appendChild(card);
    });
  }

  eventForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('eventTitle').value.trim();
    const pId = document.getElementById('eventPlace').value;
    const start = document.getElementById('eventStart').value;
    const end = document.getElementById('eventEnd').value;
    const desc = document.getElementById('eventDesc').value.trim();

    if (!title || !pId || !start || !end) return;

    const newEvt = {
      id: 'evt_' + Date.now().toString(36),
      title: title,
      placeId: pId,
      startTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      description: desc
    };

    if (!venue.events) venue.events = [];
    venue.events.push(newEvt);

    eventForm.reset();
    renderEventsManager();
    autosave();
    updateQualityChecklist();
  });

  // =========================================================================
  // 9. Mapping Quality Checklist Drawer
  // =========================================================================

  btnOpenQuality.addEventListener('click', () => {
    qualityDrawer.classList.add('open');
    drawerBackdrop.classList.remove('hidden');
    updateQualityChecklist();
  });

  function closeQualityDrawer() {
    qualityDrawer.classList.remove('open');
    drawerBackdrop.classList.add('hidden');
  }

  btnCloseQuality.addEventListener('click', closeQualityDrawer);
  drawerBackdrop.addEventListener('click', closeQualityDrawer);

  venueNameInput.addEventListener('change', () => {
    venue.venueName = venueNameInput.value.trim() || 'Hereabouts Venue';
    headerVenueName.textContent = venue.venueName;
    autosave();
  });

  btnSetMapCenter.addEventListener('click', () => {
    const center = map.getCenter();
    venue.center = [Number(center.lat.toFixed(6)), Number(center.lng.toFixed(6))];
    venue.zoom = map.getZoom();
    autosave();
    alert('Venue map center updated to current screen view!');
  });

  // Venue Backup & Restore (Export / Import JSON)
  const btnExportVenue = document.getElementById('btnExportVenue');
  const btnImportTrigger = document.getElementById('btnImportTrigger');
  const venueFileInput = document.getElementById('venueFileInput');

  if (btnExportVenue) {
    btnExportVenue.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(venue, null, 2));
      const downloadAnchor = document.createElement('a');
      const safeName = (venue.venueName || 'backup').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `hereabouts-${safeName}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  if (btnImportTrigger && venueFileInput) {
    btnImportTrigger.addEventListener('click', () => venueFileInput.click());
    venueFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const imported = JSON.parse(evt.target.result);
          if (imported && Array.isArray(imported.places)) {
            venue = {
              venueName: imported.venueName || venue.venueName,
              broadcast: imported.broadcast || '',
              center: Array.isArray(imported.center) ? imported.center : venue.center,
              zoom: imported.zoom || venue.zoom,
              places: imported.places || [],
              paths: imported.paths || [],
              zones: imported.zones || [],
              events: imported.events || []
            };
            headerVenueName.textContent = venue.venueName;
            venueNameInput.value = venue.venueName;
            renderAllLayers();
            updateQualityChecklist();
            autosave();
            alert('Venue backup imported and saved successfully!');
          } else {
            alert('Invalid venue backup file format.');
          }
        } catch (err) {
          alert('Failed to parse JSON file.');
        }
      };
      reader.readAsText(file);
      venueFileInput.value = '';
    });
  }

  function updateQualityChecklist() {
    const places = venue.places || [];
    const paths = venue.paths || [];
    const zones = venue.zones || [];
    const events = venue.events || [];

    document.getElementById('statPlacesCount').textContent = places.length;
    document.getElementById('statPathsCount').textContent = paths.length;
    document.getElementById('statZonesCount').textContent = zones.length;
    document.getElementById('statEventsCount').textContent = events.length;

    const warnings = [];

    // 1. Check Place Reachability (Distance to nearest path <= 30m)
    const chkPlaces = document.getElementById('chkPlaces');
    const chkPlacesDesc = document.getElementById('chkPlacesDesc');
    let unreachableCount = 0;

    if (places.length === 0) {
      chkPlaces.className = 'failed';
      chkPlaces.querySelector('.chk-icon').textContent = '⚠️';
      chkPlacesDesc.textContent = 'No places mapped yet. Add your first venue place!';
    } else if (paths.length === 0) {
      chkPlaces.className = 'failed';
      chkPlaces.querySelector('.chk-icon').textContent = '⚠️';
      chkPlacesDesc.textContent = `${places.length} places mapped, but no walking paths exist yet.`;
      warnings.push(`No walking paths recorded. Places are unreachable for routing.`);
    } else {
      places.forEach(p => {
        let minDist = Infinity;
        paths.forEach(pth => {
          if (!pth.coordinates || pth.coordinates.length < 2) return;
          const line = turf.lineString(pth.coordinates);
          const pt = Hereabouts.toTurfPoint(p.lat, p.lng);
          const d = turf.pointToLineDistance(pt, line, { units: 'kilometers' }) * 1000;
          if (d < minDist) minDist = d;
        });

        if (minDist > 30) {
          unreachableCount++;
          warnings.push(`"${p.name}" is ${Math.round(minDist)}m from nearest path (>30m limit).`);
        }
      });

      if (unreachableCount === 0) {
        chkPlaces.className = 'passed';
        chkPlaces.querySelector('.chk-icon').textContent = '✅';
        chkPlacesDesc.textContent = `All ${places.length} places are within 30m of mapped paths.`;
      } else {
        chkPlaces.className = 'failed';
        chkPlaces.querySelector('.chk-icon').textContent = '⚠️';
        chkPlacesDesc.textContent = `${unreachableCount} place(s) are farther than 30m from paths.`;
      }
    }

    // 2. Check Path Network Connectivity (Disconnected Graph Analysis)
    const chkPaths = document.getElementById('chkPaths');
    const chkPathsDesc = document.getElementById('chkPathsDesc');

    if (paths.length === 0) {
      chkPaths.className = 'failed';
      chkPaths.querySelector('.chk-icon').textContent = '⏳';
      chkPathsDesc.textContent = 'Record walking paths to build the pedestrian network.';
    } else {
      const graph = new Hereabouts.PedestrianGraph();
      graph.loadPaths(paths);
      const conn = graph.analyzeConnectivity();

      if (conn.isConnected) {
        chkPaths.className = 'passed';
        chkPaths.querySelector('.chk-icon').textContent = '✅';
        chkPathsDesc.textContent = `Path network is fully connected (${paths.length} paths, ${conn.totalNodes} nodes).`;
      } else {
        chkPaths.className = 'failed';
        chkPaths.querySelector('.chk-icon').textContent = '⚠️';
        chkPathsDesc.textContent = `Path network has ${conn.connectedComponents} disconnected parts. Snap endpoints within 8m to link them.`;
        warnings.push(`Path network is fragmented into ${conn.connectedComponents} disjoint islands.`);
      }
    }

    // 3. Essential Amenities Checklist
    const chkCoverage = document.getElementById('chkCoverage');
    const chkCoverageDesc = document.getElementById('chkCoverageDesc');
    const hasEntrance = places.some(p => p.category === 'entrance');
    const hasToilet = places.some(p => p.category === 'toilet');
    const hasMedical = places.some(p => p.category === 'medical');

    const missingAmenities = [];
    if (!hasEntrance) missingAmenities.push('Entrance');
    if (!hasToilet) missingAmenities.push('Restrooms');
    if (!hasMedical) missingAmenities.push('First Aid');

    if (missingAmenities.length === 0) {
      chkCoverage.className = 'passed';
      chkCoverage.querySelector('.chk-icon').textContent = '✅';
      chkCoverageDesc.textContent = 'Entrance, Restrooms, and Medical hubs mapped.';
    } else {
      chkCoverage.className = 'failed';
      chkCoverage.querySelector('.chk-icon').textContent = 'ℹ️';
      chkCoverageDesc.textContent = `Recommended: add ${missingAmenities.join(', ')}.`;
    }

    // Update Warnings Box & Alert Badge
    const warningsBox = document.getElementById('qualityWarningsList');
    const warningsUl = document.getElementById('warningsUl');

    if (warnings.length > 0) {
      warningsBox.classList.remove('hidden');
      warningsUl.innerHTML = warnings.map(w => `<li>${w}</li>`).join('');
      qualityAlertBadge.classList.remove('hidden');
    } else {
      warningsBox.classList.add('hidden');
      warningsUl.innerHTML = '';
      qualityAlertBadge.classList.add('hidden');
    }
  }

  // =========================================================================
  // 10. Map Rendering (Places, Paths, Junctions, Zones)
  // =========================================================================

  function renderAllLayers() {
    renderZones();
    renderPaths();
    renderPlaces();
  }

  function renderPlaces() {
    placesLayer.clearLayers();
    (venue.places || []).forEach(place => {
      const icon = Hereabouts.createPlaceIcon(place.category, place.status === 'closed');
      const marker = L.marker([place.lat, place.lng], {
        icon: icon,
        draggable: true
      });

      // Drag to correct position
      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        place.lat = Number(newPos.lat.toFixed(7));
        place.lng = Number(newPos.lng.toFixed(7));
        autosave();
        updateQualityChecklist();
      });

      // Tap to edit
      marker.on('click', () => {
        openEditPlaceModal(place);
      });

      // Quick tooltip
      marker.bindTooltip(`<b>${place.name}</b><br><small>${place.status.toUpperCase()}</small>`, {
        direction: 'top',
        offset: [0, -38]
      });

      placesLayer.addLayer(marker);
    });
  }

  function renderPaths() {
    pathsLayer.clearLayers();
    junctionsLayer.clearLayers();

    const paths = venue.paths || [];

    paths.forEach(p => {
      if (!p.coordinates || p.coordinates.length < 2) return;
      const latLngs = p.coordinates.map(c => [c[1], c[0]]);

      const polyline = L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 4,
        opacity: 0.85
      });

      polyline.on('click', () => openEditPathModal(p));
      pathsLayer.addLayer(polyline);
    });

    // Render path junction dots
    const junctions = Hereabouts.findPathJunctions(paths);
    junctions.forEach(pt => {
      const dot = L.circleMarker(pt, {
        radius: 5,
        color: '#fbbf24',
        fillColor: '#fbbf24',
        fillOpacity: 1,
        weight: 2
      });
      dot.bindTooltip('Path Junction (Connected)', { direction: 'top' });
      junctionsLayer.addLayer(dot);
    });
  }

  function renderZones() {
    zonesLayer.clearLayers();
    (venue.zones || []).forEach(z => {
      if (!z.coordinates || z.coordinates.length < 3) return;
      const latLngs = z.coordinates.map(c => [c[1], c[0]]);

      const poly = L.polygon(latLngs, {
        color: z.color || '#8b5cf6',
        fillColor: z.color || '#8b5cf6',
        fillOpacity: 0.22,
        weight: 2
      });

      poly.bindTooltip(`<b>${z.name}</b>`, { permanent: false, direction: 'center' });
      zonesLayer.addLayer(poly);
    });
  }

  // =========================================================================
  // 11. Server Autosave
  // =========================================================================

  let autosaveTimeout = null;
  async function autosave() {
    saveIndicator.className = 'status-pill is-saving';
    saveIndicator.querySelector('.pill-text').textContent = 'Saving...';

    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    autosaveTimeout = setTimeout(async () => {
      try {
        const res = await fetch('/api/venue', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-organizer-pin': organizerPin
          },
          body: JSON.stringify(venue)
        });

        if (res.ok) {
          saveIndicator.className = 'status-pill is-saved';
          saveIndicator.querySelector('.pill-text').textContent = 'Saved';
        } else {
          saveIndicator.className = 'status-pill is-saving';
          saveIndicator.querySelector('.pill-text').textContent = 'Save Failed';
        }
      } catch (err) {
        console.error('Autosave error:', err);
        saveIndicator.className = 'status-pill is-saving';
        saveIndicator.querySelector('.pill-text').textContent = 'Offline';
      }
    }, 300);
  }

  // Notice Banner helpers
  function showNotice(msg) {
    topNoticeMessage.textContent = msg;
    topNoticeBanner.classList.remove('hidden');
  }

  function hideNotice() {
    topNoticeBanner.classList.add('hidden');
  }

  btnDismissNotice.addEventListener('click', hideNotice);

  // Initialize
  initAuth();

})();
