// Quiz state
const state = {
  worldData: null,
  geoFeatures: [],
  queue: [],
  currentIndex: 0,
  score: 0,
  prevResult: null,
  answered: false,
};

// ── Utility ──────────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function normalize(s) {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''ʻ]/g, "'")
    .replace(/[^a-z0-9'\- ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Returns { correct: bool, perfect: bool } where perfect means exact normalized match
function isCorrect(guess, country) {
  const g = normalize(guess);
  if (!g) return { correct: false, perfect: false };
  const candidates = [country.capital, ...(country.alternates || [])];
  let perfect = false;
  const correct = candidates.some(cap => {
    const c = normalize(cap);
    if (g === c) { perfect = true; return true; }
    const threshold = c.length <= 5 ? 1 : c.length <= 10 ? 2 : 3;
    return levenshtein(g, c) <= threshold;
  });
  return { correct, perfect };
}

// ── Map ───────────────────────────────────────────────────────────────────────

const MAP_W = 800;
const MAP_H = 420;

let svgEl, gCountries, gLabels, gDot, projectionFull, pathFull;

function initMap() {
  svgEl = d3.select('#world-map')
    .attr('viewBox', `0 0 ${MAP_W} ${MAP_H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  // Ocean background
  svgEl.append('rect')
    .attr('width', MAP_W)
    .attr('height', MAP_H)
    .attr('fill', '#c9e8f5');

  projectionFull = d3.geoNaturalEarth1()
    .scale(MAP_W / 6.28)
    .translate([MAP_W / 2, MAP_H / 2]);
  pathFull = d3.geoPath().projection(projectionFull);

  gCountries = svgEl.append('g').attr('class', 'countries');
  gLabels  = svgEl.append('g').attr('class', 'country-labels');
  gDot     = svgEl.append('g').attr('class', 'capital-dot');
}

function renderMap(targetCountry) {
  const features = state.geoFeatures;
  const targetId = targetCountry ? String(targetCountry.id) : null;

  // Choose projection: zoom to target country bbox, or fall back to full world view
  let projection, path;
  if (targetCountry && features.length > 0) {
    const targetFeature = features.find(f => String(f.id) === targetId);
    if (targetFeature) {
      // Enforce a minimum geographic extent so small countries (e.g. Brunei)
      // aren't zoomed in so aggressively that neighbours vanish.
      const [[w, s], [e, n]] = d3.geoBounds(targetFeature);
      const midLon = (w + e) / 2;
      const midLat = (s + n) / 2;
      const MIN_SPAN = 12; // degrees
      const lonHalf = Math.max((e - w) / 2, MIN_SPAN / 2);
      const latHalf = Math.max((n - s) / 2, (MIN_SPAN * MAP_H / MAP_W) / 2);
      const fitGeom = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [midLon - lonHalf, midLat - latHalf],
            [midLon + lonHalf, midLat - latHalf],
            [midLon + lonHalf, midLat + latHalf],
            [midLon - lonHalf, midLat + latHalf],
            [midLon - lonHalf, midLat - latHalf],
          ]],
        },
      };
      const margin = 40;
      projection = d3.geoNaturalEarth1()
        .fitExtent([[margin, margin], [MAP_W - margin, MAP_H - margin]], fitGeom);
    }
  }
  if (!projection) {
    projection = projectionFull;
  }
  path = d3.geoPath().projection(projection);

  if (features.length > 0) {
    gCountries.selectAll('path')
      .data(features, d => d.id)
      .join('path')
      .attr('d', path)
      .attr('fill', d => String(d.id) === targetId ? '#f4a732' : '#c8d6b0')
      .attr('stroke', '#6a8a5a')
      .attr('stroke-width', d => String(d.id) === targetId ? 1 : 0.4);
  }

  // Labels — only when zoomed to a specific country
  gLabels.selectAll('*').remove();
  if (targetId && features.length > 0) {
    const nameMap = new Map(COUNTRIES.map(c => [String(c.id), c.name]));
    features.forEach(f => {
      const fId = String(f.id);
      const name = nameMap.get(fId);
      if (!name) return;
      const [lx, ly] = path.centroid(f);
      if (isNaN(lx) || isNaN(ly)) return;
      if (lx < 0 || lx > MAP_W || ly < 0 || ly > MAP_H) return;
      const isTarget = fId === targetId;
      gLabels.append('text')
        .attr('x', lx).attr('y', ly)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-family', 'system-ui, sans-serif')
        .attr('font-size', isTarget ? 13 : 10)
        .attr('font-weight', isTarget ? '700' : '400')
        .attr('fill', isTarget ? '#1a365d' : '#3d4f3d')
        .attr('stroke', 'rgba(255,255,255,0.9)')
        .attr('stroke-width', 3)
        .attr('stroke-linejoin', 'round')
        .style('paint-order', 'stroke fill')
        .text(name);
    });
  }

  gDot.selectAll('*').remove();

  if (targetCountry) {
    const [cx, cy] = projection([targetCountry.lng, targetCountry.lat]);
    if (cx != null && cy != null && !isNaN(cx) && !isNaN(cy)) {
      // Outer ring
      gDot.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', 7)
        .attr('fill', 'none')
        .attr('stroke', '#c0392b')
        .attr('stroke-width', 2)
        .attr('opacity', 0.7);
      // Dot
      gDot.append('circle')
        .attr('cx', cx).attr('cy', cy).attr('r', 4)
        .attr('fill', '#e74c3c')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5);
    }
  }
}

// ── Quiz Logic ────────────────────────────────────────────────────────────────

function buildQueue(countries, numRounds) {
  const shuffled = shuffle([...countries]);
  return shuffled.slice(0, Math.min(numRounds, shuffled.length));
}

function getCurrentCountry() {
  return state.currentIndex < state.queue.length ? state.queue[state.currentIndex] : null;
}

function scheduleRepeat(country) {
  const delay = randomInt(2, 6);
  const insertPos = Math.min(state.currentIndex + delay, state.queue.length);
  state.queue.splice(insertPos, 0, country);
}

function submitAnswer() {
  if (state.answered) return;
  const input = document.getElementById('answer-input');
  const guess = input.value.trim();
  if (!guess) return;

  const country = getCurrentCountry();
  if (!country) return;

  state.answered = true;
  const { correct, perfect } = isCorrect(guess, country);

  state.prevResult = { country, guess, correct, perfect };

  if (correct) {
    state.score++;
  } else {
    scheduleRepeat(country);
  }

  showFeedback(correct, country.capital);
  input.disabled = true;
  document.getElementById('submit-btn').disabled = true;

  setTimeout(() => {
    state.currentIndex++;
    state.answered = false;
    const next = getCurrentCountry();
    if (next) {
      showQuestion(next);
    } else {
      showResults();
    }
  }, 1500);
}

// ── UI ────────────────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function showSetup() {
  showScreen('setup-screen');
}

function startQuiz() {
  const continents = Array.from(
    document.querySelectorAll('.continent-cb:checked')
  ).map(cb => cb.value);

  if (continents.length === 0) {
    alert('Please select at least one continent.');
    return;
  }

  const numRounds = parseInt(document.getElementById('num-rounds').value, 10);
  if (isNaN(numRounds) || numRounds < 1) {
    alert('Please enter a valid number of rounds.');
    return;
  }

  const pool = COUNTRIES.filter(c => continents.includes(c.continent));
  if (pool.length === 0) {
    alert('No countries found for the selected continents.');
    return;
  }

  state.queue = buildQueue(pool, numRounds);
  state.currentIndex = 0;
  state.score = 0;
  state.prevResult = null;
  state.answered = false;

  showScreen('quiz-screen');
  showQuestion(getCurrentCountry());
}

function showQuestion(country) {
  // Update previous result pane
  const prevPane = document.getElementById('prev-pane');
  if (state.prevResult) {
    const r = state.prevResult;
    prevPane.classList.remove('hidden');
    document.getElementById('prev-country-name').textContent = r.country.name;
    document.getElementById('prev-answer-text').textContent =
      `Your answer: ${r.guess}`;
    const statusEl = document.getElementById('prev-status');
    if (r.correct) {
      statusEl.textContent = r.perfect ? '✓ Perfect' : `✓ Correct — ${r.country.capital}`;
      statusEl.className = 'prev-status correct';
    } else {
      statusEl.textContent = `✗ Incorrect — it was ${r.country.capital}`;
      statusEl.className = 'prev-status incorrect';
    }
  } else {
    prevPane.classList.add('hidden');
  }

  // Update progress
  const total = state.queue.length;
  const qNum = state.currentIndex + 1;
  document.getElementById('progress-text').textContent =
    `Question ${qNum} of ${total}`;
  const pct = (state.currentIndex / total) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('score-display').textContent =
    state.currentIndex > 0 ? `Score: ${state.score} / ${state.currentIndex}` : '';

  // Update question
  document.getElementById('question-country').textContent = country.name;

  // Reset answer input
  const input = document.getElementById('answer-input');
  input.value = '';
  input.disabled = false;
  document.getElementById('submit-btn').disabled = false;
  document.getElementById('feedback').textContent = '';
  document.getElementById('feedback').className = 'feedback';

  // Render map
  renderMap(country);

  // Focus input
  input.focus();
}

function showFeedback(correct, capital) {
  const fb = document.getElementById('feedback');
  if (correct) {
    fb.textContent = `✓ Correct!`;
    fb.className = 'feedback correct';
  } else {
    fb.textContent = `✗ The answer was: ${capital}`;
    fb.className = 'feedback incorrect';
  }
  const pct = ((state.currentIndex + 1) / state.queue.length) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('score-display').textContent =
    `Score: ${state.score} / ${state.currentIndex + 1}`;
}

function showResults() {
  showScreen('results-screen');
  const total = state.currentIndex; // questions answered
  const pct = total > 0 ? Math.round((state.score / total) * 100) : 0;
  document.getElementById('result-score').textContent =
    `${state.score} / ${total} correct (${pct}%)`;

  const msg = pct >= 90 ? 'Excellent!' : pct >= 70 ? 'Well done!' : pct >= 50 ? 'Good effort!' : 'Keep practising!';
  document.getElementById('result-msg').textContent = msg;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  initMap();

  // Load world TopoJSON
  try {
    state.worldData = await d3.json(
      'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'
    );
    state.geoFeatures = topojson
      .feature(state.worldData, state.worldData.objects.countries)
      .features;
    renderMap(null);
  } catch (e) {
    console.warn('Could not load world map data:', e);
  }

  document.getElementById('start-btn').addEventListener('click', startQuiz);
  document.getElementById('restart-btn').addEventListener('click', showSetup);

  document.getElementById('submit-btn').addEventListener('click', submitAnswer);
  document.getElementById('answer-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAnswer();
  });

  // Select/deselect all continents
  document.getElementById('select-all').addEventListener('click', () => {
    document.querySelectorAll('.continent-cb').forEach(cb => cb.checked = true);
  });
  document.getElementById('select-none').addEventListener('click', () => {
    document.querySelectorAll('.continent-cb').forEach(cb => cb.checked = false);
  });
}

document.addEventListener('DOMContentLoaded', init);
