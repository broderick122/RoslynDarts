(function () {
  'use strict';

  var names = window.RoslynNames;
  var config = window.SITE_CONFIG || { version: '1.4.0' };
  var THEME_KEY = 'roslynDarts.theme';

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function currentTheme() {
    var set = document.documentElement.getAttribute('data-theme');
    return set === 'dark' || set === 'light' ? set : systemTheme();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#10241c' : '#1c4a38');
    var next = theme === 'dark' ? 'light' : 'dark';
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      btn.setAttribute('aria-label', next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode');
      var label = btn.querySelector('.theme-label');
      if (label) label.textContent = next === 'dark' ? 'Dark' : 'Light';
    });
  }

  function wireTheme() {
    applyTheme(currentTheme());
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      if (btn.dataset.ready) return;
      btn.dataset.ready = '1';
      btn.addEventListener('click', function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* private mode */ }
        applyTheme(next);
      });
    });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        var saved = '';
        try { saved = localStorage.getItem(THEME_KEY) || ''; } catch (err) { saved = 'keep'; }
        if (saved === 'light' || saved === 'dark') return;
        applyTheme(systemTheme());
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  wireTheme();
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmtAvg(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  }

  function fmtInt(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function fmtPct(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return n.toFixed(3).replace(/^0/, '');
  }

  function fmtUpdated(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York'
    });
  }

  function prettySheetDate(value) {
    var match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
    if (!match) return value || '';
    var month = MONTHS[Number(match[1]) - 1];
    if (!month) return value;
    return month + ' ' + Number(match[2]) + ', ' + (2000 + Number(match[3]));
  }

  function readableCaps(value) {
    var s = String(value || '');
    var letters = s.replace(/[^A-Za-z]/g, '');
    var uppers = s.replace(/[^A-Z]/g, '');
    if (!letters || uppers.length / letters.length < 0.8) return s;
    return s.toLowerCase().replace(/(^|[\s(])([a-z])/g, function (_m, lead, ch) {
      return lead + ch.toUpperCase();
    });
  }

  function stripSeed(raw) {
    return String(raw || '').replace(/^\[\d+\]\s*/, '').replace(/^\d+\.\s*/, '').trim();
  }

  function teamName(source, fallback, aliases) {
    var next = names.canonicalTeam(stripSeed(source || fallback || ''), aliases);
    return next || fallback || '';
  }

  function playerName(source, fallback, aliases) {
    var next = names.canonicalPlayer(source || fallback || '', aliases);
    return next || fallback || source || '';
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(script);
    });
  }

  async function loadAll() {
    if (location.protocol !== 'file:') {
      try {
        var stamp = Date.now();
        var leagueRes = await fetch('data/league.json?t=' + stamp, { cache: 'no-store' });
        var aliasRes = await fetch('data/aliases.json?t=' + stamp, { cache: 'no-store' });
        if (leagueRes.ok && aliasRes.ok) {
          return { league: await leagueRes.json(), aliases: await aliasRes.json() };
        }
      } catch (err) { /* opening the file locally uses the script copies */ }
    }
    if (!window.LEAGUE_ALIASES) await loadScript('data/aliases.js');
    if (!window.LEAGUE_DATA) await loadScript('data/league.js');
    if (!window.LEAGUE_DATA || !window.LEAGUE_ALIASES) throw new Error('The league file is missing.');
    return { league: window.LEAGUE_DATA, aliases: window.LEAGUE_ALIASES };
  }

  function hydrate(league, aliases) {
    var data = JSON.parse(JSON.stringify(league));
    data.teams.forEach(function (t) {
      t.name = teamName(t.source, t.name, aliases);
      t.slug = names.slugify(t.name);
      t.roster.forEach(function (p) { p.name = playerName(p.source, p.name, aliases); });
    });
    data.standings.forEach(function (t) {
      t.name = teamName(t.source, t.name, aliases);
      t.slug = names.slugify(t.name);
    });
    data.players.forEach(function (p) {
      p.name = playerName(p.source, p.name, aliases);
      p.team = teamName(p.teamSource, p.team, aliases);
      p.id = names.slugify(p.name);
    });
    var counts = {};
    data.players.forEach(function (p) { counts[p.id] = (counts[p.id] || 0) + 1; });
    data.players.forEach(function (p) {
      if (counts[p.id] > 1) p.id = names.slugify(p.name + ' ' + p.team);
    });
    data.h2h.forEach(function (row) {
      row.team = teamName(row.teamSource, row.team, aliases);
      row.opponent = teamName(row.opponentSource, row.opponent, aliases);
    });
    function fixMatch(match) {
      match.home = teamName(match.homeSource, match.home, aliases);
      match.away = teamName(match.awaySource, match.away, aliases);
    }
    data.schedule.weeks.forEach(function (week) { week.matches.forEach(fixMatch); });
    data.schedule.playoffs.forEach(function (round) { round.matches.forEach(fixMatch); });
    data.pow.rows.forEach(function (row) {
      row.name = playerName(row.source, row.name, aliases);
      row.team = teamName(row.teamSource, row.team, aliases);
    });
    data.honors.ginzburgh.forEach(function (row) { row.name = playerName(row.source, row.name, aliases); });
    data.honors.pow.forEach(function (row) { row.name = playerName(row.source, row.name, aliases); });
    data.playerById = {};
    data.players.forEach(function (p) { data.playerById[p.id] = p; });
    data.directory = buildDirectory(data);
    data.directoryById = {};
    data.directory.forEach(function (p) { data.directoryById[p.id] = p; });
    data.teamBySlug = {};
    data.teamByName = {};
    data.teams.forEach(function (t) {
      data.teamBySlug[t.slug] = t;
      data.teamByName[t.name] = t;
    });
    return data;
  }

  function buildDirectory(data) {
    var map = {};
    function slot(name) {
      if (!name) return null;
      if (!map[name]) {
        map[name] = {
          name: name,
          id: names.slugify(name),
          team: '',
          average: null,
          ginzburgh: null,
          powCount: null,
          seasonGinzburghs: 0,
          lifetimeOnly: true
        };
      }
      return map[name];
    }
    (data.honors.ginzburgh || []).forEach(function (row) {
      var person = slot(row.name);
      person.ginzburgh = row.count;
      person.seasonGinzburghs = row.season || 0;
    });
    (data.honors.pow || []).forEach(function (row) {
      var person = slot(row.name);
      if (person.powCount == null || row.count > person.powCount) person.powCount = row.count;
    });
    var taken = {};
    data.players.forEach(function (p) {
      var person = slot(p.name);
      person.id = p.id;
      person.team = p.team;
      person.average = p.average;
      if (p.ginzburgh != null) person.ginzburgh = p.ginzburgh;
      if (p.powCount != null) person.powCount = p.powCount;
      person.seasonGinzburghs = p.seasonGinzburghs || person.seasonGinzburghs || 0;
      person.lifetimeOnly = false;
      taken[p.id] = true;
    });
    Object.keys(map).forEach(function (name) {
      var person = map[name];
      if (person.lifetimeOnly && taken[person.id]) person.id = names.slugify(name + ' lifetime');
      taken[person.id] = true;
    });
    return Object.keys(map).map(function (name) { return map[name]; });
  }

  function playerHref(id) { return 'player.html?p=' + encodeURIComponent(id); }
  function teamHref(slug) { return 'team.html?t=' + encodeURIComponent(slug); }
  function compareHref(aSlug, bSlug) {
    var url = 'compare.html';
    if (aSlug) url += '?a=' + encodeURIComponent(aSlug);
    if (bSlug) url += (aSlug ? '&' : '?') + 'b=' + encodeURIComponent(bSlug);
    return url;
  }

  function teamSlug(data, name) {
    var team = data.teamByName[name];
    return team ? team.slug : names.slugify(name);
  }

  function highlight(text, query) {
    var hay = String(text);
    var i = hay.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0 || !query) return esc(hay);
    return esc(hay.slice(0, i)) + '<mark>' + esc(hay.slice(i, i + query.length)) + '</mark>' + esc(hay.slice(i + query.length));
  }

  function rankPlayers(players, query) {
    var q = query.toLowerCase();
    return players.map(function (p) {
      var n = p.name.toLowerCase();
      var score = 9;
      if (n.indexOf(q) === 0) score = 0;
      else if (n.split(/\s+/).some(function (word) { return word.indexOf(q) === 0; })) score = 1;
      else if (n.indexOf(q) !== -1) score = 2;
      else if (p.team && p.team.toLowerCase().indexOf(q) !== -1) score = 3;
      return { p: p, score: score };
    }).filter(function (row) { return row.score < 9; }).sort(function (a, b) {
      return a.score - b.score || (b.p.average || 0) - (a.p.average || 0) || a.p.name.localeCompare(b.p.name);
    }).map(function (row) { return row.p; });
  }

  function mountSearch(form, players) {
    var input = form.querySelector('input');
    var list = form.querySelector('.finder-results');
    if (!input || !list || input.dataset.ready) return;
    input.dataset.ready = '1';
    var active = -1;
    var hits = [];

    function go(id) { location.href = playerHref(id); }

    function render() {
      var q = input.value.trim();
      hits = q ? rankPlayers(players, q).slice(0, 12) : [];
      active = Math.min(active, hits.length - 1);
      list.innerHTML = '';
      if (!q) { list.hidden = true; return; }
      list.hidden = false;
      if (!hits.length) {
        list.innerHTML = '<p class="empty">No shooter matches that.</p>';
        return;
      }
      hits.forEach(function (p, i) {
        var link = document.createElement('a');
        link.href = playerHref(p.id);
        link.className = 'hit' + (i === active ? ' is-active' : '');
        link.setAttribute('role', 'option');
        var detail = p.lifetimeOnly
          ? 'Lifetime' + (p.ginzburgh != null ? ' · ' + p.ginzburgh + ' Ginzburghs' : (p.powCount != null ? ' · ' + p.powCount + ' POW' : ''))
          : esc(p.team) + ' · ' + fmtAvg(p.average);
        link.innerHTML = '<span>' + highlight(p.name, q) + '</span><span class="hit-team">' + detail + '</span>';
        list.appendChild(link);
      });
    }

    input.addEventListener('input', function () { active = -1; render(); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        active = Math.min(hits.length - 1, active + 1);
        render();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        active = Math.max(0, active - 1);
        render();
      } else if (event.key === 'Enter') {
        var pick = active >= 0 ? hits[active] : hits[0];
        if (pick) { event.preventDefault(); go(pick.id); }
      } else if (event.key === 'Escape') {
        list.hidden = true;
      }
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var pick = active >= 0 ? hits[active] : hits[0];
      if (pick) go(pick.id);
    });
    document.addEventListener('click', function (event) {
      if (!form.contains(event.target)) list.hidden = true;
    });
  }

  function fillChrome(data) {
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      if (link.dataset.nav === document.body.dataset.page) link.setAttribute('aria-current', 'page');
    });
    document.querySelectorAll('[data-version]').forEach(function (el) {
      el.textContent = 'v' + config.version;
    });
    document.querySelectorAll('[data-updated]').forEach(function (el) {
      el.textContent = 'Updated ' + fmtUpdated(data.meta.updated);
    });
    document.querySelectorAll('.finder').forEach(function (form) { mountSearch(form, data.directory || data.players); });
  }

  function showError(message) {
    var content = document.getElementById('content');
    if (content && document.body.dataset.page !== 'update') {
      content.innerHTML = '<p class="banner bad">' + esc(message) + '</p>';
    }
  }

  function record(team) { return team.w + '–' + team.l; }

  function seedName(seed, name) {
    return seed ? '#' + seed + ' ' + name : name;
  }

  function opponentFor(data, team, week) {
    var block = data.schedule.weeks.find(function (item) { return item.number === week; });
    if (!block) return '';
    var match = block.matches.find(function (item) { return item.home === team || item.away === team; });
    if (!match) return '';
    return match.home === team ? match.away : match.home;
  }

  function weekWhen(data, week) {
    var block = data.schedule.weeks.find(function (item) { return item.number === week; });
    return block ? block.when : '';
  }

  function pills(scores) {
    return '<div class="pills">' + scores.map(function (score) {
      if (score === 'F') return '<span class="pill forfeit">F</span>';
      if (typeof score !== 'number') return '<span class="pill empty">–</span>';
      return '<span class="pill' + (score >= 30 ? ' hot' : '') + '">' + score + '</span>';
    }).join('') + '</div>';
  }

  function renderHome(data) {
    var leader = data.standings[0];
    var top = data.players[0];
    var series = data.players.slice().filter(function (p) { return p.highSeries != null; })
      .sort(function (a, b) { return b.highSeries - a.highSeries; })[0];
    var high = data.players.slice().filter(function (p) { return p.highGame != null; })
      .sort(function (a, b) { return b.highGame - a.highGame; })[0];
    var pow = data.pow.rows[0];
    var status = data.meta.seasonStatus ? ' · ' + data.meta.seasonStatus : '';
    var html = '';
    html += '<section class="hero">';
    html += '<p class="kicker">' + esc(data.meta.venueName) + ' · ' + esc(data.meta.night) + ' nights</p>';
    html += '<h1>Roslyn VFW American Darts</h1>';
    html += '<p class="lede">' + esc(data.meta.season) + status + ' · ' + data.meta.teamCount + ' teams · ' + data.meta.playerCount + ' shooters</p>';
    html += '<p class="address">1140 Easton Rd, Abington, PA 19001</p>';
    html += '</section>';
    html += '<form class="finder hero-finder" role="search">';
    html += '<label><span>Find a player</span><input type="search" placeholder="Try Bratzler, Yannessa, Kilkenny" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="search"></label>';
    html += '<div class="finder-results" role="listbox" hidden></div></form>';
    html += '<div class="snap-grid section">';
    if (leader) html += '<a class="snap" href="standings.html"><span>First place</span><strong>' + esc(leader.name) + '</strong><span>' + record(leader) + '</span></a>';
    if (top) html += '<a class="snap" href="' + playerHref(top.id) + '"><span>Top average</span><strong>' + fmtAvg(top.average) + '</strong><span>' + esc(top.name) + '</span></a>';
    if (series) html += '<a class="snap" href="' + playerHref(series.id) + '"><span>High series</span><strong>' + series.highSeries + '</strong><span>' + esc(series.name) + '</span></a>';
    if (high) html += '<a class="snap" href="' + playerHref(high.id) + '"><span>High game</span><strong>' + high.highGame + '</strong><span>' + esc(high.name) + '</span></a>';
    html += '</div>';
    if (pow) {
      html += '<a class="panel" href="awards.html" style="display:block;text-decoration:none;color:inherit">';
      html += '<p class="kicker">Player of the Week</p><h2>' + esc(pow.name) + '</h2>';
      html += '<p class="meta-line">' + esc(pow.team) + ' · ' + fmtAvg(pow.over) + ' points over average</p></a>';
    }
    html += '<div class="link-grid section">';
    [['standings.html', 'Standings', 'Records and the playoff line'],
      ['players.html', 'Players', 'Averages, series, and 30s'],
      ['teams.html', 'Teams', 'Rosters and team averages'],
      ['compare.html', 'Compare', 'Two teams, side by side'],
      ['schedule.html', 'Schedule', 'Weeks, times, and boards'],
      ['awards.html', 'Awards', 'Player of the Week and Ginzburghs'],
      ['rules.html', 'Rules', 'House rules and the spread chart']
    ].forEach(function (item) {
      html += '<a class="link-card" href="' + item[0] + '"><strong>' + item[1] + '</strong><span>' + item[2] + '</span></a>';
    });
    html += '</div>';
    html += '<p class="note">Each match is worth 4 points: one for each game and one for the higher team total. The top 8 teams make the playoffs.</p>';
    if (data.leagueAverage && data.leagueAverage.average) {
      html += '<p class="meta-line">League average ' + fmtAvg(data.leagueAverage.average) + ' over ' + fmtInt(data.leagueAverage.games) + ' games.</p>';
    }
    return html;
  }

  function renderStandings(data) {
    var anyTies = data.standings.some(function (t) { return t.t > 0; });
    var html = '<p class="kicker">' + esc(data.meta.season) + '</p><h1>Standings</h1>';
    html += '<p class="lede">Order is the order on the standings sheet. Games-behind notes are shown as written.</p>';
    html += '<a class="link-card section" href="compare.html"><strong>Compare teams</strong><span>Records, shooters, and the week they played</span></a>';
    var sawOut = false;
    data.standings.forEach(function (team) {
      if (!team.playoffs && !sawOut) {
        sawOut = true;
        html += '<div class="cutoff">Playoff line · top 8 go on</div>';
      }
      html += '<a class="team-card ' + (team.playoffs ? 'playoff' : 'out') + '" href="' + teamHref(team.slug) + '">';
      html += '<div class="card-top"><h2><span class="rank">' + team.rank + '</span>' + esc(team.name) + '</h2><span class="record">' + record(team) + '</span></div>';
      var bits = [fmtPct(team.pct), 'PF ' + fmtInt(team.pf), 'PA ' + fmtInt(team.pa)];
      if (anyTies) bits.unshift(team.t + ' ties');
      if (team.gb) bits.push('GB ' + team.gb);
      html += '<p class="meta-line">' + bits.map(esc).join(' · ') + '</p></a>';
    });
    html += '<section class="section"><h2>Head to head</h2>';
    html += '<label>Team<select id="h2h-team">' + data.standings.map(function (t) {
      return '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>';
    }).join('') + '</select></label><div id="h2h-list"></div></section>';
    return html;
  }

  function bindStandings(data) {
    var select = document.getElementById('h2h-team');
    var list = document.getElementById('h2h-list');
    if (!select || !list) return;
    function draw() {
      var rows = data.h2h.filter(function (row) { return row.team === select.value; });
      rows.sort(function (a, b) { return b.w - a.w || a.opponent.localeCompare(b.opponent); });
      if (!rows.length) {
        list.innerHTML = '<p class="meta-line">No head-to-head records for that team.</p>';
        return;
      }
      list.innerHTML = rows.map(function (row) {
        return '<a class="team-card" href="' + teamHref(teamSlug(data, row.opponent)) + '"><div class="card-top"><h3>vs ' + esc(row.opponent) + '</h3><span class="record">' + row.w + '–' + row.l + '</span></div></a>';
      }).join('');
    }
    select.addEventListener('change', draw);
    draw();
  }

  function leaderList(title, rows) {
    return '<section class="lb"><h2>' + esc(title) + '</h2><ol>' + rows.join('') + '</ol></section>';
  }

  function renderPlayers(data) {
    var bySeries = data.players.filter(function (p) { return p.highSeries != null; })
      .sort(function (a, b) { return b.highSeries - a.highSeries; }).slice(0, 5);
    var byGame = data.players.filter(function (p) { return p.highGame != null; })
      .sort(function (a, b) { return b.highGame - a.highGame; }).slice(0, 5);
    var byThirty = data.players.filter(function (p) { return p.thirtyCount > 0; })
      .sort(function (a, b) { return b.thirtyCount - a.thirtyCount; }).slice(0, 5);
    var html = '<p class="kicker">Shooters</p><h1>Averages</h1>';
    html += '<div class="lb-grid section">';
    html += leaderList('Top average', data.players.slice(0, 5).map(function (p) {
      return '<li><a href="' + playerHref(p.id) + '">' + esc(p.name) + '</a> ' + fmtAvg(p.average) + '</li>';
    }));
    html += leaderList('High series', bySeries.map(function (p) {
      var when = p.highSeriesDate ? ' · ' + esc(prettySheetDate(p.highSeriesDate)) : '';
      return '<li><a href="' + playerHref(p.id) + '">' + esc(p.name) + '</a> ' + p.highSeries + when + '</li>';
    }));
    html += leaderList('High game', byGame.map(function (p) {
      return '<li><a href="' + playerHref(p.id) + '">' + esc(p.name) + '</a> ' + p.highGame + '</li>';
    }));
    html += leaderList('Most 30+ games', byThirty.map(function (p) {
      return '<li><a href="' + playerHref(p.id) + '">' + esc(p.name) + '</a> ' + p.thirtyCount + '</li>';
    }));
    var byGinz = data.players.filter(function (p) { return p.ginzburgh != null; })
      .sort(function (a, b) { return b.ginzburgh - a.ginzburgh || a.name.localeCompare(b.name); }).slice(0, 5);
    if (byGinz.length) {
      html += leaderList('Ginzburghs (9-dart hits)', byGinz.map(function (p) {
        var season = p.seasonGinzburghs ? ' · ' + p.seasonGinzburghs + ' this season' : '';
        return '<li><a href="' + playerHref(p.id) + '">' + esc(p.name) + '</a> ' + p.ginzburgh + ' lifetime' + season + '</li>';
      }));
    }
    html += '</div>';
    html += '<div class="tools"><label>Team<select id="team-filter"><option value="">All teams</option>' + data.teams.map(function (t) {
      return '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>';
    }).join('') + '</select></label>';
    html += '<label>Sort<select id="sort-by"><option value="average">Average</option><option value="points">Points</option><option value="games">Games</option><option value="high">High game</option><option value="thirty">30+ games</option><option value="name">Name</option></select></label></div>';
    html += '<div id="roster"></div>';
    return html;
  }

  function bindPlayers(data) {
    var teamFilter = document.getElementById('team-filter');
    var sortBy = document.getElementById('sort-by');
    var roster = document.getElementById('roster');
    if (!roster) return;
    function draw() {
      var list = data.players.filter(function (p) { return !teamFilter.value || p.team === teamFilter.value; });
      var key = sortBy.value;
      list.sort(function (a, b) {
        if (key === 'name') return a.name.localeCompare(b.name);
        if (key === 'points') return b.points - a.points || a.name.localeCompare(b.name);
        if (key === 'games') return b.games - a.games || a.name.localeCompare(b.name);
        if (key === 'high') return (b.highGame || -1) - (a.highGame || -1) || a.name.localeCompare(b.name);
        if (key === 'thirty') return (b.thirtyCount || 0) - (a.thirtyCount || 0) || a.name.localeCompare(b.name);
        return (b.average || 0) - (a.average || 0) || a.name.localeCompare(b.name);
      });
      if (!list.length) {
        roster.innerHTML = '<p class="meta-line">Nobody on that team has games yet.</p>';
        return;
      }
      roster.innerHTML = list.map(function (p) {
        return '<a class="shooter" href="' + playerHref(p.id) + '"><div class="shooter-top"><h2>' + esc(p.name) + '</h2><span class="avg">' + fmtAvg(p.average) + '</span></div><p class="meta-line">' + esc(p.team) + ' · ' + p.games + ' games · ' + fmtInt(p.points) + ' pts · rank ' + p.rank + '</p><p class="meta-line">High game ' + (p.highGame == null ? '—' : p.highGame) + ' · Series ' + (p.highSeries == null ? '—' : p.highSeries) + ' · 30+ ' + (p.thirtyCount || 0) + '</p></a>';
      }).join('');
    }
    teamFilter.addEventListener('change', draw);
    sortBy.addEventListener('change', draw);
    draw();
  }

  function renderTeams(data) {
    var html = '<p class="kicker">Rosters</p><h1>Teams</h1>';
    html += '<a class="link-card section" href="compare.html"><strong>Compare teams</strong><span>Put two lineups next to each other</span></a>';
    data.teams.forEach(function (team) {
      html += '<a class="team-card ' + (team.playoffs ? 'playoff' : 'out') + '" href="' + teamHref(team.slug) + '">';
      html += '<div class="card-top"><h2>' + esc(team.name) + '</h2><span class="record">' + record(team) + '</span></div>';
      html += '<p class="meta-line">' + (team.playoffs ? 'Playoff team' : 'Outside the top 8') + ' · team average ' + fmtAvg(team.teamAverage) + '</p></a>';
    });
    return html;
  }

  function renderTeam(data) {
    var params = new URLSearchParams(location.search);
    var team = data.teamBySlug[params.get('t') || ''];
    if (!team) return renderTeams(data);
    var roster = team.roster.slice().sort(function (a, b) { return (b.average || 0) - (a.average || 0); });
    var html = '<p class="kicker">' + (team.playoffs ? 'Playoff team' : 'Outside the top 8') + ' · rank ' + team.rank + '</p>';
    html += '<h1>' + esc(team.name) + '</h1>';
    html += '<p class="record">' + record(team) + '</p>';
    html += '<p><a href="' + compareHref(team.slug) + '">Compare this team</a></p>';
    var bits = [fmtPct(team.pct), 'PF ' + fmtInt(team.pf), 'PA ' + fmtInt(team.pa), 'team average ' + fmtAvg(team.teamAverage)];
    if (team.gb) bits.push('GB ' + team.gb);
    html += '<p class="meta-line">' + bits.map(esc).join(' · ') + '</p>';
    html += '<div class="stat-grid section"><div class="stat"><span>Shooter games</span><strong>' + fmtInt(team.teamGames) + '</strong></div><div class="stat"><span>Shooter points</span><strong>' + fmtInt(team.teamPoints) + '</strong></div></div>';
    html += '<h2>Roster</h2>';
    roster.forEach(function (p) {
      var full = data.players.find(function (item) { return item.name === p.name && item.team === team.name; });
      var href = full ? playerHref(full.id) : 'players.html';
      html += '<a class="shooter" href="' + href + '"><div class="shooter-top"><h3>' + esc(p.name) + '</h3><span class="avg">' + fmtAvg(p.average) + '</span></div><p class="meta-line">' + p.games + ' games · ' + fmtInt(p.points) + ' pts</p></a>';
    });
    var rows = data.h2h.filter(function (row) { return row.team === team.name; });
    if (rows.length) {
      html += '<h2 class="section">Head to head</h2>';
      rows.sort(function (a, b) { return b.w - a.w; });
      rows.forEach(function (row) {
        html += '<p class="meta-line">vs <a href="' + teamHref(teamSlug(data, row.opponent)) + '">' + esc(row.opponent) + '</a> ' + row.w + '–' + row.l + '</p>';
      });
    }
    if (team.weekly && team.weekly.length) {
      html += '<h2 class="section">Points by week</h2>';
      team.weekly.forEach(function (week) {
        html += '<p class="meta-line">Week ' + week.week + ' · ' + week.pf + ' for, ' + week.pa + ' against</p>';
      });
    }
    var matches = [];
    data.schedule.weeks.forEach(function (week) {
      week.matches.forEach(function (match) {
        if (match.home === team.name || match.away === team.name) {
          var foe = match.home === team.name ? match.away : match.home;
          matches.push({ week: week, foe: foe, match: match });
        }
      });
    });
    if (matches.length) {
      html += '<h2 class="section">Schedule</h2>';
      matches.forEach(function (item) {
        html += '<p class="meta-line">Week ' + item.week.number + ' · ' + esc(item.match.time || '') + (item.match.board ? ' · Board ' + item.match.board : '') + ' · vs <a href="' + teamHref(teamSlug(data, item.foe)) + '">' + esc(item.foe) + '</a></p>';
      });
    }
    return html;
  }

  function renderSchedule(data) {
    var html = '<p class="kicker">' + esc(data.meta.season) + '</p><h1>Schedule</h1>';
    if (data.meta.scheduleEdition) html += '<p class="meta-line">' + esc(data.meta.scheduleEdition) + '</p>';
    data.schedule.weeks.forEach(function (week) {
      html += '<section class="section"><h2>Week ' + week.number + '</h2><p class="meta-line">' + esc(week.when) + '</p>';
      week.matches.forEach(function (match) {
        html += '<article class="match"><p class="meta-line">' + esc(match.time || 'Time TBD') + (match.board ? ' · Board ' + match.board : '') + '</p>';
        html += '<p class="versus"><a href="' + teamHref(teamSlug(data, match.home)) + '">' + esc(seedName(match.homeSeed, match.home)) + '</a><span>vs</span><a href="' + teamHref(teamSlug(data, match.away)) + '">' + esc(seedName(match.awaySeed, match.away)) + '</a></p></article>';
      });
      html += '</section>';
    });
    if (data.schedule.playoffs.length) {
      html += '<h2>Playoffs</h2>';
      data.schedule.playoffs.forEach(function (round) {
        var scored = round.matches.length && round.matches.every(function (m) { return m.score; });
        var title = scored && round.label === 'Finals' ? 'Posted results' : round.label;
        html += '<section class="section"><h3>' + esc(title) + '</h3>';
        if (round.when) html += '<p class="meta-line">' + esc(round.when) + '</p>';
        round.notes.forEach(function (note) { html += '<p class="meta-line">' + esc(note) + '</p>'; });
        round.matches.forEach(function (match) {
          html += '<article class="match">';
          if (match.score) html += '<p class="score-flag">' + esc(match.score) + '</p>';
          else html += '<p class="meta-line">' + esc(match.time || '') + (match.board ? ' · Board ' + match.board : '') + '</p>';
          html += '<p class="versus"><a href="' + teamHref(teamSlug(data, match.home)) + '">' + esc(seedName(match.homeSeed, match.home)) + '</a><span>vs</span><a href="' + teamHref(teamSlug(data, match.away)) + '">' + esc(seedName(match.awaySeed, match.away)) + '</a></p></article>';
        });
        html += '</section>';
      });
    }
    return html;
  }

  function honorList(title, rows, limit) {
    var html = '<section class="section"><h2>' + esc(title) + '</h2>';
    html += '<label>Filter<input class="text-input honor-filter" type="search" placeholder="Filter ' + esc(title) + '" data-list="' + esc(title) + '"></label>';
    html += '<div class="honor-body" data-honor="' + esc(title) + '"></div></section>';
    return { html: html, rows: rows, title: title, limit: limit };
  }

  function renderAwards(data) {
    var winner = data.pow.rows[0];
    var html = '<p class="kicker">Awards</p><h1>Player of the Week</h1>';
    if (data.pow.awardNumber) html += '<p class="lede">Award no. ' + data.pow.awardNumber + '</p>';
    if (winner) {
      var player = data.players.find(function (p) { return p.name === winner.name; });
      html += '<article class="panel"><h2>' + (player ? '<a href="' + playerHref(player.id) + '">' + esc(winner.name) + '</a>' : esc(winner.name)) + '</h2>';
      html += '<p class="meta-line">' + esc(winner.team) + '</p>';
      html += '<p>Games ' + [winner.g1, winner.g2, winner.g3].map(function (n) { return n == null ? '—' : n; }).join(', ') + ' · series ' + (winner.series == null ? '—' : winner.series) + ' · average ' + fmtAvg(winner.average) + ' · over average ' + fmtAvg(winner.over) + '</p></article>';
    }
    if (data.pow.blurb) html += '<p>' + esc(readableCaps(data.pow.blurb)) + '</p>';
    var eggBits = [];
    if (data.pow.summerEggs != null) eggBits.push('Summer egg total ' + fmtInt(data.pow.summerEggs));
    if (data.pow.allTimeEggs != null) eggBits.push('All-time POW egg total ' + fmtInt(data.pow.allTimeEggs));
    if (eggBits.length) html += '<p class="meta-line">' + eggBits.join(' · ') + '</p>';
    if (data.pow.raffle) html += '<p class="meta-line">Raffle: ' + esc(readableCaps(data.pow.raffle)) + '</p>';
    if (data.pow.rows.length > 1) {
      html += '<h2 class="section">This week\'s board</h2>';
      data.pow.rows.forEach(function (row, index) {
        var player = data.players.find(function (p) { return p.name === row.name; });
        var label = player ? '<a href="' + playerHref(player.id) + '">' + esc(row.name) + '</a>' : esc(row.name);
        html += '<p class="meta-line">' + (index + 1) + '. ' + label + ' · ' + esc(row.team) + ' · ' + fmtAvg(row.over) + ' over average</p>';
      });
    }
    html += '<p class="note">Player of the Week is the shooter whose three-game total beats three times their average by the most. That is the POW column in the workbook.</p>';
    html += '<div class="panel"><h2>Ginzburghs (9-dart hits)</h2>';
    html += '<p>A Ginzburgh is a nine-dart hit: nine marks in one round. Lifetime counts are on the all-time sheet. A season count is shown only when the news log records one.</p>';
    html += '<p><a href="ginzburghs.html">All Ginzburgh counts</a></p></div>';
    if (data.pow.log.length) {
      html += '<h2 class="section">Ginzburghs logged this season</h2>';
      data.pow.log.forEach(function (line) { html += '<p>' + esc(line) + '</p>'; });
    }
    var all = data.pow.allTime || {};
    if (all.games) {
      html += '<h2 class="section">All-time league totals</h2><p class="meta-line">';
      html += fmtInt(all.thirtyPlus) + ' games of 30 or more · ' + fmtInt(all.games) + ' games · average ' + fmtAvg(all.average) + ' · ' + fmtInt(all.points) + ' points</p>';
    }
    var ginz = honorList('Lifetime Ginzburghs (9-dart hits)', data.honors.ginzburgh, 25);
    var pows = honorList('All-time Player of the Week', data.honors.pow, 25);
    html += ginz.html + pows.html;
    return { html: html, lists: [ginz, pows] };
  }

  function bindHonors(lists) {
    lists.forEach(function (list) {
      var body = document.querySelector('[data-honor="' + list.title.replace(/"/g, '') + '"]');
      var input = document.querySelector('.honor-filter[data-list="' + list.title.replace(/"/g, '') + '"]');
      if (!body) return;
      function draw() {
        var q = input && input.value ? input.value.trim().toLowerCase() : '';
        var rows = list.rows.filter(function (row) { return !q || row.name.toLowerCase().indexOf(q) !== -1; });
        var shown = q ? rows : rows.slice(0, list.limit);
        body.innerHTML = shown.map(function (row) {
          return '<p class="meta-line">' + esc(row.name) + ' · ' + row.count + '</p>';
        }).join('') + (!q && rows.length > list.limit ? '<p class="meta-line">Showing ' + list.limit + ' of ' + rows.length + '. Type to search the rest.</p>' : '');
      }
      if (input) input.addEventListener('input', draw);
      draw();
    });
  }

  function renderRules(data) {
    var html = '<p class="kicker">House rules</p><h1>Rules</h1>';
    html += '<div class="panel"><p>Each match is worth 4 points: one point for each of the three games, plus one point for the higher team total. The top 8 teams make the playoffs.</p>';
    html += '<p>A Ginzburgh is a nine-dart hit, nine marks in one round. The league counts them under that name. The workbook does not list other per-inning marks or darts thrown.</p></div>';
    html += '<div class="prose">';
    data.rules.forEach(function (line) { html += '<p>' + esc(line) + '</p>'; });
    html += '</div>';
    if (data.spread.length) {
      html += '<h2 class="section">Point spread chart</h2>';
      html += '<p class="meta-line">From the SPREAD tab. The points column is the difference times 0.8.</p>';
      html += '<div class="spread">';
      data.spread.forEach(function (row) {
        html += '<div><span>' + row.diff + '</span><span>' + row.points.toFixed(1) + '</span></div>';
      });
      html += '</div>';
    }
    return html;
  }

  function thirtyGames(data, player) {
    var rows = [];
    (player.weeks || []).forEach(function (week) {
      (week.scores || []).forEach(function (score, index) {
        if (typeof score !== 'number' || score < 30) return;
        rows.push({
          score: score,
          week: week.week,
          game: index + 1,
          opponent: opponentFor(data, player.team, week.week) || '',
          date: weekWhen(data, week.week) || ''
        });
      });
    });
    rows.sort(function (a, b) {
      return b.score - a.score || a.week - b.week || a.game - b.game;
    });
    return rows;
  }

  function thirtySection(data, player) {
    var detailed = thirtyGames(data, player);
    if (detailed.length) {
      var html = '<h2 class="section">30+ games · ' + detailed.length + '</h2>';
      if (player.thirtyCount && player.thirtyCount !== detailed.length) {
        html += '<p class="meta-line">30Detail lists ' + player.thirtyCount + '. The score grid has ' + detailed.length + ' games of 30 or more, shown here with the week and game.</p>';
      }
      html += detailed.map(function (row) {
        var when = [];
        if (row.week) when.push('Week ' + row.week);
        if (row.date) when.push(esc(row.date));
        var where = 'Game ' + row.game;
        if (row.opponent) {
          where += ' · vs <a href="' + teamHref(teamSlug(data, row.opponent)) + '">' + esc(row.opponent) + '</a>';
        }
        return '<div class="thirty-row"><span class="pill hot">' + row.score + '</span><div><p class="meta-line">' + when.join(' · ') + '</p><p class="meta-line">' + where + '</p></div></div>';
      }).join('');
      return html;
    }
    if (player.thirty && player.thirty.length) {
      var fallback = '<h2 class="section">30+ games · ' + (player.thirtyCount || 0) + '</h2>';
      fallback += '<p class="meta-line">30Detail lists the scores. It does not record the week, date, opponent, or game.</p>';
      fallback += player.thirty.map(function (row) {
        return '<p class="meta-line"><span class="pill hot">' + row.score + '</span> ' + (row.times > 1 ? '× ' + row.times : '') + '</p>';
      }).join('');
      return fallback;
    }
    return '<h2 class="section">30+ games</h2><p class="meta-line">No 30+ game is listed for this shooter.</p>';
  }

  function renderLifetimeOnly(person) {
    var html = '<p class="kicker">Lifetime</p><h1>' + esc(person.name) + '</h1>';
    html += '<p class="lede">Not on this season\'s roster. Only the all-time counts stored for this name are shown.</p>';
    var bits = [];
    if (person.ginzburgh != null) bits.push('<div class="stat"><span>Ginzburghs (9-dart hits)</span><strong>' + person.ginzburgh + '</strong></div>');
    if (person.powCount != null) bits.push('<div class="stat"><span>Player of the Week awards</span><strong>' + person.powCount + '</strong></div>');
    if (bits.length) html += '<div class="stat-grid section">' + bits.join('') + '</div>';
    else html += '<p class="meta-line">No lifetime counts are listed for this name.</p>';
    html += '<p><a href="ginzburghs.html">All Ginzburghs</a></p>';
    return html;
  }

  function renderPlayer(data) {
    var params = new URLSearchParams(location.search);
    var player = data.playerById[params.get('p') || ''];
    if (!player) {
      var person = data.directoryById && data.directoryById[params.get('p') || ''];
      if (person && person.lifetimeOnly) return renderLifetimeOnly(person);
      return '<h1>Find a shooter</h1><p>Use the search box and pick a name. That opens everything the workbook has for them.</p>';
    }
    var team = data.teamByName[player.team];
    var html = '<p class="kicker">Rank ' + player.rank + '</p><h1>' + esc(player.name) + '</h1>';
    html += '<p class="lede"><a href="' + teamHref(team ? team.slug : names.slugify(player.team)) + '">' + esc(player.team) + '</a></p>';
    html += '<div class="stat-grid section">';
    html += '<div class="stat"><span>Average</span><strong>' + fmtAvg(player.average) + '</strong></div>';
    html += '<div class="stat"><span>Games</span><strong>' + fmtInt(player.games) + '</strong></div>';
    html += '<div class="stat"><span>Points</span><strong>' + fmtInt(player.points) + '</strong></div>';
    html += '<div class="stat"><span>Rank</span><strong>' + player.rank + '</strong></div>';
    html += '<div class="stat"><span>High game</span><strong>' + (player.highGame == null ? '—' : player.highGame) + '</strong></div>';
    html += '<div class="stat"><span>High series</span><strong>' + (player.highSeries == null ? '—' : player.highSeries) + '</strong></div>';
    html += '</div>';
    if (player.highSeries != null) {
      var bits = [];
      if (player.highSeriesWeek) bits.push('Week ' + player.highSeriesWeek);
      if (player.highSeriesDate) bits.push(prettySheetDate(player.highSeriesDate));
      if (bits.length) html += '<p class="meta-line">High series ' + bits.map(esc).join(' · ') + '</p>';
    }
    if (player.seasonGinzburghs) {
      html += '<p class="meta-line">Ginzburghs (9-dart hits) logged this season: ' + player.seasonGinzburghs + '</p>';
    }
    html += thirtySection(data, player);
    html += '<h2 class="section">Game by game</h2>';
    if (!player.weeks.length) html += '<p class="meta-line">No game scores are on the grid for this shooter.</p>';
    player.weeks.forEach(function (week) {
      var foe = opponentFor(data, player.team, week.week);
      var when = weekWhen(data, week.week);
      html += '<article class="week-block"><h3>Week ' + week.week + (when ? ' · ' + esc(when) : '') + '</h3>';
      if (foe) html += '<p class="meta-line">vs <a href="' + teamHref(teamSlug(data, foe)) + '">' + esc(foe) + '</a></p>';
      html += pills(week.scores);
      if (week.complete) html += '<p class="meta-line">Series ' + week.total + (week.total === player.highSeries ? ' · season high' : '') + '</p>';
      else if (week.total != null) html += '<p class="meta-line">Points ' + week.total + '</p>';
      html += '</article>';
    });
    html += '<h2 class="section">Lifetime</h2>';
    html += '<p class="meta-line">All-time figures from the workbook. A blank stat is not listed for this shooter.</p>';
    var lifetime = [];
    if (player.ginzburgh != null) lifetime.push('<div class="stat"><span>Ginzburghs (9-dart hits)</span><strong>' + player.ginzburgh + '</strong></div>');
    if (player.powCount != null) lifetime.push('<div class="stat"><span>Player of the Week awards</span><strong>' + player.powCount + '</strong></div>');
    if (lifetime.length) html += '<div class="stat-grid">' + lifetime.join('') + '</div>';
    else html += '<p class="meta-line">No lifetime counts are listed for this name.</p>';
    var key = names.normKey(player.name);
    var mentions = (data.pow.log || []).filter(function (line) {
      return names.normKey(line).indexOf(key) !== -1;
    });
    if (mentions.length) {
      html += '<h2 class="section">Season notes</h2>';
      mentions.forEach(function (line) { html += '<p>' + esc(line) + '</p>'; });
    }
    var thisWeek = data.pow.rows.find(function (row) { return row.name === player.name; });
    if (thisWeek) {
      html += '<p class="meta-line">Latest Player of the Week board: ' + fmtAvg(thisWeek.over) + ' over average' + (data.pow.rows[0] && data.pow.rows[0].name === player.name ? ' · winner' : '') + '.</p>';
    }
    html += '<p class="note">Season games, points, and average are this summer only. A Ginzburgh is a nine-dart hit. The workbook does not list other per-inning marks or darts thrown.</p>';
    return html;
  }

  function teamOptions(data, selected) {
    return data.teams.map(function (team) {
      return '<option value="' + esc(team.slug) + '"' + (team.slug === selected ? ' selected' : '') + '>' + esc(team.name) + '</option>';
    }).join('');
  }

  function rosterPlayers(data, team) {
    return data.players.filter(function (player) { return player.team === team.name; });
  }

  function bestMarks(players, field) {
    var best = null;
    players.forEach(function (player) {
      var value = player[field];
      if (typeof value !== 'number') return;
      if (best === null || value > best) best = value;
    });
    if (best === null) return [];
    return players.filter(function (player) { return player[field] === best; });
  }

  function weekPoints(team, weekNumber) {
    if (!team.weekly) return null;
    for (var i = 0; i < team.weekly.length; i++) {
      if (team.weekly[i].week === weekNumber) return team.weekly[i];
    }
    return null;
  }

  function meetings(data, a, b) {
    var found = [];
    data.schedule.weeks.forEach(function (week) {
      week.matches.forEach(function (match) {
        var paired = (match.home === a.name && match.away === b.name) || (match.home === b.name && match.away === a.name);
        if (paired) found.push({ kind: 'week', week: week, match: match });
      });
    });
    data.schedule.playoffs.forEach(function (round) {
      round.matches.forEach(function (match) {
        var paired = (match.home === a.name && match.away === b.name) || (match.home === b.name && match.away === a.name);
        if (paired) found.push({ kind: 'playoff', round: round, match: match });
      });
    });
    return found;
  }

  function cmpStat(label, left, right) {
    return '<section class="cmp-row"><h2>' + esc(label) + '</h2><div class="cmp-pair"><div>' + left + '</div><div>' + right + '</div></div></section>';
  }

  function cmpValue(team, value) {
    return '<span class="cmp-team">' + esc(team.name) + '</span><strong>' + value + '</strong>';
  }

  function recordWlt(team) {
    var ties = typeof team.t === 'number' ? team.t : 0;
    return team.w + '–' + team.l + '–' + ties;
  }

  function renderCompare(data) {
    var params = new URLSearchParams(location.search);
    var aSlug = params.get('a') || (data.teams[0] && data.teams[0].slug) || '';
    var bSlug = params.get('b') || (data.teams[1] && data.teams[1].slug) || '';
    if (aSlug === bSlug) {
      var other = data.teams.filter(function (team) { return team.slug !== aSlug; })[0];
      if (other) bSlug = other.slug;
    }
    var html = '<p class="kicker">Side by side</p><h1>Team vs team</h1>';
    html += '<p class="lede">Pick two teams. The numbers are the ones stored in the workbook.</p>';
    html += '<div class="tools">';
    html += '<label>First team<select id="cmp-a">' + teamOptions(data, aSlug) + '</select></label>';
    html += '<label>Second team<select id="cmp-b">' + teamOptions(data, bSlug) + '</select></label>';
    html += '</div>';
    html += '<button type="button" class="ghost" id="cmp-swap">Swap teams</button>';
    html += '<div id="cmp-body"></div>';
    return html;
  }

  function compareBody(data, a, b) {
    if (!a || !b) return '<p class="banner warn">Choose two teams.</p>';
    if (a.slug === b.slug) return '<p class="banner warn">Pick two different teams.</p>';
    var html = '';
    html += cmpStat('Record', cmpValue(a, esc(recordWlt(a))), cmpValue(b, esc(recordWlt(b))));
    html += cmpStat('Win pct', cmpValue(a, esc(fmtPct(a.pct))), cmpValue(b, esc(fmtPct(b.pct))));
    html += cmpStat('Standings rank', cmpValue(a, String(a.rank)), cmpValue(b, String(b.rank)));
    html += cmpStat('Points for', cmpValue(a, esc(fmtInt(a.pf))), cmpValue(b, esc(fmtInt(b.pf))));
    html += cmpStat('Points against', cmpValue(a, esc(fmtInt(a.pa))), cmpValue(b, esc(fmtInt(b.pa))));
    html += cmpStat('Team average', cmpValue(a, esc(fmtAvg(a.teamAverage))), cmpValue(b, esc(fmtAvg(b.teamAverage))));

    var h2h = data.h2h.find(function (row) { return row.team === a.name && row.opponent === b.name; });
    var h2hBack = data.h2h.find(function (row) { return row.team === b.name && row.opponent === a.name; });
    html += '<section class="cmp-row"><h2>Head to head</h2>';
    if (!h2h && !h2hBack) {
      html += '<p class="meta-line">The H2H sheet has no record between these teams.</p></section>';
    } else {
      html += '<div class="panel">';
      if (h2h) html += '<p class="record">' + esc(a.name) + ' ' + h2h.w + '–' + h2h.l + '</p>';
      if (h2hBack) html += '<p class="meta-line">' + esc(b.name) + ' ' + h2hBack.w + '–' + h2hBack.l + ' on the same grid.</p>';
      html += '<p class="meta-line">Wins and losses from the H2H sheet. That grid does not list ties.</p>';
      html += '</div></section>';
    }

    function shooterList(team) {
      var list = rosterPlayers(data, team).slice().sort(function (x, y) {
        return (y.average || 0) - (x.average || 0) || y.points - x.points || x.name.localeCompare(y.name);
      }).slice(0, 5);
      if (!list.length) return '<p class="meta-line">No shooters with games.</p>';
      return '<ol class="cmp-ol">' + list.map(function (player) {
        return '<li><a href="' + playerHref(player.id) + '">' + esc(player.name) + '</a><span>' + fmtAvg(player.average) + '</span></li>';
      }).join('') + '</ol>';
    }
    html += '<section class="cmp-row"><h2>Top shooters by average</h2><div class="cmp-pair"><div><span class="cmp-team">' + esc(a.name) + '</span>' + shooterList(a) + '</div><div><span class="cmp-team">' + esc(b.name) + '</span>' + shooterList(b) + '</div></div></section>';

    function markBlock(team, field, empty) {
      var leaders = bestMarks(rosterPlayers(data, team), field);
      if (!leaders.length) return '<span class="cmp-team">' + esc(team.name) + '</span><strong>—</strong><p class="meta-line">' + esc(empty) + '</p>';
      var value = leaders[0][field];
      var who = leaders.map(function (player) {
        return '<a href="' + playerHref(player.id) + '">' + esc(player.name) + '</a>';
      }).join(', ');
      return '<span class="cmp-team">' + esc(team.name) + '</span><strong>' + value + '</strong><p class="meta-line">' + who + '</p>';
    }
    html += cmpStat('High game', markBlock(a, 'highGame', 'No high game on the score grid.'), markBlock(b, 'highGame', 'No high game on the score grid.'));
    html += cmpStat('High series', markBlock(a, 'highSeries', 'No three-game series on the score grid.'), markBlock(b, 'highSeries', 'No three-game series on the score grid.'));

    function thirtyBlock(team) {
      var players = rosterPlayers(data, team);
      var total = players.reduce(function (sum, player) { return sum + (player.thirtyCount || 0); }, 0);
      var leader = null;
      players.forEach(function (player) {
        if (!leader || (player.thirtyCount || 0) > (leader.thirtyCount || 0)) leader = player;
      });
      var line = '<span class="cmp-team">' + esc(team.name) + '</span><strong>' + total + '</strong>';
      if (leader && leader.thirtyCount > 0) {
        line += '<p class="meta-line"><a href="' + playerHref(leader.id) + '">' + esc(leader.name) + '</a> ' + leader.thirtyCount + '</p>';
      } else {
        line += '<p class="meta-line">None listed in 30Detail.</p>';
      }
      return line;
    }
    html += '<section class="cmp-row"><h2>30+ games</h2><div class="cmp-pair"><div>' + thirtyBlock(a) + '</div><div>' + thirtyBlock(b) + '</div></div>';
    html += '<p class="meta-line">Counts are the 30+ games listed for each shooter, including multiples such as ×2.</p></section>';

    function ginzBlock(team) {
      var squad = rosterPlayers(data, team);
      var listed = squad.filter(function (p) { return p.ginzburgh != null; });
      var total = listed.reduce(function (sum, p) { return sum + p.ginzburgh; }, 0);
      var season = squad.reduce(function (sum, p) { return sum + (p.seasonGinzburghs || 0); }, 0);
      var leader = null;
      listed.forEach(function (p) {
        if (!leader || p.ginzburgh > leader.ginzburgh || (p.ginzburgh === leader.ginzburgh && p.name < leader.name)) leader = p;
      });
      if (!listed.length && !season) {
        return '<span class="cmp-team">' + esc(team.name) + '</span><strong>—</strong><p class="meta-line">No Ginzburgh count is listed for this roster.</p>';
      }
      var line = '<span class="cmp-team">' + esc(team.name) + '</span><strong>' + (listed.length ? total : '—') + '</strong>';
      line += '<p class="meta-line">Roster total</p>';
      if (leader) line += '<p class="meta-line">Most: <a href="' + playerHref(leader.id) + '">' + esc(leader.name) + '</a> ' + leader.ginzburgh + '</p>';
      line += '<p class="meta-line">' + (season ? season + ' logged this season' : 'None logged this season') + '</p>';
      return line;
    }
    html += '<section class="cmp-row"><h2>Ginzburghs (9-dart hits)</h2><div class="cmp-pair"><div>' + ginzBlock(a) + '</div><div>' + ginzBlock(b) + '</div></div>';
    html += '<p class="meta-line">Lifetime totals add the all-time counts of shooters on this roster. They are not a separate team lifetime. Season numbers count only the news log.</p></section>';

    var played = meetings(data, a, b);
    html += '<section class="cmp-row"><h2>Week by week</h2>';
    if (!played.length) {
      html += '<p class="meta-line">The schedule does not list a match between these teams.</p>';
    }
    played.forEach(function (item) {
      var match = item.match;
      html += '<article class="match">';
      if (item.kind === 'week') {
        html += '<h3>Week ' + item.week.number + (item.week.when ? ' · ' + esc(item.week.when) : '') + '</h3>';
      } else {
        html += '<h3>' + esc(item.round.label || 'Playoffs') + (item.round.when ? ' · ' + esc(item.round.when) : '') + '</h3>';
      }
      var whenBits = [];
      if (match.time) whenBits.push(match.time);
      if (match.board) whenBits.push('Board ' + match.board);
      if (whenBits.length) html += '<p class="meta-line">' + esc(whenBits.join(' · ')) + '</p>';
      html += '<p>' + esc(seedName(match.homeSeed, match.home)) + ' vs ' + esc(seedName(match.awaySeed, match.away)) + '</p>';
      if (match.score) html += '<p class="score-flag">Posted score ' + esc(match.score) + '</p>';
      if (item.kind === 'week') {
        var leftPts = weekPoints(a, item.week.number);
        var rightPts = weekPoints(b, item.week.number);
        if (leftPts || rightPts) {
          if (leftPts) html += '<p class="meta-line">' + esc(a.name) + ' ' + leftPts.pf + ' for, ' + leftPts.pa + ' against</p>';
          if (rightPts) html += '<p class="meta-line">' + esc(b.name) + ' ' + rightPts.pf + ' for, ' + rightPts.pa + ' against</p>';
          html += '<p class="meta-line">Those are the week’s points from the PF-PA sheet, not the 4-point match score.</p>';
        } else {
          html += '<p class="meta-line">No weekly points are stored for this match.</p>';
        }
      }
      html += '</article>';
    });
    html += '</section>';
    return html;
  }

  function bindCompare(data) {
    var selectA = document.getElementById('cmp-a');
    var selectB = document.getElementById('cmp-b');
    var body = document.getElementById('cmp-body');
    var swap = document.getElementById('cmp-swap');
    if (!selectA || !selectB || !body) return;

    function draw(fromHistory) {
      var a = data.teamBySlug[selectA.value];
      var b = data.teamBySlug[selectB.value];
      body.innerHTML = compareBody(data, a, b);
      if (!fromHistory) {
        var url = compareHref(selectA.value, selectB.value);
        history.replaceState(null, '', url);
      }
    }

    selectA.addEventListener('change', function () { draw(false); });
    selectB.addEventListener('change', function () { draw(false); });
    if (swap) {
      swap.addEventListener('click', function () {
        var hold = selectA.value;
        selectA.value = selectB.value;
        selectB.value = hold;
        draw(false);
      });
    }
    window.addEventListener('popstate', function () {
      var params = new URLSearchParams(location.search);
      if (params.get('a') && data.teamBySlug[params.get('a')]) selectA.value = params.get('a');
      if (params.get('b') && data.teamBySlug[params.get('b')]) selectB.value = params.get('b');
      draw(true);
    });
    draw(true);
  }

  function renderGinzburghs(data) {
    var html = '<p class="kicker">Nine-dart hits</p><h1>Ginzburghs</h1>';
    html += '<p class="lede">A Ginzburgh is a nine-dart hit: nine marks in one round. The list is every shooter on the all-time sheet, highest count first. The same count is sorted by name.</p>';
    html += '<label class="ginz-find">Find a shooter<input id="ginz-filter" class="text-input" type="search" placeholder="Type a name" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="search"></label>';
    html += '<p id="ginz-count" class="meta-line"></p>';
    html += '<div id="ginz-list"></div>';
    return html;
  }

  function bindGinzburghs(data) {
    var input = document.getElementById('ginz-filter');
    var list = document.getElementById('ginz-list');
    var count = document.getElementById('ginz-count');
    if (!input || !list) return;
    var rows = (data.honors.ginzburgh || []).slice().sort(function (a, b) {
      return b.count - a.count || a.name.localeCompare(b.name);
    });
    function draw() {
      var q = input.value.trim().toLowerCase();
      var shown = rows.filter(function (row) {
        return !q || row.name.toLowerCase().indexOf(q) !== -1;
      });
      if (count) count.textContent = shown.length + (shown.length === 1 ? ' shooter' : ' shooters');
      if (!shown.length) {
        list.innerHTML = '<p class="banner warn">No shooter matches that.</p>';
        return;
      }
      list.innerHTML = shown.map(function (row) {
        var season = row.season ? '<p class="meta-line">' + row.season + ' logged this season</p>' : '';
        var body = '<div class="shooter-top"><h2>' + esc(row.name) + '</h2><span class="avg">' + row.count + '</span></div><p class="meta-line">Lifetime Ginzburghs (9-dart hits)</p>' + season;
        var person = (data.directory || []).find(function (item) { return item.name === row.name; });
        var href = playerHref(person ? person.id : (player ? player.id : names.slugify(row.name)));
        var note = person && person.lifetimeOnly ? '<p class="meta-line">Not on this season\'s roster</p>' : '';
        return '<a class="shooter" href="' + href + '">' + body + note + '</a>';
      }).join('');
    }
    input.addEventListener('input', draw);
    draw();
  }

  var pages = {
    home: function (data) { return renderHome(data); },
    standings: function (data) { return renderStandings(data); },
    players: function (data) { return renderPlayers(data); },
    teams: function (data) { return renderTeams(data); },
    team: function (data) { return renderTeam(data); },
    schedule: function (data) { return renderSchedule(data); },
    awards: function (data) { return renderAwards(data); },
    rules: function (data) { return renderRules(data); },
    player: function (data) { return renderPlayer(data); },
    compare: function (data) { return renderCompare(data); },
    ginzburghs: function (data) { return renderGinzburghs(data); }
  };

  async function boot() {
    var page = document.body.dataset.page || 'home';
    try {
      var loaded = await loadAll();
      var data = hydrate(loaded.league, loaded.aliases);
      fillChrome(data);
      if (page === 'update') return;
      var content = document.getElementById('content');
      var view = pages[page] ? pages[page](data) : renderHome(data);
      if (page === 'awards') {
        content.innerHTML = view.html;
        bindHonors(view.lists);
      } else {
        content.innerHTML = view;
      }
      fillChrome(data);
      if (page === 'standings') bindStandings(data);
      if (page === 'players') bindPlayers(data);
      if (page === 'compare') bindCompare(data);
      if (page === 'ginzburghs') bindGinzburghs(data);
    } catch (err) {
      showError('The scores could not be loaded. If you just opened the file from a folder, the data scripts need to sit next to this page.');
    }
  }

  boot();
})();
