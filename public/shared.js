/**
 * Hereabouts - Shared Utilities & Geospatial Engine
 * Provides Leaflet layers, category icons, Turf geometry helpers,
 * topological path snapping/splitting, and Dijkstra graph pathfinding.
 */

// Category metadata: colors, labels, and SVGs
const CATEGORIES = {
  entrance: {
    label: 'Entrance',
    color: '#2ecc71',
    bg: '#e8f8f5',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`
  },
  building: {
    label: 'Building',
    color: '#3498db',
    bg: '#ebf5fb',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="18"/><line x1="15" y1="22" x2="15" y2="18"/><line x1="8" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/></svg>`
  },
  food: {
    label: 'Food & Drink',
    color: '#e67e22',
    bg: '#fef5e7',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`
  },
  toilet: {
    label: 'Restrooms',
    color: '#1abc9c',
    bg: '#e8f8f5',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><path d="M7 21v-7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v7"/><line x1="9" y1="21" x2="9" y2="14"/><line x1="15" y1="21" x2="15" y2="14"/></svg>`
  },
  parking: {
    label: 'Parking',
    color: '#2980b9',
    bg: '#eaf2f8',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>`
  },
  stage: {
    label: 'Stage & Events',
    color: '#9b59b6',
    bg: '#f4ecf7',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
  },
  medical: {
    label: 'Medical / First Aid',
    color: '#e74c3c',
    bg: '#fdebd0',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`
  },
  exit: {
    label: 'Exit',
    color: '#d35400',
    bg: '#fbeee6',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
  },
  other: {
    label: 'Other',
    color: '#7f8c8d',
    bg: '#f2f3f4',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
  }
};

/**
 * Setup default Leaflet map with Esri World Imagery (satellite) + OpenStreetMap toggle
 */
function initHereaboutsMap(containerId, initialCenter = [37.7695, -122.4465], initialZoom = 17) {
  const map = L.map(containerId, {
    zoomControl: false,
    maxZoom: 20
  }).setView(initialCenter, initialZoom);

  // Esri Satellite
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19
  });

  // OpenStreetMap
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  });

  // Add default satellite
  satelliteLayer.addTo(map);

  // Layer control switcher
  const baseMaps = {
    "Satellite (Esri)": satelliteLayer,
    "Street Map (OSM)": osmLayer
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

  // Reposition zoom control to top-left or custom
  L.control.zoom({ position: 'topright' }).addTo(map);

  return { map, satelliteLayer, osmLayer };
}

/**
 * Generate custom HTML Leaflet Icon for places
 */
function createPlaceIcon(category, isClosed = false) {
  const cat = CATEGORIES[category] || CATEGORIES.other;
  const color = isClosed ? '#7f8c8d' : cat.color;
  const closedBadge = isClosed ? `<span class="closed-chip">Closed</span>` : '';

  const html = `
    <div class="custom-place-marker ${isClosed ? 'is-closed' : ''}" style="--marker-color: ${color}">
      <div class="marker-pin">
        <div class="marker-icon">${cat.iconSvg}</div>
      </div>
      ${closedBadge}
    </div>
  `;

  return L.divIcon({
    html: html,
    className: 'hereabouts-div-icon',
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -40]
  });
}

/**
 * Geometric Helpers using Turf.js
 */

// Convert [lat, lng] to Turf point [lng, lat]
function toTurfPoint(lat, lng) {
  return turf.point([Number(lng), Number(lat)]);
}

// Distance in meters between two [lat, lng] coordinates
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  if (typeof turf === 'undefined') {
    // Haversine fallback
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  const from = turf.point([Number(lng1), Number(lat1)]);
  const to = turf.point([Number(lng2), Number(lat2)]);
  return turf.distance(from, to, { units: 'kilometers' }) * 1000;
}

// Walking time in minutes at 80 meters per minute
function getWalkingMinutes(distanceMeters) {
  return Math.ceil(distanceMeters / 80);
}

// Format meters to human readable
function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

// Format walking time
function formatWalkingTime(distanceMeters) {
  const mins = getWalkingMinutes(distanceMeters);
  if (mins <= 1) return '< 1 min walk';
  return `~${mins} min walk`;
}

/**
 * Path Network Snapping and Line Splitting
 * Snaps start/end points within 8m to existing paths and splits intersected paths
 */
