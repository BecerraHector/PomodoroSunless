(() => {
  'use strict';

  const STORAGE_KEY = 'vigilia-pomodoro-v1';
  const LONG_MIN = 15;
  const CIRC = 1131; // 2π·180, igual que el trazo del anillo
  const MODES = ['work', 'short', 'long'];
  const WORD = { work: 'Enfoque', short: 'Descanso', long: 'Descanso largo' };
  const ROMAN = ['0', 'I', 'II', 'III', 'IV'];

  const defaults = {
    durWork: 25,
    durShort: 5,
    tasks: [
      { name: 'Redactar el ensayo de estética', done: true },
      { name: 'Revisar wireframes del grimorio', done: false },
      { name: 'Responder correos pendientes', done: false },
      { name: 'Estudiar teoría del color', done: false },
    ],
    doneCount: 0,
  };

  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  })();

  const state = {
    durWork: saved.durWork ?? defaults.durWork,
    durShort: saved.durShort ?? defaults.durShort,
    tasks: Array.isArray(saved.tasks) ? saved.tasks : defaults.tasks,
    doneCount: saved.doneCount ?? defaults.doneCount,
    mode: 'work',
    remaining: (saved.durWork ?? defaults.durWork) * 60,
    running: false,
  };

  const $ = id => document.getElementById(id);
  const els = {
    time: $('time'), progress: $('progress'), modeWord: $('mode-word'),
    hdrCycle: $('hdr-cycle'), hdrMode: $('hdr-mode'),
    toggle: $('btn-toggle'), reset: $('btn-reset'),
    dots: $('dots'), modes: $('modes'), tasks: $('tasks'), addTask: $('add-task'),
    workMin: $('work-min'), shortMin: $('short-min'),
  };

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      durWork: state.durWork, durShort: state.durShort,
      tasks: state.tasks, doneCount: state.doneCount,
    }));
  }

  const dur = mode =>
    (mode === 'work' ? state.durWork : mode === 'short' ? state.durShort : LONG_MIN) * 60;

  const fmt = s =>
    String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  function shownCycles() {
    const d = state.doneCount;
    return d > 0 && d % 4 === 0 ? 4 : d % 4;
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

  function tick() {
    if (!state.running) return;
    state.remaining -= 1;
    if (state.remaining <= 0) {
      chime();
      if (state.mode === 'work') {
        state.doneCount += 1;
        state.mode = state.doneCount % 4 === 0 ? 'long' : 'short';
      } else {
        state.mode = 'work';
      }
      state.remaining = dur(state.mode);
      save();
    }
    render();
  }
  setInterval(tick, 1000);

  function setMode(mode) {
    state.mode = mode;
    state.remaining = dur(mode);
    state.running = false;
    render();
  }

  function bump(which, delta) {
    const key = which === 'work' ? 'durWork' : 'durShort';
    state[key] = Math.max(1, Math.min(90, state[key] + delta));
    const modeKey = which === 'work' ? 'work' : 'short';
    if (state.mode === modeKey && !state.running) state.remaining = dur(modeKey);
    save();
    render();
  }

  function render() {
    const frac = Math.max(0, Math.min(1, state.remaining / dur(state.mode)));
    els.time.textContent = fmt(state.remaining);
    els.progress.setAttribute('stroke-dashoffset', String(Math.round(CIRC * frac)));
    els.modeWord.textContent = WORD[state.mode];
    els.hdrCycle.textContent = ROMAN[shownCycles()];
    els.hdrMode.textContent = WORD[state.mode].toUpperCase();
    els.toggle.textContent = state.running ? 'Pausar' : 'Iniciar';
    els.workMin.textContent = state.durWork + ' min';
    els.shortMin.textContent = state.durShort + ' min';
    document.title = state.running
      ? fmt(state.remaining) + ' · ' + WORD[state.mode] + ' — Vigilia'
      : 'Vigilia — Pomodoro gótico';

    els.dots.querySelectorAll('.dot').forEach((d, i) =>
      d.classList.toggle('on', i < shownCycles()));

    els.modes.querySelectorAll('.chip').forEach((c, i) =>
      c.classList.toggle('active', MODES[i] === state.mode));
  }

  function renderTasks() {
    els.tasks.replaceChildren(...state.tasks.map((t, i) => {
      const row = document.createElement('div');
      row.className = 'task' + (t.done ? ' done' : '');
      const box = document.createElement('span');
      box.className = 'box';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = t.name;
      row.append(box, name);
      row.addEventListener('click', () => {
        state.tasks[i].done = !state.tasks[i].done;
        save();
        renderTasks();
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

  els.toggle.addEventListener('click', () => { state.running = !state.running; render(); });
  els.reset.addEventListener('click', () => {
    state.remaining = dur(state.mode);
    state.running = false;
    render();
  });
  $('inc-work').addEventListener('click', () => bump('work', 1));
  $('dec-work').addEventListener('click', () => bump('work', -1));
  $('inc-short').addEventListener('click', () => bump('short', 1));
  $('dec-short').addEventListener('click', () => bump('short', -1));

  els.addTask.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const v = els.addTask.value.trim();
    if (!v) return;
    state.tasks.push({ name: v, done: false });
    els.addTask.value = '';
    save();
    renderTasks();
  });

  document.addEventListener('keydown', e => {
    if (e.target === els.addTask || e.key !== ' ') return;
    e.preventDefault();
    state.running = !state.running;
    render();
  });

  renderTasks();
  render();
})();
