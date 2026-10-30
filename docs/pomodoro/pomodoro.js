/*
 * Pomodoro: focus / short break / long break cycles.
 * A running session is stored as an absolute end time, so it stays accurate
 * in a background tab and carries on after a reload.
 */
(function () {
  const DEFAULTS = { focus: 25, short: 5, long: 15, cycles: 4, sound: true, notify: true, autostart: false };
  const LIMITS = { focus: 120, short: 60, long: 120, cycles: 10 };
  const LABELS = { focus: "Focus", short: "Short break", long: "Long break" };
  const STORE_KEY = "webtools-pomodoro";
  const MINUTE = 60_000;
  const RING = 2 * Math.PI * 100;
  const DRAG_PX = 24; // drag distance per minute when adjusting the time

  const ICONS = {
    play: '<path d="M7 4v16l13-8z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
  };

  /* ---------- State ---------- */

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      return {};
    }
  })();

  const settings = { ...DEFAULTS, ...saved.settings };
  const timer = {
    mode: "focus",
    length: settings.focus * MINUTE, // full length of this session (ms)
    remaining: settings.focus * MINUTE, // time left while paused (ms)
    endTime: null, // set while running
    done: 0, // focus sessions finished in the current round
    today: { date: "", pomos: 0, minutes: 0 },
    ...saved.timer,
  };

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ settings, timer }));
    } catch {}
  }

  const isRunning = () => timer.endTime !== null;
  const timeLeft = () => (isRunning() ? Math.max(0, timer.endTime - Date.now()) : timer.remaining);
  const duration = (mode) => settings[mode] * MINUTE;

  function rollToday() {
    const date = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
    if (timer.today.date !== date) timer.today = { date, pomos: 0, minutes: 0 };
  }

  /* ---------- Timer ---------- */

  let endTimeout = null;

  function start() {
    if (timer.remaining <= 0) timer.remaining = timer.length;
    timer.endTime = Date.now() + timer.remaining;
    // A single timeout for the end, so a throttled background tab still finishes on time.
    clearTimeout(endTimeout);
    endTimeout = setTimeout(tick, timer.remaining + 50);
    wakeLock.request();
    save();
    render();
  }

  function pause() {
    timer.remaining = timeLeft();
    timer.endTime = null;
    clearTimeout(endTimeout);
    wakeLock.release();
    save();
    render();
  }

  function setSession(mode) {
    if (isRunning()) pause();
    timer.mode = mode;
    timer.length = timer.remaining = duration(mode);
  }

  function nextMode() {
    if (timer.mode !== "focus") return "focus";
    return timer.done >= settings.cycles ? "long" : "short";
  }

  function advance() {
    // A new round of focus sessions starts after the long break.
    if (timer.mode === "long") timer.done = 0;
    setSession(nextMode());
  }

  // quiet: the session ended while the page was closed, so don't chime or notify.
  function finish(quiet) {
    const finished = timer.mode;
    timer.endTime = null;
    timer.remaining = 0;
    if (finished === "focus") {
      timer.done = Math.min(timer.done + 1, settings.cycles);
      rollToday();
      timer.today.pomos++;
      timer.today.minutes += Math.round(timer.length / MINUTE);
    }
    advance();
    if (!quiet) {
      alertEnd(finished);
      if (settings.autostart) return start();
    }
    wakeLock.release();
    save();
    render();
  }

  function tick() {
    if (!isRunning()) return;
    if (timeLeft() <= 0) finish(false);
    else render();
  }

  setInterval(tick, 250);

  // Change the paused time by whole minutes (drag or scroll on the ring).
  function adjust(minutes) {
    const mins = Math.round(timer.remaining / MINUTE) + minutes;
    const ms = Math.min(LIMITS[timer.mode], Math.max(1, mins)) * MINUTE;
    if (ms === timer.remaining) return;
    const untouched = timer.remaining === timer.length;
    timer.remaining = ms;
    timer.length = untouched ? ms : Math.max(timer.length, ms);
    sound.tick(minutes > 0);
    save();
    render();
  }

  /* ---------- Sound, notifications, wake lock ---------- */

  const sound = (() => {
    let ctx;
    const audio = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

    function tone(freq, at, peak, length) {
      const c = audio();
      const osc = c.createOscillator();
      const gain = c.createGain();
      const t = c.currentTime + at;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + length);
      osc.connect(gain).connect(c.destination);
      osc.start(t);
      osc.stop(t + length + 0.05);
    }

    return {
      // Call from a click so the browser lets audio play later.
      unlock: () => audio().resume(),
      chime: () => [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.12, 0.18, 1.4)), // C5 E5 G5
      tick: (up) => tone(up ? 1050 : 820, 0, 0.1, 0.06),
    };
  })();

  function alertEnd(finished) {
    if (settings.sound) sound.chime();
    navigator.vibrate?.([180, 60, 180]);

    if (settings.notify && window.Notification?.permission === "granted") {
      const body =
        finished === "focus"
          ? `Focus session done. Time for a ${timer.mode === "long" ? "long" : "short"} break.`
          : "Break's over. Ready to focus?";
      new Notification("Pomodoro", { body, icon: "../assets/favicon.svg" });
    }
  }

  function askNotifyPermission() {
    if (settings.notify && window.Notification?.permission === "default") {
      Notification.requestPermission();
    }
  }

  // Keep the screen awake while a session runs (released by the browser when the tab hides).
  const wakeLock = {
    lock: null,
    async request() {
      try {
        this.lock = await navigator.wakeLock?.request("screen");
      } catch {}
    },
    release() {
      this.lock?.release().catch(() => {});
      this.lock = null;
    },
  };

  /* ---------- UI ---------- */

  const root = document.getElementById("pomo");
  const timeEl = document.getElementById("time");
  const progressEl = document.getElementById("progress");
  const dotsEl = document.getElementById("dots");
  const playBtn = document.getElementById("play");
  const todayEl = document.getElementById("today");
  const ringEl = document.getElementById("ring");
  const tabs = [...document.querySelectorAll("[data-mode]")];
  const settingsForm = document.querySelector(".pomo__settings");
  const baseTitle = document.title;

  function format(ms) {
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function render() {
    const running = isRunning();
    const left = timeLeft();

    root.dataset.mode = timer.mode;
    root.classList.toggle("is-running", running);

    timeEl.textContent = format(left);
    progressEl.style.strokeDashoffset = RING * (1 - Math.min(1, left / timer.length));

    for (const tab of tabs) {
      tab.setAttribute("aria-selected", tab.dataset.mode === timer.mode);
      tab.disabled = running;
    }

    dotsEl.innerHTML = Array.from({ length: settings.cycles }, (_, i) =>
      `<i class="${i < timer.done ? "is-done" : ""}"></i>`
    ).join("");

    playBtn.innerHTML = Site.svg(running ? ICONS.pause : ICONS.play);
    playBtn.title = running ? "Pause (Space)" : "Start (Space)";
    playBtn.setAttribute("aria-label", running ? "Pause" : "Start");

    rollToday();
    const { pomos, minutes } = timer.today;
    todayEl.textContent = pomos
      ? `Today: ${pomos} pomodoro${pomos === 1 ? "" : "s"} · ${minutes} min focused`
      : "No pomodoros yet today.";

    document.title = running ? `${format(left)} · ${LABELS[timer.mode]}` : baseTitle;
  }

  function toggle() {
    if (isRunning()) return pause();
    sound.unlock();
    askNotifyPermission();
    start();
  }

  function reset() {
    setSession(timer.mode);
    save();
    render();
  }

  function skip() {
    advance();
    save();
    render();
  }

  function switchTo(mode) {
    if (isRunning()) return;
    setSession(mode);
    save();
    render();
  }

  playBtn.addEventListener("click", toggle);
  document.getElementById("reset").addEventListener("click", reset);
  document.getElementById("skip").addEventListener("click", skip);
  for (const tab of tabs) tab.addEventListener("click", () => switchTo(tab.dataset.mode));

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, select, textarea")) return;
    // Space on a focused button already clicks it.
    if (e.key === " " && e.target.closest("button, summary")) return;
    const action = {
      " ": toggle,
      r: reset,
      s: skip,
      1: () => switchTo("focus"),
      2: () => switchTo("short"),
      3: () => switchTo("long"),
    }[e.key.toLowerCase()];
    if (action) {
      e.preventDefault();
      action();
    }
  });

  // Drag the ring up/down, or scroll on it, to change the time while paused.
  let drag = null;
  ringEl.addEventListener("pointerdown", (e) => {
    if (isRunning()) return;
    sound.unlock();
    drag = { y: e.clientY, steps: 0 };
    ringEl.setPointerCapture(e.pointerId);
  });
  ringEl.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const steps = Math.trunc((drag.y - e.clientY) / DRAG_PX);
    if (steps !== drag.steps) {
      adjust(steps - drag.steps);
      drag.steps = steps;
    }
  });
  ringEl.addEventListener("pointerup", () => (drag = null));
  ringEl.addEventListener("pointercancel", () => (drag = null));

  let wheel = 0;
  ringEl.addEventListener(
    "wheel",
    (e) => {
      if (isRunning()) return;
      e.preventDefault();
      wheel += e.deltaY;
      if (Math.abs(wheel) >= 50) {
        adjust(wheel < 0 ? 1 : -1);
        wheel = 0;
      }
    },
    { passive: false }
  );

  // Settings form
  for (const input of settingsForm.querySelectorAll("input")) {
    const key = input.name;
    if (input.type === "checkbox") input.checked = settings[key];
    else input.value = settings[key];

    input.addEventListener("change", () => {
      if (input.type === "checkbox") {
        settings[key] = input.checked;
        if (key === "notify") askNotifyPermission();
      } else {
        const n = Math.round(Number(input.value)) || DEFAULTS[key];
        settings[key] = Math.min(LIMITS[key], Math.max(1, n));
        input.value = settings[key];
        timer.done = Math.min(timer.done, settings.cycles);
        // Apply new durations right away unless a session is under way.
        if (!isRunning() && timer.remaining === timer.length) setSession(timer.mode);
      }
      save();
      render();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    tick();
    if (isRunning()) wakeLock.request();
  });

  /* ---------- Init ---------- */

  if (isRunning()) {
    if (timeLeft() <= 0) finish(true);
    else endTimeout = setTimeout(tick, timeLeft() + 50);
  }
  render();
})();