function snapAndIntegratePath(newCoords, existingPaths, snapThresholdMeters = 8) {
  if (!newCoords || newCoords.length < 2) return { updatedPaths: existingPaths, newPathCoords: newCoords, junctions: [] };
  
  // newCoords is [[lng, lat], ...]
  let coords = newCoords.map(c => [Number(c[0]), Number(c[1])]);
  let paths = JSON.parse(JSON.stringify(existingPaths || []));
  const junctions = [];

  // Helper to test endpoint against all paths
  function handleEndpoint(endpointIndex) {
    const pt = turf.point(coords[endpointIndex]);
    let bestDist = Infinity;
    let bestSnap = null;
    let bestPathIndex = -1;

    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      if (!p.coordinates || p.coordinates.length < 2) continue;
      const line = turf.lineString(p.coordinates);
      const snapped = turf.nearestPointOnLine(line, pt, { units: 'kilometers' });
      const distMeters = snapped.properties.dist * 1000;

      if (distMeters <= snapThresholdMeters && distMeters < bestDist) {
        bestDist = distMeters;
        bestSnap = snapped.geometry.coordinates;
        bestPathIndex = i;
      }
    }

    if (bestSnap && bestPathIndex !== -1) {
      // Snap our endpoint coordinate to the line
      coords[endpointIndex] = [bestSnap[0], bestSnap[1]];
      junctions.push([bestSnap[1], bestSnap[0]]); // [lat, lng]

      // Now split the target path at this snapped coordinate
      const targetPath = paths[bestPathIndex];
      const splitResult = splitLineAtPoint(targetPath.coordinates, bestSnap);
      if (splitResult.length === 2) {
        // Replace target path with split parts
        const pathA = {
          ...targetPath,
          id: targetPath.id + '_a_' + Math.random().toString(36).substr(2, 4),
          coordinates: splitResult[0],
          lengthMeters: calculatePolylineLength(splitResult[0])
        };
        const pathB = {
          ...targetPath,
          id: targetPath.id + '_b_' + Math.random().toString(36).substr(2, 4),
          coordinates: splitResult[1],
          lengthMeters: calculatePolylineLength(splitResult[1])
        };
        paths.splice(bestPathIndex, 1, pathA, pathB);
      }
    }
  }

  // Check start endpoint
  handleEndpoint(0);
  // Check end endpoint
  handleEndpoint(coords.length - 1);

  return {
    updatedPaths: paths,
    newPathCoords: coords,
    junctions: junctions
  };
}

/**
 * Split a polyline at a specified [lng, lat] point along the line
 */
function splitLineAtPoint(lineCoords, splitPoint) {
  if (lineCoords.length < 2) return [lineCoords];
  const pt = turf.point(splitPoint);
  let bestSegIndex = 0;
  let minSegDist = Infinity;

  // Find which segment the split point belongs to
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const seg = turf.lineString([lineCoords[i], lineCoords[i + 1]]);
    const dist = turf.pointToLineDistance(pt, seg, { units: 'kilometers' }) * 1000;
    if (dist < minSegDist) {
      minSegDist = dist;
      bestSegIndex = i;
    }
  }

  const part1 = [];
  for (let i = 0; i <= bestSegIndex; i++) {
    part1.push(lineCoords[i]);
  }
  part1.push(splitPoint);

  const part2 = [splitPoint];
  for (let i = bestSegIndex + 1; i < lineCoords.length; i++) {
    part2.push(lineCoords[i]);
  }

  // Filter out zero-length segments if split point is identical to start/end
  if (part1.length >= 2 && part2.length >= 2) {
    return [part1, part2];
  }
  return [lineCoords];
}

/**
 * Calculate total length of polyline in meters
 */
function calculatePolylineLength(coords) {
  if (!coords || coords.length < 2) return 0;
  try {
    const line = turf.lineString(coords);
    return Math.round(turf.length(line, { units: 'kilometers' }) * 1000);
  } catch (e) {
    return 0;
  }
}

/**
 * Find all junctions (shared endpoints or intersections) across path network
 */
function findPathJunctions(paths) {
  const junctions = [];
  const coordCount = new Map();

  paths.forEach(p => {
    if (!p.coordinates || p.coordinates.length < 2) return;
    const startKey = `${p.coordinates[0][0].toFixed(5)},${p.coordinates[0][1].toFixed(5)}`;
    const endKey = `${p.coordinates[p.coordinates.length - 1][0].toFixed(5)},${p.coordinates[p.coordinates.length - 1][1].toFixed(5)}`;

    coordCount.set(startKey, (coordCount.get(startKey) || 0) + 1);
    coordCount.set(endKey, (coordCount.get(endKey) || 0) + 1);
  });

  coordCount.forEach((count, key) => {
    if (count > 1) {
      const [lng, lat] = key.split(',').map(Number);
      junctions.push([lat, lng]);
    }
  });

  return junctions;
}

/**
 * Build Walkable Graph and Dijkstra Shortest Path Engine
 */
class PedestrianGraph {
  constructor() {
    this.adjacency = new Map(); // key -> [{ neighborKey, weightMeters, coord, tags }]
    this.nodes = new Map();     // key -> [lng, lat]
  }

