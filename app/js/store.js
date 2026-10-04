// Progress and settings, saved on the device (localStorage) with JSON backup/restore.
//
// Several players can share the tablet. Each player has their own progress, stored under
// 'pianoTutor.v1.<id>'. Settings that belong to the TABLET (mic sensitivity, timing delay,
// theme, on-screen keys, metronome) are shared by everyone and stored in 'pianoTutor.device';
// they're merged into each player's `settings` so the rest of the app needn't care.

const LEGACY_KEY = 'pianoTutor.v1';            // single-player data from before v0.3
const PROFILES_KEY = 'pianoTutor.profiles';
const DEVICE_KEY = 'pianoTutor.device';
const playerKey = id => `pianoTutor.v1.${id}`;
const ACTIVE_GAP = 120; // seconds: a pause longer than this isn't counted as practice

export const DEVICE_SETTINGS = ['micThreshold', 'latency', 'theme', 'touchKeyboard', 'click', 'autoListen'];
const DEVICE_DEFAULTS = { touchKeyboard: true, micThreshold: 0.012, theme: 'system', autoListen: true };
const PLAYER_COLOURS = ['#2563c4', '#c2410c', '#7c3aed', '#0f766e', '#be185d', '#a16207'];

const fresh = () => ({
  version: 1,
  createdAt: Date.now(),
  settings: { ...DEVICE_DEFAULTS },
  onboarded: false,
  placement: null,            // { at, score, total, passed }
  lessons: {},                // id -> { done, completedAt, steps:{ i: { done, mastered, best, ... } }, lastAt }
  notes: {},                  // 'C4' -> { box 1-5, seen, right, avgMs, lastAt }
  practice: {},               // 'YYYY-MM-DD' -> seconds
  history: [],                // [{ at, kind, id, title, detail }]  newest last, capped
  lastActiveAt: null,
  prevSessionAt: null,        // last activity before the current session started
});

const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Could not save', e); } };

let device = { ...DEVICE_DEFAULTS, ...read(DEVICE_KEY, {}) };
let profiles = loadProfiles();
let state = loadPlayer(profiles.active);
const subs = new Set();

function loadProfiles() {
  const p = read(PROFILES_KEY, null);
  if (p) return p;
  // First run of the multi-player version: turn existing progress into the first player.
  const legacy = read(LEGACY_KEY, null);
  if (legacy) {
    const id = 'p' + Date.now().toString(36);
    write(playerKey(id), legacy);
    const pick = k => legacy.settings?.[k] !== undefined && (device[k] = legacy.settings[k]);
    DEVICE_SETTINGS.forEach(pick);
    write(DEVICE_KEY, device);
    const out = { active: id, list: [{ id, name: 'Jonny', colour: PLAYER_COLOURS[0], createdAt: legacy.createdAt || Date.now() }] };
    write(PROFILES_KEY, out);
    try { localStorage.removeItem(LEGACY_KEY); } catch {}
    return out;
  }
  return { active: null, list: [] };
}
function loadPlayer(id) {
  const s = id ? read(playerKey(id), null) : null;
  return withDevice(s ? migrate(s) : fresh());
}
function migrate(s) {
  const base = fresh();
  return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
}
function withDevice(s) { s.settings = { ...s.settings, ...device }; return s; }

function save() {
  // tablet-wide settings go to the device store; the rest to the current player
  DEVICE_SETTINGS.forEach(k => { if (state.settings[k] !== undefined) device[k] = state.settings[k]; });
  write(DEVICE_KEY, device);
  if (profiles.active) write(playerKey(profiles.active), state);
  subs.forEach(fn => fn(state));
}

export const store = {
  get: () => state,
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  update(fn) { fn(state); save(); },

  // ---- players
  players: () => profiles.list,
  current: () => profiles.list.find(p => p.id === profiles.active) || null,
  addPlayer(name) {
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const colour = PLAYER_COLOURS[profiles.list.length % PLAYER_COLOURS.length];
    profiles.list.push({ id, name: name.trim() || 'Player', colour, createdAt: Date.now() });
    write(PROFILES_KEY, profiles);
    write(playerKey(id), fresh());
    return id;
  },
  switchTo(id) {
    if (!profiles.list.some(p => p.id === id)) return;
    profiles.active = id;
    write(PROFILES_KEY, profiles);
    state = loadPlayer(id);
    subs.forEach(fn => fn(state));
  },
  renamePlayer(id, name) {
    const p = profiles.list.find(x => x.id === id);
    if (p && name.trim()) { p.name = name.trim(); write(PROFILES_KEY, profiles); }
  },
  removePlayer(id) {
    profiles.list = profiles.list.filter(p => p.id !== id);
    try { localStorage.removeItem(playerKey(id)); } catch {}
    if (profiles.active === id) {
      profiles.active = profiles.list[0]?.id || null;
      state = loadPlayer(profiles.active);
    }
    write(PROFILES_KEY, profiles);
    subs.forEach(fn => fn(state));
  },

  // Called on any practice activity (notes played, steps completed).
  activity() {
    if (!profiles.active) return;
    const now = Date.now();
    const last = state.lastActiveAt;
    if (last && (now - last) / 1000 < ACTIVE_GAP) {
      const day = dayKey(now);
      state.practice[day] = (state.practice[day] || 0) + (now - last) / 1000;
    } else if (last) {
      state.prevSessionAt = last; // a new session is starting
    }
    state.lastActiveAt = now;
    save();
  },

  log(kind, id, title, detail) {
    state.history.push({ at: Date.now(), kind, id, title, detail });
    if (state.history.length > 500) state.history = state.history.slice(-500);
    save();
  },

  lesson(id) { return state.lessons[id] || (state.lessons[id] = { done: false, steps: {}, attempts: 0 }); },

  // Backup / restore apply to the current player.
  exportJSON() { return JSON.stringify({ ...state, player: store.current()?.name }, null, 2); },
  importJSON(text) {
    const s = JSON.parse(text);
    if (!s || s.version !== 1) throw new Error('This does not look like a Piano Tutor backup.');
    delete s.player;
    state = withDevice(migrate(s)); save();
  },
  reset() { state = withDevice(fresh()); save(); },
};

export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Ask the browser not to evict our storage.
try { navigator.storage?.persist?.(); } catch {}
