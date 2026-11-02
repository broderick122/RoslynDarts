import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const { findSensitive } = require(path.join(root, 'js/parse-workbook.js'));
const names = require(path.join(root, 'js/names.js'));

const files = execSync('git ls-files -z', { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const spreadsheet = /\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i;
const skip = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?)$/i;
let failed = 0;

function fail(message) {
  failed += 1;
  console.error('FAIL ' + message);
}

for (const rel of files) {
  if (spreadsheet.test(rel)) {
    fail(rel + ': spreadsheet files are not published. They can contain phone numbers.');
    continue;
  }
  if (skip.test(rel)) continue;
  let text = '';
  try {
    text = readFileSync(path.join(root, rel), 'utf8');
  } catch (err) {
    continue;
  }
  if (text.indexOf('\0') !== -1) continue;
  const longDigits = !rel.startsWith('vendor/');
  const hits = findSensitive(text, { longDigits: longDigits });
  if (hits.length) fail(rel + ': found ' + hits.join(', '));
}

const leaguePath = path.join(root, 'data/league.json');
let league;
try {
  league = JSON.parse(readFileSync(leaguePath, 'utf8'));
} catch (err) {
  fail('data/league.json is missing or is not valid JSON');
  league = null;
}
if (league) {
  if (!league.standings || !league.standings.length) fail('data/league.json has no standings');
  if (!league.players || !league.players.length) fail('data/league.json has no players');
  const blob = JSON.stringify(league);
  if (/#DIV\/0!/i.test(blob)) fail('data/league.json still contains #DIV/0!');
  for (const player of league.players) {
    if (names.isPlaceholder(names.normKey(player.name || ''))) {
      fail('data/league.json includes an empty roster name: ' + player.name);
    }
  }
  const aliases = JSON.parse(readFileSync(path.join(root, 'data/aliases.json'), 'utf8'));
  const aliasJs = readFileSync(path.join(root, 'data/aliases.js'), 'utf8');
  if (aliasJs.indexOf(JSON.stringify(aliases.teams['glazerbeam'])) === -1) {
    fail('data/aliases.js is out of date with data/aliases.json');
  }
}

if (failed) {
  console.error(failed + ' privacy check(s) failed.');
  process.exit(1);
}
console.log('Privacy check ok (' + files.length + ' files).');
