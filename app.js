(() => {
  'use strict';

  const POPULAR_CITIES = [
    'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai',
    'Kolkata', 'Pune', 'Ahmedabad', 'New York', 'London',
  ];
  const DEFAULT_CITY = 'Mumbai';

  const els = {
    form: document.getElementById('search-form'),
    input: document.getElementById('city-input'),
    btn: document.getElementById('search-btn'),
    chips: document.getElementById('chips'),
    status: document.getElementById('status'),
    result: document.getElementById('result'),
    city: document.getElementById('loc-city'),
    region: document.getElementById('loc-region'),
    time: document.getElementById('loc-time'),
    emoji: document.getElementById('cond-emoji'),
    temp: document.getElementById('temp-value'),
    cond: document.getElementById('cond-text'),
    feels: document.getElementById('feels-like'),
    insightLabel: document.getElementById('insight-label'),
    insightText: document.getElementById('insight-text'),
    humidity: document.getElementById('m-humidity'),
    wind: document.getElementById('m-wind'),
    uv: document.getElementById('m-uv'),
    uvSub: document.getElementById('m-uv-sub'),
    jsonPre: document.getElementById('json-pre'),
    tabFormatted: document.getElementById('tab-formatted'),
    tabRaw: document.getElementById('tab-raw'),
    copyBtn: document.getElementById('copy-btn'),
  };

  let requestSeq = 0;      // guards against stale results overwriting a newer search
  let controller = null;   // aborts in-flight requests when a new search starts
  let lastData = null;
  let activeTab = 'formatted';
  let copyTimer = null;

  /* ---------- helpers ---------- */

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function conditionEmoji(text) {
    const t = (text || '').toLowerCase();
    if (t.includes('thunder') || t.includes('storm')) return '⛈️';
    if (t.includes('snow') || t.includes('sleet') || t.includes('ice')) return '❄️';
    if (t.includes('rain') || t.includes('drizzle') || t.includes('shower')) return '🌧️';
    if (t.includes('mist') || t.includes('fog') || t.includes('haze') ||
        t.includes('smoke') || t.includes('dust') || t.includes('sand') || t.includes('ash')) return '🌫️';
    if (t.includes('overcast') || t.includes('cloud')) return '☁️';
    if (t.includes('partly') || t.includes('patchy')) return '⛅';
    if (t.includes('sunny') || t.includes('clear')) return '☀️';
    return '🌤️';
  }

  function uvBand(uv) {
    if (uv == null) return 'Exposure level';
    if (uv <= 2) return 'Low exposure';
    if (uv <= 5) return 'Moderate exposure';
    if (uv <= 7) return 'High exposure';
    if (uv <= 10) return 'Very high exposure';
    return 'Extreme exposure';
  }

  /**
   * Weather insight card rules.
   * Condition text takes priority over temperature, so e.g. "Smoky haze"
   * is reported as haze rather than as "Warm & Sunny".
   */
  function buildInsight(current) {
    const t = (current.condition && current.condition.text ? current.condition.text : '').toLowerCase();
    const temp = typeof current.temp_c === 'number' ? current.temp_c : 0;
    const uv = typeof current.uv === 'number' ? current.uv : 0;

    if (t.includes('thunder') || t.includes('storm')) {
      return ['Thunderstorms', 'Stay indoors if you can — lightning risk outside.'];
    }
    if (t.includes('snow') || t.includes('sleet') || t.includes('ice')) {
      return ['Snowy', 'Bundle up warmly and watch your step on icy surfaces.'];
    }
    if (t.includes('rain') || t.includes('drizzle') || t.includes('shower')) {
      return ['Rain Around', 'Carry an umbrella — wet conditions outside.'];
    }
    if (t.includes('mist') || t.includes('fog') || t.includes('haze') ||
        t.includes('smoke') || t.includes('dust') || t.includes('ash')) {
      return ['Hazy Skies', 'Reduced visibility outdoors — take it slow out there.'];
    }
    if (uv >= 8) {
      return ['Harsh Sun', 'UV is strong today — sunscreen and shades recommended.'];
    }
    if (temp >= 30) {
      return ['Hot & Humid', 'Stay hydrated; light, breathable clothing works best.'];
    }
    if (temp >= 22) {
      return ['Warm & Sunny', 'Pleasant warmth — light layers work perfectly.'];
    }
    if (temp >= 14) {
      return ['Mild & Pleasant', 'Comfortable conditions for most outdoor plans.'];
    }
    if (temp >= 5) {
      return ['Cool Breeze', 'A light jacket will keep you comfortable.'];
    }
    return ['Cold Snap', 'Layer up before you head out — it’s cold out there.'];
  }

  function formatLocalTime(value) {
    if (!value) return '';
    const [datePart, timePart] = value.split(' ');
    if (!datePart || !timePart) return value;
    const [y, mo, day] = datePart.split('-').map(Number);
    const [hh, mi] = timePart.split(':').map(Number);
    if ([y, mo, day, hh, mi].some((n) => Number.isNaN(n))) return value;
    const dt = new Date(y, mo - 1, day, hh, mi);
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const h24 = dt.getHours();
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    return `${weekdays[dt.getDay()]}, ${day} ${months[dt.getMonth()]} · ${h12}:${String(mi).padStart(2, '0')} ${ampm} local`;
  }

  function friendlyError(status, apiError) {
    const code = apiError && apiError.code;
    const message = apiError && apiError.message;
    if (code === 1006) return 'City not found. Check the spelling and try again.';
    if (code === 1003) return 'Please provide a city name to search.';
    if (status === 400) return 'That search didn’t work. Try a different city name.';
    if (status === 401 || status === 403) return 'Weather service rejected the request — the API key may be invalid or out of quota.';
    if (status === 429) return 'Too many requests right now. Please try again in a little while.';
    if (status >= 500) return 'The weather service is having trouble. Please try again shortly.';
    return message || 'Something went wrong. Please try again.';
  }

  /* ---------- rendering ---------- */

  function renderChips() {
    els.chips.innerHTML = POPULAR_CITIES
      .map((city) => `<button type="button" class="chip" data-city="${escapeHtml(city)}">${escapeHtml(city)}</button>`)
      .join('');
  }

  function setLoading(city) {
    els.btn.disabled = true;
    els.result.hidden = true;
    els.status.innerHTML =
      `<div class="status-card"><span class="spinner"></span> Fetching live weather for “${escapeHtml(city)}”…</div>`;
  }

  function showError(message) {
    els.btn.disabled = false;
    els.result.hidden = true;
    els.status.innerHTML = `<div class="status-card error">⚠️ ${escapeHtml(message)}</div>`;
  }

  function renderWeather(data) {
    const loc = data.location || {};
    const cur = data.current || {};
    const cond = cur.condition || {};
    const [label, text] = buildInsight(cur);

    els.city.textContent = loc.name || 'Unknown';
    els.region.textContent = [loc.region, loc.country].filter(Boolean).join(', ') || '—';
    els.time.textContent = formatLocalTime(loc.localtime);
    els.emoji.textContent = conditionEmoji(cond.text);
    els.temp.textContent = typeof cur.temp_c === 'number' ? Math.round(cur.temp_c) : '—';
    els.cond.textContent = cond.text || 'Conditions unavailable';
    els.feels.textContent = typeof cur.feelslike_c === 'number'
      ? `Feels like ${Math.round(cur.feelslike_c)}°`
      : 'Feels-like unavailable';
    els.insightLabel.textContent = label;
    els.insightText.textContent = text;
    els.humidity.textContent = typeof cur.humidity === 'number' ? cur.humidity : '—';
    els.wind.textContent = typeof cur.wind_kph === 'number' ? Math.round(cur.wind_kph) : '—';
    els.uv.textContent = typeof cur.uv === 'number' ? cur.uv : '—';
    els.uvSub.textContent = uvBand(cur.uv);

    renderJson();
    els.status.innerHTML = '';
    els.btn.disabled = false;
    els.result.hidden = false;
  }

  /* ---------- JSON panel ---------- */

  function jsonContent() {
    if (!lastData) return '{}';
    return activeTab === 'formatted'
      ? JSON.stringify(lastData, null, 2)
      : JSON.stringify(lastData);
  }

  function renderJson() {
    els.jsonPre.textContent = jsonContent();
  }

  function setActiveTab(tab) {
    activeTab = tab;
    els.tabFormatted.classList.toggle('active', tab === 'formatted');
    els.tabFormatted.setAttribute('aria-selected', String(tab === 'formatted'));
    els.tabRaw.classList.toggle('active', tab === 'raw');
    els.tabRaw.setAttribute('aria-selected', String(tab === 'raw'));
    renderJson();
  }

  async function copyJson() {
    const content = jsonContent();
    let copied = false;
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
    } catch (err) {
      try {
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (fallbackErr) {
        copied = false;
      }
    }
    els.copyBtn.textContent = copied ? 'Copied ✓' : 'Copy failed';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { els.copyBtn.textContent = 'Copy'; }, 1600);
  }

  /* ---------- data fetching ---------- */

  async function fetchWeather(city) {
    const id = ++requestSeq;
    if (controller) controller.abort();
    controller = new AbortController();
    setLoading(city);

    try {
      const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`, {
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (id !== requestSeq) return; // a newer search superseded this one

      if (!res.ok) {
        showError(friendlyError(res.status, data && data.error));
        return;
      }
      lastData = data;
      renderWeather(data);
    } catch (err) {
      if (id !== requestSeq) return;
      if (err && err.name === 'AbortError') return;
      showError('Could not reach the weather service. Check your connection and try again.');
    }
  }

  /* ---------- events & init ---------- */

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const city = els.input.value.trim();
    if (!city) {
      showError('Please enter a city name to search.');
      els.input.focus();
      return;
    }
    fetchWeather(city);
  });

  els.chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    els.input.value = chip.dataset.city;
    fetchWeather(chip.dataset.city);
  });

  els.tabFormatted.addEventListener('click', () => setActiveTab('formatted'));
  els.tabRaw.addEventListener('click', () => setActiveTab('raw'));
  els.copyBtn.addEventListener('click', copyJson);

  renderChips();
  fetchWeather(DEFAULT_CITY);
})();
