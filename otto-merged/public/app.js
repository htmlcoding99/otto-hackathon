/* ================================================
   OTTO — Autonomous Decision Engine
   app.js · Complete Frontend Logic
   ================================================ */

'use strict';

// ══════════════════════════════════════════════
// SECTION 1 — GLOBAL STATE
// ══════════════════════════════════════════════

const state = {
  running:         false,
  currentTask:     null,
  candidates:      [],
  rejected:        [],
  winner:          null,
  approvalPending: false,
  sessionLog:      JSON.parse(localStorage.getItem('otto_sessions') || '[]'),
  missionCount:    parseInt(localStorage.getItem('otto_mission_count') || '0'),
  reportData:      null,
  activeMissionId: null,
};

// ══════════════════════════════════════════════
// SECTION 2 — DECISION TWIN ENGINE
// ══════════════════════════════════════════════

const DecisionTwin = {
  defaults: {
    budgetSensitivity:  50,
    deliveryPriority:   50,
    qualityFocus:       60,
    riskTolerance:      40,
    valueOrientation:   70,
    decisionCount:      0,
    approvals:          [],
    rejections:         [],
  },

  load() {
    const raw = localStorage.getItem('otto_twin');
    return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
  },

  save(profile) {
    localStorage.setItem('otto_twin', JSON.stringify(profile));
  },

  updateFromSliders() {
    const profile = this.load();
    const wv = parseInt(document.getElementById('weight-value').value);
    const ws = parseInt(document.getElementById('weight-speed').value);
    const wq = parseInt(document.getElementById('weight-quality').value);
    profile.valueOrientation    = Math.round(wv * 10);
    profile.deliveryPriority    = Math.round(ws * 10);
    profile.qualityFocus        = Math.round(wq * 10);
    this.save(profile);
    return profile;
  },

  updateFromApproval(winner, all) {
    const profile = this.load();
    // (decisionCount is incremented once per mission in launchOtto, not here.)
    // Winner cheaper than avg → budget sensitive
    const avgPrice = all.reduce((s, c) => s + c.price, 0) / all.length;
    if (winner.price < avgPrice) {
      profile.budgetSensitivity = Math.min(100, profile.budgetSensitivity + 8);
    } else {
      profile.budgetSensitivity = Math.max(0, profile.budgetSensitivity - 5);
    }
    // Winner fast delivery
    if (winner.deliveryDays <= 2) {
      profile.deliveryPriority = Math.min(100, profile.deliveryPriority + 5);
    }
    // Winner high rating
    if (winner.rating >= 4.7) {
      profile.qualityFocus = Math.min(100, profile.qualityFocus + 6);
    }
    profile.approvals.push({ name: winner.name, price: winner.price, ts: Date.now() });
    if (profile.approvals.length > 10) profile.approvals = profile.approvals.slice(-10);
    this.save(profile);
    return profile;
  },

  getInsight(profile) {
    const b = profile.budgetSensitivity;
    const d = profile.deliveryPriority;
    const q = profile.qualityFocus;
    if (b > 70 && d > 60) return 'You prioritize value and speed over premium quality.';
    if (q > 75 && b < 50) return 'You favor premium quality over cost savings.';
    if (d > 75) return 'Fast delivery is your top constraint.';
    if (b > 75) return 'You are highly budget-conscious and value-driven.';
    return 'You balance value, quality, and delivery evenly.';
  },

  render(profile, prev) {
    const isEmpty = document.querySelector('.twin-empty');
    const twinProfile = document.getElementById('twin-profile');
    if (profile.decisionCount === 0 && !profile._forced) return;

    if (isEmpty) isEmpty.style.display = 'none';
    twinProfile.style.display = 'flex';

    // set(scoreId, barId, deltaId, value, prevValue) — fills the bar/score and,
    // when a previous value is supplied, shows the ▲/▼ change from last run.
    const set = (scoreId, barId, deltaId, val, prevVal) => {
      val = Math.round(val);
      document.getElementById(scoreId).textContent = val;
      setTimeout(() => { document.getElementById(barId).style.width = val + '%'; }, 100);

      const dEl = document.getElementById(deltaId);
      if (!dEl) return;
      if (prevVal != null && Math.round(prevVal) !== val) {
        const diff = val - Math.round(prevVal);
        dEl.textContent = (diff > 0 ? '▲' : '▼') + Math.abs(diff);
        dEl.className = 'twin-delta show ' + (diff > 0 ? 'up' : 'down');
      } else {
        dEl.textContent = '';
        dEl.className = 'twin-delta';
      }
    };

    const p = prev || null;
    set('ts-budget',   'tb-budget',   'td-budget',   profile.budgetSensitivity, p && p.budgetSensitivity);
    set('ts-delivery', 'tb-delivery', 'td-delivery', profile.deliveryPriority,  p && p.deliveryPriority);
    set('ts-quality',  'tb-quality',  'td-quality',  profile.qualityFocus,      p && p.qualityFocus);
    set('ts-value',    'tb-value',    'td-value',    profile.valueOrientation,  p && p.valueOrientation);
    set('ts-risk',     'tb-risk',     'td-risk',     profile.riskTolerance,     p && p.riskTolerance);

    const count = document.getElementById('twin-count');
    if (count) {
      const n = profile.decisionCount || 0;
      count.style.display = '';
      count.textContent = n + (n === 1 ? ' search learned' : ' searches learned');
    }

    const note = document.getElementById('twin-note');
    note.textContent = this.getInsight(profile);

    this.renderStats(profile);

    const dot = document.getElementById('twin-dot');
    if (dot) dot.classList.add('active');
  },

  // Real, concrete stats from saved mission history — makes the learning feel
  // earned rather than decorative.
  renderStats(profile) {
    const el = document.getElementById('twin-stats');
    if (!el) return;

    const all = loadMissions();
    const missions = all.length;
    if (!missions) { el.innerHTML = ''; return; }

    const purchased    = all.filter(m => m.purchased).length;
    const approvalRate = Math.round((purchased / missions) * 100);
    const priced       = all.filter(m => m.winner && typeof m.winner.price === 'number');
    const avgSpend     = priced.length ? priced.reduce((s, m) => s + m.winner.price, 0) / priced.length : 0;

    const tags = [];
    if (profile.budgetSensitivity > 60) tags.push('budget-conscious');
    if (profile.deliveryPriority  > 60) tags.push('fast-delivery');
    if (profile.qualityFocus      > 65) tags.push('quality-focused');
    if (!tags.length) tags.push('balanced');

    el.innerHTML = `
      <div class="twin-stat-grid">
        <div class="twin-stat"><span class="twin-stat-num">${missions}</span><span class="twin-stat-lbl">missions</span></div>
        <div class="twin-stat"><span class="twin-stat-num">${approvalRate}%</span><span class="twin-stat-lbl">approved</span></div>
        <div class="twin-stat"><span class="twin-stat-num">$${avgSpend.toFixed(0)}</span><span class="twin-stat-lbl">avg spend</span></div>
      </div>
      <div class="twin-tags">${tags.map(t => `<span class="twin-tag">${t}</span>`).join('')}</div>`;
  },
};

// ══════════════════════════════════════════════
// SECTION 3 — CANDIDATE DATABASES (MOCK DATA)
// ══════════════════════════════════════════════

