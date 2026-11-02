import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/build-data.mjs path/to/workbook.xlsx');
  process.exit(1);
}

const XLSX = require('xlsx');
const { parseWorkbook, findSensitive } = require(path.join(root, 'js/parse-workbook.js'));
const aliases = JSON.parse(readFileSync(path.join(root, 'data/aliases.json'), 'utf8'));
const workbook = XLSX.read(readFileSync(xlsxPath), { type: 'buffer', cellDates: true });
const result = parseWorkbook(workbook, aliases);
if (!result.ok) {
  console.error('Could not build league data:');
  result.errors.forEach(function (e) { console.error(' -', e); });
  process.exit(1);
}

const json = JSON.stringify(result.league, null, 2) + '\n';
const hits = findSensitive(json);
if (hits.length) {
  console.error('Refusing to write league data because it matched: ' + hits.join(', '));
  process.exit(1);
}

writeFileSync(path.join(root, 'data/league.json'), json);
writeFileSync(path.join(root, 'data/league.js'), 'window.LEAGUE_DATA = ' + JSON.stringify(result.league, null, 2) + ';\n');
writeFileSync(path.join(root, 'data/aliases.js'), 'window.LEAGUE_ALIASES = ' + JSON.stringify(aliases, null, 2) + ';\n');
console.log('Wrote data/league.json, data/league.js, and data/aliases.js');
console.log(result.league.meta.season, result.league.meta.teamCount + ' teams,', result.league.meta.playerCount + ' shooters');
if (result.warnings.length) {
  console.log('Warnings:');
  result.warnings.forEach(function (w) { console.log(' -', w); });
}
