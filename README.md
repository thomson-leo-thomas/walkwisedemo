# Hereabouts 🗺️

**Hereabouts** is a mobile-first, zero-build outdoor venue mapping and visitor navigation web application. It is designed for outdoor events, campus festivals, parks, and fairgrounds.

- **Organizers** walk the grounds with their phones, map points of interest using GPS with multi-reading averaging, record walkable paths with automatic topology snapping and line-splitting, draw zones, and broadcast live alerts.
- **Visitors** open a mobile web link, see their live smoothed blue dot snapped to walkable paths, browse nearby places and upcoming events, receive real-time "What Next?" recommendations, and get graph-based walking directions along mapped trails.

---

## Architecture & Technology Stack

- **Backend**: Node.js + Express (`server.js`).
- **Data Storage**: Single JSON file in `data/venue.json` with atomic writes (no database setup required).
- **Frontend**: Plain HTML5 + Vanilla JS + CSS3 (no bundler or build steps required).
- **Map & Satellite Tiles**: Leaflet.js with Esri World Imagery (Satellite) and OpenStreetMap layer switcher.
- **Geospatial Engine**: Turf.js (CDN) for distance calculation, line simplification, point-to-line projection, and line splitting.
- **Pedestrian Routing Engine**: Custom topological graph with Dijkstra's shortest-path algorithm (`public/shared.js`).

---