const CANDIDATE_DB = {
  matcha: [
    { name: 'Jade Leaf Matcha Gift Set',    price: 42.95, rating: 4.8, deliveryDays: 2, reviews: 2847, url: '#', description: 'Ceremonial grade matcha with hand-carved bamboo whisk and chawan bowl. Organic, stone-ground.', features: ['Ceremonial grade', 'Bamboo whisk', 'Gift box', '2-day Prime'], badges: ['top','fast','eco'] },
    { name: 'Ippodo Tea Matcha Starter',    price: 55.00, rating: 4.9, deliveryDays: 3, reviews: 1203, url: '#', description: 'Premium Japanese matcha from 300-year-old Kyoto tea house. Includes whisking bowl.', features: ['300-yr heritage', 'Kyoto origin', 'Premium gift wrap'], badges: ['premium','top'] },
    { name: 'DoMatcha Organic Starter Set', price: 38.50, rating: 4.6, deliveryDays: 4, reviews: 3912, url: '#', description: 'USDA organic ceremonial matcha starter kit with electric whisk.', features: ['USDA Organic', 'Electric frother', 'Beginner-friendly'], badges: ['eco','value'] },
    { name: 'Naoki Matcha Silver Grade',    price: 29.99, rating: 4.5, deliveryDays: 3, reviews: 5421, url: '#', description: 'Best-selling culinary to ceremonial grade matcha. Great everyday value.', features: ['Silver grade', 'Resealable tin', 'Best seller'], badges: ['value'] },
    { name: 'Encha Organic Latte Grade',    price: 35.00, rating: 4.7, deliveryDays: 2, reviews: 2108, url: '#', description: 'Smooth latte-grade matcha perfect for oat milk lattes. No bitterness.', features: ['Latte grade', 'No bitterness', 'Organic'], badges: ['fast','eco'] },
    { name: 'AIYA Matcha Ceremony Set',     price: 58.00, rating: 4.8, deliveryDays: 5, reviews: 789,  url: '#', description: 'Complete tea ceremony set with authentic chawan, chasen, and chashaku.', features: ['Full ceremony set', 'Authentic chawan', 'Premium packaging'], badges: ['premium'] },
    { name: 'Pique Sun Goddess Matcha',     price: 48.00, rating: 4.6, deliveryDays: 3, reviews: 4231, url: '#', description: 'Quadruple-screened, pesticide-free matcha. Dissolves instantly.', features: ['Quadruple screened', 'Pesticide-free', 'Instant dissolve'], badges: ['eco'] },
    { name: 'Tenzo Matcha Social Pack',     price: 32.00, rating: 4.5, deliveryDays: 2, reviews: 6700, url: '#', description: 'Vibrant-green daily matcha. Great for baking and lattes.', features: ['Vibrant color', 'Multi-use', 'Resealable bag'], badges: ['value','fast'] },
  ],
  skincare: [
    { name: 'Tatcha The Dewy Skin Set',     price: 75.00, rating: 4.9, deliveryDays: 2, reviews: 3201, url: '#', description: 'Iconic Japanese skincare ritual set. Includes rice enzyme powder and dewy moisturizer.', features: ['Japanese ritual', 'Rice enzymes', 'Premium gift set'], badges: ['top','premium'] },
    { name: 'Glow Recipe Watermelon Kit',   price: 52.00, rating: 4.7, deliveryDays: 2, reviews: 5892, url: '#', description: 'Hydrating watermelon skincare set. Cleanser, toner, and sleeping mask.', features: ['Watermelon extract', 'Hydrating', 'Vegan & cruelty-free'], badges: ['top','eco','fast'] },
    { name: 'CeraVe Moisturizing Bundle',   price: 28.99, rating: 4.8, deliveryDays: 1, reviews: 42000, url: '#', description: 'Dermatologist-recommended bundle. Cleanser + moisturizer for all skin types.', features: ['Derm-recommended', 'Fragrance-free', 'All skin types'], badges: ['value','fast'] },
    { name: 'The Ordinary Regimen Set',     price: 31.50, rating: 4.6, deliveryDays: 3, reviews: 8930, url: '#', description: 'Science-backed serum set: Niacinamide, Hyaluronic Acid, AHA/BHA peel.', features: ['Science-backed', 'High-efficiency actives', 'Cruelty-free'], badges: ['value','eco'] },
    { name: 'Drunk Elephant Littles Set',   price: 68.00, rating: 4.8, deliveryDays: 2, reviews: 7211, url: '#', description: 'Travel-size fan favorites. T.L.C. Framboos, B-Hydra, Lala Retro.', features: ['Fan favorites', 'Travel size', 'Biocompatible'], badges: ['top','fast'] },
    { name: 'Paula\'s Choice Starter Kit',  price: 45.00, rating: 4.7, deliveryDays: 4, reviews: 3401, url: '#', description: 'Complete anti-aging routine: BHA exfoliant, moisturizer, SPF 50.', features: ['Anti-aging', 'BHA exfoliant', 'SPF included'], badges: ['premium'] },
    { name: 'Youth To The People Set',      price: 55.00, rating: 4.6, deliveryDays: 3, reviews: 2100, url: '#', description: 'Superfood skincare set. Cleanser + Adaptogen eye cream. Vegan.', features: ['Superfood formula', 'Vegan', 'Sustainable packaging'], badges: ['eco'] },
    { name: 'Kiehl\'s Ultra Facial Kit',    price: 62.00, rating: 4.7, deliveryDays: 2, reviews: 4800, url: '#', description: 'Legendary Ultra Facial moisturizer set with toner and eye cream.', features: ['Legacy formula', 'Intense hydration', 'Dermatologist-tested'], badges: ['premium','fast'] },
  ],
  coffee: [
    { name: 'Fellow Stagg EKG Kettle',      price: 165.00, rating: 4.8, deliveryDays: 2, reviews: 8921, url: '#', description: 'Variable temperature gooseneck kettle. 0.9L, built-in timer. The barista\'s choice.', features: ['Variable temp', 'Gooseneck', 'Built-in timer', 'Matte black'], badges: ['top','premium','fast'] },
    { name: 'Hario V60 Starter Kit',        price: 52.00, rating: 4.8, deliveryDays: 3, reviews: 12300, url: '#', description: 'Iconic pour-over dripper with server and filters. Everything to brew your first V60.', features: ['V60 dripper', '600ml server', '40 filters'], badges: ['top','value'] },
    { name: 'AeroPress Go Travel Kit',      price: 38.00, rating: 4.9, deliveryDays: 2, reviews: 18700, url: '#', description: 'Compact AeroPress with travel mug. 1-3 cup capacity. Unbreakable.', features: ['Travel-ready', 'Unbreakable', 'Fast brew', '80+ recipes'], badges: ['value','fast'] },
    { name: 'Baratza Encore Grinder',       price: 169.00, rating: 4.7, deliveryDays: 3, reviews: 6201, url: '#', description: 'Entry-level burr grinder with 40 grind settings. Recommended by professionals.', features: ['40 grind settings', 'Conical burr', 'Professional-grade'], badges: ['premium'] },
    { name: 'Chemex 6-Cup Classic Set',     price: 58.00, rating: 4.7, deliveryDays: 4, reviews: 9800, url: '#', description: 'Iconic hourglass coffee maker with bonded filters. Museum-quality design.', features: ['Museum design', 'Bonded filters', '6-cup capacity'], badges: ['premium'] },
    { name: 'OXO Brew Pour-Over Kit',       price: 41.00, rating: 4.6, deliveryDays: 2, reviews: 7300, url: '#', description: 'Beginner-friendly pour-over with built-in drip timer and glass carafe.', features: ['Beginner-friendly', 'Drip timer', 'Glass carafe'], badges: ['value','fast'] },
    { name: 'Timemore C2 Hand Grinder',     price: 69.00, rating: 4.8, deliveryDays: 4, reviews: 4200, url: '#', description: 'High-precision manual grinder with stainless conical burr. Silent.', features: ['Precision burr', 'Silent', 'Travel-friendly'], badges: ['top'] },
    { name: 'Blue Bottle Coffee Sampler',   price: 45.00, rating: 4.7, deliveryDays: 3, reviews: 3100, url: '#', description: '4-bag sampler of award-winning single-origin coffees. Freshly roasted.', features: ['4 origins', 'Freshly roasted', 'Award-winning'], badges: ['eco'] },
  ],
  book: [
    { name: 'Bird by Bird — Anne Lamott',   price: 14.99, rating: 4.9, deliveryDays: 2, reviews: 32100, url: '#', description: 'The definitive book on writing and life. A gift every writer needs.', features: ['Paperback', 'Cult classic', 'Timeless advice'], badges: ['top','value'] },
    { name: 'Leuchtturm A5 Dotted Journal', price: 23.95, rating: 4.8, deliveryDays: 2, reviews: 18400, url: '#', description: 'Premium German notebook. 249 pages, dotted, ribbon bookmark, numbered pages.', features: ['249 pages', 'Acid-free', 'Ribbon bookmark', 'Numbered'], badges: ['top','fast'] },
    { name: 'Story: Robert McKee',          price: 18.95, rating: 4.8, deliveryDays: 3, reviews: 8900, url: '#', description: 'Master screenplay and storytelling principles used by Hollywood writers.', features: ['Screenwriting', 'Hollywood-tested', 'Gold standard'], badges: ['top'] },
    { name: 'Moleskine Classic + Pen Set',  price: 34.95, rating: 4.7, deliveryDays: 2, reviews: 5400, url: '#', description: 'Iconic Moleskine hard cover + Moleskine rollerball pen gift bundle.', features: ['Hard cover', 'Includes pen', 'Gift-ready'], badges: ['premium','fast'] },
    { name: 'On Writing — Stephen King',    price: 13.99, rating: 4.9, deliveryDays: 1, reviews: 41200, url: '#', description: 'Part memoir, part masterclass on the craft of writing.', features: ['Memoir + craft', 'Easy read', 'Mass market paperback'], badges: ['value','fast'] },
    { name: 'Big Magic — Elizabeth Gilbert', price: 15.00, rating: 4.8, deliveryDays: 2, reviews: 22400, url: '#', description: 'Creative living beyond fear. For artists, writers, and anyone who creates.', features: ['Creativity', 'Inspirational', 'Easy read'], badges: ['top','fast'] },
    { name: 'A5 Writing Bundle — 3-Pack',   price: 29.99, rating: 4.6, deliveryDays: 3, reviews: 3200, url: '#', description: '3 notebooks: dot grid, lined, and blank. Great daily writing habit starter.', features: ['3 notebooks', 'Mixed styles', 'Elastic band'], badges: ['value'] },
    { name: 'The Elements of Style',        price: 10.99, rating: 4.8, deliveryDays: 1, reviews: 58000, url: '#', description: 'The essential writing reference by Strunk & White. Every writer owns this.', features: ['Classic reference', 'Concise', 'Timeless'], badges: ['value','fast'] },
  ],
  headphones: [
    { name: 'Sony WH-1000XM5',             price: 279.99, rating: 4.8, deliveryDays: 2, reviews: 42000, url: '#', description: 'Industry-leading noise cancellation. 30hr battery. Best-in-class ANC.', features: ['Best ANC', '30hr battery', 'LDAC', 'Multipoint'], badges: ['top','fast'] },
    { name: 'Bose QuietComfort 45',         price: 229.00, rating: 4.7, deliveryDays: 2, reviews: 28300, url: '#', description: 'Legendary Bose ANC. More comfortable fit than Sony. 24hr battery.', features: ['Bose ANC', '24hr battery', 'Adjustable EQ'], badges: ['top','fast'] },
    { name: 'Apple AirPods Pro 2',          price: 189.99, rating: 4.7, deliveryDays: 1, reviews: 95000, url: '#', description: 'Best for iPhone users. H2 chip, adaptive transparency, MagSafe case.', features: ['H2 chip', 'Adaptive transparency', 'MagSafe', 'Apple ecosystem'], badges: ['fast','value'] },
    { name: 'Jabra Evolve2 55',             price: 179.99, rating: 4.6, deliveryDays: 3, reviews: 8200, url: '#', description: 'Professional grade. 10-mic call clarity. 50m range. Teams/Zoom certified.', features: ['10-mic array', 'Pro certified', '50m range', 'Busy light'], badges: ['premium'] },
    { name: 'Anker Soundcore Q45',          price: 79.99, rating: 4.6, deliveryDays: 2, reviews: 37100, url: '#', description: 'Best budget ANC under $100. 50hr battery, foldable, app EQ.', features: ['50hr battery', 'Budget ANC', 'Foldable', 'App EQ'], badges: ['value','fast'] },
    { name: 'Beyerdynamic DT 990 Pro',      price: 159.00, rating: 4.8, deliveryDays: 3, reviews: 14500, url: '#', description: 'Audiophile open-back studio headphones. Reference sound quality.', features: ['Open-back', 'Reference sound', 'Studio grade', '250Ω'], badges: ['premium','top'] },
    { name: 'Samsung Galaxy Buds2 Pro',     price: 149.99, rating: 4.6, deliveryDays: 2, reviews: 19300, url: '#', description: 'Hi-Fi 24-bit audio. Best for Samsung ecosystem. IPX7 waterproof.', features: ['24-bit Hi-Fi', 'IPX7', 'Samsung ecosystem', '8hr buds'], badges: ['fast','value'] },
    { name: 'Sennheiser Momentum 4',        price: 199.99, rating: 4.7, deliveryDays: 4, reviews: 6700, url: '#', description: '60-hour battery, exceptional sound signature, adaptive ANC.', features: ['60hr battery', 'Sound Master EQ', 'Adaptive ANC'], badges: ['premium'] },
  ],
  generic: [
    { name: 'Amazon Basics Option A',       price: 0, rating: 4.3, deliveryDays: 2, reviews: 8000,  url: '#', description: 'Highly rated value option with fast Prime shipping.', features: ['Fast shipping', 'Well-reviewed'], badges: ['value','fast'] },
    { name: 'Top Rated Choice',             price: 0, rating: 4.8, deliveryDays: 3, reviews: 15000, url: '#', description: 'Top-rated product in this category with excellent reviews.', features: ['Top rated', 'Best reviews'], badges: ['top'] },
    { name: 'Premium Selection',            price: 0, rating: 4.7, deliveryDays: 2, reviews: 5000,  url: '#', description: 'Premium quality product with warranty and gift packaging.', features: ['Premium quality', 'Gift packaging', 'Warranty'], badges: ['premium','fast'] },
    { name: 'Budget Value Pick',            price: 0, rating: 4.5, deliveryDays: 4, reviews: 20000, url: '#', description: 'Best value for money in this category.', features: ['Great value', 'High volume seller'], badges: ['value'] }
  ]
};

const PRESETS = {
  matcha:     { goal: 'Find a great matcha starter set for a beginner.', budget: 60, urgency: 'standard', constraints: 'eco-friendly, high quality', wv: 6, ws: 4, wq: 8 },
  skincare:   { goal: 'I need a gentle hydrating skincare set for sensitive skin.', budget: 80, urgency: 'urgent', constraints: 'cruelty-free, fragrance-free', wv: 5, ws: 7, wq: 9 },
  coffee:     { goal: 'Get a beginner pour-over coffee kit for my home office.', budget: 120, urgency: 'flexible', constraints: 'easy to use, compact', wv: 8, ws: 3, wq: 7 },
  book:       { goal: 'Get a book and journal bundle for a writer friend. Under $45.', budget: 45, urgency: 'standard', constraints: 'for writers, thoughtful gift', wv: 8, ws: 6, wq: 7 },
  headphones: { goal: 'Find the best wireless headphones for work from home under $200.', budget: 200, urgency: 'flexible', constraints: 'noise cancelling, long battery', wv: 6, ws: 4, wq: 9 },
};

// ══════════════════════════════════════════════
// SECTION 3b — BUDGET GUIDANCE
// ══════════════════════════════════════════════

// Budget guidance is backed by LIVE Exa data: we hit /api/budget/estimate to get
// the real price range for the goal, then warn if the budget is well above it.
// The live range is cached per goal+constraints so changing only the budget
// compares instantly without re-searching the web.
let _rangeCache = null;          // { key, min, max, count }
let _rangeReqToken = 0;          // guards against out-of-order responses
let _rangeDebounce = null;
let _budgetWarnDismissedFor = null;

function budgetKey() {
  const goal        = document.getElementById('goal-input').value.trim();
  const constraints = document.getElementById('constraints-input').value.trim();
  return goal.length >= 5 ? goal + '||' + constraints : null;
}

function hideBudgetWarning() {
  document.getElementById('budget-warning').style.display = 'none';
}

function checkBudgetRange() {
  const budget = parseFloat(document.getElementById('budget-input').value);
  const key    = budgetKey();

  // Need both a real goal and a positive budget before there's anything to check.
  if (!key || !budget || budget <= 0) { hideBudgetWarning(); return; }

  // Reuse the live range we already fetched for this goal; otherwise go get it.
  if (_rangeCache && _rangeCache.key === key) {
    renderBudgetWarning(_rangeCache, budget);
  } else {
    scheduleRangeFetch(key);
  }
}

function scheduleRangeFetch(key) {
  clearTimeout(_rangeDebounce);
  _rangeDebounce = setTimeout(() => fetchLiveRange(key), 700);
}

