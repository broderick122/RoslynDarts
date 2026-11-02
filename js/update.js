(function () {
  'use strict';

  var config = window.SITE_CONFIG;
  var tokenKey = 'roslynDarts.githubToken';
  var pending = null;

  var tokenInput = document.getElementById('token');
  var tokenStatus = document.getElementById('token-status');
  var fileInput = document.getElementById('file');
  var fileStatus = document.getElementById('file-status');
  var preview = document.getElementById('preview');
  var publishBtn = document.getElementById('publish');
  var publishStatus = document.getElementById('publish-status');
  var downloadBtn = document.getElementById('download');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function say(el, kind, html) {
    el.className = 'banner ' + kind;
    el.innerHTML = html;
    el.hidden = false;
  }

  function token() {
    return (tokenInput.value || '').trim() || localStorage.getItem(tokenKey) || '';
  }

  function refreshTokenStatus() {
    var saved = '';
    try { saved = localStorage.getItem(tokenKey) || ''; } catch (err) { saved = ''; }
    if (saved) {
      say(tokenStatus, 'ok', 'A token is saved in this browser only. It is not sent anywhere except GitHub, and only when you publish.');
    } else {
      say(tokenStatus, 'warn', 'No token saved yet. You can still check a workbook. Publishing needs the token.');
    }
    publishBtn.disabled = !(pending && token());
  }

  document.getElementById('token-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var value = tokenInput.value.trim();
    if (!value) {
      say(tokenStatus, 'bad', 'Paste the token first.');
      return;
    }
    try {
      localStorage.setItem(tokenKey, value);
      tokenInput.value = '';
      refreshTokenStatus();
    } catch (err) {
      say(tokenStatus, 'bad', 'This browser will not store the token. You can paste it again when you publish, but it will not be remembered.');
    }
  });

  document.getElementById('forget').addEventListener('click', function () {
    try { localStorage.removeItem(tokenKey); } catch (err) { /* ignore */ }
    tokenInput.value = '';
    refreshTokenStatus();
    say(tokenStatus, 'warn', 'The saved token was removed from this browser.');
  });

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(script);
    });
  }

  async function loadAliases() {
    if (location.protocol !== 'file:') {
      try {
        var res = await fetch('data/aliases.json?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) return res.json();
      } catch (err) { /* use the script copy */ }
    }
    if (!window.LEAGUE_ALIASES) await loadScript('data/aliases.js');
    if (!window.LEAGUE_ALIASES) throw new Error('The alias list is missing.');
    return window.LEAGUE_ALIASES;
  }

  function fmtAvg(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  }

  async function handleFile(file) {
    pending = null;
    publishBtn.disabled = true;
    preview.hidden = true;
    preview.innerHTML = '';
    downloadBtn.hidden = true;
    if (!file) return;
    say(fileStatus, 'warn', 'Reading ' + esc(file.name) + '…');
    try {
      var aliases = await loadAliases();
      var bytes = await file.arrayBuffer();
      var workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
      var result = window.RoslynParse.parseWorkbook(workbook, aliases);
      if (!result.ok || !result.league) {
        say(fileStatus, 'bad', '<strong>This file was not accepted.</strong><ul>' + result.errors.map(function (e) {
          return '<li>' + esc(e) + '</li>';
        }).join('') + '</ul>');
        return;
      }
      var hits = window.RoslynParse.findSensitive(JSON.stringify(result.league));
      if (hits.length) {
        say(fileStatus, 'bad', 'This file was not accepted. The parsed scores still looked like they contained contact information, so nothing can be published.');
        return;
      }
      pending = result;
      var league = result.league;
      var top = league.standings.slice(0, 4).map(function (t) {
        return '<li>' + esc(t.name) + ' ' + t.w + '–' + t.l + '</li>';
      }).join('');
      var best = league.players[0];
      var series = league.players.slice().filter(function (p) { return p.highSeries != null; })
        .sort(function (a, b) { return b.highSeries - a.highSeries; })[0];
      var high = league.players.slice().filter(function (p) { return p.highGame != null; })
        .sort(function (a, b) { return b.highGame - a.highGame; })[0];
      var html = '<p><strong>' + esc(league.meta.season) + '</strong> · ' + league.meta.teamCount + ' teams · ' + league.meta.playerCount + ' shooters with games</p>';
      html += '<ul>' + top + '</ul>';
      if (best) html += '<p>Top average: ' + esc(best.name) + ' ' + fmtAvg(best.average) + '</p>';
      if (series) html += '<p>High series: ' + esc(series.name) + ' ' + series.highSeries + '</p>';
      if (high) html += '<p>High game: ' + esc(high.name) + ' ' + high.highGame + '</p>';
      html += '<p>The spreadsheet itself is not uploaded. Phone numbers, email addresses, and the Capt. tab stay on your computer. The site only receives the scores.</p>';
      if (result.warnings.length) {
        html += '<div class="banner warn"><strong>Check these notes, then publish if they look right.</strong><ul>' + result.warnings.map(function (w) {
          return '<li>' + esc(w) + '</li>';
        }).join('') + '</ul></div>';
      }
      preview.innerHTML = html;
      preview.hidden = false;
      downloadBtn.hidden = false;
      say(fileStatus, 'ok', 'This workbook looks usable. Review the preview, then update the website.');
      publishBtn.disabled = !token();
    } catch (err) {
      say(fileStatus, 'bad', 'That file could not be read as an Excel workbook. Choose the .xlsx Chip keeps for the league.');
    }
  }

  fileInput.addEventListener('change', function () {
    handleFile(fileInput.files && fileInput.files[0]);
  });

  var drop = document.getElementById('drop');
  ['dragover', 'dragenter'].forEach(function (type) {
    drop.addEventListener(type, function (event) { event.preventDefault(); });
  });
  drop.addEventListener('drop', function (event) {
    event.preventDefault();
    var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  downloadBtn.addEventListener('click', function () {
    if (!pending) return;
    var blob = new Blob([JSON.stringify(pending.league, null, 2) + '\n'], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'league.json';
    link.click();
    URL.revokeObjectURL(url);
  });

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    var size = 0x8000;
    for (var i = 0; i < bytes.length; i += size) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + size));
    }
    return btoa(bin);
  }

  async function explain(res) {
    var msg = '';
    try { msg = (await res.json()).message || ''; } catch (err) { msg = ''; }
    if (res.status === 401) return 'GitHub did not accept that token. Copy the whole token and try again.';
    if (res.status === 403) return 'That token cannot edit this repository. It needs Contents set to Read and write, only for ' + config.repoOwner + '/' + config.repoName + '.';
    if (res.status === 404) return 'GitHub could not find ' + config.repoOwner + '/' + config.repoName + '. The token may not be allowed to see that repository.';
    return 'GitHub returned an error (' + res.status + '). ' + msg;
  }

  async function putFile(auth, filePath, text, message) {
    var url = 'https://api.github.com/repos/' + config.repoOwner + '/' + config.repoName + '/contents/' + filePath;
    var headers = {
      Authorization: 'Bearer ' + auth,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    var sha = '';
    var current = await fetch(url + '?ref=' + encodeURIComponent(config.branch), { headers: headers });
    if (current.status === 200) sha = (await current.json()).sha;
    else if (current.status !== 404) throw new Error(await explain(current));
    var body = { message: message, content: utf8ToB64(text), branch: config.branch };
    if (sha) body.sha = sha;
    var saved = await fetch(url, { method: 'PUT', headers: headers, body: JSON.stringify(body) });
    if (!saved.ok) throw new Error(await explain(saved));
  }

  publishBtn.addEventListener('click', async function () {
    if (!pending || !token()) return;
    publishBtn.disabled = true;
    say(publishStatus, 'warn', 'Publishing the scores to the main branch…');
    var league = pending.league;
    var message = 'Update ' + (league.meta.season || 'league') + ' darts data';
    var json = JSON.stringify(league, null, 2) + '\n';
    var script = 'window.LEAGUE_DATA = ' + JSON.stringify(league, null, 2) + ';\n';
    try {
      await putFile(token(), 'data/league.json', json, message);
      await putFile(token(), 'data/league.js', script, message);
      say(publishStatus, 'ok', 'The website files were updated. Give it a minute, then refresh the home page. The spreadsheet was not uploaded.');
    } catch (err) {
      say(publishStatus, 'bad', esc(err.message || 'The update did not go through.'));
    }
    publishBtn.disabled = !(pending && token());
  });

  refreshTokenStatus();
})();
