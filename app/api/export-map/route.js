import { fetchSubmissions } from '@/lib/kobo';
import { filterSubmissionsForUser, applyUrlFilters } from '@/lib/filter';
import { getField } from '@/lib/fieldMap';

export const dynamic = 'force-dynamic';

function parseLocation(val) {
  if (val == null) return null;
  if (typeof val === 'object') {
    const lat = val.latitude ?? val.lat ?? val.y;
    const lng = val.longitude ?? val.lng ?? val.lon ?? val.x;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
    return null;
  }
  const parts = String(val).trim().split(/\s+/).map((x) => Number(x));
  if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) return { lat: parts[0], lng: parts[1] };
  return null;
}

function escapeXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ---- minimal ZIP (stored / no compression) so KMZ needs no dependency ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipSingleFile(filename, contentBuffer) {
  const nameBuf = Buffer.from(filename, 'utf8');
  const data = contentBuffer;
  const crc = crc32(data);
  const size = data.length;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);      // version needed
  local.writeUInt16LE(0, 6);       // flags
  local.writeUInt16LE(0, 8);       // method 0 = stored
  local.writeUInt16LE(0, 10);      // mod time
  local.writeUInt16LE(0, 12);      // mod date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(size, 18);   // compressed
  local.writeUInt32LE(size, 22);   // uncompressed
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);      // extra len
  const localHeader = Buffer.concat([local, nameBuf]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);    // version made by
  central.writeUInt16LE(20, 6);    // version needed
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);    // offset of local header
  const centralHeader = Buffer.concat([central, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length, 12);
  eocd.writeUInt32LE(localHeader.length + size, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, data, centralHeader, eocd]);
}

function buildKml(points, ts) {
  const placemarks = points.map((p) => `
    <Placemark>
      <name>${escapeXml(p.village)} - ${escapeXml(p.serial)}</name>
      <description><![CDATA[
        <b>Reading:</b> ${escapeXml(p.reading)}<br/>
        <b>Surveyor:</b> ${escapeXml(p.surveyor)}<br/>
        <b>Time:</b> ${escapeXml(p.time)}<br/>
        <b>Submission #</b>${escapeXml(p.id)}
      ]]></description>
      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
    </Placemark>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>PVC Pipe Readings ${ts}</name>
    <description>Exported from PVC Pipe Readings</description>
    ${placemarks}
  </Document>
</kml>`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();

    let subs = await fetchSubmissions();
    subs = await filterSubmissionsForUser(subs);
    subs = applyUrlFilters(subs, searchParams);

    const points = [];
    for (const s of subs) {
      const loc = parseLocation(getField(s, 'location')) || parseLocation(s._geolocation);
      if (loc) {
        points.push({
          id: s._id, lat: loc.lat, lng: loc.lng,
          village: getField(s, 'village') || 'Unknown',
          serial: getField(s, 'serial') || 'Unknown',
          reading: getField(s, 'endReading') ?? '',
          surveyor: getField(s, 'surveyor') || 'Unknown',
          time: s._submission_time,
        });
      }
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'json' || format === 'geojson') {
      const geo = {
        type: 'FeatureCollection',
        features: points.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { id: p.id, village: p.village, meter: p.serial, reading: p.reading, surveyor: p.surveyor, time: p.time },
        })),
      };
      return new Response(JSON.stringify(geo, null, 2), {
        headers: { 'Content-Type': 'application/geo+json; charset=utf-8', 'Content-Disposition': `attachment; filename="water-meter-map-${ts}.geojson"` },
      });
    }

    if (format === 'kml') {
      return new Response(buildKml(points, ts), {
        headers: { 'Content-Type': 'application/vnd.google-earth.kml+xml; charset=utf-8', 'Content-Disposition': `attachment; filename="water-meter-map-${ts}.kml"` },
      });
    }

    if (format === 'kmz') {
      const kml = buildKml(points, ts);
      const zip = zipSingleFile('doc.kml', Buffer.from(kml, 'utf8'));
      return new Response(zip, {
        headers: { 'Content-Type': 'application/vnd.google-earth.kmz', 'Content-Disposition': `attachment; filename="water-meter-map-${ts}.kmz"` },
      });
    }

    if (format === 'html') {
      const safePoints = JSON.stringify(points);
      const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><title>PVC Pipe Map ${ts}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body,html,#map{margin:0;height:100vh;font-family:system-ui}</style>
</head><body><div id="map"></div>
<script>
const points = ${safePoints};
const map = L.map('map').setView([30.9, 75.8], 9);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'OpenStreetMap'}).addTo(map);
const markers = points.map(p => {
  const m = L.marker([p.lat, p.lng]).addTo(map);
  m.bindPopup('<b>' + p.village + '</b><br/>Pipe: ' + p.serial + '<br/>Reading: ' + p.reading + '<br/>By: ' + p.surveyor + '<br/><a target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lng + '">Directions</a>');
  return m;
});
if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
</script></body></html>`;
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="water-meter-map-${ts}.html"` },
      });
    }

    // CSV (default)
    const lines = ['Submission ID,Village,Pipe ID,Reading,Surveyor,Latitude,Longitude,Time,Directions Link'];
    for (const p of points) {
      const cells = [p.id, p.village, p.serial, p.reading, p.surveyor, p.lat, p.lng, p.time, `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`];
      lines.push(cells.map((c) => {
        const v = String(c ?? '');
        return /[,"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(','));
    }
    return new Response('\uFEFF' + lines.join('\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="water-meter-map-${ts}.csv"` },
    });
  } catch (e) {
    return new Response(`Export error: ${e.message}`, { status: 500 });
  }
}