async function fetchLiveRange(key) {
  if (budgetKey() !== key) return;               // inputs changed during debounce

  const goal        = document.getElementById('goal-input').value.trim();
  const budget      = parseFloat(document.getElementById('budget-input').value);
  const constraints = document.getElementById('constraints-input').value.trim();
  if (!budget || budget <= 0) { hideBudgetWarning(); return; }

  const token = ++_rangeReqToken;
  showBudgetLoading();

  try {
    const res  = await fetch('/api/budget/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, budget, constraints }),
    });
    const data = await res.json().catch(() => ({}));
    if (token !== _rangeReqToken) return;         // a newer request superseded us
    if (!res.ok || !data.count || data.min == null) { hideBudgetWarning(); return; }

    _rangeCache = { key, min: data.min, max: data.max, count: data.count };
    renderBudgetWarning(_rangeCache, parseFloat(document.getElementById('budget-input').value));
  } catch {
    if (token === _rangeReqToken) hideBudgetWarning();
  }
}

function showBudgetLoading() {
  const card = document.getElementById('budget-warning');
  card.innerHTML = `
    <div class="bw-head">
      <span class="bw-spinner"></span>
      Checking live prices…
    </div>
    <div class="bw-msg">Searching the web for real prices to see if your budget is higher than needed.</div>`;
  card.style.display = 'block';
}

function renderBudgetWarning(range, budget) {
  const card = document.getElementById('budget-warning');
  if (!budget || budget <= 0) { card.style.display = 'none'; return; }

  const lo = Math.floor(range.min);
  const hi = Math.ceil(range.max);

  // Budget well above the priciest live option (>50% over) → gentle nudge.
  if (budget > range.max * 1.5) {
    if (_budgetWarnDismissedFor === budget) { card.style.display = 'none'; return; }
    card.classList.remove('bw-ok');
    card.innerHTML = `
      <div class="bw-head">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Budget looks high
        <button class="bw-close" onclick="dismissBudgetWarning()" aria-label="Dismiss">✕</button>
      </div>
      <div class="bw-msg">
        $${budget.toFixed(0)} is well above the live prices we found for this
        (${range.count} real result${range.count === 1 ? '' : 's'} from the web).
        You'll likely get great options for less.
      </div>
      <div class="bw-range">
        <span class="bw-range-pill">$${lo} – $${hi}</span>
        <button class="bw-apply" onclick="applyRecommendedBudget(${hi})">Use $${hi}</button>
      </div>`;
    card.style.display = 'block';
    return;
  }

  // Otherwise the budget sits in a sensible range → positive confirmation.
  card.classList.add('bw-ok');
  card.innerHTML = `
    <div class="bw-head bw-head-ok">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Budget looks good
    </div>
    <div class="bw-msg">
      We found ${range.count} real option${range.count === 1 ? '' : 's'} from the web in the
      <strong>$${lo}–$${hi}</strong> range — your budget fits nicely.
    </div>`;
  card.style.display = 'block';
}

function dismissBudgetWarning() {
  const budget = parseFloat(document.getElementById('budget-input').value);
  _budgetWarnDismissedFor = budget;
  hideBudgetWarning();
}

function applyRecommendedBudget(value) {
  const input = document.getElementById('budget-input');
  input.value = value;
  _budgetWarnDismissedFor = null;
  checkBudgetRange();
  input.focus();
}

// ══════════════════════════════════════════════
// SECTION 4 — SCORING ENGINE
// ══════════════════════════════════════════════

function scoreCandidate(c, budget, weights, profile) {
  const wv = weights.value   / 10;
  const ws = weights.speed   / 10;
  const wq = weights.quality / 10;

  // Value Score — how much budget remains
  const valueScore = Math.max(0, Math.round(((budget - c.price) / budget) * 100));

  // Delivery Score — based on delivery days
  const dMap = { 1: 100, 2: 90, 3: 75, 4: 55, 5: 35, 6: 20 };
  const deliveryScore = dMap[Math.min(c.deliveryDays, 6)] || 15;

  // Quality Score — based on rating (4.0-5.0 range)
  const qualityScore = Math.round(((c.rating - 3.5) / 1.5) * 100);

  // Savings Score — will be computed after all candidates are scored
  const savingsScore = 0; // placeholder

  // Preference Fit — based on twin profile
  let prefFit = 50;
  if (profile.budgetSensitivity > 60 && valueScore > 60) prefFit += 20;
  if (profile.deliveryPriority  > 60 && deliveryScore > 75) prefFit += 15;
  if (profile.qualityFocus      > 65 && qualityScore > 80) prefFit += 15;
  prefFit = Math.min(100, prefFit);

  // Weighted Final Score
  const totalWeight = wv + ws + wq + 1 + 0.5; // +1 quality default, +0.5 pref
  const finalScore = Math.round(
    (valueScore   * wv +
     deliveryScore * ws +
     qualityScore  * wq +
     qualityScore  * 1 +
     prefFit       * 0.5) / totalWeight
  );

  return { valueScore, deliveryScore, qualityScore, savingsScore, prefFit, finalScore };
}

function computeSavingsScores(candidates) {
  const avgPrice = candidates.reduce((s, c) => s + c.price, 0) / candidates.length;
  candidates.forEach(c => {
    const saved = Math.max(0, avgPrice - c.price);
    c.scores.savingsScore = Math.min(100, Math.round((saved / avgPrice) * 100));
  });
}

function filterAndScore(allCandidates, budget, urgency, constraints, weights, profile) {
  const rejectedList = [];
  const passed = [];
  const constraintKeywords = constraints.toLowerCase().split(/,\s*/);

  allCandidates.forEach(c => {
    if (c.price > budget) {
      rejectedList.push({ ...c, rejectedReason: `Over budget ($${c.price} > $${budget})` });
      return;
    }
    if (urgency === 'same-day' && c.deliveryDays > 1) {
      rejectedList.push({ ...c, rejectedReason: `Same-day delivery unavailable (${c.deliveryDays}-day ship)` });
      return;
    }
    if (urgency === 'urgent' && c.deliveryDays > 3) {
      rejectedList.push({ ...c, rejectedReason: `Delivery too slow for urgent (${c.deliveryDays} days)` });
      return;
    }
    if (c.rating < 4.2) {
      rejectedList.push({ ...c, rejectedReason: `Below quality threshold (${c.rating}★ < 4.2★)` });
      return;
    }
    c.scores = scoreCandidate(c, budget, weights, profile);
    passed.push(c);
  });

  computeSavingsScores(passed);

  // Re-compute final score with savings
  passed.forEach(c => {
    c.scores.finalScore = Math.round(
      (c.scores.finalScore * 0.8) + (c.scores.savingsScore * 0.2)
    );
  });

  passed.sort((a, b) => b.scores.finalScore - a.scores.finalScore);
  return { passed, rejected: rejectedList };
}

// ══════════════════════════════════════════════
// SECTION 5 — CANVAS BACKGROUND
// ══════════════════════════════════════════════

(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, dots = [], shootingStars = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeDots(n) {
    dots = [];
    for (let i = 0; i < n; i++) {
      dots.push({
        x:  Math.random() * W,
        y:  Math.random() * H,
        r:  Math.random() * 1.2 + 0.3,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        o:  Math.random() * 0.4 + 0.1,
      });
    }
  }

  // ── Shooting stars: occasional diagonal streaks with a fading tail ──
  function spawnShootingStar() {
    // Start near the top edge and travel down-right at a gentle diagonal.
    // Moderate speed: ~4–6 px/frame (not too fast, not too slow).
    const speed = 4 + Math.random() * 2;
    const angle = (18 + Math.random() * 16) * Math.PI / 180; // 18°–34° below horizontal
    shootingStars.push({
      x:    Math.random() * W * 0.6 - W * 0.1,
      y:    Math.random() * H * 0.35 - 40,
      vx:   Math.cos(angle) * speed,
      vy:   Math.sin(angle) * speed,
      len:  120 + Math.random() * 90,   // tail length
      life: 1,                          // 1 → 0, fades out near the end
    });
  }

  function drawShootingStars() {
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const s = shootingStars[i];
      s.x += s.vx;
      s.y += s.vy;
      if (s.x > W + 60 || s.y > H + 60) s.life -= 0.04;

      const mag   = Math.hypot(s.vx, s.vy) || 1;
      const tailX = s.x - (s.vx / mag) * s.len;
      const tailY = s.y - (s.vy / mag) * s.len;
      const grad  = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255,255,255,${0.85 * s.life})`);
      grad.addColorStop(0.4, `rgba(192,132,252,${0.35 * s.life})`);
      grad.addColorStop(1, 'rgba(56,189,248,0)');

      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tailX, tailY);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * s.life})`;
      ctx.fill();

      if (s.life <= 0) shootingStars.splice(i, 1);
    }

    // Occasionally launch a new one (roughly one every ~3–4s at 60fps)
    if (shootingStars.length < 3 && Math.random() < 0.006) spawnShootingStar();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    dots.forEach(d => {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) d.x = W; if (d.x > W) d.x = 0;
      if (d.y < 0) d.y = H; if (d.y > H) d.y = 0;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(192,132,252,${d.o})`;
      ctx.fill();
    });

    // Draw connections
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const dx = dots[i].x - dots[j].x;
        const dy = dots[i].y - dots[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.strokeStyle = `rgba(56,189,248,${0.04 * (1 - dist/100)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    drawShootingStars();

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); makeDots(60); });
  resize();
  makeDots(60);
  draw();
})();

// ══════════════════════════════════════════════
// SECTION 6 — FEED / ACTIVITY UTILITIES
// ══════════════════════════════════════════════

function showFeed() {
  document.getElementById('welcome-state').style.display = 'none';
  document.getElementById('feed-wrap').style.display     = 'flex';
}

function resetFeed() {
  document.getElementById('feed-messages').innerHTML = '';
  document.getElementById('welcome-state').style.display = '';
  document.getElementById('feed-wrap').style.display     = 'none';
  document.getElementById('decision-panel').style.display = 'none';
  document.getElementById('rerank-section').style.display = 'none';
  document.getElementById('scoreboard-section').style.display = 'none';
  document.getElementById('savings-section').style.display = 'none';
}

function setActivity(text, running = true) {
  const idle    = document.getElementById('activity-idle');
  const running_ = document.getElementById('activity-running');
  const actText = document.getElementById('activity-text');
  if (running) {
    idle.style.display    = 'none';
    running_.style.display = 'flex';
    actText.textContent   = text;
  } else {
    idle.style.display    = '';
    running_.style.display = 'none';
  }
}

function setStatus(state_) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.className = 'status-dot';
  if (state_ === 'thinking') { dot.classList.add('thinking'); text.textContent = 'Thinking'; }
  else if (state_ === 'error') { dot.classList.add('error'); text.textContent = 'Error'; }
  else { text.textContent = 'Ready'; }
}

// ── Custom slow/smooth auto-scroll ──────────────────────────────────────────
// The browser's native smooth scroll is fast and abrupt; this animates the real
// scroll container (feed-wrap on desktop, the window on mobile) over a longer
// duration with easing so the feed glides instead of jumping.

// Find the nearest actually-scrollable ancestor; null means the window scrolls.
function getScrollParent(el) {
  let p = el && el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    p = p.parentElement;
  }
  return null;
}

