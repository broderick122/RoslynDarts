# Roslyn VFW American Darts

Wednesday-night standings, averages, schedule, and shooter pages for the American dart league at Roslyn VFW Post 3498, 1140 Easton Rd, Abington, PA 19001.

The site is plain HTML, CSS, and JavaScript. GitHub Pages serves it from the root of `main`. There is no build step when someone opens the site.

## Turn on GitHub Pages

Mike, this is the part that puts the site on the internet:

1. Open [github.com/broderick122/RoslynDarts](https://github.com/broderick122/RoslynDarts).
2. Click **Settings**.
3. Click **Pages** in the left sidebar.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Set the branch to **main** and the folder to **/ (root)**.
6. Click **Save**.

After a minute the site is at [https://broderick122.github.io/RoslynDarts/](https://broderick122.github.io/RoslynDarts/). The repository is already public, which is what free GitHub Pages needs.

## Where the numbers come from

Chip keeps the season workbook in Excel, the same way as always. The website does not contain that workbook. A workbook can hold captain phone numbers and other contact details, so the public repository is not allowed to store `.xlsx` files.

The Update page reads the workbook in the browser, keeps only the stat tabs it knows, and publishes a sanitized `data/league.json`. Opening the site, including `index.html` from a downloaded copy, shows those parsed scores. `data/league.js` is the same data so the page still works when it is opened as a file.

Tabs the parser reads: Standings, AVERAGES, Avg GRID, Schedule, H2H, PF-PA, Avg-Series, 30Detail, news, Ginsburgh&PlayeroftheWeek, Rules, and SPREAD.

Tabs it never reads include Capt., outing, tourney, golf, Reminders, Pay26B, and the old leftover sheets. The only street address on the site is the VFW hall, and it is written in the page, not copied out of the workbook.

Empty roster labels such as `7TH MAN` are hidden. `#DIV/0!` is hidden. Games-behind cells that contain notes such as `- 3` or `---` are shown as written.

## Update the site after Chip changes the workbook

1. Open the **Update scores** page on the site (`update.html`).
2. The first time, on that phone or computer, create a GitHub fine-grained token:
   - GitHub **Settings → Developer settings → Fine-grained tokens**.
   - Repository access: only **RoslynDarts**.
   - Repository permission: **Contents: Read and write**.
3. Paste the token and click **Save token on this browser**. It stays in that browser's local storage. It is not written into the website.
4. Choose the `.xlsx`. Save the workbook in Excel first so calculated averages are stored in the file.
5. Read the preview. If a required tab or the standings table is missing, the page says what is missing and does not show a partial table.
6. Click **Update the website**. That commits `data/league.json` and `data/league.js` on `main`. Refresh the home page after a minute.

If the token step is a problem, use **Download the sanitized scores instead** and send Mike the JSON file to commit as `data/league.json` (and the same object assigned to `window.LEAGUE_DATA` in `data/league.js`). Do not commit the spreadsheet.

## Names

`data/aliases.json` maps the workbook's spellings onto one official name (Glazerbeam, The Fuck-Ups, Chip McClenaghan, Kilkenny, and the rest). Edit that file when a new spelling shows up. The site applies it when it draws the pages, so a spelling change is visible on refresh. If two different strings should become the same person and their stats were stored separately, publish the workbook again after the alias change.

`data/aliases.js` is a copy for opening the site as a file. Regenerate both data files with:

```bash
NODE_PATH=/path/to/node_modules node scripts/build-data.mjs "/path/to/workbook.xlsx"
```

That command needs the `xlsx` package available to Node. It is only for rebuilding data. Visitors do not run it.

## Privacy check

`node scripts/check-privacy.mjs` fails if a tracked file is a spreadsheet or if the published text contains a phone number, an email address, a long digit string that is not part of an average, or the captain-contact header. GitHub runs the same check on every push (`.github/workflows/privacy.yml`).

The Update page runs the same scan on the parsed scores and refuses to publish if it matches.

## What the pages show

Home, standings (with the line after 8th and head-to-head), players (sort, team filter, and leaderboards), teams, schedule, awards, rules, a shooter page, and the update page.

Shooter search is on every page and is the main box on the home page. A shooter page shows team, games, points, average, rank, high game, high series, each 30+ game from 30Detail, week-by-week scores from Avg GRID, Player of the Week, and Ginzburgh counts when the workbook has them.

The workbook does not track nine-marks or other per-inning marks. Those are not on the site.

Each match is 4 points: three games plus the team total. The top 8 teams make the playoffs.

## Version

The footer shows the site version from `js/config.js` (currently 1.0.0). Styles and scripts are loaded with `?v=1.0.0` so a changed design is not stuck in a phone cache. League data is fetched with a fresh query on each visit, so a published workbook update shows up without bumping that version.

SheetJS (`vendor/xlsx.full.min.js`, Apache-2.0) reads the workbook on the Update page only.
