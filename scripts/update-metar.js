const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SOURCE_URL = "https://aviationweather.gov/data/cache/metars.cache.csv.gz";
const OUTPUT_DIR = path.join(__dirname, "..", "data");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "metars.json");

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

async function downloadCache() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "metar-gh-pages-builder/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Allikas vastas veaga ${response.status}.`);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  return zlib.gunzipSync(compressed).toString("utf8");
}

async function buildDataset() {
  const csvText = await downloadCache();
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const stations = {};

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex]);
    if (values.length !== header.length) {
      continue;
    }

    const row = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    const icao = (row.station_id || "").trim().toUpperCase();
    const rawOb = (row.raw_text || "").trim();

    if (!icao || !rawOb) {
      continue;
    }

    stations[icao] = {
      rawOb,
      observationTime: row.observation_time || null,
      flightCategory: row.flight_category || null,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null
    };
  }

  const payload = {
    source: SOURCE_URL,
    updatedAt: new Date().toISOString(),
    stationCount: Object.keys(stations).length,
    stations
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload));
  console.log(`Kirjutasin ${payload.stationCount} jaama faili ${OUTPUT_PATH}`);
}

buildDataset().catch((error) => {
  console.error(error);
  process.exit(1);
});