function _animateScroll(scroller, dest, duration) {
  const isWin = scroller === window;
  const start = isWin ? window.pageYOffset : scroller.scrollTop;
  const max = isWin
    ? document.documentElement.scrollHeight - window.innerHeight
    : scroller.scrollHeight - scroller.clientHeight;
  const target = Math.max(0, Math.min(dest, max));
  const dist = target - start;
  if (Math.abs(dist) < 2) return;

  const t0 = performance.now();
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2); // easeInOutQuad
  (function step(now) {
    const p = Math.min(1, (now - t0) / duration);
    const y = start + dist * ease(p);
    if (isWin) window.scrollTo(0, y); else scroller.scrollTop = y;
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}

// block: 'end' → bring el's bottom into view; 'start' → align el to the top.
function smoothScrollToEl(el, block = 'end', duration = 900) {
  if (!el) return;
  const parent = getScrollParent(el);
  const isWin = !parent;
  const elRect = el.getBoundingClientRect();
  const parTop = isWin ? 0 : parent.getBoundingClientRect().top;
  const parH = isWin ? window.innerHeight : parent.clientHeight;
  const cur = isWin ? window.pageYOffset : parent.scrollTop;
  const delta = block === 'start'
    ? (elRect.top - parTop) - 14
    : (elRect.bottom - (parTop + parH)) + 18;
  _animateScroll(isWin ? window : parent, cur + delta, duration);
}

function scrollFeedBottom() {
  smoothScrollToEl(document.getElementById('feed-bottom'), 'end', 850);
}

// Once results are in, rest the view on the #1 ranked product (top of the
// options card) instead of scrolling past everything to the approval gate.
function scrollToTopPick() {
  const card = document.getElementById('options-card');
  if (card) smoothScrollToEl(card, 'start', 1000);
  else scrollFeedBottom();
}

// Visual differentiator between consecutive requests in the same feed — each
// new launch drops a "NEW REQUEST" separator showing the goal, so stacked
// missions read as distinct conversations.
function addMissionSeparator(goal, budget) {
  const container = document.getElementById('feed-messages');
  const div = document.createElement('div');
  div.className = 'mission-sep';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `
    <div class="mission-sep-card">
      <span class="mission-sep-badge">NEW REQUEST</span>
      <div class="mission-sep-goal">${escapeHtml(goal)}</div>
      <div class="mission-sep-meta">Budget $${Number(budget).toFixed(0)} · ${time}</div>
    </div>`;
  container.appendChild(div);
  scrollFeedBottom();
}

function addMsg(type, who, avatarClass, content) {
  const container = document.getElementById('feed-messages');
  const div = document.createElement('div');
  div.className = `msg msg-${type}`;

  const initials = { otto: 'O', system: '⚡', success: '✓', warning: '!' };
  const ini = initials[avatarClass] || 'O';

  div.innerHTML = `
    <div class="msg-avatar av-${avatarClass}">${ini}</div>
    <div class="msg-inner">
      <div class="msg-who">${who}</div>
      <div class="msg-bubble">${content}</div>
    </div>`;
  container.appendChild(div);
  scrollFeedBottom();
  return div;
}

function addThinking(text) {
  const container = document.getElementById('feed-messages');
  const div = document.createElement('div');
  div.className = 'msg msg-thinking';
  div.innerHTML = `
    <div class="msg-avatar av-otto">O</div>
    <div class="msg-inner">
      <div class="msg-who">OTTO</div>
      <div class="msg-bubble">
        <div class="t-dots"><span></span><span></span><span></span></div>
        <span>${text}</span>
      </div>
    </div>`;
  container.appendChild(div);
  scrollFeedBottom();
  return div;
}

function addStep(text) {
  const container = document.getElementById('feed-messages');
  const div = document.createElement('div');
  div.className = 'msg msg-step';
  div.innerHTML = `
    <div class="msg-avatar av-system">⚡</div>
    <div class="msg-inner">
      <div class="msg-who">SYSTEM</div>
      <div class="msg-bubble">
        <div class="step-icon-wrap">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="step-txt">${text}</div>
      </div>
    </div>`;
  container.appendChild(div);
  scrollFeedBottom();
  return div;
}

function addDivider(label) {
  const container = document.getElementById('feed-messages');
  const div = document.createElement('div');
  div.className = 'feed-divider';
  div.innerHTML = `<div class="fd-line"></div><div class="fd-label">${label}</div><div class="fd-line"></div>`;
  container.appendChild(div);
}

function removeEl(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ══════════════════════════════════════════════
// SECTION 7 — RENDERING
// ══════════════════════════════════════════════

// Glass-box: turn each 0–100 score into a plain-English reason from the
// underlying facts (price vs budget, delivery, rating, savings vs average).
function explainScores(c, budget) {
  const price  = c.price || 0;
  const remain = Math.max(0, budget - price);
  const pct    = budget > 0 ? Math.round((remain / budget) * 100) : 0;

  const value = budget > 0
    ? `$${price.toFixed(2)} — leaves $${remain.toFixed(2)} (${pct}%) of your $${budget.toFixed(0)} budget`
    : `Priced at $${price.toFixed(2)}`;
  const speed = c.deliveryDays <= 1 ? 'Arrives same day'
    : c.deliveryDays <= 2 ? 'Fast 2-day delivery'
    : `${c.deliveryDays}-day delivery`;
  const quality = `${c.rating}★ across ${Number(c.reviews || 0).toLocaleString()} reviews`;
  const savings = (c._avgSaved && c._avgSaved > 0)
    ? `$${c._avgSaved.toFixed(2)} cheaper than the average option`
    : 'Priced around the category average';

  return { value, speed, quality, savings };
}

function renderCandidateCard(c, rank, total) {
  const rankLabel = rank === 1 ? '#1' : rank === 2 ? '#2' : rank === 3 ? '#3' : `#${rank}`;
  const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
  const isTop = rank === 1;
  const badgeHTML = (c.badges || []).map(b => {
    const map = { top: ['badge-top','⭐ Top Pick'], fast: ['badge-fast','⚡ Fast Ship'], value: ['badge-value','💰 Best Value'], premium: ['badge-premium','👑 Premium'], eco: ['badge-eco','🌿 Eco'] };
    const [cls, label] = map[b] || ['badge-value', b];
    return `<span class="badge ${cls}">${label}</span>`;
  }).join('');

  const deliveryStr = c.deliveryDays <= 1 ? 'Same day' : c.deliveryDays <= 2 ? '2-day delivery' : `${c.deliveryDays}-day delivery`;
  const reviewStr   = c.reviews.toLocaleString() + ' reviews';
  const { valueScore, deliveryScore, qualityScore, savingsScore, prefFit, finalScore } = c.scores;

  const avgSaved = c._avgSaved !== undefined ? `Saves $${c._avgSaved.toFixed(2)} vs avg` : '';

  // Plain-English reason behind each score (tooltip + expandable breakdown).
  const budget = (state.currentTask && state.currentTask.budget) || (c.price + (c._avgSaved || 0));
  const why = explainScores(c, budget);

  // Real product link (Exa results have a real URL; mock/preset data uses '#').
  const hasUrl = c.url && c.url !== '#';

  // The #1 pick shows its image as a full-width banner; the rest use a small
  // thumbnail beside the name.
  const banner = (isTop && c.image)
    ? `<img class="opt-banner" src="${escapeHtml(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="imgFallback(this)">`
    : '';
  const thumb = banner
    ? ''                                  // banner replaces the inline thumb
    : c.image
      ? `<img class="opt-thumb" src="${escapeHtml(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="imgFallback(this)">`
      : `<div class="opt-thumb opt-thumb-ph">🛍️</div>`;
  const nameHTML = hasUrl
    ? `<a class="opt-name opt-name-link" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${c.name}</a>`
    : `<div class="opt-name">${c.name}</div>`;
  const viewLink = hasUrl
    ? `<a class="opt-link" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">View product
         <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 17 17 7M9 7h8v8"/></svg>
       </a>`
    : '';

  return `
    <div class="opt-item ${isTop ? 'top-pick' : ''}">
      ${banner}
      <div class="opt-row1">
        <span class="opt-rank ${rankClass}">${rankLabel}</span>
        ${thumb}
        <div style="flex:1;min-width:0">
          ${nameHTML}
          <div class="opt-badges" style="margin-top:4px">${badgeHTML}</div>
        </div>
        <span class="opt-price">$${c.price.toFixed(2)}</span>
      </div>
      <div class="opt-why">${c.description}</div>
      <div class="opt-tradeoff">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ${deliveryStr} · ${c.rating}★ · ${reviewStr}${avgSaved ? ' · ' + avgSaved : ''}
      </div>
      <div class="opt-scores">
        <div class="score-chip" title="${escapeHtml(why.value)}"><span class="score-chip-label">Value</span><span class="score-chip-val">${valueScore}</span></div>
        <div class="score-chip" title="${escapeHtml(why.speed)}"><span class="score-chip-label">Speed</span><span class="score-chip-val">${deliveryScore}</span></div>
        <div class="score-chip" title="${escapeHtml(why.quality)}"><span class="score-chip-label">Quality</span><span class="score-chip-val">${qualityScore}</span></div>
        <div class="score-chip" title="${escapeHtml(why.savings)}"><span class="score-chip-label">Savings</span><span class="score-chip-val">${savingsScore}</span></div>
      </div>
      <details class="opt-explain">
        <summary>Why these scores?</summary>
        <ul>
          <li><strong>Value ${valueScore}</strong> — ${escapeHtml(why.value)}</li>
          <li><strong>Speed ${deliveryScore}</strong> — ${escapeHtml(why.speed)}</li>
          <li><strong>Quality ${qualityScore}</strong> — ${escapeHtml(why.quality)}</li>
          <li><strong>Savings ${savingsScore}</strong> — ${escapeHtml(why.savings)}</li>
        </ul>
      </details>
      <div class="opt-final-score" style="margin-top:6px">
        Final Score: <span class="fscore">${finalScore}</span>
      </div>
      <div class="opt-actions">
        <button class="opt-buy" onclick="buyCandidate('${c.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          Authorise &amp; Pay · $${c.price.toFixed(2)}
        </button>
        ${viewLink}
      </div>
    </div>`;
}

// Let the user pick ANY product to buy (not just OTTO's #1). Sets it as the
// chosen winner and jumps straight to secure checkout.
function buyCandidate(id) {
  const c = (state.candidates || []).find(x => x.id === id);
  if (!c) return;
  state.winner = c;
  state.approvalPending = true;
  handleApproveInline();
}

// Swap a broken product image for the placeholder tile (Exa thumbnails can
// 404 or be hotlink-blocked; we never want a broken-image icon in the card).
function imgFallback(img) {
  const isBanner = img && img.classList && img.classList.contains('opt-banner');
  const ph = document.createElement('div');
  ph.className = (isBanner ? 'opt-banner' : 'opt-thumb') + ' opt-thumb-ph';
  ph.textContent = '🛍️';
  if (img && img.replaceWith) img.replaceWith(ph);
}
window.imgFallback = imgFallback;

function renderOptionsCard(candidates) {
  const container = document.getElementById('feed-messages');

  // Each mission appends its own ranked card. The #options-card id marks the
  // *current* mission's card (used by scrollToTopPick + rerank), so hand it off
  // from any previous mission's card to this new one — otherwise getElementById
  // keeps returning the first/oldest card and we scroll to the wrong product.
  const prev = document.getElementById('options-card');
  if (prev) prev.removeAttribute('id');

  const card = document.createElement('div');
  card.className = 'options-card';
  card.id = 'options-card';

  // Compute average for savings display
  const avgPrice = candidates.reduce((s, c) => s + c.price, 0) / candidates.length;
  candidates.forEach(c => {
    c._avgSaved = Math.max(0, avgPrice - c.price);
  });

  card.innerHTML = `
    <div class="options-card-header">
      <span>Ranked Candidates</span>
      <span class="options-count">${candidates.length} options</span>
    </div>
    ${candidates.map((c, i) => renderCandidateCard(c, i + 1, candidates.length)).join('')}`;
  container.appendChild(card);
  scrollFeedBottom();
}

// SVG radar/spider chart comparing the top 3 candidates across the four score
// axes. One picture tells the whole scoring story better than a table.
function renderRadarChart(candidates) {
  const top = (candidates || []).slice(0, 3);
  if (!top.length) return;

  const axes = [
    { key: 'valueScore',    label: 'Value' },
    { key: 'deliveryScore', label: 'Speed' },
    { key: 'qualityScore',  label: 'Quality' },
    { key: 'savingsScore',  label: 'Savings' },
  ];
  const colors = ['#c084fc', '#38bdf8', '#34d399'];

  const size = 260, cx = size / 2, cy = size / 2, R = 90, N = axes.length;
  const ang   = (i) => (-90 + i * (360 / N)) * Math.PI / 180;
  const pt    = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
  const polyPts = (r, valFn) =>
    axes.map((a, i) => pt(i, r * valFn(a, i)).map((n) => n.toFixed(1)).join(',')).join(' ');

  // Concentric grid rings + spokes + axis labels
  let grid = '';
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    grid += `<polygon points="${polyPts(R * f, () => 1)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  });
  let spokes = '', labels = '';
  axes.forEach((a, i) => {
    const [x, y] = pt(i, R);
    spokes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.08)"/>`;
    const [lx, ly] = pt(i, R + 16);
    const anchor = Math.abs(lx - cx) < 1 ? 'middle' : lx > cx ? 'start' : 'end';
    labels += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" fill="var(--t3)" font-size="10" text-anchor="${anchor}">${a.label}</text>`;
  });

  // One translucent polygon per candidate, plus vertex dots
  let shapes = '';
  top.forEach((c, idx) => {
    const col = colors[idx];
    const val = (a) => Math.max(0, Math.min(100, (c.scores && c.scores[a.key]) || 0)) / 100;
    shapes += `<polygon points="${polyPts(R, val)}" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="2"/>`;
    axes.forEach((a, i) => {
      const [x, y] = pt(i, R * val(a));
      shapes += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${col}"/>`;
    });
  });

  const legend = top
    .map((c, idx) => {
      const name = c.name.length > 34 ? c.name.slice(0, 33) + '…' : c.name;
      return `<div class="radar-legend-item"><span class="radar-dot" style="background:${colors[idx]}"></span>${escapeHtml(name)}</div>`;
    })
    .join('');

  const card = document.createElement('div');
  card.className = 'radar-card';
  card.innerHTML = `
    <div class="radar-head">Top ${top.length} compared · Value · Speed · Quality · Savings</div>
    <div class="radar-body">
      <svg viewBox="0 0 ${size} ${size}" class="radar-svg" role="img" aria-label="Radar comparison of top candidates">
        ${grid}${spokes}${labels}${shapes}
      </svg>
      <div class="radar-legend">${legend}</div>
    </div>`;
  document.getElementById('feed-messages').appendChild(card);
  scrollFeedBottom();
}

