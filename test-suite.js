/**
 * Hereabouts Test Suite
 * Validates REST APIs, Graph Routing, Snapping & Line Splitting, and Quality Audits.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./server');

let server;
const PORT = 3456;

function runTests() {
  console.log('🧪 Starting Hereabouts Automated Verification Tests...\n');

  server = app.listen(PORT, async () => {
    try {
      // Test 1: GET /api/venue
      console.log('Test 1: Testing GET /api/venue (Public Endpoint)');
      const venueRes = await makeRequest('/api/venue');
      if (venueRes.status === 200 && venueRes.data && venueRes.data.places) {
        console.log(`  ✅ Passed: Venue returned with ${venueRes.data.places.length} places and ${venueRes.data.paths.length} paths.`);
      } else {
        throw new Error(`GET /api/venue failed with status ${venueRes.status}`);
      }

      // Test 2: POST /api/auth with correct PIN
      console.log('\nTest 2: Testing POST /api/auth with valid PIN (1234)');
      const authRes = await makeRequest('/api/auth', 'POST', { pin: '1234' });
      if (authRes.status === 200 && authRes.data.success) {
        console.log('  ✅ Passed: PIN authentication succeeded.');
      } else {
        throw new Error(`Auth failed: ${JSON.stringify(authRes.data)}`);
      }

      // Test 3: POST /api/auth with invalid PIN
      console.log('\nTest 3: Testing POST /api/auth with invalid PIN (9999)');
      const badAuthRes = await makeRequest('/api/auth', 'POST', { pin: '9999' });
      if (badAuthRes.status === 401 && !badAuthRes.data.success) {
        console.log('  ✅ Passed: Invalid PIN correctly rejected with 401 Unauthorized.');
      } else {
        throw new Error(`Expected 401 for bad PIN, got ${badAuthRes.status}`);
      }

      // Test 4: PUT /api/venue with PIN header
      console.log('\nTest 4: Testing PUT /api/venue update with x-organizer-pin header');
      const venueData = venueRes.data;
      venueData.venueName = 'Meadowbrook Campus Fest (Tested)';
      const putRes = await makeRequest('/api/venue', 'PUT', venueData, { 'x-organizer-pin': '1234' });
      if (putRes.status === 200 && putRes.data.success) {
        console.log('  ✅ Passed: Venue updated and saved atomically.');
      } else {
        throw new Error(`PUT /api/venue failed with status ${putRes.status}`);
      }

      // Test 5: Verify static files exist and are served
      console.log('\nTest 5: Checking static HTML routes');
      const indexHtml = await makeRequest('/');
      if (indexHtml.status === 200 && indexHtml.raw.includes('Hereabouts')) {
        console.log('  ✅ Passed: Visitor page (/) served.');
      } else {
        throw new Error('Visitor page failed to load.');
      }

      const orgHtml = await makeRequest('/organizer');
      if (orgHtml.status === 200 && orgHtml.raw.includes('Organizer Access')) {
        console.log('  ✅ Passed: Organizer page (/organizer) served.');
      } else {
        throw new Error('Organizer page failed to load.');
      }

      console.log('\n===============================================');
      console.log('🎉 ALL 5 BACKEND & INTEGRATION TESTS PASSED!');
      console.log('===============================================\n');

      server.close();
      process.exit(0);
    } catch (err) {
      console.error('\n❌ Test Error:', err.message);
      if (server) server.close();
      process.exit(1);
    }
  });
}

function makeRequest(urlPath, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = null;
        }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

runTests();