## Quick Start (Local Run)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The server will start on port `3000`:
- **Visitor Page**: [http://localhost:3000/](http://localhost:3000/)
- **Organizer Mapping Studio**: [http://localhost:3000/organizer](http://localhost:3000/organizer)
- **Default Organizer PIN**: `1234` (configurable via `ORG_PIN` environment variable).

### 3. Run Automated Tests
```bash
npm test
```

---

## Phone Testing via ngrok (Required for GPS)

> [!IMPORTANT]
> Mobile browsers (Chrome, Safari) **strictly enforce HTTPS** for `navigator.geolocation.watchPosition`. If you access an `http://192.168.x.x:3000` IP address on your phone, the browser will block GPS access.
> 
> Use **ngrok** to get a free, instant HTTPS tunnel to your phone:

1. In a terminal, run:
   ```bash
   npx ngrok http 3000
   ```
2. ngrok will output a secure HTTPS link, for example:
   ```text
   Forwarding   https://abc1-234.ngrok-free.app -> http://localhost:3000
   ```
3. Open that `https://...` link on your phone:
   - On organizer's phone: `https://abc1-234.ngrok-free.app/organizer`
   - On visitor's phone: `https://abc1-234.ngrok-free.app/`
4. The phone will immediately grant GPS geolocation access!

### Desktop Testing Without Walking Outdoors
Both the Organizer and Visitor pages include a **Simulation / Click-to-Move** fallback:
- **Organizer**: Check the **"Simulate GPS (Click Map)"** box at the bottom-left. Clicking anywhere on the map moves your organizer position, allowing you to test adding places, recording paths, and drawing zones right from your desk!
- **Visitor**: Simply click anywhere on the map to set your visitor location. Proximity calculations, path snapping, and walking routes will update instantly.

---

## Deployment Options

### Option 1: Deploy to Vercel

Hereabouts is pre-configured for Vercel with `vercel.json` and `/api` serverless proxy:

1. Push your repository to GitHub, GitLab, or Bitbucket.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Under **Environment Variables**, add:
   - `ORG_PIN`: Your chosen organizer access PIN (e.g., `5678`).
4. Click **Deploy**. Vercel will deploy the site with free HTTPS.

> [!NOTE]
> *Serverless Filesystem Note*: In Vercel serverless functions, the root filesystem is read-only. `server.js` automatically detects Vercel and writes venue changes to `/tmp/venue.json`. For long-term persistent storage across cold starts without an external database, platforms with persistent disks like **Render** or **Railway** (below) are recommended.

---

### Option 2: Deploy to Render (Recommended for Persistent JSON Storage)

1. Push your code to GitHub.
2. Sign up or log in at [render.com](https://render.com).
3. Click **New +** &rarr; **Web Service**.
4. Connect your repository.
5. Configure the settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
6. Under **Environment Variables**:
   - `ORG_PIN`: `your_custom_pin`
   - `PORT`: `3000`
7. Click **Create Web Service**. Render provides a free HTTPS domain with full persistent disk support for `data/venue.json`!

---

### Option 3: Deploy to Railway

1. Install the Railway CLI or connect via [railway.app](https://railway.app).
2. Create a new project and select **Deploy from GitHub repo**.
3. Railway will automatically detect Node.js, run `npm install`, and execute `npm start`.
4. In the Railway dashboard under **Variables**, set:
   - `ORG_PIN`: `your_custom_pin`
5. Generate a public domain under **Settings** &rarr; **Networking**.

---

## Organizer Features & Mapping Guide

1. **GPS Accuracy Filtering & Guard**:
   - Shows live accuracy readout (e.g. `±6 m`).
   - Disables "Add Place" and path point collection if accuracy is worse than 25 m, advising *"Wait for better GPS"*.
2. **"Add Place Here" (5-Second Averaging)**:
   - Starts a 5-second countdown timer.
   - Samples GPS readings every second, discards any fix > 25 m, and averages the remaining coordinates.
   - Opens the Place form: Name, Category (Door, Building, Food, Restroom, Parking, Stage, Medical, Exit, Other), Status (Open, Closed, Delayed), Wait Time, Description, and optional camera photo.
3. **"Record Path" (3m Movement Filter & Line Simplification)**:
   - Records a vertex only when the organizer moves at least 3 meters from the previous vertex.
   - Discards any readings with accuracy worse than 25 m.
   - On stop, simplifies the polyline (`turf.simplify` with tolerance `0.000005`) and prompts for tags: `stairs`, `ramp`, `covered`, `narrow`.
4. **Automatic Path Network Snapping & Splitting**:
   - When a path is saved, if its start or end point is within **8 meters** of another path's line, it snaps that endpoint to the nearest point on that line and splits that path into two connected segments.
   - Connected junctions are rendered as small yellow dots.
5. **"Draw Zone"**:
   - Tap points on the map to define polygon boundaries, name the zone, and assign an outline color.
6. **Drag-to-Correct & In-Place Editing**:
   - Place markers are draggable by the organizer. Dragging immediately updates coordinates and autosaves.
   - Tap any place or path to edit details or delete.
7. **Broadcast Alerts**:
   - Broadcast banners appear in real-time at the top of every visitor's phone.
8. **Mapping Quality Checklist Panel**:
   - Place, path, zone, and event counts.
   - **Reachability Warning**: Flags any place farther than 30 m from the nearest path.
   - **Graph Disconnection Warning**: Uses Breadth-First Search (BFS) graph analysis to warn if the path network contains disconnected islands.
   - **Amenity Checklist**: Verifies presence of entrance, restrooms, and medical aid.

---

## Visitor Features & Navigation Guide

1. **Map Experience**:
   - High-contrast outdoor UI with Esri Satellite imagery and OSM toggle.
   - Category pins, with closed venues greyed out with "Closed" badges.
2. **Live Blue Dot GPS & Path Snapping**:
   - Keeps a rolling 3-reading buffer to smooth out GPS jitter.
   - **20m Path Snapping**: If the visitor is within 20 m of any mapped path, projects the blue dot onto the nearest point on the path. Includes a toggle to switch snapping ON or OFF.
3. **"What Next?" Recommendation Hero Card**:
   - Real-time scoring based on urgency and walking distance (at 80 m/minute).
   - Only recommends events that the visitor can reach before they end.
   - Example: *"Dance show, Auditorium. 2 min away, starts in 8 min. Go now."*
   - Tapping the card instantly starts walking navigation to that location.
4. **Bottom Sheet ("Nearby" & "Happening Soon")**:
   - Filter places by category.
   - Automatically sorted by walking distance.
   - Lists events starting within the next 60 minutes.
5. **"Take Me There" Pedestrian Navigation**:
   - Builds an adjacency graph from all mapped path lines.
   - Uses **Dijkstra's shortest-path algorithm** to compute the route along pedestrian paths.
   - Displays glowing walking route line on the map and active HUD with walking minutes and path tags (e.g. *"Includes ramp", "Covered path"*).

---

## File Structure

```text
d:/walkwisedemo me/
├── package.json               # Node.js dependencies & scripts
├── server.js                  # Express backend, PIN auth, JSON file persistence
├── test-suite.js              # Automated integration test suite
├── vercel.json                # Vercel deployment configuration
├── api/
│   └── index.js               # Vercel serverless entry proxy
├── data/
│   └── venue.json             # Seed venue data (places, paths, zones, events)
├── public/
│   ├── shared.js              # Shared geometry, category icons, Dijkstra graph builder
│   ├── organizer.html         # Organizer mobile studio markup
│   ├── organizer.css          # Outdoor high-contrast organizer styles
│   ├── organizer.js           # Organizer GPS filtering, path recording, snapping/splitting
│   ├── index.html             # Visitor mobile markup
│   ├── style.css              # Visitor mobile styles, bottom sheet, navigation HUD
│   └── app.js                 # Visitor GPS smoothing, path snapping, What Next?, routing
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
└── README.md                  # Documentation and deployment guide
```
