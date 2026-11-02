import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parseWorkbook, findSensitive } = require(path.join(root, 'js/parse-workbook.js'));
const names = require(path.join(root, 'js/names.js'));
const XLSX = require('xlsx');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  }
}

const aliases = JSON.parse(readFileSync(path.join(root, 'data/aliases.json'), 'utf8'));

assert(names.canonicalTeam('FuckUps', aliases) === 'The Fuck-Ups', 'FuckUps');
assert(names.canonicalTeam('THE FUCK-UPS', aliases) === 'The Fuck-Ups', 'THE FUCK-UPS');
assert(names.canonicalTeam('Glazerbeams', aliases) === 'Glazerbeam', 'Glazerbeams');
assert(names.canonicalTeam('RED\u042FUM', aliases) === 'Redrum', 'cyrillic redrum');
assert(names.canonicalTeam('Bad Co.', aliases) === 'Bad Company', 'Bad Co.');
assert(names.canonicalTeam('Bastards', aliases) === "Ol' Dirty Bastards", 'Bastards');
assert(names.canonicalTeam('Roslyn', aliases) === 'All Out of Roslyn', 'Roslyn');
assert(names.canonicalTeam('Troop', aliases) === 'Troopers', 'Troop');
assert(names.canonicalPlayer('CHIP McC.', aliases) === 'Chip McClenaghan', 'Chip McC.');
assert(names.canonicalPlayer('Chip McClenaghan', aliases) === 'Chip McClenaghan', 'Chip full');
assert(names.canonicalPlayer('Tom Killkenny', aliases) === 'Tom Kilkenny', 'Killkenny');
assert(names.canonicalPlayer("SEAN O'BRIEN", aliases) === "Sean O'Brien", "O'Brien");
assert(names.canonicalPlayer('JP UNGEREAN', aliases) === 'JP Ungerean', 'JP');
assert(names.canonicalPlayer('7TH MAN', aliases) === '', '7th man hidden');
assert(names.isPlaceholder(names.normKey('8TH PERSON')), '8th person');
assert(names.slugify('Jake Yannessa') === 'jake-yannessa', 'slug');

const phone = ['215', '555', '0199'].join('-');
const email = ['chip', 'example.com'].join('@');
assert(findSensitive('call ' + phone).indexOf('phone') !== -1, 'phone detector');
assert(findSensitive('write ' + email).indexOf('email') !== -1, 'email detector');
assert(findSensitive('07.22.26').length === 0, 'date is not a phone');
assert(findSensitive('Harry Bratzler 27.35').length === 0, 'average is not a phone');
assert(findSensitive('Glazerbeam 33-11').length === 0, 'record is not a phone');
assert(findSensitive('Captains Contact Info').indexOf('contact-label') !== -1, 'contact label');
assert(findSensitive('If you need Captains contact info, let me know.').length === 0, 'rules sentence is not a contact list');

const xlsxPath = process.argv[2] || process.env.LEAGUE_XLSX;
if (!xlsxPath || !existsSync(xlsxPath)) {
  console.error('Pass the workbook path to verify the real season.');
  process.exit(failed ? 1 : 0);
}

const wb = XLSX.read(readFileSync(xlsxPath), { type: 'buffer', cellDates: true });
const result = parseWorkbook(wb, aliases);
if (!result.ok) {
  console.error('Parser rejected the real workbook:');
  result.errors.forEach(function (e) { console.error(' -', e); });
  process.exit(1);
}
const league = result.league;
console.log('Warnings:');
result.warnings.forEach(function (w) { console.log(' -', w); });
console.log('Teams:', league.teams.map(function (t) { return t.rank + ' ' + t.name + ' ' + t.w + '-' + t.l; }).join('\n'));
console.log('Players', league.players.length);
console.log('Weeks', league.schedule.weeks.length, 'playoff blocks', league.schedule.playoffs.length);
console.log(JSON.stringify(league.schedule.playoffs, null, 2).slice(0, 2000));

const first = league.standings[0];
assert(first.name === 'Glazerbeam' && first.w === 33 && first.l === 11 && first.rank === 1, 'Glazerbeam 33-11 first, got ' + JSON.stringify(first));
assert(league.standings.filter(function (t) { return t.playoffs; }).length === 8, 'top 8 playoffs');
assert(league.standings[8] && league.standings[8].playoffs === false, '9th misses playoffs');

