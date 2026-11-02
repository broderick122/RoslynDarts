/* Shared name cleanup for the league site and the workbook parser. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RoslynNames = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function cap(word) {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function normKey(value) {
    var s = String(value == null ? '' : value);
    s = s.replace(/[\u2018\u2019\u02BC]/g, "'");
    s = s.replace(/[\u042F\u044F]/g, 'R');
    if (typeof s.normalize === 'function') {
      s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    }
    s = s.replace(/\[[^\]]*\]/g, ' ');
    s = s.toLowerCase();
    s = s.replace(/[_/.,&+]+/g, ' ');
    s = s.replace(/-/g, ' ');
    s = s.replace(/[^a-z0-9' ]+/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function cleanLabel(value) {
    return String(value == null ? '' : value)
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isPlaceholder(key) {
    if (!key) return true;
    if (/^\d+(st|nd|rd|th)\s+(man|person|shooter|player)$/.test(key)) return true;
    if (/^(man|person|shooter|player|open|tbd|sub|substitute|n a|na)$/.test(key)) return true;
    if (key.indexOf('div') !== -1 && key.indexOf('0') !== -1) return true;
    return false;
  }

  function titleCasePerson(key) {
    var special = { jp: 'JP', jr: 'Jr.', sr: 'Sr.', ii: 'II', iii: 'III', iv: 'IV' };
    return key.split(' ').filter(Boolean).map(function (word) {
      if (special[word]) return special[word];
      if (word.indexOf("'") !== -1) {
        return word.split("'").map(function (part) {
          if (!part) return '';
          if (part.length === 1) return part.toUpperCase();
          if (part.indexOf('mc') === 0 && part.length > 2) return 'Mc' + cap(part.slice(2));
          return cap(part);
        }).join("'");
      }
      if (word.indexOf('mc') === 0 && word.length > 2) return 'Mc' + cap(word.slice(2));
      return cap(word);
    }).join(' ');
  }

  function titleCaseWords(key) {
    return key.split(' ').filter(Boolean).map(cap).join(' ');
  }

  function canonicalTeam(raw, aliases, opts) {
    var fallback = !opts || opts.fallback !== false;
    var key = normKey(raw);
    if (!key) return '';
    var teams = (aliases && aliases.teams) || {};
    if (teams[key]) return teams[key];
    var noThe = key.replace(/^the /, '');
    if (noThe !== key && teams[noThe]) return teams[noThe];
    if (!fallback) return '';
    return titleCaseWords(key);
  }

  function canonicalPlayer(raw, aliases) {
    var key = normKey(raw);
    if (!key || isPlaceholder(key)) return '';
    var pairs = (aliases && aliases.replace) || [];
    for (var i = 0; i < pairs.length; i++) {
      var from = pairs[i][0];
      var to = pairs[i][1];
      if (from) key = key.split(from).join(to);
    }
    key = key.replace(/\s+/g, ' ').trim();
    if (!key || isPlaceholder(key)) return '';
    var players = (aliases && aliases.players) || {};
    if (players[key]) return players[key];
    return titleCasePerson(key);
  }

  function slugify(value) {
    return normKey(value).replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  return {
    cap: cap,
    normKey: normKey,
    cleanLabel: cleanLabel,
    isPlaceholder: isPlaceholder,
    canonicalTeam: canonicalTeam,
    canonicalPlayer: canonicalPlayer,
    slugify: slugify,
    titleCasePerson: titleCasePerson
  };
});
