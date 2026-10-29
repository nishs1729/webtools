/*
 * Noisee: mix looping ambient sounds with Web Audio.
 * Each sound is fetched on first play from sounds/<id>.mp3.
 * Volumes and the last mix are remembered in localStorage.
 */
(function () {
  const SOUNDS = [
    { id: "rain", name: "Rain", icon: "🌧️" },
    { id: "river", name: "River", icon: "🏞️" },
    { id: "wind", name: "Wind", icon: "🌬️" },
    { id: "fire", name: "Fire", icon: "🔥" },
    { id: "birds", name: "Birds", icon: "🐦" },
    { id: "night-birds", name: "Night birds", icon: "🦉" },
    { id: "cicada", name: "Cicada", icon: "🦗" },
    { id: "sea", name: "Sea", icon: "🌊" },
  ];

  // Sounds listed in a preset play at that volume; the rest are turned off.
  const PRESETS = {
    "Cozy Fireplace": { wind: 0.1, fire: 0.7, cicada: 0.5, "night-birds": 0.4 },
    "Gentle Rain": { rain: 0.6, wind: 0.1 },
    "Rainy Night": { rain: 0.8, river: 0.5, wind: 0.3, cicada: 0.3 },
    "Tropical Beach": { river: 0.5, wind: 0.1, birds: 1, sea: 0.8 },
    "Thunderstorm": { rain: 0.9, river: 0.7, wind: 0.7 },
    "Summer Night": { river: 0.2, wind: 0.1, fire: 0.5, cicada: 1, "night-birds": 0.7 },
    "Forest Campfire": { river: 0.2, wind: 0.1, fire: 1, birds: 0.7, cicada: 1, "night-birds": 0.4 },
    "Windy River": { river: 1, wind: 0.4 },
    "Beach Day": { wind: 0.1, birds: 0.6, sea: 0.8 },
    "Night Swamp": { river: 0.7, cicada: 0.9, sea: 0.2, "night-birds": 0.7 },
  };

  const STORE_KEY = "webtools-noisee";
  const FADE = 0.15; // time constant (s) for volume fades
  const DEFAULT_VOLUME = 0.6;

  const ICONS = {
    play: '<path d="M7 4v16l13-8z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
  };

  /* ---------- Saved state: { master, volumes: {id: v}, mix: [id] } ---------- */

  const state = (() => {
    const fallback = { master: 0.5, volumes: {}, mix: [] };
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
    } catch {
      return fallback;
    }
  })();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {}
  }

  /* ---------- Audio graph: source → sound gain → master gain → out ---------- */

  let ctx, masterGain;

  const sounds = SOUNDS.map((def) => ({
    ...def,
    vol: state.volumes[def.id] ?? DEFAULT_VOLUME,
    on: false, // what the user wants
    source: null, // what is actually playing
    gain: null,
    loading: null,
  }));

  // The AudioContext is created on first use, inside a click, so browsers allow it.
  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = state.master;
      masterGain.connect(ctx.destination);
      for (const s of sounds) {
        s.gain = ctx.createGain();
        s.gain.gain.value = 0;
        s.gain.connect(masterGain);
      }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  const ramp = (param, value) => param.setTargetAtTime(value, ctx.currentTime, FADE);

  function loadBuffer(s) {
    s.loading ??= fetch(`sounds/${s.id}.mp3`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch((err) => {
        s.loading = null;
        throw err;
      });
    return s.loading;
  }

  // Bring the audio in line with s.on. Safe to call repeatedly, even mid-load.
  async function sync(s) {
    render(s);

    if (!s.on) {
      if (s.source) {
        ramp(s.gain.gain, 0);
        s.source.stop(ctx.currentTime + FADE * 5);
        s.source = null;
      }
      return;
    }

    audio();
    if (s.source) return ramp(s.gain.gain, s.vol);

    let buffer;
    try {
      buffer = await loadBuffer(s);
    } catch (err) {
      console.error(`Noisee: could not load ${s.id}`, err);
      errorEl.hidden = false;
      s.on = false;
      render(s);
      updatePlayButton();
      return;
    }

    // Turned off, or started by another call, while loading.
    if (!s.on || s.source) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(s.gain);
    // Random start point so layered sounds don't line up the same way every time.
    source.start(0, Math.random() * buffer.duration);
    s.source = source;
    ramp(s.gain.gain, s.vol);
    render(s);
  }

  function setOn(s, on) {
    s.on = on;
    sync(s);
  }

  // Remember the current mix so Play can bring it back later, even after a reload.
  function mixChanged() {
    const mix = sounds.filter((s) => s.on).map((s) => s.id);
    if (mix.length) state.mix = mix;
    save();
    updatePlayButton();
  }

  function setVolume(s, vol) {
    s.vol = vol;
    s.slider.value = vol;
    state.volumes[s.id] = vol;
    if (s.source) ramp(s.gain.gain, vol);
  }

  /* ---------- UI ---------- */

  const grid = document.getElementById("sounds");
  const playBtn = document.getElementById("play");
  const masterEl = document.getElementById("master");
  const presetEl = document.getElementById("preset");
  const errorEl = document.getElementById("error");

  grid.innerHTML = sounds
    .map(
      (s) => `
        <li class="sound" data-id="${s.id}">
          <button class="sound__toggle" type="button" aria-pressed="false">
            <span class="sound__icon" aria-hidden="true">${s.icon}</span>
            <span class="sound__name">${s.name}</span>
            <span class="sound__bars" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
          <input class="sound__vol" type="range" min="0" max="1" step="0.01"
                 value="${s.vol}" aria-label="${s.name} volume">
        </li>`
    )
    .join("");

  function render(s) {
    s.el.classList.toggle("is-on", s.on);
    s.el.classList.toggle("is-loading", s.on && !s.source);
    s.toggle.setAttribute("aria-pressed", s.on);
  }

  function updatePlayButton() {
    const playing = sounds.some((s) => s.on);
    playBtn.innerHTML = `${Site.svg(playing ? ICONS.pause : ICONS.play)}${playing ? "Pause" : "Play"}`;
    playBtn.disabled = !playing && !state.mix.length;
    playBtn.title = playBtn.disabled ? "Pick a sound or a preset first" : "";
  }

  for (const s of sounds) {
    s.el = grid.querySelector(`[data-id="${s.id}"]`);
    s.toggle = s.el.querySelector(".sound__toggle");
    s.slider = s.el.querySelector(".sound__vol");

    s.toggle.addEventListener("click", () => {
      setOn(s, !s.on);
      presetEl.value = "";
      mixChanged();
    });

    s.slider.addEventListener("input", () => {
      setVolume(s, parseFloat(s.slider.value));
      presetEl.value = "";
      save();
    });
  }

  playBtn.addEventListener("click", () => {
    const playing = sounds.some((s) => s.on);
    for (const s of sounds) setOn(s, !playing && state.mix.includes(s.id));
    mixChanged();
  });

  masterEl.value = state.master;
  masterEl.addEventListener("input", () => {
    state.master = parseFloat(masterEl.value);
    if (masterGain) ramp(masterGain.gain, state.master);
    save();
  });

  presetEl.insertAdjacentHTML(
    "beforeend",
    Object.keys(PRESETS).map((name) => `<option>${name}</option>`).join("")
  );
  presetEl.addEventListener("change", () => {
    const preset = PRESETS[presetEl.value];
    if (!preset) return;
    for (const s of sounds) {
      if (s.id in preset) setVolume(s, preset[s.id]);
      setOn(s, s.id in preset);
    }
    mixChanged();
  });

  // Space toggles play/pause, unless a control has focus.
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      if (!playBtn.disabled) playBtn.click();
    }
  });

  updatePlayButton();
})();
