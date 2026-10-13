#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_INPUT = 'C:\\Users\\george.s.oliveira\\Downloads\\IP2LOCATION-LITE-DB11.CSV\\IP2LOCATION-LITE-DB11.CSV';
const DEFAULT_OUTPUT = path.join(__dirname, '..', 'src', 'ip-location-db');
const MAX_SEARCH_ITEMS = 0;

const args = parseArgs(process.argv.slice(2));
const input = path.resolve(args.input || DEFAULT_INPUT);
const outputDir = path.resolve(args.output || DEFAULT_OUTPUT);
const maxSearchItems = Number(args.maxSearchItems) || MAX_SEARCH_ITEMS;

main().catch(error => {
  console.error((error && error.stack) || error);
  process.exitCode = 1;
});

async function main() {
  if (!fs.existsSync(input)) throw new Error('CSV nao encontrado: ' + input);
  fs.mkdirSync(outputDir, { recursive: true });

  const countries = new Map();
  const search = new Map();
  let rows = 0;
  const reader = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    const fields = parseCsvLine(line);
    if (fields.length < 10) continue;

    const start = toUint32(fields[0]);
    const end = toUint32(fields[1]);
    const countryCode = clean(fields[2]).toUpperCase();
    const country = clean(fields[3]);
    if (start === null || end === null || !countryCode || countryCode === '-' || country === '-') continue;

    const row = {
      start,
      end,
      countryCode,
      country,
      region: clean(fields[4]),
      city: clean(fields[5]),
      timezone: clean(fields[9]),
    };

    if (!countries.has(countryCode)) countries.set(countryCode, { code: countryCode, name: country, rows: [] });
    countries.get(countryCode).rows.push(row);
    addSearch(search, 'country', country, countryCode, countryCode, '');
    if (row.region && row.region !== '-') addSearch(search, 'region', row.region + ', ' + country, row.region, countryCode, '');
    if (row.city && row.city !== '-')
      addSearch(search, 'city', row.city + (row.region && row.region !== '-' ? ', ' + row.region : '') + ', ' + country, row.city, countryCode, row.region);
    if (row.timezone && row.timezone !== '-') addSearch(search, 'timezone', row.timezone, row.timezone, countryCode, '');
    rows += 1;
  }

  const index = {
    schema: 'chameleon-ip2location-db11',
    version: 1,
    source: path.basename(input),
    generatedAt: new Date().toISOString(),
    rows,
    countries: [],
    search: [],
  };

  for (const country of Array.from(countries.values()).sort((a, b) => a.code.localeCompare(b.code))) {
    country.rows.sort((a, b) => a.start - b.start);
    fs.writeFileSync(
      path.join(outputDir, country.code + '.json'),
      JSON.stringify({
        schema: 'chameleon-ip2location-country',
        version: 1,
        countryCode: country.code,
        country: country.name,
        rows: country.rows,
      })
    );
    index.countries.push({ code: country.code, name: country.name, rows: country.rows.length, asset: country.code + '.json' });
  }

  let searchItems = Array.from(search.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  index.search = maxSearchItems > 0 ? searchItems.slice(0, maxSearchItems) : searchItems;
  fs.writeFileSync(path.join(outputDir, 'index.json'), JSON.stringify(index));

  console.log(JSON.stringify({ ok: true, input, outputDir, rows, countries: index.countries.length, search: index.search.length }, null, 2));
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') result.input = argv[++i];
    else if (argv[i] === '--output') result.output = argv[++i];
    else if (argv[i] === '--max-search-items') result.maxSearchItems = argv[++i];
  }
  return result;
}

function addSearch(search, type, label, value, countryCode, region) {
  const scope = type === 'timezone' ? '' : countryCode;
  const key = [type, scope, normalize(region), normalize(value)].join('|');
  const current = search.get(key);
  if (current) {
    current.count += 1;
    if (!current.countryCodes.includes(countryCode)) current.countryCodes.push(countryCode);
    return;
  }
  search.set(key, {
    type,
    label,
    value,
    countryCodes: [countryCode],
    region: region || '',
    count: 1,
    q: normalize([label, value, countryCode, region].filter(Boolean).join(' ')),
  });
}

function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else value += char;
  }
  fields.push(value);
  return fields;
}

function clean(value) {
  return String(value || '').trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toUint32(value) {
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 && result <= 4294967295 ? result : null;
}
