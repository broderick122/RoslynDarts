/* Turn Chip's workbook into the public league file.
   Only the sheets listed in ALLOWED_SHEETS are read, and only the
   stat cells those sheets are known for. The Capt. sheet is never opened.
*/
(function (root, factory) {
  var Names = root.RoslynNames;
  if (!Names && typeof require === 'function') Names = require('./names.js');
  if (!Names) throw new Error('names.js has to load before the workbook parser.');
  var api = factory(Names);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RoslynParse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Names) {
  'use strict';

  var ALLOWED_SHEETS = [
    'Standings',
    'AVERAGES',
    'Avg GRID',
    'Schedule',
    'H2H',
    'PF-PA',
    'Avg-Series',
    '30Detail',
    'news',
    'Ginsburgh&PlayeroftheWeek',
    'Rules',
    'SPREAD'
  ];

  var PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/;
  var EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
  var LONG_DIGITS_RE = /(?<![\d.])\d{10,}(?![\d.])/;

  function findSensitive(text, opts) {
    var s = String(text == null ? '' : text);
    var hits = [];
    if (PHONE_RE.test(s)) hits.push('phone');
    if (EMAIL_RE.test(s)) hits.push('email');
    if (!opts || opts.longDigits !== false) {
      if (LONG_DIGITS_RE.test(s)) hits.push('long-number');
    }
    var lines = s.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/[^a-z]+/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (
        line === 'captains contact info' ||
        line === 'captain contact info' ||
        line === 'please add these to your contacts'
      ) {
        hits.push('contact-label');
        break;
      }
    }
    return hits;
  }

  function getXLSX() {
    if (typeof XLSX !== 'undefined') return XLSX;
    if (typeof globalThis !== 'undefined' && globalThis.XLSX) return globalThis.XLSX;
    if (typeof require === 'function') return require('xlsx');
    throw new Error('The spreadsheet reader is not loaded.');
  }

  function resolveSheetName(workbook, want) {
    var names = workbook.SheetNames || [];
    for (var i = 0; i < names.length; i++) {
      if (names[i] === want) return names[i];
    }
    var lower = want.toLowerCase();
    for (var j = 0; j < names.length; j++) {
      if (String(names[j]).trim().toLowerCase() === lower) return names[j];
    }
    return null;
  }

  function sheetRows(workbook, want) {
    if (ALLOWED_SHEETS.indexOf(want) === -1) {
      throw new Error('Refusing to read a sheet that is not on the stats allowlist.');
    }
    var actual = resolveSheetName(workbook, want);
    if (!actual) return null;
    var X = getXLSX();
    var ws = workbook.Sheets[actual];
    if (!ws || !ws['!ref']) return [];
    var range = X.utils.decode_range(ws['!ref']);
    var rows = [];
    for (var r = range.s.r; r <= range.e.r; r++) {
      var line = [];
      for (var c = range.s.c; c <= range.e.c; c++) {
        var cell = ws[X.utils.encode_cell({ r: r, c: c })];
        if (!cell || cell.t === 'e') {
          line[c] = null;
        } else {
          line[c] = cell.v == null ? null : cell.v;
        }
      }
      rows[r] = line;
    }
    return rows;
  }

  function isDate(value) {
    return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
  }

  function num(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    var t = value.trim();
    if (!t || /div\/0/i.test(t)) return null;
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return null;
  }

  function safeText(value, ctx) {
    if (value == null) return '';
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    var s = Names.cleanLabel(value);
    if (!s) return '';
    if (/div\/0/i.test(s)) return '';
    if (findSensitive(s).length) {
      ctx.redacted += 1;
      return '';
    }
    return s;
  }

  function gbText(value, ctx) {
    if (value == null || value === '') return '';
    if (typeof value === 'number' && isFinite(value)) return String(value);
    if (typeof value !== 'string') return '';
    var s = value.trim();
    if (!s || /div\/0/i.test(s)) return '';
    if (findSensitive(s).length) {
      ctx.redacted += 1;
      return '';
    }
    return s;
  }

  function sheetDate(value) {
    if (value == null || value === '') return '';
    if (isDate(value)) {
      var m = String(value.getUTCMonth() + 1);
      var d = String(value.getUTCDate());
      var y = String(value.getUTCFullYear()).slice(-2);
      if (m.length < 2) m = '0' + m;
      if (d.length < 2) d = '0' + d;
      return m + '.' + d + '.' + y;
    }
    if (typeof value === 'number') return '';
    var s = Names.cleanLabel(value);
    if (!s || /div\/0/i.test(s)) return '';
    return s;
  }

  function normTime(value) {
    if (value == null || value === '') return '';
    if (isDate(value)) {
      if (value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCFullYear() > 1990) {
        return '9:15 pm';
      }
      return formatHM(value.getUTCHours(), value.getUTCMinutes());
    }
    if (typeof value === 'number') {
      if (value > 0 && value < 1) {
        var mins = Math.round(value * 24 * 60);
        return formatHM(Math.floor(mins / 60), mins % 60);
      }
      if (value > 1000) return '9:15 pm';
      return '';
    }
    var s = String(value).trim();
    var match = s.match(/(\d{1,2})\s*:\s*(\d{2})\s*(am|pm)?/i);
    if (!match) return '';
    var hour = Number(match[1]);
    var minute = match[2];
    var ap = (match[3] || 'pm').toLowerCase();
    if (!match[3] && hour >= 1 && hour <= 11) ap = 'pm';
    return hour + ':' + minute + ' ' + ap;
  }

  function formatHM(hour, minute) {
    var ap = hour >= 12 ? 'pm' : 'am';
    var h = hour % 12;
    if (h === 0) h = 12;
    var m = minute < 10 ? '0' + minute : String(minute);
    return h + ':' + m + ' ' + ap;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function stripSeed(raw) {
    return String(raw || '').replace(/^\[\d+\]\s*/, '').replace(/^\d+\.\s*/, '').trim();
  }

  function splitSeed(raw) {
    var text = String(raw || '').replace(/\s+/g, ' ').trim();
    var bracket = text.match(/^\[(\d+)\]\s*(.+)$/);
    if (bracket) return { seed: Number(bracket[1]), name: bracket[2] };
    var dotted = text.match(/^(\d+)\.\s*(.+)$/);
    if (dotted) return { seed: Number(dotted[1]), name: dotted[2] };
    return { seed: null, name: text };
  }

  function knownTeam(raw, aliases, allowed) {
    var name = Names.canonicalTeam(stripSeed(raw), aliases, { fallback: false });
    if (!name) return '';
    if (allowed && !allowed.has(name)) return '';
    return name;
  }

  function parseStandings(rows, aliases, ctx) {
    var header = -1;
    for (var r = 0; r < rows.length && r < 40; r++) {
      var texts = (rows[r] || []).map(function (v) { return typeof v === 'string' ? Names.normKey(v) : ''; });
      if (texts.indexOf('team') !== -1 && texts.indexOf('w') !== -1 && texts.indexOf('l') !== -1) {
        header = r;
        break;
      }
    }
    if (header < 0) {
      ctx.errors.push('The Standings tab does not have a team table. It needs a header row with TEAM, W, and L.');
      return { teams: [], leagueAverage: null };
    }

    function readSide(line, offset) {
      var teamRaw = line[offset + 1];
      if (typeof teamRaw !== 'string') return null;
      var key = Names.normKey(teamRaw);
      if (!key || key === 'team') return null;
      if (key === 'key' || key === 'bye week' || key === 'in' || key === 'out') return null;
      if (key.indexOf('league avg') === 0 || key === 'league average') {
        var nums = [];
        for (var i = 0; i < line.length; i++) {
          var n = num(line[i]);
          if (n !== null) nums.push(n);
        }
        var average = null;
        var big = [];
        for (var k = 0; k < nums.length; k++) {
          if (nums[k] > 5 && nums[k] < 45) average = nums[k];
          else if (nums[k] >= 45) big.push(nums[k]);
        }
        big.sort(function (a, b) { return a - b; });
        if (big.length >= 2) {
          ctx.leagueAverage = { games: big[0], points: big[big.length - 1], average: average };
        }
        return null;
      }
      var gms = num(line[offset + 2]);
      var w = num(line[offset + 3]);
      var l = num(line[offset + 4]);
      var t = num(line[offset + 5]);
      if (gms === null && w === null && l === null) return null;
      var source = safeText(teamRaw, ctx);
      if (!source) return null;
      var wins = w === null ? 0 : w;
      var losses = l === null ? 0 : l;
      var ties = t === null ? 0 : t;
      var played = gms === null ? wins + losses + ties : gms;
      var pct = num(line[offset + 9]);
      if (pct === null && played) pct = wins / played;
      return {
        source: source,
        name: Names.canonicalTeam(source, aliases),
        gms: played,
        w: wins,
        l: losses,
        t: ties,
        gb: gbText(line[offset + 6], ctx),
        pf: num(line[offset + 7]),
        pa: num(line[offset + 8]),
        pct: pct
      };
    }

    var left = [];
    var right = [];
    var emptyRun = 0;
    var found = 0;
    for (var row = header + 1; row < rows.length; row++) {
      var line = rows[row] || [];
      var a = readSide(line, 0);
      var b = readSide(line, 11);
      if (!a && !b) {
        emptyRun += 1;
        if (found >= 4 && emptyRun >= 8) break;
        continue;
      }
      emptyRun = 0;
      if (a) { left.push(a); found += 1; }
      if (b) { right.push(b); found += 1; }
    }

    var teams = left.concat(right);
    var anyPlayed = teams.some(function (t) { return t.gms > 0 || t.w > 0 || t.l > 0; });
    if (anyPlayed) {
      teams = teams.filter(function (t) { return t.gms > 0 || t.w > 0 || t.l > 0; });
    }
    if (teams.length < 4) {
      ctx.errors.push('The Standings tab only has ' + teams.length + ' team' + (teams.length === 1 ? '' : 's') + ' with a record. The table may have moved, so nothing was published.');
      return { teams: [], leagueAverage: ctx.leagueAverage || null };
    }
    teams.forEach(function (t, i) {
      t.rank = i + 1;
      t.playoffs = i < 8;
      if (t.w > 80 || t.l > 80 || (t.pf !== null && t.pf > 20000)) {
        ctx.errors.push('The standings row for ' + t.name + ' has numbers that do not look like a season record (wins ' + t.w + ', points for ' + t.pf + '). The Standings layout may have changed, so nothing was published.');
      }
      if (t.gms && t.w + t.l + t.t !== t.gms) {
        ctx.warnings.push(t.name + ': wins, losses, and ties add up to ' + (t.w + t.l + t.t) + ' but the games column says ' + t.gms + '. Both numbers are shown as written.');
      }
    });
    return { teams: teams, leagueAverage: ctx.leagueAverage || null };
  }

  function parseAverages(rows, aliases, allowed, ctx) {
    var starts = [0, 5, 10];
    var blocks = [];
    for (var s = 0; s < starts.length; s++) {
      var start = starts[s];
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r] || [];
        var cell = row[start];
        if (typeof cell !== 'string') continue;
        var key = Names.normKey(cell);
        if (!key || key === 'name' || key.indexOf('team average') === 0) continue;
        if (key.indexOf('dart league') !== -1 || key.indexOf('shooter average') === 0) continue;
        if (row[start + 1] !== null && row[start + 1] !== '') continue;
        var header = -1;
        for (var k = 1; k <= 4 && r + k < rows.length; k++) {
          var h = rows[r + k] || [];
          if (typeof h[start] === 'string' && Names.normKey(h[start]) === 'name') {
            header = r + k;
            break;
          }
        }
        if (header < 0) continue;
        var labels = [1, 2, 3].map(function (i) {
          return Names.normKey((rows[header] || [])[start + i] || '');
        });
        if (labels.indexOf('gms') === -1 && labels.indexOf('games') === -1 && labels.indexOf('avg') === -1) continue;
        var source = safeText(cell, ctx);
        if (!source) continue;
        var roster = [];
        var teamGames = null;
        var teamPoints = null;
        var teamAverage = null;
        for (var rr = header + 1; rr < rows.length && rr < header + 14; rr++) {
          var line = rows[rr] || [];
          var rawName = line[start];
          if (rawName == null || rawName === '') break;
          if (typeof rawName !== 'string') break;
          var nk = Names.normKey(rawName);
          if (nk.indexOf('team average') === 0) {
            teamGames = num(line[start + 1]);
            teamPoints = num(line[start + 2]);
            teamAverage = num(line[start + 3]);
            break;
          }
          if (Names.isPlaceholder(nk)) {
            ctx.skippedPlaceholders += 1;
            continue;
          }
          var games = num(line[start + 1]);
          var points = num(line[start + 2]);
          var average = num(line[start + 3]);
          if (games === null || games <= 0) {
            ctx.skippedEmpty += 1;
            continue;
          }
          if (average === null && points !== null) average = points / games;
          var pname = Names.canonicalPlayer(rawName, aliases);
          var psource = safeText(rawName, ctx);
          if (!pname || !psource) continue;
          if (games > 60 || (average !== null && average > 80)) {
            ctx.warnings.push(pname + ' was left off ' + source + ' because the games or average did not look like a darts line.');
            continue;
          }
          var teamForAvg = Names.canonicalTeam(source, aliases);
          if (allowed.has(teamForAvg) && points !== null && average !== null && games >= 3 && Math.abs(points / games - average) > 1.5) {
            ctx.avgMismatches.push(pname + ' (' + teamForAvg + '): the average column says ' + average + ' and points divided by games is ' + (points / games).toFixed(2) + '. The site shows the average column.');
          }
          roster.push({
            source: psource,
            name: pname,
            games: games,
            points: points === null ? 0 : points,
            average: average
          });
        }
        if (!roster.length) continue;
        blocks.push({
          source: source,
          name: Names.canonicalTeam(source, aliases),
          roster: roster,
          teamGames: teamGames,
          teamPoints: teamPoints,
          teamAverage: teamAverage
        });
      }
    }

    var map = new Map();
    var oldTeams = [];
    blocks.forEach(function (block) {
      if (!allowed.has(block.name)) {
        oldTeams.push(block.name);
        return;
      }
      var games = block.roster.reduce(function (sum, p) { return sum + p.games; }, 0);
      var prev = map.get(block.name);
      if (!prev || games > prev._games) {
        block._games = games;
        map.set(block.name, block);
      }
    });
    if (oldTeams.length) {
      var uniqueOld = oldTeams.filter(function (name, i) { return oldTeams.indexOf(name) === i; });
      ctx.warnings.push('Left out shooter lists that are not in this season\'s standings: ' + uniqueOld.join(', ') + '.');
    }
    allowed.forEach(function (name) {
      if (!map.has(name)) {
        ctx.errors.push('The AVERAGES tab does not have a shooter list for ' + name + '.');
      }
    });
    return map;
  }

  function parseGrid(rows, aliases, allowed, ctx) {
    var blocks = [];
    var nameCols = [2, 13];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [];
      for (var nc = 0; nc < nameCols.length; nc++) {
        var col = nameCols[nc];
        var val = row[col];
        if (typeof val !== 'string') continue;
        var teamName = Names.canonicalTeam(val, aliases);
        if (!allowed.has(teamName)) continue;
        var next = rows[r + 1] || [];
        var gameCol = col === 2 ? 1 : 12;
        var labelCol = col === 2 ? 0 : 11;
        var people = [];
        var named = 0;
        for (var c = 0; c < 8; c++) {
          var raw = next[col + c];
          if (typeof raw !== 'string' || !Names.normKey(raw)) {
            people.push(null);
            continue;
          }
          named += 1;
          if (Names.isPlaceholder(Names.normKey(raw))) {
            ctx.skippedPlaceholders += 1;
            people.push(null);
            continue;
          }
          var pname = Names.canonicalPlayer(raw, aliases);
          var psource = safeText(raw, ctx);
          if (!pname || !psource) {
            people.push(null);
            continue;
          }
          people.push({ source: psource, name: pname, weeks: new Map(), numeric: 0 });
        }
        if (named < 3) continue;
        var matchNo = null;
        for (var rr = r + 2; rr < rows.length && rr < r + 48; rr++) {
          var line = rows[rr] || [];
          var label = typeof line[labelCol] === 'string' ? line[labelCol] : '';
          if (/games\s*shot|total\s*pts|average/i.test(label)) break;
          if (typeof line[col] === 'string' && allowed.has(Names.canonicalTeam(line[col], aliases))) break;
          var match = String(label).match(/match\s*#\s*0*(\d+)/i);
          if (match) matchNo = Number(match[1]);
          var gameNo = num(line[gameCol]);
          if (!matchNo || !gameNo || gameNo < 1 || gameNo > 3) continue;
          for (var p = 0; p < people.length; p++) {
            if (!people[p]) continue;
            var cell = line[col + p];
            if (cell == null || cell === '') continue;
            var slot = people[p].weeks.get(matchNo);
            if (!slot) {
              slot = [null, null, null];
              people[p].weeks.set(matchNo, slot);
            }
            if (typeof cell === 'number' && isFinite(cell)) {
              slot[gameNo - 1] = cell;
              people[p].numeric += 1;
            } else if (typeof cell === 'string' && cell.trim().toUpperCase() === 'F') {
              slot[gameNo - 1] = 'F';
            }
          }
        }
        var scoreCount = people.reduce(function (sum, p) { return sum + (p ? p.numeric : 0); }, 0);
        blocks.push({ team: teamName, source: safeText(val, ctx) || val, people: people, scoreCount: scoreCount });
      }
    }

    var best = new Map();
    blocks.forEach(function (block) {
      var prev = best.get(block.team);
      if (!prev || block.scoreCount > prev.scoreCount) best.set(block.team, block);
    });
    allowed.forEach(function (name) {
      if (!best.has(name) || best.get(name).scoreCount === 0) {
        ctx.errors.push('The Avg GRID tab does not have game scores for ' + name + '.');
      }
    });
    return best;
  }

  function weeksFromPerson(person) {
    var weeks = [];
    person.weeks.forEach(function (scores, week) {
      var any = scores.some(function (s) { return s !== null; });
      if (!any) return;
      var nums = scores.filter(function (s) { return typeof s === 'number'; });
      var total = nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) : null;
      var complete = scores.length === 3 && scores.every(function (s) { return typeof s === 'number'; });
      weeks.push({ week: week, scores: scores.slice(), total: total, complete: complete });
    });
    weeks.sort(function (a, b) { return a.week - b.week; });
    return weeks;
  }

  function multiplier(value) {
    if (typeof value !== 'string') return null;
    var match = value.trim().match(/^x\s*(\d+)$/i);
    return match ? Number(match[1]) : null;
  }

  function parseThirty(rows, aliases, ctx) {
    var list = [];
    for (var r = 0; r < rows.length; r++) {
      var line = rows[r] || [];
      if (typeof line[0] !== 'string') continue;
      var key = Names.normKey(line[0]);
      if (!key || key.indexOf('detail') !== -1 || key === 'name') continue;
      var name = Names.canonicalPlayer(line[0], aliases);
      var source = safeText(line[0], ctx);
      if (!name || !source) continue;
      var times = multiplier(line[2]) || multiplier(line[3]) || 1;
      var score = null;
      if (typeof line[3] === 'number') score = line[3];
      else if (typeof line[2] === 'number') score = line[2];
      if (score === null || score < 30) continue;
      var teamSource = typeof line[1] === 'string' ? safeText(line[1], ctx) : '';
      list.push({
        source: source,
        name: name,
        teamSource: teamSource,
        team: teamSource ? Names.canonicalTeam(teamSource, aliases) : '',
        score: score,
        times: times
      });
    }
    return list;
  }

  function parseSeries(rows, aliases, ctx) {
    var header = -1;
    for (var r = 0; r < Math.min(rows.length, 8); r++) {
      var texts = (rows[r] || []).map(function (v) { return typeof v === 'string' ? Names.normKey(v) : ''; });
      if (texts.indexOf('high series') !== -1 || (texts.indexOf('name') !== -1 && texts.indexOf('avg') !== -1)) {
        header = r;
        break;
      }
    }
    var series = [];
    if (header < 0) {
      ctx.warnings.push('The Avg-Series tab does not have a high-series table. Series dates will be left blank.');
      return series;
    }
    for (var i = header + 1; i < rows.length; i++) {
      var line = rows[i] || [];
      if (typeof line[8] !== 'string') continue;
      var key = Names.normKey(line[8]);
      if (!key || key === 'name' || key.indexOf('min') === 0) continue;
      var points = num(line[10]);
      if (points === null) continue;
      var name = Names.canonicalPlayer(line[8], aliases);
      var source = safeText(line[8], ctx);
      if (!name || !source) continue;
      var teamSource = typeof line[9] === 'string' ? safeText(line[9], ctx) : '';
      series.push({
        source: source,
        name: name,
        teamSource: teamSource,
        team: teamSource ? Names.canonicalTeam(teamSource, aliases) : '',
        points: points,
        week: num(line[11]),
        date: sheetDate(line[12])
      });
    }
    if (!series.length) {
      ctx.warnings.push('The Avg-Series tab did not list any high series.');
    }
    return series;
  }

  function parseSchedule(rows, aliases, allowed, ctx) {
    var starts = [0, 5, 10, 15];
    var weeks = [];
    var playoffs = [];
    var repairedTime = false;

    function takeBlock(r, start) {
      var matches = [];
      var notes = [];
      var blanks = 0;
      for (var rr = r + 1; rr < rows.length && rr < r + 12; rr++) {
        var line = rows[rr] || [];
        var a = line[start];
        var b = line[start + 1];
        var c = line[start + 2];
        var d = line[start + 3];
        var empty = [a, b, c, d].every(function (v) { return v == null || String(v).trim() === ''; });
        if (empty) {
          blanks += 1;
          if (blanks >= 2) break;
          continue;
        }
        blanks = 0;
        if (typeof a === 'string' && /^week\s*no\.?/i.test(a)) break;
        if (typeof a === 'string' && /^(qtr|semi|final)/i.test(a.trim())) break;
        if (typeof a === 'string' && /best of/i.test(a)) {
          var note = safeText(a, ctx);
          if (note) notes.push(note);
          continue;
        }
        if (typeof b !== 'string' || typeof d !== 'string') continue;
        var left = splitSeed(b);
        var right = splitSeed(d);
        var home = knownTeam(left.name, aliases, allowed);
        var away = knownTeam(right.name, aliases, allowed);
        if (!home || !away) continue;
        var score = '';
        if (typeof a === 'string' && /^\d+\s*[-–]\s*\d+$/.test(a.trim())) {
          score = a.replace(/\s+/g, '').replace('–', '-');
        }
        var time = score ? '' : normTime(a);
        if (!score && isDate(a)) repairedTime = true;
        var board = typeof c === 'number' && isFinite(c) ? c : null;
        matches.push({
          time: time,
          score: score,
          board: board,
          homeSeed: left.seed,
          awaySeed: right.seed,
          homeSource: safeText(left.name, ctx),
          awaySource: safeText(right.name, ctx),
          home: home,
          away: away
        });
      }
      return { matches: matches, notes: notes };
    }

    for (var s = 0; s < starts.length; s++) {
      var start = starts[s];
      for (var r = 0; r < rows.length; r++) {
        var raw = rows[r] && rows[r][start];
        if (typeof raw !== 'string') continue;
        var text = Names.cleanLabel(raw);
        var weekM = text.match(/^week\s*no\.?\s*(\d+)\s*[-–—]\s*(.+)$/i);
        var postM = text.match(/^(qtr(?:\.|ter)?\s*finals?|semi[-\s]*finals?|finals?)(?:\s*[-–—]\s*(.+))?$/i);
        if (!weekM && !postM) continue;
        var block = takeBlock(r, start);
        if (weekM) {
          weeks.push({
            number: Number(weekM[1]),
            label: safeText(text, ctx) || text,
            when: weekM[2].trim(),
            matches: block.matches
          });
        } else if (block.matches.length || block.notes.length) {
          playoffs.push({
            label: safeText(text, ctx) || text,
            when: (postM[2] || '').trim(),
            notes: block.notes,
            matches: block.matches
          });
        }
      }
    }

    var seen = {};
    weeks = weeks.filter(function (w) {
      if (seen[w.number]) return false;
      seen[w.number] = true;
      return true;
    });
    weeks.sort(function (a, b) { return a.number - b.number; });
    if (!weeks.length) {
      ctx.errors.push('The Schedule tab does not list any weeks. Expected headers like "Week No. 1 - June 10".');
    } else if (weeks.length !== 11) {
      ctx.warnings.push('The Schedule tab lists ' + weeks.length + ' weeks. This season usually has 11.');
    }
    weeks.forEach(function (w) {
      if (w.matches.length !== 6) {
        ctx.warnings.push(w.label + ' lists ' + w.matches.length + ' matches. A full week has 6.');
      }
    });
    if (repairedTime) {
      ctx.warnings.push('One schedule time cell was a date instead of a clock time. It is shown as 9:15 pm, which is that row\'s usual slot.');
    }
    return { weeks: weeks, playoffs: playoffs };
  }

  function parseH2H(rows, aliases, allowed, ctx) {
    var header = -1;
    for (var r = 0; r < rows.length && r < 12; r++) {
      var known = 0;
      var line = rows[r] || [];
      for (var c = 0; c < line.length; c++) {
        if (typeof line[c] === 'string' && allowed.has(Names.canonicalTeam(line[c], aliases, { fallback: false }))) known += 1;
      }
      if (known >= 4) { header = r; break; }
    }
    if (header < 0) {
      ctx.errors.push('The H2H tab does not have a team-versus-team win/loss grid.');
      return [];
    }
    var head = rows[header] || [];
    var opponents = [];
    for (var col = 1; col < head.length; col++) {
      if (typeof head[col] !== 'string') continue;
      var name = knownTeam(head[col], aliases, allowed);
      if (!name) continue;
      opponents.push({ col: col, name: name, source: safeText(head[col], ctx) });
    }
    var next = rows[header + 1] || [];
    var wl = 0;
    next.forEach(function (v) {
      var k = typeof v === 'string' ? Names.normKey(v) : '';
      if (k === 'w' || k === 'l') wl += 1;
    });
    var dataStart = wl >= 4 ? header + 2 : header + 1;
    var records = [];
    for (var i = dataStart; i < rows.length; i++) {
      var line = rows[i] || [];
      if (typeof line[0] !== 'string') continue;
      var team = knownTeam(line[0], aliases, allowed);
      if (!team) continue;
      var teamSource = safeText(line[0], ctx);
      for (var o = 0; o < opponents.length; o++) {
        var opp = opponents[o];
        if (opp.name === team) continue;
        // The W/L headers sit under the opponent's name and are that
        // opponent's record, so the row team won the L column.
        var oppWins = num(line[opp.col]);
        var oppLosses = num(line[opp.col + 1]);
        if (oppWins === null && oppLosses === null) continue;
        var wins = oppLosses === null ? 0 : oppLosses;
        var losses = oppWins === null ? 0 : oppWins;
        if (wins === 0 && losses === 0) continue;
        records.push({
          teamSource: teamSource,
          opponentSource: opp.source,
          team: team,
          opponent: opp.name,
          w: wins,
          l: losses
        });
      }
    }
    if (!records.length) {
      ctx.errors.push('The H2H tab does not have any win/loss records between this season\'s teams.');
    }
    return records;
  }

  function parsePfPa(rows, aliases, allowed, standings, ctx) {
    var header = -1;
    for (var r = 0; r < rows.length && r < 8; r++) {
      var known = 0;
      var line = rows[r] || [];
      for (var c = 0; c < line.length; c++) {
        if (typeof line[c] === 'string' && allowed.has(Names.canonicalTeam(line[c], aliases, { fallback: false }))) known += 1;
      }
      if (known >= 4) { header = r; break; }
    }
    if (header < 0) {
      ctx.warnings.push('The PF-PA tab does not have this season\'s teams, so weekly points for and against were left off.');
      return null;
    }
    var head = rows[header] || [];
    var sub = rows[header + 1] || [];
    var cols = [];
    for (var c = 0; c < head.length; c++) {
      if (typeof head[c] !== 'string') continue;
      var team = knownTeam(head[c], aliases, allowed);
      if (!team) continue;
      var label = typeof sub[c] === 'string' ? Names.normKey(sub[c]) : '';
      if (label && label !== 'pf') continue;
      cols.push({ team: team, pf: c, pa: c + 1 });
    }
    var weekly = new Map();
    var week = null;
    var subRow = 0;
    for (var i = header + 1; i < rows.length; i++) {
      var line = rows[i] || [];
      var label = typeof line[0] === 'string' ? line[0] : '';
      var match = label.match(/game\s*#\s*0*(\d+)/i);
      if (match) {
        week = Number(match[1]);
        subRow = 1;
      } else if (week && subRow < 3) {
        var hasNum = line.some(function (v) { return typeof v === 'number'; });
        if (!hasNum) continue;
        subRow += 1;
      } else {
        continue;
      }
      if (week < 1 || week > 11) continue;
      for (var k = 0; k < cols.length; k++) {
        var spec = cols[k];
        var pf = num(line[spec.pf]);
        var pa = num(line[spec.pa]);
        if (pf === null && pa === null) continue;
        var list = weekly.get(spec.team);
        if (!list) {
          list = [];
          weekly.set(spec.team, list);
        }
        var rec = null;
        for (var n = 0; n < list.length; n++) if (list[n].week === week) rec = list[n];
        if (!rec) {
          rec = { week: week, pf: 0, pa: 0 };
          list.push(rec);
        }
        if (pf !== null) rec.pf += pf;
        if (pa !== null) rec.pa += pa;
      }
    }
    var bad = [];
    standings.forEach(function (t) {
      var list = weekly.get(t.name) || [];
      var pf = list.reduce(function (s, w) { return s + w.pf; }, 0);
      var pa = list.reduce(function (s, w) { return s + w.pa; }, 0);
      if (t.pf === null) return;
      if (Math.abs(pf - t.pf) > 1 || (t.pa !== null && Math.abs(pa - t.pa) > 1)) bad.push(t.name);
    });
    if (bad.length) {
      ctx.warnings.push('Weekly points on the PF-PA tab do not match the Standings totals for ' + bad.join(', ') + '. Those weekly lines were left off so the site would not show a second, different total.');
      return null;
    }
    return weekly;
  }

  function parseNews(rows, aliases, ctx) {
    var pow = {
      awardNumber: null,
      blurb: '',
      summerEggs: null,
      allTimeEggs: null,
      raffle: '',
      rows: [],
      log: [],
      allTime: { thirtyPlus: null, games: null, average: null, points: null }
    };
    var header = -1;
    for (var r = 0; r < rows.length; r++) {
      var line = rows[r] || [];
      if (Names.normKey(line[0] || '') === 'player' && Names.normKey(line[1] || '') === 'team') {
        header = r;
        break;
      }
    }
    if (header < 0) {
      ctx.warnings.push('The news tab does not have a Player of the Week table (headers PLAYER and TEAM).');
    } else {
      for (var i = header + 1; i < rows.length; i++) {
        var row = rows[i] || [];
        if (typeof row[0] !== 'string' || !Names.normKey(row[0])) {
          if (pow.rows.length) break;
          continue;
        }
        var average = num(row[2]);
        var baseline = num(row[3]);
        var g1 = num(row[4]);
        var g2 = num(row[5]);
        var g3 = num(row[6]);
        var series = num(row[7]);
        var over = num(row[8]);
        if ([average, baseline, g1, g2, g3, series, over].every(function (v) { return v === null; })) continue;
        var source = safeText(row[0], ctx);
        var name = Names.canonicalPlayer(row[0], aliases);
        if (!source || !name) continue;
        var teamSource = typeof row[1] === 'string' ? safeText(row[1], ctx) : '';
        pow.rows.push({
          source: source,
          name: name,
          teamSource: teamSource,
          team: teamSource ? Names.canonicalTeam(teamSource, aliases) : '',
          average: average,
          baseline: baseline,
          g1: g1,
          g2: g2,
          g3: g3,
          series: series,
          over: over
        });
      }
    }
    pow.rows.sort(function (a, b) { return (b.over || 0) - (a.over || 0); });

    for (var n = 0; n < rows.length; n++) {
      var cells = rows[n] || [];
      var lead = typeof cells[0] === 'string' ? cells[0] : '';
      var leadKey = Names.normKey(lead);
      if (/player of the week award/i.test(lead)) {
        var award = lead.match(/(\d+)/);
        if (award) pow.awardNumber = Number(award[1]);
      }
      if (/this is .+player of the week/i.test(lead)) {
        var blurb = safeText(lead, ctx);
        if (blurb) pow.blurb = blurb;
      }
      if (/^week no\./i.test(lead) && /ginzburgh/i.test(lead)) {
        var logLine = safeText(lead, ctx);
        if (logLine) pow.log.push(logLine);
      }
      for (var c = 0; c < cells.length; c++) {
        if (typeof cells[c] !== 'string') continue;
        var lab = Names.normKey(cells[c]);
        if (lab === 'summer total') pow.summerEggs = num(cells[c + 1]);
        if (lab.indexOf('all time pow egg') === 0) {
          for (var k = 1; k <= 6; k++) {
            var egg = num(cells[c + k]);
            if (egg !== null) { pow.allTimeEggs = egg; break; }
          }
        }
      }
      if (leadKey === 'raffle winner' && !pow.raffle) {
        var winnerRow = rows[n + 1] || [];
        var winner = typeof winnerRow[0] === 'string' ? safeText(winnerRow[0], ctx) : '';
        if (winner && !/^#?n\/?a$/.test(Names.normKey(winner))) pow.raffle = winner;
        pow.allTime.thirtyPlus = num(winnerRow[1]);
        pow.allTime.games = num(winnerRow[2]);
        pow.allTime.average = num(winnerRow[4]);
        if (pow.allTime.average === null) pow.allTime.average = num(winnerRow[3]);
        pow.allTime.points = num(winnerRow[6]);
        if (pow.allTime.points === null) pow.allTime.points = num(winnerRow[5]);
      }
    }
    return pow;
  }

  function parseHonors(rows, aliases, ctx) {
    var header = 0;
    for (var r = 0; r < rows.length && r < 12; r++) {
      var joined = (rows[r] || []).map(function (v) {
        return typeof v === 'string' ? Names.normKey(v) : '';
      }).join(' ');
      if (joined.indexOf('ginzburgh') !== -1 || joined.indexOf('player of the week') !== -1) {
        header = r;
        break;
      }
    }
    function pushPerson(nameCell, countCell, bucket) {
      if (typeof nameCell !== 'string') return;
      var key = Names.normKey(nameCell);
      if (!key || key.indexOf('ginzburgh') !== -1 || key.indexOf('player of the week') !== -1) return;
      if (key.indexOf('team ') === 0 || Names.isPlaceholder(key)) return;
      var count = num(countCell);
      if (count === null || count <= 0) return;
      var name = Names.canonicalPlayer(nameCell, aliases);
      var source = safeText(nameCell, ctx);
      if (!name || !source) return;
      bucket.push({ source: source, name: name, count: count });
    }
    var ginz = [];
    var pow = [];
    for (var i = header + 1; i < rows.length; i++) {
      var line = rows[i] || [];
      pushPerson(line[0], line[1], ginz);
      pushPerson(line[3], line[4], pow);
    }
    function dedupe(list) {
      var map = new Map();
      list.forEach(function (row) {
        var prev = map.get(row.name);
        if (!prev || row.count > prev.count) map.set(row.name, row);
      });
      return Array.from(map.values()).sort(function (a, b) {
        return b.count - a.count || a.name.localeCompare(b.name);
      });
    }
    return { ginzburgh: dedupe(ginz), pow: dedupe(pow) };
  }

  function parseRules(rows, ctx) {
    var lines = [];
    for (var r = 0; r < rows.length; r++) {
      var line = rows[r] || [];
      if (typeof line[1] !== 'string') continue;
      var text = safeText(line[1], ctx);
      if (text) lines.push(text);
    }
    if (!lines.length) {
      ctx.warnings.push('The Rules tab did not have rule text in column B.');
    }
    return lines;
  }

  function parseSpread(rows, ctx) {
    var map = new Map();
    function add(diff, points) {
      if (diff === null || points === null) return;
      if (diff < 1 || diff > 80 || points <= 0 || points > 200) return;
      map.set(diff, round1(points));
    }
    for (var r = 0; r < rows.length; r++) {
      var line = rows[r] || [];
      add(num(line[0]), num(line[2]));
      add(num(line[4]), num(line[6]));
    }
    var spread = Array.from(map.keys()).sort(function (a, b) { return a - b; }).map(function (diff) {
      return { diff: diff, points: map.get(diff) };
    });
    if (spread.length < 10) {
      ctx.errors.push('The SPREAD tab does not look like the handicap chart (difference in one column, points in another).');
    }
    return spread;
  }

  function detectMeta(standRows, schedRows, ctx) {
    var texts = [];
    [standRows, schedRows].forEach(function (rows) {
      if (!rows) return;
      for (var r = 0; r < Math.min(8, rows.length); r++) {
        var line = rows[r] || [];
        for (var c = 0; c < line.length; c++) {
          if (typeof line[c] === 'string') texts.push(line[c]);
        }
      }
    });
    var season = 'Summer 2026';
    var status = '';
    var sheetTitle = '';
    var edition = '';
    texts.forEach(function (t) {
      var seasonMatch = t.match(/\b(spring|summer|fall|winter)\s+(20\d{2})\b/i);
      if (seasonMatch) season = seasonMatch[1].charAt(0).toUpperCase() + seasonMatch[1].slice(1).toLowerCase() + ' ' + seasonMatch[2];
      if (/standing/i.test(t) && /final/i.test(t)) status = 'Finals';
      if (/^edition\b/i.test(t) && t.length < 60) {
        var ed = safeText(t, ctx);
        if (ed) edition = ed;
      }
    });
    var titles = texts.filter(function (t) {
      return /dart league/i.test(t) && t.length < 90 && !findSensitive(t).length;
    });
    titles.sort(function (a, b) { return b.length - a.length; });
    if (titles.length) sheetTitle = Names.cleanLabel(titles[0]);
    return { season: season, status: status, sheetTitle: sheetTitle, edition: edition };
  }

  function highOf(weeks) {
    var highGame = null;
    var highSeries = null;
    var highSeriesWeek = null;
    weeks.forEach(function (w) {
      w.scores.forEach(function (s) {
        if (typeof s === 'number' && (highGame === null || s > highGame)) highGame = s;
      });
      if (w.complete && (highSeries === null || w.total > highSeries)) {
        highSeries = w.total;
        highSeriesWeek = w.week;
      }
    });
    return { highGame: highGame, highSeries: highSeries, highSeriesWeek: highSeriesWeek };
  }

  function parseWorkbook(workbook, aliases) {
    var ctx = {
      errors: [],
      warnings: [],
      redacted: 0,
      skippedPlaceholders: 0,
      skippedEmpty: 0,
      avgMismatches: [],
      leagueAverage: null
    };
    if (!workbook || !workbook.SheetNames || !workbook.Sheets) {
      return { ok: false, errors: ['That file is not an Excel workbook.'], warnings: [], league: null };
    }
    var missing = [];
    for (var i = 0; i < ALLOWED_SHEETS.length; i++) {
      if (!resolveSheetName(workbook, ALLOWED_SHEETS[i])) missing.push(ALLOWED_SHEETS[i]);
    }
    if (missing.length) {
      missing.forEach(function (name) {
        ctx.errors.push('The workbook is missing the "' + name + '" tab.');
      });
      return { ok: false, errors: ctx.errors, warnings: [], league: null };
    }

    var standRows = sheetRows(workbook, 'Standings');
    var avgRows = sheetRows(workbook, 'AVERAGES');
    var gridRows = sheetRows(workbook, 'Avg GRID');
    var schedRows = sheetRows(workbook, 'Schedule');
    var h2hRows = sheetRows(workbook, 'H2H');
    var pfRows = sheetRows(workbook, 'PF-PA');
    var seriesRows = sheetRows(workbook, 'Avg-Series');
    var thirtyRows = sheetRows(workbook, '30Detail');
    var newsRows = sheetRows(workbook, 'news');
    var honorRows = sheetRows(workbook, 'Ginsburgh&PlayeroftheWeek');
    var ruleRows = sheetRows(workbook, 'Rules');
    var spreadRows = sheetRows(workbook, 'SPREAD');

    var metaBits = detectMeta(standRows, schedRows, ctx);
    var standingParsed = parseStandings(standRows, aliases, ctx);
    var standings = standingParsed.teams;
    if (!standings.length) {
      return finish(null, ctx);
    }
    var allowed = new Set(standings.map(function (t) { return t.name; }));
    var averages = parseAverages(avgRows, aliases, allowed, ctx);
    var grid = parseGrid(gridRows, aliases, allowed, ctx);
    var schedule = parseSchedule(schedRows, aliases, allowed, ctx);
    var h2h = parseH2H(h2hRows, aliases, allowed, ctx);
    var weekly = ctx.errors.length ? null : parsePfPa(pfRows, aliases, allowed, standings, ctx);
    var series = parseSeries(seriesRows, aliases, ctx);
    var thirties = parseThirty(thirtyRows, aliases, ctx);
    var pow = parseNews(newsRows, aliases, ctx);
    var honors = parseHonors(honorRows, aliases, ctx);
    var rules = parseRules(ruleRows, ctx);
    var spread = parseSpread(spreadRows, ctx);

    if (ctx.errors.length) return finish(null, ctx);

    var seriesByName = new Map();
    series.forEach(function (row) {
      var prev = seriesByName.get(row.name);
      if (!prev || row.points > prev.points) seriesByName.set(row.name, row);
    });

    var teams = standings.map(function (t) {
      var block = averages.get(t.name);
      var gridBlock = grid.get(t.name);
      var roster = block.roster.map(function (p) { return Object.assign({}, p); });
      var byName = new Map();
      roster.forEach(function (p) { byName.set(p.name, p); });
      if (gridBlock) {
        gridBlock.people.forEach(function (person) {
          if (!person) return;
          var weeks = weeksFromPerson(person);
          if (!weeks.length) return;
          var existing = byName.get(person.name);
          if (!existing) {
            var games = 0;
            var points = 0;
            weeks.forEach(function (w) {
              w.scores.forEach(function (s) {
                if (typeof s === 'number') { games += 1; points += s; }
              });
            });
            if (!games) return;
            existing = {
              source: person.source,
              name: person.name,
              games: games,
              points: points,
              average: points / games
            };
            roster.push(existing);
            byName.set(person.name, existing);
            ctx.warnings.push(person.name + ' has scores on Avg GRID for ' + t.name + ' but is not on the AVERAGES list. Totals were added up from the grid.');
          }
          existing.weeks = weeks.map(function (w) {
            return { week: w.week, scores: w.scores, total: w.total, complete: w.complete };
          });
        });
      }
      roster.forEach(function (p) {
        if (!p.weeks) p.weeks = [];
      });
      var weeklyList = weekly && weekly.get(t.name) ? weekly.get(t.name).slice() : null;
      if (weeklyList) weeklyList.sort(function (a, b) { return a.week - b.week; });
      var teamGames = block.teamGames;
      var teamPoints = block.teamPoints;
      var teamAverage = block.teamAverage;
      if (teamAverage === null && teamGames) teamAverage = teamPoints / teamGames;
      return {
        source: t.source,
        name: t.name,
        rank: t.rank,
        playoffs: t.playoffs,
        gms: t.gms,
        w: t.w,
        l: t.l,
        t: t.t,
        gb: t.gb,
        pf: t.pf,
        pa: t.pa,
        pct: t.pct,
        teamGames: teamGames,
        teamPoints: teamPoints,
        teamAverage: teamAverage,
        weekly: weeklyList,
        roster: roster.map(function (p) {
          return { source: p.source, name: p.name, games: p.games, points: p.points, average: p.average };
        }),
        _people: roster
      };
    });

    var players = [];
    teams.forEach(function (team) {
      team._people.forEach(function (p) {
        var highs = highOf(p.weeks || []);
        var sheet = seriesByName.get(p.name);
        var highSeries = highs.highSeries;
        var highSeriesWeek = highs.highSeriesWeek;
        var highSeriesDate = '';
        if (sheet && highSeries !== null && sheet.points === highSeries) {
          if (sheet.week !== null) highSeriesWeek = sheet.week;
          highSeriesDate = sheet.date || '';
          if (sheet.week !== null && highs.highSeriesWeek !== null && sheet.week !== highs.highSeriesWeek) {
            ctx.warnings.push(p.name + ': high series ' + highSeries + ' is week ' + sheet.week + ' on Avg-Series and week ' + highs.highSeriesWeek + ' on the score grid. The site shows week ' + sheet.week + '.');
          }
        } else if (sheet && highSeries !== null && sheet.points !== highSeries) {
          ctx.warnings.push(p.name + ': Avg-Series lists ' + sheet.points + ' but the best three-game total on Avg GRID is ' + highSeries + '. The site shows the grid total.');
        } else if (sheet && highSeries === null) {
          highSeries = sheet.points;
          highSeriesWeek = sheet.week;
          highSeriesDate = sheet.date || '';
        }
        var detail = thirties.filter(function (row) {
          return row.name === p.name && (!row.team || row.team === team.name);
        });
        var thirtyMap = new Map();
        detail.forEach(function (row) {
          thirtyMap.set(row.score, (thirtyMap.get(row.score) || 0) + row.times);
        });
        var thirty = Array.from(thirtyMap.keys()).sort(function (a, b) { return b - a; }).map(function (score) {
          return { score: score, times: thirtyMap.get(score) };
        });
        var thirtyCount = thirty.reduce(function (s, row) { return s + row.times; }, 0);
        players.push({
          source: p.source,
          name: p.name,
          teamSource: team.source,
          team: team.name,
          games: p.games,
          points: p.points,
          average: p.average,
          highGame: highs.highGame,
          highSeries: highSeries,
          highSeriesWeek: highSeriesWeek,
          highSeriesDate: highSeriesDate,
          thirtyCount: thirtyCount,
          thirty: thirty,
          weeks: (p.weeks || []).map(function (w) {
            return { week: w.week, scores: w.scores, total: w.total, complete: w.complete };
          })
        });
      });
      delete team._people;
    });

    thirties.forEach(function (row) {
      var found = players.some(function (p) { return p.name === row.name; });
      if (!found) ctx.warnings.push('30Detail lists ' + row.name + ' but that shooter is not on a current roster.');
    });

    players.sort(function (a, b) {
      return (b.average || 0) - (a.average || 0) || (b.points || 0) - (a.points || 0) || a.name.localeCompare(b.name);
    });
    var rank = 1;
    players.forEach(function (p, index) {
      if (index > 0 && Math.abs((p.average || 0) - (players[index - 1].average || 0)) > 0.0001) rank = index + 1;
      p.rank = rank;
      p.id = Names.slugify(p.name);
    });
    var idCount = {};
    players.forEach(function (p) { idCount[p.id] = (idCount[p.id] || 0) + 1; });
    players.forEach(function (p) {
      if (idCount[p.id] > 1) p.id = Names.slugify(p.name + ' ' + p.team);
    });

    var ginzByName = new Map();
    honors.ginzburgh.forEach(function (row) { ginzByName.set(row.name, row.count); });
    var powByName = new Map();
    honors.pow.forEach(function (row) { powByName.set(row.name, row.count); });
    var seasonGinz = {};
    (pow.log || []).forEach(function (line) {
      var mentioned = String(line).match(/:\s*(.+?)\s*\(/);
      if (!mentioned) return;
      var who = Names.canonicalPlayer(mentioned[1], aliases);
      if (!who) return;
      seasonGinz[who] = (seasonGinz[who] || 0) + 1;
    });
    honors.ginzburgh.forEach(function (row) {
      row.season = seasonGinz[row.name] || 0;
    });
    players.forEach(function (p) {
      p.ginzburgh = ginzByName.has(p.name) ? ginzByName.get(p.name) : null;
      p.powCount = powByName.has(p.name) ? powByName.get(p.name) : null;
      p.seasonGinzburghs = seasonGinz[p.name] || 0;
    });

    if (ctx.skippedPlaceholders) {
      ctx.warnings.push('Hid ' + ctx.skippedPlaceholders + ' empty roster spots such as 7th man.');
    }
    if (ctx.avgMismatches.length) {
      var shown = ctx.avgMismatches.slice(0, 8);
      var extra = ctx.avgMismatches.length - shown.length;
      ctx.warnings.push(shown.join(' ' ) + (extra > 0 ? ' And ' + extra + ' more average mismatches.' : ''));
    }

    var year = (metaBits.season.match(/(20\d{2})/) || ['', '2026'])[1];
    schedule.weeks.forEach(function (w) {
      if (w.when && !/20\d{2}/.test(w.when)) w.when = w.when + ', ' + year;
    });
    schedule.playoffs.forEach(function (w) {
      if (w.when && !/20\d{2}/.test(w.when)) w.when = w.when + ', ' + year;
    });

    var league = {
      meta: {
        leagueTitle: 'Roslyn VFW American Darts',
        sheetTitle: metaBits.sheetTitle,
        season: metaBits.season,
        seasonStatus: metaBits.status,
        scheduleEdition: metaBits.edition,
        updated: new Date().toISOString(),
        venueName: 'Roslyn VFW Post 3498',
        night: 'Wednesday',
        teamCount: teams.length,
        playerCount: players.length,
        weekCount: schedule.weeks.length
      },
      leagueAverage: standingParsed.leagueAverage,
      standings: teams.map(function (t) {
        return {
          source: t.source, name: t.name, rank: t.rank, playoffs: t.playoffs,
          gms: t.gms, w: t.w, l: t.l, t: t.t, gb: t.gb, pf: t.pf, pa: t.pa, pct: t.pct
        };
      }),
      teams: teams,
      players: players,
      h2h: h2h,
      schedule: schedule,
      pow: pow,
      honors: honors,
      rules: rules,
      spread: spread
    };
    return finish(league, ctx);
  }

  function finish(league, ctx) {
    if (ctx.redacted) {
      ctx.warnings.push('Some cells were left out because they looked like a phone number, an email address, or a contact list.');
    }
    if (league) {
      var blob = JSON.stringify(league);
      var hits = findSensitive(blob);
      if (hits.length) {
        ctx.errors.push('Publishing was stopped because the parsed data still contained contact information. Nothing was saved.');
        league = null;
      }
    }
    return {
      ok: ctx.errors.length === 0 && !!league,
      errors: ctx.errors,
      warnings: ctx.warnings,
      league: ctx.errors.length ? null : league
    };
  }

  return {
    ALLOWED_SHEETS: ALLOWED_SHEETS,
    findSensitive: findSensitive,
    parseWorkbook: parseWorkbook
  };
});