function renderRejectedSection(rejected) {
  if (!rejected.length) return;
  const container = document.getElementById('feed-messages');
  const div = document.createElement('div');
  div.className = 'msg msg-step';
  const items = rejected.map(r =>
    `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
       <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
       <span style="flex:1;font-size:11px;color:var(--t2)">${r.name}</span>
       <span style="font-size:10px;color:var(--rose)">${r.rejectedReason}</span>
     </div>`
  ).join('');
  div.innerHTML = `
    <div class="msg-avatar av-warning">!</div>
    <div class="msg-inner">
      <div class="msg-who">CONSTRAINT ANALYSIS</div>
      <div class="msg-bubble">
        <div class="step-icon-wrap" style="background:rgba(251,191,36,0.12);color:var(--amber)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="step-txt">
          <strong style="color:var(--amber)">${rejected.length} candidates eliminated:</strong>
          <div style="margin-top:6px">${items}</div>
        </div>
      </div>
    </div>`;
  container.appendChild(div);
  scrollFeedBottom();
}

function renderDecisionBoard(candidates) {
  const panel = document.getElementById('decision-panel');
  panel.style.display = 'flex';

  document.getElementById('rerank-section').style.display = 'flex';
  document.getElementById('scoreboard-section').style.display = 'flex';

  const board = document.getElementById('scoreboard');
  board.innerHTML = candidates.map((c, i) => {
    const rankClass = ['r1','r2','r3'][i] || '';
    const rankLabel = ['#1','#2','#3'][i] || `#${i+1}`;
    const isWinner = i === 0;
    const { valueScore, deliveryScore, qualityScore, savingsScore, prefFit, finalScore } = c.scores;

    return `
      <div class="sb-card ${isWinner ? 'sb-winner' : ''}">
        <div class="sb-row1">
          <span class="sb-rank ${rankClass}">${rankLabel}</span>
          <span class="sb-name" title="${c.name}">${c.name}</span>
          <span class="sb-total">${finalScore}</span>
        </div>
        <div class="sb-bars">
          <div class="sb-bar-row"><span class="sb-bar-label">Value</span><div class="sb-bar-track"><div class="sb-bar-fill fill-value" style="width:0%" data-w="${valueScore}"></div></div><span class="sb-bar-num">${valueScore}</span></div>
          <div class="sb-bar-row"><span class="sb-bar-label">Speed</span><div class="sb-bar-track"><div class="sb-bar-fill fill-speed" style="width:0%" data-w="${deliveryScore}"></div></div><span class="sb-bar-num">${deliveryScore}</span></div>
          <div class="sb-bar-row"><span class="sb-bar-label">Quality</span><div class="sb-bar-track"><div class="sb-bar-fill fill-quality" style="width:0%" data-w="${qualityScore}"></div></div><span class="sb-bar-num">${qualityScore}</span></div>
          <div class="sb-bar-row"><span class="sb-bar-label">Pref Fit</span><div class="sb-bar-track"><div class="sb-bar-fill fill-pref" style="width:0%" data-w="${prefFit}"></div></div><span class="sb-bar-num">${prefFit}</span></div>
        </div>
        <div class="sb-price">$${c.price.toFixed(2)}</div>
      </div>`;
  }).join('');

  // Animate bars after paint
  setTimeout(() => {
    board.querySelectorAll('.sb-bar-fill').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });
  }, 80);
}

function renderSavingsPanel(candidates, budget) {
  const section = document.getElementById('savings-section');
  section.style.display = 'flex';
  const winner = candidates[0];
  const avgPrice = candidates.reduce((s, c) => s + c.price, 0) / candidates.length;
  const maxPrice = Math.max(...candidates.map(c => c.price));
  const totalSaved = maxPrice - winner.price;
  const vsAvg = Math.max(0, avgPrice - winner.price);

  document.getElementById('savings-panel').innerHTML = `
    <div class="savings-hero">
      <div class="savings-hero-label">Total Savings Identified</div>
      <div class="savings-hero-val">$${totalSaved.toFixed(2)}</div>
      <div class="savings-sub">vs most expensive option</div>
    </div>
    <div class="savings-rows">
      <div class="savings-row"><span class="savings-key">Winner price</span><span class="savings-val">$${winner.price.toFixed(2)}</span></div>
      <div class="savings-row"><span class="savings-key">Budget</span><span class="savings-val">$${budget.toFixed(2)}</span></div>
      <div class="savings-row"><span class="savings-key">Budget remaining</span><span class="savings-val green">$${(budget - winner.price).toFixed(2)}</span></div>
      <div class="savings-row"><span class="savings-key">vs category avg</span><span class="savings-val green">-$${vsAvg.toFixed(2)}</span></div>
      <div class="savings-row"><span class="savings-key">vs most expensive</span><span class="savings-val violet">-$${totalSaved.toFixed(2)}</span></div>
      <div class="savings-row"><span class="savings-key">Candidates analyzed</span><span class="savings-val">${candidates.length + state.rejected.length}</span></div>
    </div>`;
}

function renderApprovalInline(winner, task) {
  const container = document.getElementById('feed-messages');
  const div = document.createElement('div');
  div.id = 'approval-inline-el';
  const confidence = Math.min(98, winner.scores.finalScore + 10);
  const avgAll = [...state.candidates, ...state.rejected.filter(r => r.price)];
  const maxP = Math.max(...state.candidates.map(c => c.price));
  const saved = (maxP - winner.price).toFixed(2);

  div.innerHTML = `
    <div class="approval-inline">
      <div class="approval-top">
        <div class="approval-icon-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <div class="approval-title">✅ Ready when you are</div>
          <div class="approval-sub">
            OTTO's top pick is <strong class="cv">${winner.name}</strong> at <strong class="ce">$${winner.price.toFixed(2)}</strong>
            — saving about <strong class="ce">$${saved}</strong>.
            Confidence: <strong class="cv">${confidence}%</strong>. You can authorise this one, pick another above, or see more options.
          </div>
        </div>
      </div>
      <div class="approval-actions">
        <button class="btn-inline-approve" onclick="handleApproveInline()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          Authorise &amp; Pay · $${winner.price.toFixed(2)}
        </button>
        <button class="btn-inline-alt" onclick="handleAlternatives()">See other options</button>
        <button class="btn-inline-report" onclick="showReport()">View details</button>
      </div>
    </div>`;
  container.appendChild(div);
  scrollFeedBottom();
}

function renderReceipt(winner, goal, budget) {
  const txId = 'OTTO-' + Date.now().toString(36).toUpperCase();
  const now  = new Date().toLocaleString();
  const saved = Math.max(0, budget - winner.price).toFixed(2);

  document.getElementById('receipt-body').innerHTML = `
    <div class="r-row"><span class="r-label">Mission</span><span class="r-val">${goal.substring(0, 60)}${goal.length > 60 ? '…' : ''}</span></div>
    <div class="r-row"><span class="r-label">Item</span><span class="r-val">${winner.name}</span></div>
    <div class="r-row"><span class="r-label">Delivery</span><span class="r-val">${winner.deliveryDays <= 2 ? '⚡ ' : ''}${winner.deliveryDays}-day shipping</span></div>
    <div class="r-row"><span class="r-label">Rating</span><span class="r-val">${winner.rating}★ (${winner.reviews.toLocaleString()} reviews)</span></div>
    <div class="r-row"><span class="r-label">Budget saved</span><span class="r-val" style="color:var(--emerald)">$${saved} remaining</span></div>
    <div class="r-row"><span class="r-label">Timestamp</span><span class="r-val">${now}</span></div>
    <div class="r-total">
      <span class="r-total-label">Total Charged</span>
      <span class="r-total-val">$${winner.price.toFixed(2)}</span>
    </div>
    <div class="r-id">Transaction ID: ${txId}</div>`;

  // Reset the "Email me this" control (modal is reused across missions)
  const emailBtn = document.getElementById('btn-email-receipt');
  if (emailBtn) {
    emailBtn.disabled = false;
    emailBtn.classList.remove('sent');
    emailBtn.innerHTML =
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg> Email me this`;
  }
  const emailInput = document.getElementById('receipt-email');
  if (emailInput) emailInput.value = '';

  document.getElementById('receipt-modal').style.display = 'flex';
}

async function emailReceipt() {
  const winner = state.winner;
  if (!winner) return;

  const input = document.getElementById('receipt-email');
  const btn   = document.getElementById('btn-email-receipt');
  const to    = (input.value || '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    input.style.animation = 'shake 0.4s ease';
    setTimeout(() => { input.style.animation = ''; }, 500);
    input.focus();
    return;
  }

  const label = btn.innerHTML;
  btn.disabled    = true;
  btn.textContent = 'Sending…';

  try {
    const resp = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to,
        goal: state.currentTask?.goal || '',
        pick: {
          name:         winner.name,
          price:        winner.price,
          why:          winner.description || winner.why || '',
          url:          winner.url,
          source:       winner.source,
          deliveryDays: winner.deliveryDays,
          rating:       winner.rating,
        },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Server ${resp.status}`);

    btn.classList.add('sent');
    btn.textContent = '✓ Sent!';
  } catch (err) {
    btn.disabled  = false;
    btn.innerHTML = label;
    addMsg('warning', 'OTTO', 'warning',
      `Couldn't send the email: <strong style="color:var(--rose)">${err.message}</strong>. ` +
      `Add a <code>RESEND_API_KEY</code> to your env (free at resend.com) and restart the server.`
    );
  }
}

function renderDecisionReport() {
  const data = state.reportData;
  if (!data) return;
  const { goal, budget, winner, candidates, rejected, profile, timestamp } = data;
  const confidence = Math.min(98, winner.scores.finalScore + 10);
  const avgPrice = candidates.reduce((s, c) => s + c.price, 0) / candidates.length;
  const saved = (avgPrice - winner.price).toFixed(2);

  const rejRows = rejected.map(r =>
    `<li><strong>${r.name}</strong> — ${r.rejectedReason}</li>`
  ).join('');

  const candidateRows = candidates.map((c, i) =>
    `<li>#${i+1} <strong>${c.name}</strong> · $${c.price.toFixed(2)} · Score: ${c.scores.finalScore}</li>`
  ).join('');

  const twinRows = [
    `Budget Sensitivity: ${profile.budgetSensitivity}%`,
    `Delivery Priority: ${profile.deliveryPriority}%`,
    `Quality Focus: ${profile.qualityFocus}%`,
    `Risk Tolerance: ${profile.riskTolerance}%`,
  ].map(r => `<li>${r}</li>`).join('');

  document.getElementById('report-body').innerHTML = `
    <div class="report-section">
      <div class="report-section-title">Goal</div>
      <p>${goal}</p>
    </div>
    <div class="report-section">
      <div class="report-section-title">Your Preferences</div>
      <ul>${twinRows}</ul>
      <p style="margin-top:6px;font-style:italic;color:var(--sky)">Insight: ${DecisionTwin.getInsight(profile)}</p>
    </div>
    <div class="report-section">
      <div class="report-section-title">Candidates Evaluated (${candidates.length})</div>
      <ul>${candidateRows}</ul>
    </div>
    ${rejected.length ? `
    <div class="report-section">
      <div class="report-section-title">Candidates Rejected (${rejected.length})</div>
      <ul>${rejRows}</ul>
    </div>` : ''}
    <div class="report-section">
      <div class="report-section-title">Chosen Option</div>
      <p><strong>${winner.name}</strong> — $${winner.price.toFixed(2)}</p>
    </div>
    <div class="report-section">
      <div class="report-section-title">Reasoning</div>
      <p>${winner.description}</p>
      <p style="margin-top:6px">Final Score: <strong class="ce">${winner.scores.finalScore}</strong> — highest across Value (${winner.scores.valueScore}), Delivery (${winner.scores.deliveryScore}), Quality (${winner.scores.qualityScore}), Preference Fit (${winner.scores.prefFit}).</p>
    </div>
    <div class="report-section">
      <div class="report-section-title">Estimated Savings</div>
      <p>$${parseFloat(saved).toFixed(2)} vs category average · $${Math.max(0, budget - winner.price).toFixed(2)} budget remaining.</p>
    </div>
    <div class="report-section">
      <div class="report-section-title">Confidence</div>
      <div class="report-conf">${confidence}%</div>
    </div>
    <div class="report-section">
      <div class="report-section-title">Execution Status</div>
      <p style="color:var(--emerald)">✓ Success — ${new Date(timestamp).toLocaleString()}</p>
    </div>`;

  document.getElementById('report-modal').style.display = 'flex';
}

