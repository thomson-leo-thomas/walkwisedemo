const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ORG_PIN = process.env.ORG_PIN || '1234';

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Determine data file path (supports Vercel /tmp serverless writeability or local persistence)
const IS_VERCEL = !!process.env.VERCEL;
const LOCAL_DATA_PATH = path.join(__dirname, 'data', 'venue.json');
const DATA_FILE_PATH = IS_VERCEL ? path.join('/tmp', 'venue.json') : LOCAL_DATA_PATH;

// In-memory cache for ultra-fast serverless response
let memoryVenueCache = null;

// Optional Vercel KV / Upstash Redis support for 100% persistent serverless storage
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function getFromKv() {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/hereabouts_venue`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    if (res.ok) {
      const json = await res.json();
      if (json.result) {
        return typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
      }
    }
  } catch (err) {
    console.warn('KV read error:', err.message);
  }
  return null;
}

async function saveToKv(data) {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await fetch(`${KV_URL}/set/hereabouts_venue`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (err) {
    console.warn('KV write error:', err.message);
    return false;
  }
}

// Ensure data file exists
function ensureVenueFile() {
  try {
    if (IS_VERCEL && !fs.existsSync(DATA_FILE_PATH)) {
      if (fs.existsSync(LOCAL_DATA_PATH)) {
        fs.copyFileSync(LOCAL_DATA_PATH, DATA_FILE_PATH);
      } else {
        const seedData = {
          venueName: 'Hereabouts Venue',
          broadcast: 'Welcome to Hereabouts! Explore places and walking paths.',
          center: [37.7695, -122.4465],
          zoom: 17,
          places: [],
          paths: [],
          zones: [],
          events: []
        };
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(seedData, null, 2), 'utf8');
      }
    } else if (!fs.existsSync(LOCAL_DATA_PATH)) {
      const dataDir = path.dirname(LOCAL_DATA_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const seedData = {
        venueName: 'Hereabouts Venue',
        broadcast: 'Welcome to Hereabouts! Explore places and walking paths.',
        center: [37.7695, -122.4465],
        zoom: 17,
        places: [],
        paths: [],
        zones: [],
        events: []
      };
      fs.writeFileSync(LOCAL_DATA_PATH, JSON.stringify(seedData, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Error ensuring venue data file:', err);
  }
}

ensureVenueFile();

// Helper to read venue data
function readVenueData() {
  if (memoryVenueCache) return memoryVenueCache;
  ensureVenueFile();
  try {
    const raw = fs.readFileSync(DATA_FILE_PATH, 'utf8');
    memoryVenueCache = JSON.parse(raw);
    return memoryVenueCache;
  } catch (err) {
    console.error('Error reading venue data:', err);
    return {
      venueName: 'Hereabouts Venue',
      broadcast: '',
      center: [37.7695, -122.4465],
      zoom: 17,
      places: [],
      paths: [],
      zones: [],
      events: []
    };
  }
}

// Helper to write venue data atomically
function writeVenueData(data) {
  memoryVenueCache = data;
  ensureVenueFile();
  if (KV_URL && KV_TOKEN) {
    saveToKv(data);
  }
  try {
    const tempPath = `${DATA_FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, DATA_FILE_PATH);
    return true;
  } catch (err) {
    console.error('Error writing venue data:', err);
    try {
      fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('Direct write failed:', e);
      return false;
    }
  }
}

// Authentication middleware
function requireOrganizerPin(req, res, next) {
  const pinHeader = req.headers['x-organizer-pin'];
  const pinQuery = req.query.pin;
  const pinBody = req.body && req.body.pin;
  const providedPin = pinHeader || pinQuery || pinBody;

  if (providedPin && String(providedPin).trim() === String(ORG_PIN).trim()) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Invalid organizer PIN.' });
}

// API Routes

// Health check
app.get(['/api/health', '/health'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authenticate PIN
app.post(['/api/auth', '/auth'], (req, res) => {
  const { pin } = req.body || {};
  if (pin && String(pin).trim() === String(ORG_PIN).trim()) {
    return res.json({ success: true, message: 'Organizer PIN verified.' });
  }
  return res.status(401).json({ success: false, error: 'Invalid PIN.' });
});

// Get venue data (Public for visitors & organizers)
app.get(['/api/venue', '/venue'], async (req, res) => {
  if (KV_URL && KV_TOKEN) {
    const kvData = await getFromKv();
    if (kvData) {
      memoryVenueCache = kvData;
      return res.json(kvData);
    }
  }
  const data = readVenueData();
  res.json(data);
});

// Update full venue data (Organizer PIN required)
app.put(['/api/venue', '/venue'], requireOrganizerPin, async (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid payload.' });
  }

  // Preserve core structure
  const updatedData = {
    venueName: incoming.venueName || 'Hereabouts Venue',
    broadcast: typeof incoming.broadcast === 'string' ? incoming.broadcast : '',
    center: Array.isArray(incoming.center) && incoming.center.length === 2 ? incoming.center : [37.7695, -122.4465],
    zoom: incoming.zoom || 17,
    places: Array.isArray(incoming.places) ? incoming.places : [],
    paths: Array.isArray(incoming.paths) ? incoming.paths : [],
    zones: Array.isArray(incoming.zones) ? incoming.zones : [],
    events: Array.isArray(incoming.events) ? incoming.events : [],
    updatedAt: new Date().toISOString()
  };

  const success = writeVenueData(updatedData);
  if (!success) {
    return res.status(500).json({ error: 'Failed to write venue data.' });
  }

  res.json({ success: true, message: 'Venue data updated successfully.', data: updatedData });
});

// Quick broadcast message update (Organizer PIN required)
app.post(['/api/venue/broadcast', '/venue/broadcast'], requireOrganizerPin, (req, res) => {
  const { broadcast } = req.body || {};
  const data = readVenueData();
  data.broadcast = typeof broadcast === 'string' ? broadcast : '';
  data.updatedAt = new Date().toISOString();
  writeVenueData(data);
  res.json({ success: true, broadcast: data.broadcast });
});

// Static public files
app.use(express.static(path.join(__dirname, 'public')));

// Specific page routes
app.get('/organizer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'organizer.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 Fallback
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Start local server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`  HEREABOUTS SERVER RUNNING`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Visitor URL:   http://localhost:${PORT}/`);
    console.log(`  Organizer URL: http://localhost:${PORT}/organizer`);
    console.log(`  Default Organizer PIN: ${ORG_PIN}`);
    console.log(`===============================================`);
  });
}

module.exports = app;
