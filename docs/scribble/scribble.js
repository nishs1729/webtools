/*
 * Scribble Pad: a simple drawing canvas.
 * The drawing is a list of actions (strokes and clears) rather than pixels,
 * so undo/redo is cheap, resizing never stretches anything, and the whole
 * drawing can be saved in localStorage and replayed on load.
 */
(function () {
  const SWATCHES = ["#1c1c1a", "#d0453a", "#e8a33d", "#2e9c5a", "#2f6fde", "#8b5cf6"];
  const DEFAULTS = {
    tool: "pen",
    color: SWATCHES[0],
    size: 6,
    opacity: 1,
    bg: "#ffffff",
    transparent: false,
    grid: false,
    format: "image/png",
  };
  const STORE_KEY = "webtools-scribble";
  const MAX_SIZE = 60;

  /* ---------- Saved state ---------- */

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      return {};
    }
  })();

  const settings = { ...DEFAULTS, ...saved.settings };
  // Each action is { tool, color, size, opacity, points: [x0, y0, x1, y1, …] } or { clear: true }.
  const actions = Array.isArray(saved.actions) ? saved.actions : [];
  const undone = [];

  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ settings, actions }));
      } catch {
        // Storage full: keep drawing, it just won't survive a reload.
      }
    }, 300);
  }

  /* ---------- Canvas ---------- */

  const wrap = document.getElementById("wrap");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  // Finished strokes are drawn here once; the visible canvas = this + the stroke in progress.
  const committed = document.createElement("canvas");
  const cctx = committed.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    const rect = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    for (const [c, context] of [[canvas, ctx], [committed, cctx]]) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    replay();
  }

  function drawAction(c, a) {
    if (a.clear) {
      c.clearRect(0, 0, width, height);
      return;
    }
    const p = a.points;
    c.save();
    c.globalCompositeOperation = a.tool === "eraser" ? "destination-out" : "source-over";
    c.globalAlpha = a.tool === "eraser" ? 1 : a.opacity;
    c.strokeStyle = c.fillStyle = a.color;
    c.lineWidth = a.size;
    c.lineCap = c.lineJoin = "round";
    c.beginPath();
    if (p.length <= 2) {
      // A single tap: a dot.
      c.arc(p[0], p[1], a.size / 2, 0, Math.PI * 2);
      c.fill();
    } else {
      // Smooth the line by curving through the midpoints between samples.
      c.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length - 2; i += 2) {
        c.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
      }
      c.lineTo(p[p.length - 2], p[p.length - 1]);
      c.stroke();
    }
    c.restore();
  }

  // Redraw every action from scratch into the committed layer.
  function replay() {
    cctx.clearRect(0, 0, width, height);
    for (const a of actions) drawAction(cctx, a);
    paint();
  }

  // Show the committed layer plus the stroke being drawn.
  function paint() {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(committed, 0, 0, width, height);
    if (current) drawAction(ctx, current);
    updateHistoryButtons();
  }

  /* ---------- Drawing ---------- */

  let current = null;
  let pointerId = null;
  let frame = 0;

  const paintSoon = () => (frame ||= requestAnimationFrame(() => ((frame = 0), paint())));

  function addPoint(e) {
    const rect = canvas.getBoundingClientRect();
    current.points.push(
      Math.round((e.clientX - rect.left) * 10) / 10,
      Math.round((e.clientY - rect.top) * 10) / 10
    );
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (pointerId !== null || e.button !== 0) return; // one stroke at a time
    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    current = {
      tool: settings.tool,
      color: settings.color,
      size: settings.size,
      opacity: settings.opacity,
      points: [],
    };
    addPoint(e);
    paintSoon();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointerId) return;
    // Coalesced events give the full-resolution path between frames.
    for (const ev of e.getCoalescedEvents?.() ?? [e]) addPoint(ev);
    paintSoon();
  });

  function endStroke(e) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    commit(current);
    current = null;
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  function commit(action) {
    actions.push(action);
    undone.length = 0;
    drawAction(cctx, action);
    paint();
    save();
  }

  function undo() {
    if (!actions.length) return;
    undone.push(actions.pop());
    replay();
    save();
  }

  function redo() {
    if (!undone.length) return;
    actions.push(undone.pop());
    replay();
    save();
  }

  /* ---------- Toolbar ---------- */

  const toolBtns = [...document.querySelectorAll("[data-tool]")];
  const swatchesEl = document.getElementById("swatches");
  const customColor = document.getElementById("custom-color");
  const customSwatch = customColor.parentElement;
  const sizeEl = document.getElementById("size");
  const opacityEl = document.getElementById("opacity");
  const undoBtn = document.getElementById("undo");
  const redoBtn = document.getElementById("redo");
  const bgEl = document.getElementById("bg");
  const transparentEl = document.getElementById("transparent");
  const gridEl = document.getElementById("grid");
  const formatEl = document.getElementById("format");

  customSwatch.insertAdjacentHTML(
    "beforebegin",
    SWATCHES.map(
      (c) => `<button type="button" class="scribble__swatch" style="--swatch:${c}" data-color="${c}" aria-label="Colour ${c}"></button>`
    ).join("")
  );
  const swatchBtns = [...swatchesEl.querySelectorAll("[data-color]")];

  function updateHistoryButtons() {
    undoBtn.disabled = !actions.length;
    redoBtn.disabled = !undone.length;
  }

  function updateToolbar() {
    for (const b of toolBtns) b.setAttribute("aria-pressed", b.dataset.tool === settings.tool);
    for (const b of swatchBtns) b.setAttribute("aria-pressed", b.dataset.color === settings.color);
    const custom = !SWATCHES.includes(settings.color);
    customSwatch.setAttribute("aria-pressed", custom);
    customSwatch.style.background = custom ? settings.color : "";
    customColor.value = settings.color;
    sizeEl.value = settings.size;
    document.getElementById("size-out").value = `${settings.size} px`;
    opacityEl.value = settings.opacity;
    document.getElementById("opacity-out").value = `${Math.round(settings.opacity * 100)}%`;
    bgEl.value = settings.bg;
    transparentEl.checked = settings.transparent;
    gridEl.checked = settings.grid;
    formatEl.value = settings.format;
    wrap.style.setProperty("--paper", settings.bg);
    wrap.classList.toggle("is-transparent", settings.transparent);
    wrap.classList.toggle("has-grid", settings.grid);
  }

  function set(changes) {
    Object.assign(settings, changes);
    updateToolbar();
    save();
  }

  for (const b of toolBtns) b.addEventListener("click", () => set({ tool: b.dataset.tool }));
  // Picking a colour switches back to the pen.
  for (const b of swatchBtns) b.addEventListener("click", () => set({ color: b.dataset.color, tool: "pen" }));
  customColor.addEventListener("input", () => set({ color: customColor.value, tool: "pen" }));
  sizeEl.addEventListener("input", () => set({ size: Number(sizeEl.value) }));
  opacityEl.addEventListener("input", () => set({ opacity: Number(opacityEl.value) }));
  bgEl.addEventListener("input", () => set({ bg: bgEl.value, transparent: false }));
  transparentEl.addEventListener("change", () => set({ transparent: transparentEl.checked }));
  gridEl.addEventListener("change", () => set({ grid: gridEl.checked }));
  formatEl.addEventListener("change", () => set({ format: formatEl.value }));

  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);

  // Clearing is an action too, so it can be undone.
  document.getElementById("clear").addEventListener("click", () => {
    if (actions.length && !actions[actions.length - 1].clear) commit({ clear: true });
  });

  document.getElementById("download").addEventListener("click", () => {
    const out = document.createElement("canvas");
    out.width = committed.width;
    out.height = committed.height;
    const octx = out.getContext("2d");
    // JPEG has no transparency, so it always gets the background colour.
    if (!settings.transparent || settings.format === "image/jpeg") {
      octx.fillStyle = settings.bg;
      octx.fillRect(0, 0, out.width, out.height);
    }
    octx.drawImage(committed, 0, 0);

    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[settings.format];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    out.toBlob(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scribble-${stamp}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      settings.format,
      0.92
    );
  });

  /* ---------- Keyboard ---------- */

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea")) return;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (mod && key === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    } else if (mod && key === "y") {
      e.preventDefault();
      redo();
    } else if (mod || e.altKey) {
      return;
    } else if (key === "b") {
      set({ tool: "pen" });
    } else if (key === "e") {
      set({ tool: "eraser" });
    } else if (key === "[" || key === "-") {
      set({ size: Math.max(1, settings.size - (settings.size > 10 ? 2 : 1)) });
    } else if (key === "]" || key === "+" || key === "=") {
      set({ size: Math.min(MAX_SIZE, settings.size + (settings.size >= 10 ? 2 : 1)) });
    }
  });

  /* ---------- Init ---------- */

  updateToolbar();
  new ResizeObserver(resize).observe(wrap);
})();