// ══════════════════════════════════════════════
// SECTION 7b — POLISH: stepper · sound · skeletons
// ══════════════════════════════════════════════

// Pipeline progress stepper — Research → Score → Decide → Approve → Execute.
const Stepper = {
  stages: ['Research', 'Score', 'Decide', 'Approve', 'Execute'],
  el: null,

  mount() {
    const container = document.getElementById('feed-messages');
    const wrap = document.createElement('div');
    wrap.className = 'pipe-stepper';
    wrap.id = 'pipe-stepper';
    wrap.innerHTML = this.stages.map((s, i) =>
      `<div class="pipe-step" data-i="${i}"><span class="pipe-dot">${i + 1}</span><span class="pipe-label">${s}</span></div>` +
      (i < this.stages.length - 1 ? '<div class="pipe-line" data-i="' + i + '"></div>' : '')
    ).join('');
    container.appendChild(wrap);
    this.el = wrap;
    this.set(-1);
    scrollFeedBottom();
  },

  set(active) {
    if (!this.el) return;
    this.el.querySelectorAll('.pipe-step').forEach((step) => {
      const i = +step.dataset.i;
      step.classList.toggle('done', i < active);
      step.classList.toggle('active', i === active);
    });
    this.el.querySelectorAll('.pipe-line').forEach((ln) => {
      ln.classList.toggle('done', +ln.dataset.i < active);
    });
  },

  // Map each pipeline agent onto a stepper stage.
  agentStage(agent) {
    const m = {
      PlannerAgent: 0, DecisionTwinAgent: 0, ResearchAgent: 0,
      ConstraintAnalysisAgent: 1, RankingAgent: 1,
      SavingsOptimizerAgent: 2,
    };
    return m[agent] ?? 0;
  },
};

// Subtle Web Audio cues — no asset files, generated on the fly. Needs a user
// gesture to start the AudioContext; launchOtto runs from a click, so it's fine.
const Sound = {
  ctx: null,
  enabled: JSON.parse(localStorage.getItem('otto_sound') || 'true'),

  ac() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    return this.ctx;
  },

  tone(freq, dur, type = 'sine', gain = 0.05) {
    if (!this.enabled) return;
    const ac = this.ac();
    if (!ac) return;
    try {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch { /* audio blocked — non-fatal */ }
  },

  whoosh() { this.tone(180, 0.18, 'sawtooth', 0.045); this.tone(300, 0.16, 'sine', 0.035); },
  tick()   { this.tone(660, 0.05, 'square', 0.02); },
  chime()  { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 'sine', 0.05), i * 90)); },
};

// Shimmer placeholder cards shown while the pipeline is working.
function renderSkeletons(n = 3) {
  const container = document.getElementById('feed-messages');
  const wrap = document.createElement('div');
  wrap.className = 'skeleton-card';
  wrap.id = 'skeleton-card';
  wrap.innerHTML = Array.from({ length: n }).map(() =>
    `<div class="skel-row">
       <div class="skel skel-thumb"></div>
       <div class="skel-lines">
         <div class="skel skel-line w70"></div>
         <div class="skel skel-line w40"></div>
       </div>
       <div class="skel skel-price"></div>
     </div>`).join('');
  container.appendChild(wrap);
  scrollFeedBottom();
}

function removeSkeletons() { removeEl(document.getElementById('skeleton-card')); }

// ══════════════════════════════════════════════
// SECTION 8 — MAIN LAUNCH FLOW
// ══════════════════════════════════════════════

// Client-side content check — instant feedback before the live pipeline runs.
// The server (/api/pipeline/run + /api/budget/estimate) enforces the same rules
// authoritatively; this just saves the user a round-trip. Mirrors lib/moderation.ts:
// obfuscation-resistant (leetspeak, separators, spaced/repeated letters) with
// word-boundary anchoring so legitimate words ("method", "bath bomb") pass.
const PROHIBITED_TERMS = {
  'illegal drugs': ['meth','methamphetamine','crystal meth','cocaine','crack cocaine','heroin','fentanyl','mdma','ecstasy','lsd','pcp','magic mushrooms','illegal drugs'],
  'weapons or explosives': ['firearm','firearms','handgun','handguns','pistol','rifle','shotgun','ammunition','ammo','assault rifle','machine gun','ghost gun','ar-15','ak-47','silencer','grenade','dynamite','tnt','pipe bomb','car bomb','build a bomb','make a bomb','explosives','anthrax','sarin','ricin'],
  'explicit content': ['porn','pornography','child porn','csam','escort service','prostitute','prostitution'],
  'violence or other illegal activity': ['hitman','hit man','assassinate','kill someone','human trafficking'],
};

const _LEET = {'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','8':'b','9':'g','@':'a','$':'s','!':'i','|':'i'};
function _applyLeet(s) { let o=''; for (const c of s) o += (_LEET[c] ?? c); return o; }
function _normalize(s) { return _applyLeet(s.toLowerCase()); }
function _joinSpacedLetters(s) { return s.replace(/\b[a-z](?:\s+[a-z]\b){2,}/g, m => m.replace(/\s+/g,'')); }
function _esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function _buildTermRegex(term) {
  const IN = "[._\\-*'`~]*", BETWEEN = "[\\s._\\-*'`~]+";
  const words = _normalize(term).split(/\s+/).filter(Boolean);
  const wordPat = w => Array.from(w).filter(c => /[a-z0-9]/.test(c)).map(c => _esc(c)+'+').join(IN);
  return new RegExp('\\b' + words.map(wordPat).join(BETWEEN) + '\\b', 'i');
}
const _COMPILED = Object.entries(PROHIBITED_TERMS).flatMap(
  ([label, terms]) => terms.map(t => ({ label, re: _buildTermRegex(t) }))
);

function flagProhibitedInput(...parts) {
  const raw = parts.filter(Boolean).join(' ');
  if (!raw.trim()) return null;
  const base = _normalize(raw);
  const variants = [base, _joinSpacedLetters(base)];
  for (const { label, re } of _COMPILED) {
    if (variants.some(v => re.test(v))) {
      return `This request was flagged because it appears to involve ${label}. OTTO only helps with legitimate shopping — please revise your request.`;
    }
  }
  return null;
}

async function launchOtto() {
  const goal        = document.getElementById('goal-input').value.trim();
  const budgetRaw   = document.getElementById('budget-input').value;
  const urgency     = document.getElementById('urgency-input').value;
  const constraints = document.getElementById('constraints-input').value.trim();

  if (!goal) {
    document.getElementById('goal-input').style.animation = 'shake 0.4s ease';
    setTimeout(() => document.getElementById('goal-input').style.animation = '', 500);
    return;
  }
  if (!budgetRaw || parseFloat(budgetRaw) <= 0) {
    document.getElementById('budget-input').style.animation = 'shake 0.4s ease';
    setTimeout(() => document.getElementById('budget-input').style.animation = '', 500);
    return;
  }

  // Content moderation — block prohibited requests before launching the pipeline.
  const flagged = flagProhibitedInput(goal, constraints);
  if (flagged) {
    const gi = document.getElementById('goal-input');
    gi.style.animation = 'shake 0.4s ease';
    setTimeout(() => gi.style.animation = '', 500);
    showFeed();
    addMsg('error', 'SYSTEM', 'warning', `<strong>Request blocked:</strong> ${flagged}`);
    setStatus('ready');
    return;
  }

  const budget  = parseFloat(budgetRaw);
  const weights = {
    value:   parseInt(document.getElementById('weight-value').value),
    speed:   parseInt(document.getElementById('weight-speed').value),
    quality: parseInt(document.getElementById('weight-quality').value),
  };

  // Sync rerank sliders
  document.getElementById('rr-budget').value  = budget;
  document.getElementById('rr-value').value   = weights.value;
  document.getElementById('rr-speed').value   = weights.speed;
  document.getElementById('rr-quality').value = weights.quality;

  state.running         = true;
  state.approvalPending = false;
  state.currentTask     = { goal, budget, urgency, constraints, weights };

  document.getElementById('launch-btn').disabled = true;
  setStatus('thinking');
  showFeed();

  const profile = DecisionTwin.updateFromSliders();

  setActivity('Sending mission to OTTO backend...');
  addMissionSeparator(goal, budget);
  Sound.whoosh();
  Stepper.mount();
  Stepper.set(0);
  const t = addThinking('Agents are evaluating the pipeline...');
  renderSkeletons(3);

  try {
    const res = await fetch('/api/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal, budget, urgency, constraints, weights,
        existingProfile: DecisionTwin.load(),
        // Personalise using the user's recent missions (reuse past decisions).
        pastMissions: loadMissions().slice(0, 5).map(m => ({
          goal:  m.goal,
          pick:  m.winner && m.winner.name,
          price: m.winner && m.winner.price,
        })),
      })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || 'Pipeline failed');
    }
    
    const result = (await res.json()).data;
    
    removeEl(t);
    
    // Play back the reasoning chain
    for (const step of result.reasoningChain) {
      Stepper.set(Stepper.agentStage(step.agent));
      const ts = addThinking(`[${step.agent}] Working...`);
      await delay(step.durationMs > 1000 ? 1000 : step.durationMs);
      removeEl(ts);

      let providerHtml = '';
      if (step.provider && step.model) {
        providerHtml = `<div class="provider-badge">${step.provider} · ${step.model}</div>`;
      }

      addStep(`<strong>${step.agent}</strong>: ${step.reasoning} <br>${providerHtml}`);
      Sound.tick();
      await delay(300);
    }

    removeSkeletons();
    
    // Set UI state
    state.candidates = result.ranked;
    state.rejected = result.rejected;
    state.winner = result.winner;
    
    // Capture the prior profile so the twin can show what changed this run,
    // and count this as one learned mission.
    const prevTwin = DecisionTwin.load();
    const newTwin = result.decisionTwin.profile;
    newTwin.decisionCount = (prevTwin.decisionCount || 0) + 1;
    DecisionTwin.render(newTwin, prevTwin);
    DecisionTwin.save(newTwin);
    renderRejectedSection(result.rejected);
    renderOptionsCard(result.ranked.slice(0, 5));
    renderRadarChart(result.ranked);
    renderDecisionBoard(result.ranked.slice(0, 5));
    renderSavingsPanel(result.ranked, budget);
    
    const confidence = result.confidence;
    const winner = result.winner;
    
    addDivider('TOP RECOMMENDATION');
    addMsg('success', 'OTTO', 'success',
      `<strong style="color:var(--emerald)">🏆 Recommendation: ${winner.name}</strong><br><br>
      <strong>Why it won:</strong> ${winner.description}<br><br>
      <strong>Final Score:</strong> <span class="cv">${winner.scores.finalScore}/100</span><br><br>
      <strong>Narrative:</strong> ${result.finalReasoning}<br><br>
      <strong>Confidence:</strong> <span class="cv">${confidence}%</span>`
    );
    
    if (window.speakText) {
      window.speakText(`I recommend ${winner.name} at $${winner.price.toFixed(0)}. Confidence ${confidence} percent. ${result.finalReasoning}`);
    }
    
    await delay(400);
    Stepper.set(3);
    Sound.chime();
    addDivider('AUTHORISE PURCHASE');
    renderApprovalInline(winner, state.currentTask);
    
    state.reportData = {
      goal, budget, winner, candidates: result.ranked, rejected: result.rejected,
      profile: result.decisionTwin.profile, timestamp: Date.now(),
    };

    // Save this mission as a reopenable "chat" in the sidebar history.
    snapshotMission(result);

    state.approvalPending = true;
    setActivity('Awaiting approval...', true);
    setStatus('thinking');
    document.getElementById('launch-btn').disabled = false;

    // Land the user on the #1 product, not scrolled past it to the approval gate.
    setTimeout(scrollToTopPick, 150);

  } catch (err) {
    removeEl(t);
    addMsg('error', 'SYSTEM', 'error', `<strong>Pipeline Error:</strong> ${err.message}`);
    setActivity('Mission failed', true);
    setStatus('ready');
    document.getElementById('launch-btn').disabled = false;
  }
}

