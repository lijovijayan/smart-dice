// Game sound effects. Every sound is made in the browser with the Web Audio API, so there are
// no audio files to load and the page still works from file://. A cue is a few short tones
// and noise bursts.
//
// Browsers only allow sound after the visitor has clicked or pressed a key. The audio context
// is therefore made on the first sound played, which always follows a roll or a click.

export const SOUND_KEY = 'smart-dice:sound';
const MASTER_VOLUME = 0.6;
const NOISE_SECONDS = 0.5;

/** Makes the audio context. Returns null where Web Audio is not available. */
function defaultContext() {
  const Constructor = window.AudioContext || window.webkitAudioContext;
  return Constructor ? new Constructor() : null;
}

function browserStorage() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A tone that glides from `from` to `to` Hz (in `dur` seconds) and fades out. */
function tone(audio, out, { type = 'sine', from, to = from, start = 0, dur, gain = 0.2 }) {
  const t0 = audio.currentTime + start;
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.01, dur / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(env).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A short burst of filtered noise, for clicks, hisses and pops. */
function burst(audio, out, noise, { start = 0, dur, freq, q = 1, type = 'bandpass', gain = 0.2 }) {
  const t0 = audio.currentTime + start;
  const src = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const env = audio.createGain();
  src.buffer = noise;
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t0, Math.random() * Math.max(0, NOISE_SECONDS - dur));
  src.stop(t0 + dur + 0.02);
}

/** Each cue is named for when the board or the page plays it. */
const CUES = {
  // A tap on a button, or the sound toggle.
  click: (a, o) => tone(a, o, { type: 'square', from: 900, dur: 0.02, gain: 0.03 }),
  // Undo falls, redo rises: a short slide in the matching direction.
  undo: (a, o) => tone(a, o, { type: 'triangle', from: 560, to: 300, dur: 0.14, gain: 0.1 }),
  redo: (a, o) => tone(a, o, { type: 'triangle', from: 300, to: 560, dur: 0.14, gain: 0.1 }),
  // One soft tick per square a token hops over.
  step: (a, o) => {
    const pitch = 620 + Math.random() * 60;
    tone(a, o, { type: 'triangle', from: pitch, to: pitch * 0.94, dur: 0.06, gain: 0.06 });
  },
  // Dice clatter: a run of clicks that fade out, like a die bouncing on a table.
  roll: (a, o, n) => {
    for (let i = 0; i < 7; i += 1) {
      burst(a, o, n, {
        start: i * 0.065 + Math.random() * 0.02,
        dur: 0.05,
        freq: 2600 + Math.random() * 900,
        q: 2.5,
        gain: 0.35 - i * 0.03,
      });
    }
  },
  // A token drops onto its square.
  land: (a, o) => tone(a, o, { type: 'sine', from: 320, to: 170, dur: 0.12, gain: 0.16 }),
  // A wasted roll: a low, short knock.
  bump: (a, o) => tone(a, o, { type: 'triangle', from: 210, to: 120, dur: 0.2, gain: 0.14 }),
  // Climbing a ladder: a rising sweep.
  climb: (a, o) => tone(a, o, { type: 'sine', from: 330, to: 1100, dur: 0.8, gain: 0.1 }),
  // Reaching the top of a ladder: two bright notes.
  chime: (a, o) => {
    tone(a, o, { type: 'sine', from: 1319, dur: 0.5, gain: 0.12 });
    tone(a, o, { type: 'sine', from: 1976, start: 0.08, dur: 0.5, gain: 0.09 });
  },
  // A snake strikes: a hiss and a thump.
  bite: (a, o, n) => {
    burst(a, o, n, { dur: 0.3, freq: 4200, q: 0.9, gain: 0.22 });
    tone(a, o, { type: 'sawtooth', from: 170, to: 60, dur: 0.28, gain: 0.14 });
  },
  // The snake swallows: a low gulp.
  swallow: (a, o) => tone(a, o, { type: 'sine', from: 260, to: 85, dur: 0.5, gain: 0.2 }),
  // The snake spits the token out: a pop.
  spit: (a, o, n) => {
    burst(a, o, n, { dur: 0.08, freq: 1800, q: 1.5, gain: 0.25 });
    tone(a, o, { type: 'sine', from: 700, to: 1400, dur: 0.12, gain: 0.1 });
  },
  // Someone wins: a rising arpeggio.
  win: (a, o) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((pitch, i) => {
      tone(a, o, { type: 'triangle', from: pitch, start: i * 0.13, dur: 0.4, gain: 0.14 });
    });
  },
};

export const SOUND_CUES = Object.freeze(Object.keys(CUES));

function makeNoise(audio) {
  const size = Math.floor(audio.sampleRate * NOISE_SECONDS);
  const buffer = audio.createBuffer(1, size, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * The sound effects for the game. Sound is on unless the visitor turns it off, and that choice
 * is remembered. Every method is safe when audio is blocked or missing: it just stays silent.
 * @param {{ storage?: Pick<Storage, 'getItem' | 'setItem'> | null, createContext?: () => any }} [options]
 */
export function createSound({ storage = browserStorage(), createContext = defaultContext } = {}) {
  let enabled = true;
  try {
    enabled = storage ? storage.getItem(SOUND_KEY) !== 'off' : true;
  } catch {
    enabled = true;
  }

  let audio = null;
  let out = null;
  let noise = null;
  let unavailable = false;

  /** Makes the audio graph the first time it is needed. Returns null when audio is unavailable. */
  function ready() {
    if (audio) return audio;
    if (unavailable) return null;
    audio = createContext();
    if (!audio) {
      unavailable = true;
      return null;
    }
    out = audio.createGain();
    out.gain.value = MASTER_VOLUME;
    out.connect(audio.destination);
    noise = makeNoise(audio);
    return audio;
  }

  function play(name) {
    if (!enabled || !Object.prototype.hasOwnProperty.call(CUES, name)) return;
    const context = ready();
    if (!context) return;
    if (context.state === 'suspended') void context.resume();
    try {
      CUES[name](context, out, noise);
    } catch {
      // A sound must never break the game, so a failure here is ignored.
    }
  }

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(value) {
      enabled = Boolean(value);
      try {
        storage?.setItem(SOUND_KEY, enabled ? 'on' : 'off');
      } catch {
        // Storage may be full or blocked. The choice then lasts for this visit only.
      }
      if (enabled) play('click');
    },
    play,
  };
}
