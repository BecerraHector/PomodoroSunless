(() => {
  'use strict';

  const STORAGE_KEY = 'vigilia-pomodoro-v1';
  const CIRC = 1131; // 2π·180, igual que el trazo del anillo
  const MODES = ['work', 'short', 'long'];
  const WORD = { work: 'Enfoque', short: 'Descanso', long: 'Descanso largo' };
  const ROMAN_CYCLE = ['0', 'I', 'II', 'III', 'IV'];

  const defaults = {
    durWork: 25,
    durShort: 5,
    durLong: 15,
    tasks: [
      { name: 'Redactar el ensayo de estética', done: true },
      { name: 'Revisar wireframes del grimorio', done: false },
      { name: 'Responder correos pendientes', done: false },
      { name: 'Estudiar teoría del color', done: false },
    ],
    doneCount: 0,
    stats: { date: '', today: 0, streak: 0, lastDay: '' },
  };

  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  })();

  const state = {
    durWork: saved.durWork ?? defaults.durWork,
    durShort: saved.durShort ?? defaults.durShort,
    durLong: saved.durLong ?? defaults.durLong,
    tasks: Array.isArray(saved.tasks) ? saved.tasks : defaults.tasks,
    doneCount: saved.doneCount ?? defaults.doneCount,
    stats: Object.assign({}, defaults.stats, saved.stats),
    mode: 'work',
    remaining: (saved.durWork ?? defaults.durWork) * 60,
    running: false,
    endAt: 0, // timestamp de fin: el tiempo real manda, no el intervalo
  };

  const $ = id => document.getElementById(id);
  const els = {
    app: document.querySelector('.app'),
    modeRow: document.querySelector('.mode-row'),
    time: $('time'), progress: $('progress'), modeWord: $('mode-word'),
    hdrCycle: $('hdr-cycle'), hdrMode: $('hdr-mode'),
    toggle: $('btn-toggle'), reset: $('btn-reset'),
    dots: $('dots'), modes: $('modes'), tasks: $('tasks'), addTask: $('add-task'),
    workMin: $('work-min'), shortMin: $('short-min'), longMin: $('long-min'),
    statToday: $('stat-today'), statStreak: $('stat-streak'),
  };

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      durWork: state.durWork, durShort: state.durShort, durLong: state.durLong,
      tasks: state.tasks, doneCount: state.doneCount, stats: state.stats,
    }));
  }

  const dur = mode =>
    (mode === 'work' ? state.durWork : mode === 'short' ? state.durShort : state.durLong) * 60;

  const fmt = s =>
    String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  function shownCycles() {
    const d = state.doneCount;
    return d > 0 && d % 4 === 0 ? 4 : d % 4;
  }

  /* ── Crónica: fechas y numeración romana ── */
  const dateStr = d =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const todayStr = () => dateStr(new Date());
  const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d); };

  function roman(n) {
    if (n <= 0) return '0';
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
      [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, r] of map) while (n >= v) { out += r; n -= v; }
    return out;
  }

  function registerPomodoro() {
    const t = todayStr();
    if (state.stats.date !== t) { state.stats.date = t; state.stats.today = 0; }
    state.stats.today += 1;
    if (state.stats.lastDay !== t) {
      state.stats.streak = state.stats.lastDay === yesterdayStr() ? state.stats.streak + 1 : 1;
      state.stats.lastDay = t;
    }
  }

  /* Campanada discreta al cambiar de ciclo */
  let audioCtx = null;
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      [220, 330].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 1.4);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + i * 0.18);
        o.stop(t + i * 0.18 + 1.5);
      });
    } catch { /* sin audio, sin drama */ }
  }

  /* ── Efectos de transición ── */
  let shownWord = null;
  function swapWord(txt) {
    if (shownWord === txt) return;
    if (shownWord === null) { shownWord = txt; els.modeWord.textContent = txt; return; }
    shownWord = txt;
    els.modeWord.classList.add('word-out');
    setTimeout(() => {
      els.modeWord.textContent = txt;
      els.modeWord.classList.remove('word-out');
      els.modeWord.classList.add('word-in');
      requestAnimationFrame(() => requestAnimationFrame(() =>
        els.modeWord.classList.remove('word-in')));
    }, 240);
  }

  function easeRing() {
    els.progress.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.4, 0, 0.2, 1)';
    setTimeout(() => { els.progress.style.transition = ''; }, 950);
  }

  function redrawDividers() {
    els.modeRow.classList.remove('redraw');
    void els.modeRow.offsetWidth;
    els.modeRow.classList.add('redraw');
    setTimeout(() => els.modeRow.classList.remove('redraw'), 900);
  }

  function ceremony() {
    els.app.classList.add('ceremony');
    setTimeout(() => els.app.classList.remove('ceremony'), 1400);
  }

  function applyMode(mode) {
    state.mode = mode;
    easeRing();
    redrawDividers();
  }

  /* ── Temporizador (contra reloj real, inmune al throttling) ── */
  function setRunning(on) {
    state.running = on;
    if (on) state.endAt = Date.now() + state.remaining * 1000;
    render();
  }

  function tick() {
    if (!state.running) return;
    const rem = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
    if (rem === state.remaining) return;
    state.remaining = rem;
    if (rem <= 0) {
      chime();
      ceremony();
      if (state.mode === 'work') {
        state.doneCount += 1;
        registerPomodoro();
        applyMode(state.doneCount % 4 === 0 ? 'long' : 'short');
      } else {
        applyMode('work');
      }
      state.remaining = dur(state.mode);
      state.endAt = Date.now() + state.remaining * 1000;
      save();
    }
    render();
  }
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  function setMode(mode) {
    applyMode(mode);
    state.remaining = dur(mode);
    state.running = false;
    render();
  }

  function bump(which, delta) {
    const key = which === 'work' ? 'durWork' : which === 'short' ? 'durShort' : 'durLong';
    state[key] = Math.max(1, Math.min(90, state[key] + delta));
    if (state.mode === which && !state.running) state.remaining = dur(which);
    save();
    render();
  }

  function render() {
    const frac = Math.max(0, Math.min(1, state.remaining / dur(state.mode)));
    els.time.textContent = fmt(state.remaining);
    els.progress.setAttribute('stroke-dashoffset', String(Math.round(CIRC * frac)));
    swapWord(WORD[state.mode]);
    els.hdrCycle.textContent = ROMAN_CYCLE[shownCycles()];
    els.hdrMode.textContent = WORD[state.mode].toUpperCase();
    els.toggle.textContent = state.running ? 'Pausar' : 'Iniciar';
    els.workMin.textContent = state.durWork + ' min';
    els.shortMin.textContent = state.durShort + ' min';
    els.longMin.textContent = state.durLong + ' min';
    document.title = state.running
      ? fmt(state.remaining) + ' · ' + WORD[state.mode] + ' — Vigilia'
      : 'Vigilia — Pomodoro gótico';

    const t = todayStr();
    const doneToday = state.stats.date === t ? state.stats.today : 0;
    const streak = (state.stats.lastDay === t || state.stats.lastDay === yesterdayStr())
      ? state.stats.streak : 0;
    els.statToday.textContent = roman(doneToday);
    els.statStreak.textContent = roman(streak) + (streak === 1 ? ' DÍA' : ' DÍAS');

    els.app.classList.toggle('is-running', state.running);
    els.app.classList.toggle('is-ending', state.running && state.remaining > 0 && state.remaining <= 60);
    for (const m of MODES) els.app.classList.toggle('mode-' + m, state.mode === m);

    els.dots.querySelectorAll('.dot').forEach((d, i) =>
      d.classList.toggle('on', i < shownCycles()));

    els.modes.querySelectorAll('.chip').forEach((c, i) =>
      c.classList.toggle('active', MODES[i] === state.mode));
  }

  function renderTasks() {
    els.tasks.replaceChildren(...state.tasks.map(t => {
      const row = document.createElement('div');
      row.className = 'task' + (t.done ? ' done' : '');
      const box = document.createElement('span');
      box.className = 'box';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t.name;
      const del = document.createElement('button');
      del.className = 'task-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Eliminar tarea');
      del.addEventListener('click', e => {
        e.stopPropagation();
        row.classList.add('leaving');
        setTimeout(() => {
          const idx = state.tasks.indexOf(t);
          if (idx !== -1) state.tasks.splice(idx, 1);
          save();
          renderTasks();
        }, 260);
      });
      row.append(box, name, del);
      // Alterna la clase en la fila viva para que el rombo y el tachado se animen
      row.addEventListener('click', () => {
        t.done = !t.done;
        row.classList.toggle('done', t.done);
        save();
      });
      return row;
    }));
  }

  /* Construcción estática */
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('span');
    d.className = 'dot';
    els.dots.appendChild(d);
  }
  for (const m of MODES) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = WORD[m];
    b.addEventListener('click', () => setMode(m));
    els.modes.appendChild(b);
  }

  els.toggle.addEventListener('click', () => setRunning(!state.running));
  els.reset.addEventListener('click', () => {
    state.remaining = dur(state.mode);
    state.running = false;
    render();
  });
  $('inc-work').addEventListener('click', () => bump('work', 1));
  $('dec-work').addEventListener('click', () => bump('work', -1));
  $('inc-short').addEventListener('click', () => bump('short', 1));
  $('dec-short').addEventListener('click', () => bump('short', -1));
  $('inc-long').addEventListener('click', () => bump('long', 1));
  $('dec-long').addEventListener('click', () => bump('long', -1));

  // La caja crece hacia abajo con el texto; pasado el tope hace scroll interno
  function growAddTask() {
    els.addTask.style.height = 'auto';
    els.addTask.style.height = (els.addTask.scrollHeight + 2) + 'px';
  }
  els.addTask.addEventListener('input', growAddTask);

  els.addTask.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const v = els.addTask.value.replace(/\s+/g, ' ').trim();
    if (!v) return;
    state.tasks.push({ name: v, done: false });
    els.addTask.value = '';
    growAddTask();
    save();
    renderTasks();
  });

  document.addEventListener('keydown', e => {
    if (e.target === els.addTask || e.key !== ' ') return;
    e.preventDefault();
    setRunning(!state.running);
  });

  renderTasks();
  render();
})();