// ══════════════════════════════════════════════
// SECTION 9 — APPROVAL & PAYMENT FLOW
// ══════════════════════════════════════════════

async function handleApproveInline() {
  if (!state.approvalPending) return;
  state.approvalPending = false;

  // Remove inline approval
  const el = document.getElementById('approval-inline-el');
  if (el) removeEl(el);

  // Also close overlay modal if open
  document.getElementById('approval-modal').style.display = 'none';

  Stepper.set(4);
  await startStripeCheckout();
}

async function handleApprove() {
  document.getElementById('approval-modal').style.display = 'none';
  await handleApproveInline();
}

// Embedded Stripe Checkout: ask the backend for a session client_secret, then
// mount Stripe's in-app card form inside a modal (the user never leaves OTTO).
// On successful payment Stripe redirects the top window to /success.
let _embeddedCheckout = null;

async function startStripeCheckout() {
  const winner = state.winner;
  if (!winner) return;

  setActivity('Opening secure Stripe Checkout…');

  try {
    const res = await fetch('/api/stripe/embedded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: winner.name,
        price:       winner.price,
        candidateId: winner.id,
        goal:        state.currentTask?.goal || '',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.clientSecret) throw new Error(data.error || `Checkout failed (${res.status})`);
    if (typeof Stripe === 'undefined') throw new Error('Stripe.js did not load (check your connection).');

    const stripe = Stripe(data.publishableKey);

    // Tear down any previous instance before mounting a fresh one.
    if (_embeddedCheckout) { _embeddedCheckout.destroy(); _embeddedCheckout = null; }

    document.getElementById('embedded-modal').style.display = 'flex';
    _embeddedCheckout = await stripe.initEmbeddedCheckout({ clientSecret: data.clientSecret });
    _embeddedCheckout.mount('#embedded-checkout');
  } catch (err) {
    addMsg('warning', 'OTTO', 'warning',
      `Stripe checkout failed: <strong style="color:var(--rose)">${err.message}</strong>. ` +
      `Check the Stripe keys in <code>.env.local</code> (and STRIPE_MOCK_MODE=false), then restart the dev server.`
    );
    setActivity('Checkout failed', false);
    setStatus('error');
    state.approvalPending = true;   // let them try again
    document.getElementById('launch-btn').disabled = false;
  }
}

function closeEmbeddedCheckout() {
  if (_embeddedCheckout) { _embeddedCheckout.destroy(); _embeddedCheckout = null; }
  document.getElementById('embedded-modal').style.display = 'none';
  state.approvalPending = true;    // they backed out — allow another attempt
  setActivity('Checkout cancelled', false);
  setStatus('ready');
}

async function runPaymentFlow() {
  const winner = state.winner;
  if (!winner) return;

  setActivity('Processing payment...');
  document.getElementById('payment-modal').style.display = 'flex';

  // Reset steps
  ['pstep-1','pstep-2','pstep-3'].forEach(id => {
    const el = document.getElementById(id);
    el.className = 'pstep';
  });

  const sub = document.getElementById('payment-sub');

  // Step 1
  await delay(600);
  document.getElementById('pstep-1').className = 'pstep active';
  sub.textContent = 'Initializing secure session...';
  await delay(1000);
  document.getElementById('pstep-1').className = 'pstep done';

  // Step 2
  document.getElementById('pstep-2').className = 'pstep active';
  sub.textContent = `Verifying charge: $${winner.price.toFixed(2)}`;
  await delay(1200);
  document.getElementById('pstep-2').className = 'pstep done';

  // Step 3
  document.getElementById('pstep-3').className = 'pstep active';
  sub.textContent = 'Completing transaction...';
  await delay(1000);
  document.getElementById('pstep-3').className = 'pstep done';

  sub.textContent = 'Transaction complete!';
  await delay(500);

  // Close payment, show receipt
  document.getElementById('payment-modal').style.display = 'none';
  setActivity('Mission complete!', true);
  setStatus('ready');

  // Update Decision Twin
  const profile = DecisionTwin.updateFromApproval(winner, state.candidates);
  DecisionTwin.render(profile);

  renderReceipt(winner, state.currentTask.goal, state.currentTask.budget);

  // The mission was already saved to the Chats history when the recommendation
  // was produced; mark it purchased so the snapshot reflects completion.
  markMissionPurchased();
}

// Flag the active mission's saved snapshot as purchased.
function markMissionPurchased() {
  const all = loadMissions();
  const m = all.find(x => x.id === state.activeMissionId);
  if (m) { m.purchased = true; saveMissions(all); }
}

function handleAlternatives() {
  // Close modals
  document.getElementById('approval-modal').style.display = 'none';
  const approvalEl = document.getElementById('approval-inline-el');
  if (approvalEl) removeEl(approvalEl);

  // Show alternatives from candidates
  if (state.candidates.length < 2) {
    addMsg('default', 'OTTO', 'otto', 'No additional alternatives within your current constraints. Try adjusting your budget or urgency.');
    return;
  }

  addDivider('ALTERNATIVE OPTIONS');
  const alts = state.candidates.slice(1, 4);
  addMsg('default', 'OTTO', 'otto',
    `Here are <strong>${alts.length} alternatives</strong> to the top recommendation. Adjust re-ranking sliders on the right to recompute scores with different priorities.`
  );

  alts.forEach((c, i) => {
    const container = document.getElementById('feed-messages');
    const div = document.createElement('div');
    div.className = 'options-card';
    div.style.marginBottom = '8px';
    div.innerHTML = renderCandidateCard(c, i + 2, alts.length + 1);
    container.appendChild(div);
  });

  // Re-show approval
  state.approvalPending = true;
  renderApprovalInline(state.winner, state.currentTask);
  scrollFeedBottom();
}

function handleCancelModal() {
  document.getElementById('approval-modal').style.display = 'none';
  addMsg('default', 'OTTO', 'otto', 'Mission cancelled. You can adjust your constraints and launch a new mission anytime.');
  state.approvalPending = false;
  state.running = false;
  setActivity('Ready', false);
  setStatus('ready');
  document.getElementById('launch-btn').disabled = false;
}

// ══════════════════════════════════════════════
// SECTION 10 — DYNAMIC RE-RANKING
// ══════════════════════════════════════════════

async function rerank() {
  if (!state.candidates.length) return;

  const newBudget  = parseFloat(document.getElementById('rr-budget').value) || state.currentTask.budget;
  const newWeights = {
    value:   parseInt(document.getElementById('rr-value').value),
    speed:   parseInt(document.getElementById('rr-speed').value),
    quality: parseInt(document.getElementById('rr-quality').value),
  };

  const btn = document.getElementById('btn-rerank');
  btn.textContent = 'Recomputing...';
  btn.disabled = true;

  setActivity('Recomputing decision model...');

  const profile = DecisionTwin.load();

  // Re-score and sort
  state.candidates.forEach(c => {
    c.scores = scoreCandidate(c, newBudget, newWeights, profile);
  });
  computeSavingsScores(state.candidates);
  state.candidates.forEach(c => {
    c.scores.finalScore = Math.round(c.scores.finalScore * 0.8 + c.scores.savingsScore * 0.2);
  });
  state.candidates.sort((a, b) => b.scores.finalScore - a.scores.finalScore);

  await delay(600);

  // Flash the board
  const board = document.getElementById('scoreboard');
  board.classList.add('rerank-flash');
  setTimeout(() => board.classList.remove('rerank-flash'), 700);

  renderDecisionBoard(state.candidates.slice(0, 5));
  renderSavingsPanel(state.candidates, newBudget);

  // Update options card
  const oldCard = document.getElementById('options-card');
  if (oldCard) {
    const avgPrice = state.candidates.reduce((s, c) => s + c.price, 0) / state.candidates.length;
    state.candidates.forEach(c => { c._avgSaved = Math.max(0, avgPrice - c.price); });
    oldCard.innerHTML = `
      <div class="options-card-header">
        <span>Ranked Candidates (Updated)</span>
        <span class="options-count">${state.candidates.length} options</span>
      </div>
      ${state.candidates.slice(0, 5).map((c, i) => renderCandidateCard(c, i + 1, state.candidates.length)).join('')}`;
  }

  addStep('Rankings recomputed with new weights. Decision Board updated.');
  state.winner = state.candidates[0];

  btn.textContent = 'Recompute Rankings';
  btn.disabled = false;
  setActivity('Awaiting approval...');
}

// ══════════════════════════════════════════════
// SECTION 11 — MODALS & REPORT
// ══════════════════════════════════════════════

function showReport() {
  renderDecisionReport();
}

function closeReport() {
  document.getElementById('report-modal').style.display = 'none';
}

function newMission() {
  document.getElementById('receipt-modal').style.display = 'none';
  document.getElementById('approval-modal').style.display = 'none';
  document.getElementById('report-modal').style.display   = 'none';
  document.getElementById('payment-modal').style.display  = 'none';

  state.running         = false;
  state.approvalPending = false;
  state.candidates      = [];
  state.rejected        = [];
  state.winner          = null;

  document.getElementById('goal-input').value        = '';
  document.getElementById('budget-input').value      = '';
  document.getElementById('constraints-input').value = '';
  document.getElementById('urgency-input').value     = 'flexible';

  resetFeed();
  setActivity('', false);
  setStatus('ready');
  document.getElementById('launch-btn').disabled = false;
}

// ══════════════════════════════════════════════
// SECTION 12 — SESSION LOG
// ══════════════════════════════════════════════

const MISSIONS_KEY = 'otto_missions';

function loadMissions() {
  try { return JSON.parse(localStorage.getItem(MISSIONS_KEY) || '[]'); }
  catch { return []; }
}

function saveMissions(list) {
  localStorage.setItem(MISSIONS_KEY, JSON.stringify(list.slice(0, 30)));
}

// Persist a full snapshot of the just-completed mission so it can be reopened.
function snapshotMission(result) {
  const t = state.currentTask;
  const snap = {
    id:          'm-' + Date.now().toString(36),
    ts:          Date.now(),
    goal:        t.goal,
    budget:      t.budget,
    urgency:     t.urgency,
    constraints: t.constraints,
    weights:     t.weights,
    ranked:      result.ranked,
    rejected:    result.rejected,
    winner:      result.winner,
    finalReasoning: result.finalReasoning,
    confidence:  result.confidence,
    profile:     (result.decisionTwin && result.decisionTwin.profile) || DecisionTwin.load(),
  };

  const all = loadMissions();
  all.unshift(snap);
  saveMissions(all);
  state.activeMissionId = snap.id;
  renderMissionList();

  // Best-effort server-side log (kept for backwards compatibility).
  fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal: t.goal.substring(0, 50), price: result.winner.price, name: result.winner.name, ts: snap.ts }),
  }).catch(() => {});

  return snap;
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'now';
  if (s < 3600)  return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderMissionList() {
  const container = document.getElementById('session-log');
  const tools = document.getElementById('chat-tools');
  const all = loadMissions();

  // Show the search/clear tools only when there's something to act on.
  if (tools) tools.style.display = all.length ? 'flex' : 'none';

  if (!all.length) {
    container.innerHTML = '<div class="session-empty">No results yet. Run a search to see them here.</div>';
    return;
  }

  const q = (state._chatFilter || '').toLowerCase();
  const missions = q
    ? all.filter(m => ((m.label || m.goal || '') + ' ' + ((m.winner && m.winner.name) || '')).toLowerCase().includes(q))
    : all;

  if (!missions.length) {
    container.innerHTML = `<div class="session-empty">No missions match “${escapeHtml(state._chatFilter)}”.</div>`;
    return;
  }

  container.innerHTML = missions.map(m => {
    const name   = escapeHtml(m.label || m.goal);
    const win    = m.winner ? escapeHtml(m.winner.name) : 'No pick';
    const price  = m.winner && typeof m.winner.price === 'number' ? '$' + m.winner.price.toFixed(2) : '';
    const bought = m.purchased ? '<span class="si-badge">✓</span>' : '';
    const active = m.id === state.activeMissionId ? 'active' : '';
    return `
      <div class="session-item ${active}" onclick="restoreMission('${m.id}')">
        <div class="si-goal">${name}</div>
        <div class="si-meta">
          <span class="si-win" title="${win}">${win}</span>
          ${price ? `<span class="si-price">${price}</span>` : ''}
          ${bought}
          <span class="si-time">${timeAgo(m.ts)}</span>
        </div>
        <div class="si-actions">
          <button class="si-btn" onclick="renameMission('${m.id}',event)" title="Rename">✎</button>
          <button class="si-btn del" onclick="deleteMission('${m.id}',event)" title="Delete">✕</button>
        </div>
      </div>`;
  }).join('');
}