const harry = league.players.find(function (p) { return p.name === 'Harry Bratzler'; });
assert(harry && Math.abs(harry.average - 27.35) < 0.001 && harry.rank === 1, 'Harry 27.35 rank 1');
const dan = league.players.find(function (p) { return p.name === 'Dan White'; });
assert(dan && dan.rank === 2, 'Dan White rank 2');
const jake = league.players.find(function (p) { return p.name === 'Jake Yannessa'; });
assert(jake && jake.highSeries === 107, 'Jake series 107, got ' + (jake && jake.highSeries));
assert(jake && jake.highSeriesWeek === 7, 'Jake series week 7, got ' + (jake && jake.highSeriesWeek));
assert(jake && jake.highSeriesDate === '07.22.26', 'Jake series date, got ' + (jake && jake.highSeriesDate));
assert(jake && jake.highGame === 42, 'Jake high game 42, got ' + (jake && jake.highGame));
assert(jake && jake.thirtyCount === 11, 'Jake 30+ count 11, got ' + (jake && jake.thirtyCount));
const maxGame = Math.max.apply(null, league.players.map(function (p) { return p.highGame || 0; }));
assert(maxGame === 42, 'league high game 42, got ' + maxGame);
assert(league.players.some(function (p) { return p.name === 'Chip McClenaghan'; }), 'Chip official name');
assert(!league.players.some(function (p) { return /killkenny/i.test(p.name); }), 'no Killkenny');
const blob = JSON.stringify(league);
assert(!/7th man/i.test(blob), 'no 7th man');
assert(!/#DIV\/0!/i.test(blob), 'no DIV/0');
assert(findSensitive(blob).length === 0, 'published data is clean: ' + findSensitive(blob).join(','));
assert(league.schedule.weeks.length === 11, '11 weeks');
assert(league.teams.length === 12, '12 teams');
assert(league.players.length >= 70 && league.players.length <= 110, 'player count ' + league.players.length);

league.standings.forEach(function (t) {
  var wins = league.h2h.filter(function (r) { return r.team === t.name; }).reduce(function (s, r) { return s + r.w; }, 0);
  assert(wins === t.w, t.name + ' H2H wins ' + wins + ' vs standings ' + t.w);
});

const week2 = league.schedule.weeks.find(function (w) { return w.number === 2; });
const repaired = week2 && week2.matches.find(function (m) { return m.home === 'Faces' && m.away === 'Glazerbeam'; });
assert(repaired && repaired.time === '9:15 pm', 'week 2 Faces/Glazer time, got ' + JSON.stringify(repaired));

const john = honorsCount(league, 'ginzburgh', 'John Clauss');
assert(john === 43, 'John Clauss Ginzburgh 43, got ' + john);
assert(honorsCount(league, 'ginzburgh', 'Tom Kilkenny') === 24, 'Tom Kilkenny Ginzburgh');
assert(honorsCount(league, 'pow', 'Matt Kraynik') === 4, 'Matt POW count');
const chipPow = league.players.find(function (p) { return p.name === 'Chip McClenaghan'; });
assert(chipPow && chipPow.powCount === 6, 'Chip POW awards, got ' + (chipPow && chipPow.powCount));
assert(jake.ginzburgh === 11, 'Jake all-time Ginzburgh 11, got ' + jake.ginzburgh);
assert(league.pow.rows[0] && league.pow.rows[0].name === 'Matt Kraynik', 'current POW Matt, got ' + (league.pow.rows[0] && league.pow.rows[0].name));
assert(league.pow.log.length >= 5, 'ginzburgh log ' + league.pow.log.length);
assert(league.rules.length > 5, 'rules text');
assert(league.spread.length >= 30, 'spread chart ' + league.spread.length);

const glazer = league.teams.find(function (t) { return t.name === 'Glazerbeam'; });
if (glazer.weekly) {
  var pf = glazer.weekly.reduce(function (s, w) { return s + w.pf; }, 0);
  assert(Math.abs(pf - glazer.pf) <= 1, 'Glazer weekly PF ' + pf + ' vs ' + glazer.pf);
  console.log('Weekly PF attached');
} else {
  console.log('Weekly PF omitted');
}

const xml = execSync('unzip -p ' + JSON.stringify(xlsxPath) + ' xl/sharedStrings.xml', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const sourceHits = findSensitive(xml);
assert(sourceHits.indexOf('phone') !== -1, 'source workbook should contain phones so the scrub is meaningful');
const re = new RegExp('(?:\\+?1[\\s.\\-]?)?\\(?\\d{3}\\)?[\\s.\\-]\\d{3}[\\s.\\-]\\d{4}', 'g');
const found = xml.match(re) || [];
assert(found.length > 0, 'expected formatted phones in source');
found.forEach(function (hit) {
  if (blob.indexOf(hit) !== -1) {
    failed += 1;
    console.error('FAIL: published data contains a source phone pattern');
  }
});
console.log('Source phone patterns:', found.length, '(values not printed). None in published data.');

const bad = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(bad, XLSX.utils.aoa_to_sheet([['nope']]), 'golf');
XLSX.utils.book_append_sheet(bad, XLSX.utils.aoa_to_sheet([[phone]]), 'Capt.');
const badResult = parseWorkbook(bad, aliases);
assert(!badResult.ok && badResult.league === null, 'malformed workbook rejected');
assert(badResult.errors.some(function (e) { return /Standings/.test(e); }), 'missing Standings is named');
assert(JSON.stringify(badResult).indexOf(phone) === -1, 'rejection does not echo the phone');

function honorsCount(leagueFile, kind, name) {
  const row = leagueFile.honors[kind].find(function (r) { return r.name === name; });
  return row ? row.count : null;
}

if (failed) {
  console.error(failed + ' assertion(s) failed');
  process.exit(1);
}
console.log('Verify ok.');