  coordKey(lng, lat) {
    return `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`;
  }

  addNode(lng, lat) {
    const key = this.coordKey(lng, lat);
    if (!this.nodes.has(key)) {
      this.nodes.set(key, [Number(lng), Number(lat)]);
      this.adjacency.set(key, []);
    }
    return key;
  }

  addEdge(lng1, lat1, lng2, lat2, tags = []) {
    const u = this.addNode(lng1, lat1);
    const v = this.addNode(lng2, lat2);
    if (u === v) return;

    const weight = getDistanceMeters(lat1, lng1, lat2, lng2);
    this.adjacency.get(u).push({ neighborKey: v, weightMeters: weight, coord: [lng2, lat2], tags });
    this.adjacency.get(v).push({ neighborKey: u, weightMeters: weight, coord: [lng1, lat1], tags });
  }

  // Populate graph from all venue paths
  loadPaths(paths) {
    this.adjacency.clear();
    this.nodes.clear();
    if (!paths) return;

    paths.forEach(path => {
      const coords = path.coordinates;
      if (!coords || coords.length < 2) return;
      const tags = path.tags || [];

      for (let i = 0; i < coords.length - 1; i++) {
        this.addEdge(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1], tags);
      }
    });
  }

  // Find nearest node in graph to a given [lat, lng]
  findNearestNode(lat, lng) {
    let bestKey = null;
    let minDistance = Infinity;

    this.nodes.forEach((coord, key) => {
      const d = getDistanceMeters(lat, lng, coord[1], coord[0]);
      if (d < minDistance) {
        minDistance = d;
        bestKey = key;
      }
    });

    return { key: bestKey, distanceMeters: minDistance, coord: bestKey ? this.nodes.get(bestKey) : null };
  }

  // Project a point onto the nearest segment of any path in the graph
  projectPointToNetwork(lat, lng, paths) {
    const pt = toTurfPoint(lat, lng);
    let bestDist = Infinity;
    let bestPoint = null;
    let bestSeg = null;

    if (!paths || paths.length === 0) return null;

    paths.forEach(path => {
      if (!path.coordinates || path.coordinates.length < 2) return;
      const line = turf.lineString(path.coordinates);
      const snapped = turf.nearestPointOnLine(line, pt, { units: 'kilometers' });
      const distMeters = snapped.properties.dist * 1000;

      if (distMeters < bestDist) {
        bestDist = distMeters;
        bestPoint = snapped.geometry.coordinates; // [lng, lat]
        bestSeg = {
          tags: path.tags || []
        };
      }
    });

    if (bestPoint) {
      return {
        coord: bestPoint, // [lng, lat]
        lat: bestPoint[1],
        lng: bestPoint[0],
        distanceMeters: bestDist,
        tags: bestSeg ? bestSeg.tags : []
      };
    }
    return null;
  }

  // Dijkstra algorithm from startKey to endKey
  dijkstra(startKey, endKey) {
    if (!this.nodes.has(startKey) || !this.nodes.has(endKey)) return null;
    if (startKey === endKey) {
      const c = this.nodes.get(startKey);
      return { pathCoordinates: [[c[1], c[0]]], totalDistance: 0, tagsEncountered: [] };
    }

    const distances = new Map();
    const previous = new Map();
    const edgeTags = new Map();
    const unvisited = new Set(this.nodes.keys());

    this.nodes.forEach((_, key) => {
      distances.set(key, Infinity);
    });
    distances.set(startKey, 0);

    while (unvisited.size > 0) {
      // Find unvisited node with smallest distance
      let current = null;
      let lowestDist = Infinity;
      unvisited.forEach(key => {
        const d = distances.get(key);
        if (d < lowestDist) {
          lowestDist = d;
          current = key;
        }
      });

      if (!current || lowestDist === Infinity) break;
      if (current === endKey) break;

      unvisited.delete(current);

      const neighbors = this.adjacency.get(current) || [];
      for (const edge of neighbors) {
        if (!unvisited.has(edge.neighborKey)) continue;
        const alt = lowestDist + edge.weightMeters;
        if (alt < distances.get(edge.neighborKey)) {
          distances.set(edge.neighborKey, alt);
          previous.set(edge.neighborKey, current);
          edgeTags.set(`${current}->${edge.neighborKey}`, edge.tags);
        }
      }
    }

    // Check if end reached
    if (distances.get(endKey) === Infinity) {
      return null; // No path found
    }

    // Reconstruct path
    const pathCoords = []; // [[lat, lng], ...]
    const tagsEncountered = new Set();
    let curr = endKey;

    while (curr) {
      const coord = this.nodes.get(curr);
      pathCoords.unshift([coord[1], coord[0]]); // Leaflet uses [lat, lng]
      const prev = previous.get(curr);
      if (prev) {
        const tags = edgeTags.get(`${prev}->${curr}`) || [];
        tags.forEach(t => tagsEncountered.add(t));
      }
      curr = prev;
    }

    return {
      pathCoordinates: pathCoords,
      totalDistance: Math.round(distances.get(endKey)),
      tagsEncountered: Array.from(tagsEncountered)
    };
  }

  // Find Route from Origin [originLat, originLng] to Destination [destLat, destLng]
  findRoute(originLat, originLng, destLat, destLng, paths) {
    if (!paths || paths.length === 0) {
      // Direct straight line fallback if no paths exist
      const d = getDistanceMeters(originLat, originLng, destLat, destLng);
      return {
        pathCoordinates: [[originLat, originLng], [destLat, destLng]],
        totalDistance: Math.round(d),
        walkingMinutes: getWalkingMinutes(d),
        tagsEncountered: [],
        isDirectLine: true
      };
    }

    // Project origin and destination onto path network
    const originProj = this.projectPointToNetwork(originLat, originLng, paths);
    const destProj = this.projectPointToNetwork(destLat, destLng, paths);

    if (!originProj || !destProj) {
      const d = getDistanceMeters(originLat, originLng, destLat, destLng);
      return {
        pathCoordinates: [[originLat, originLng], [destLat, destLng]],
        totalDistance: Math.round(d),
        walkingMinutes: getWalkingMinutes(d),
        tagsEncountered: [],
        isDirectLine: true
      };
    }

    // Temporarily add projected nodes to graph
    const origKey = this.addNode(originProj.lng, originProj.lat);
    const destKey = this.addNode(destProj.lng, destProj.lat);

    // Connect projected nodes to nearest nodes on graph
    const nearOrig = this.findNearestNode(originProj.lat, originProj.lng);
    const nearDest = this.findNearestNode(destProj.lat, destProj.lng);

    if (nearOrig.key && nearOrig.key !== origKey) {
      this.addEdge(originProj.lng, originProj.lat, nearOrig.coord[0], nearOrig.coord[1], originProj.tags);
    }
    if (nearDest.key && nearDest.key !== destKey) {
      this.addEdge(destProj.lng, destProj.lat, nearDest.coord[0], nearDest.coord[1], destProj.tags);
    }

    const route = this.dijkstra(origKey, destKey);

    if (!route) {
      // Paths might be disconnected, return straight line
      const d = getDistanceMeters(originLat, originLng, destLat, destLng);
      return {
        pathCoordinates: [[originLat, originLng], [destLat, destLng]],
        totalDistance: Math.round(d),
        walkingMinutes: getWalkingMinutes(d),
        tagsEncountered: [],
        isDirectLine: true
      };
    }

    // Prepend origin and append destination if slightly off-path
    const fullCoordinates = [];
    if (originProj.distanceMeters > 3) {
      fullCoordinates.push([originLat, originLng]);
    }
    route.pathCoordinates.forEach(c => fullCoordinates.push(c));
    if (destProj.distanceMeters > 3) {
      fullCoordinates.push([destLat, destLng]);
    }

    const totalDist = route.totalDistance + Math.round(originProj.distanceMeters) + Math.round(destProj.distanceMeters);

    return {
      pathCoordinates: fullCoordinates,
      totalDistance: totalDist,
      walkingMinutes: getWalkingMinutes(totalDist),
      tagsEncountered: route.tagsEncountered,
      isDirectLine: false
    };
  }

  // Analyze network connectivity (Connected Components using BFS)
  analyzeConnectivity() {
    const visited = new Set();
    let componentsCount = 0;

    this.nodes.forEach((_, key) => {
      if (!visited.has(key)) {
        componentsCount++;
        // BFS
        const queue = [key];
        visited.add(key);
        while (queue.length > 0) {
          const curr = queue.shift();
          const neighbors = this.adjacency.get(curr) || [];
          for (const edge of neighbors) {
            if (!visited.has(edge.neighborKey)) {
              visited.add(edge.neighborKey);
              queue.push(edge.neighborKey);
            }
          }
        }
      }
    });

    return {
      totalNodes: this.nodes.size,
      connectedComponents: componentsCount,
      isConnected: componentsCount <= 1
    };
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.Hereabouts = {
    CATEGORIES,
    initHereaboutsMap,
    createPlaceIcon,
    toTurfPoint,
    getDistanceMeters,
    getWalkingMinutes,
    formatDistance,
    formatWalkingTime,
    snapAndIntegratePath,
    splitLineAtPoint,
    calculatePolylineLength,
    findPathJunctions,
    PedestrianGraph
  };
}