function onChatSearch(q) {
  state._chatFilter = q;
  renderMissionList();
}

function deleteMission(id, ev) {
  if (ev) ev.stopPropagation();
  const all = loadMissions().filter(m => m.id !== id);
  saveMissions(all);
  if (state.activeMissionId === id) state.activeMissionId = null;
  renderMissionList();
}

function renameMission(id, ev) {
  if (ev) ev.stopPropagation();
  const all = loadMissions();
  const m = all.find(x => x.id === id);
  if (!m) return;
  const next = window.prompt('Rename this mission:', m.label || m.goal);
  if (next == null) return;                       // cancelled
  m.label = next.trim() || m.goal;
  saveMissions(all);
  renderMissionList();
}

function clearAllMissions() {
  if (!loadMissions().length) return;
  if (!window.confirm('Delete all saved missions? This cannot be undone.')) return;
  saveMissions([]);
  state.activeMissionId = null;
  state._chatFilter = '';
  const search = document.getElementById('chat-search');
  if (search) search.value = '';
  renderMissionList();
}

// Reopen a saved mission's full feed without re-running the pipeline.
function restoreMission(id) {
  const snap = loadMissions().find(m => m.id === id);
  if (!snap) return;

  state.activeMissionId = id;
  state.running         = false;
  state.approvalPending = false;
  state.currentTask     = { goal: snap.goal, budget: snap.budget, urgency: snap.urgency, constraints: snap.constraints, weights: snap.weights };
  state.candidates      = snap.ranked;
  state.rejected        = snap.rejected;
  state.winner          = snap.winner;
  state.reportData      = {
    goal: snap.goal, budget: snap.budget, winner: snap.winner,
    candidates: snap.ranked, rejected: snap.rejected, profile: snap.profile, timestamp: snap.ts,
  };

  // Restore the form inputs too.
  document.getElementById('goal-input').value        = snap.goal;
  document.getElementById('budget-input').value      = snap.budget;
  document.getElementById('urgency-input').value     = snap.urgency;
  document.getElementById('constraints-input').value = snap.constraints || '';

  showFeed();
  document.getElementById('feed-messages').innerHTML = '';
  addDivider('SAVED CHAT · ' + new Date(snap.ts).toLocaleString());
  if (snap.profile) DecisionTwin.render(snap.profile);
  renderRejectedSection(snap.rejected);
  renderOptionsCard(snap.ranked.slice(0, 5));
  renderDecisionBoard(snap.ranked.slice(0, 5));
  renderSavingsPanel(snap.ranked, snap.budget);

  addDivider('TOP RECOMMENDATION');
  const w = snap.winner;
  addMsg('success', 'OTTO', 'success',
    `<strong style="color:var(--emerald)">🏆 ${w.name}</strong><br><br>
     <strong>Final Score:</strong> <span class="cv">${w.scores.finalScore}/100</span><br><br>
     ${snap.finalReasoning || ''}<br><br>
     <strong>Confidence:</strong> <span class="cv">${snap.confidence}%</span>`
  );
  addMsg('default', 'OTTO', 'otto', 'This is a saved result. Hit <strong>New</strong> in Past Results to start a fresh one.');

  renderMissionList();
  setActivity('Viewing saved chat', false);
  setStatus('ready');
  scrollFeedBottom();
}

// Clear everything and start a fresh chat.
function newChat() {
  state.activeMissionId = null;
  state.running         = false;
  state.approvalPending = false;
  state.candidates      = [];
  state.rejected        = [];
  state.winner          = null;
  state.reportData      = null;

  document.getElementById('goal-input').value        = '';
  document.getElementById('budget-input').value      = '';
  document.getElementById('constraints-input').value = '';
  document.getElementById('urgency-input').value     = 'flexible';

  resetFeed();
  hideBudgetWarning();
  setActivity('', false);
  setStatus('ready');
  document.getElementById('launch-btn').disabled = false;
  renderMissionList();
  document.getElementById('goal-input').focus();
}

// ══════════════════════════════════════════════
// SECTION 13 — PRESETS
// ══════════════════════════════════════════════

function loadPreset(key) {
  const p = PRESETS[key];
  if (!p) return;

  document.getElementById('goal-input').value        = p.goal;
  document.getElementById('budget-input').value      = p.budget;
  document.getElementById('urgency-input').value     = p.urgency;
  document.getElementById('constraints-input').value = p.constraints;

  document.getElementById('weight-value').value   = p.wv;
  document.getElementById('weight-speed').value   = p.ws;
  document.getElementById('weight-quality').value = p.wq;
  document.getElementById('wv-val').textContent   = p.wv;
  document.getElementById('ws-val').textContent   = p.ws;
  document.getElementById('wq-val').textContent   = p.wq;

  // Highlight preset
  document.querySelectorAll('.preset-btn').forEach(b => b.style.borderColor = '');
  const btn = document.getElementById(`preset-${key}`);
  if (btn) {
    btn.style.borderColor = 'rgba(192,132,252,0.5)';
    btn.style.background  = 'rgba(192,132,252,0.07)';
    setTimeout(() => {
      btn.style.borderColor = '';
      btn.style.background  = '';
    }, 2000);
  }

  document.getElementById('goal-input').focus();

  _budgetWarnDismissedFor = null;
  checkBudgetRange();
}

// ══════════════════════════════════════════════
// SECTION 14 — SLIDER UPDATES
// ══════════════════════════════════════════════

function initSliders() {
  const pairs = [
    ['weight-value',   'wv-val'],
    ['weight-speed',   'ws-val'],
    ['weight-quality', 'wq-val'],
  ];
  pairs.forEach(([sliderId, valId]) => {
    const slider = document.getElementById(sliderId);
    const valEl  = document.getElementById(valId);
    slider.addEventListener('input', () => {
      valEl.textContent = slider.value;
    });
  });
}

// ══════════════════════════════════════════════
// SECTION 15 — KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!document.getElementById('launch-btn').disabled) launchOtto();
  }
  if (e.key === 'Escape') {
    document.getElementById('approval-modal').style.display = 'none';
    document.getElementById('report-modal').style.display   = 'none';
  }
});

// ══════════════════════════════════════════════
// SECTION 15b — VOICE (speech input + spoken output)
// ══════════════════════════════════════════════
// Uses the free, browser-native Web Speech API:
//   · SpeechRecognition  → speak your goal, it fills the form
//   · speechSynthesis    → OTTO reads its recommendation aloud
// Both are feature-detected; the mic/speaker buttons only appear when supported.

const Voice = {
  recognition:  null,
  listening:    false,
  speakEnabled: JSON.parse(localStorage.getItem('otto_speak') || 'true'),

  supportsInput()  { return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window; },
  supportsOutput() { return 'speechSynthesis' in window; },

  init() {
    if (this.supportsOutput()) {
      const sp = document.getElementById('speaker-toggle');
      if (sp) { sp.style.display = 'flex'; this.reflectSpeaker(); }
    }
    if (this.supportsInput()) {
      const mic = document.getElementById('mic-btn');
      if (mic) mic.style.display = 'flex';

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang            = 'en-US';
      rec.interimResults  = true;
      rec.continuous      = false;
      rec.onresult = (e) => this.onResult(e);
      rec.onend    = ()  => this.stopListening();
      rec.onerror  = ()  => this.stopListening();
      this.recognition = rec;
    }
  },

  toggleInput() {
    if (!this.recognition) return;
    if (this.listening) { this.recognition.stop(); return; }
    try {
      this.recognition.start();
      this.listening = true;
      document.getElementById('mic-btn')?.classList.add('listening');
    } catch { /* start() throws if already running — ignore */ }
  },

  stopListening() {
    this.listening = false;
    document.getElementById('mic-btn')?.classList.remove('listening');
  },

  onResult(e) {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) transcript += e.results[i][0].transcript;
    transcript = transcript.trim();
    if (!transcript) return;

    const goal = document.getElementById('goal-input');
    goal.value = transcript.charAt(0).toUpperCase() + transcript.slice(1);
    checkBudgetRange();

    // On the final phrase, try to pull a budget out of natural speech.
    if (e.results[e.results.length - 1].isFinal) this.applyBudgetFromSpeech(transcript);
  },

  // "headphones under 200" / "around $150" / "for 80 dollars" → fills budget.
  applyBudgetFromSpeech(text) {
    const m = text.match(/(?:under|below|less than|max|budget|around|about|for|up to)\s*\$?\s*(\d{1,6})/i)
           || text.match(/\$\s*(\d{1,6})/)
           || text.match(/(\d{1,6})\s*(?:dollars|bucks|usd)/i);
    const n = m ? Number(m[1]) : null;
    const b = document.getElementById('budget-input');
    if (n && n > 0 && !b.value) { b.value = n; _budgetWarnDismissedFor = null; checkBudgetRange(); }
  },

  speak(text) {
    if (!this.speakEnabled || !this.supportsOutput() || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'en-US';
      u.rate = 1.03;
      window.speechSynthesis.speak(u);
    } catch { /* TTS unavailable — non-fatal */ }
  },

  toggleSpeaker() {
    this.speakEnabled = !this.speakEnabled;
    localStorage.setItem('otto_speak', JSON.stringify(this.speakEnabled));
    if (!this.speakEnabled && this.supportsOutput()) window.speechSynthesis.cancel();
    this.reflectSpeaker();
  },

  reflectSpeaker() {
    const sp = document.getElementById('speaker-toggle');
    if (!sp) return;
    sp.classList.toggle('muted', !this.speakEnabled);
    sp.title = this.speakEnabled ? 'Voice Output On — click to mute' : 'Voice Output Off — click to enable';
  },
};

// Global handlers referenced from index.html (onclick + window.speakText).
function toggleVoiceInput() { Voice.toggleInput(); }
function toggleSpeaker()    { Voice.toggleSpeaker(); }
function speakText(text)    { Voice.speak(text); }
window.speakText = speakText;

// ══════════════════════════════════════════════
// SECTION 16 — INIT
// ══════════════════════════════════════════════

(function init() {
  initSliders();
  Voice.init();
  renderMissionList();

  // Budget guidance — re-check whenever the budget or goal changes.
  const budgetEl      = document.getElementById('budget-input');
  const goalEl        = document.getElementById('goal-input');
  const constraintsEl = document.getElementById('constraints-input');
  budgetEl.addEventListener('input', () => { _budgetWarnDismissedFor = null; checkBudgetRange(); });
  goalEl.addEventListener('input', checkBudgetRange);
  constraintsEl.addEventListener('input', checkBudgetRange);

  // Render twin if stored
  const profile = DecisionTwin.load();
  if (profile.decisionCount > 0) {
    profile._forced = true;
    DecisionTwin.render(profile);
  }

  // Cmd+Enter hint
  document.getElementById('goal-input').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      launchOtto();
    }
  });

  console.log('%cOTTO — Autonomous Decision Engine', 'color:#c084fc;font-size:16px;font-weight:bold');
  console.log('%cReady. Launch a mission to begin.', 'color:#38bdf8');
})();
