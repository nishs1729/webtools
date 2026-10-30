/*
 * QR Code: create (EasyQRCodeJS) and scan (jsQR, from the camera or an image).
 * Both libraries are vendored in ./vendor, so everything runs offline.
 */
(function () {
  const DEFAULTS = {
    text: "",
    level: "M",
    size: 512,
    fg: "#000000",
    bg: "#ffffff",
    margin: 16,
    dotScale: 1,
    title: "",
    logoScale: 0.22,
  };
  const STORE_KEY = "webtools-qr";

  const state = (() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
    } catch {
      return { ...DEFAULTS };
    }
  })();

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {}
  }

  const $ = (id) => document.getElementById(id);

  /* ================= Create ================= */

  const textEl = $("text");
  const previewEl = $("preview");
  const pngBtn = $("download-png");
  const svgBtn = $("download-svg");
  const copyBtn = $("copy-image");
  const optionsEl = document.querySelector(".qr__options");
  const logoScaleEl = $("logo-scale");

  // Images are kept in memory only: { url, ratio } (ratio = width / height).
  const images = { logo: null, background: null };
  let pngUrl = null;
  let renderId = 0;

  function qrOptions(text, drawer) {
    const { size } = state;
    const opts = {
      text,
      drawer,
      width: size,
      height: size,
      colorDark: state.fg,
      colorLight: state.bg,
      correctLevel: QRCode.CorrectLevel[state.level],
      quietZone: state.margin,
      quietZoneColor: state.bg,
      dotScale: state.dotScale,
    };
    if (state.title) {
      Object.assign(opts, {
        title: state.title,
        titleFont: `600 ${Math.round(size * 0.055)}px system-ui, sans-serif`,
        titleColor: state.fg,
        titleBackgroundColor: state.bg,
        titleHeight: Math.round(size * 0.13),
        titleTop: Math.round(size * 0.08),
      });
    }
    if (images.logo) {
      // Fit the logo in a square box, keeping its aspect ratio.
      const box = size * state.logoScale;
      const { ratio } = images.logo;
      Object.assign(opts, {
        logo: images.logo.url,
        logoWidth: ratio >= 1 ? box : box * ratio,
        logoHeight: ratio >= 1 ? box / ratio : box,
        logoBackgroundTransparent: true,
      });
    }
    if (images.background) {
      Object.assign(opts, { backgroundImage: images.background.url, autoColor: true });
    }
    return opts;
  }

  // Draw into a detached element; resolves with that element once drawing (incl. images) is done.
  function draw(text, drawer) {
    return new Promise((resolve, reject) => {
      const holder = document.createElement("div");
      try {
        new QRCode(holder, {
          ...qrOptions(text, drawer),
          onRenderingEnd: (_, dataUrl) => resolve({ holder, dataUrl }),
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function setPreview(html, ready) {
    previewEl.innerHTML = html;
    pngBtn.disabled = svgBtn.disabled = copyBtn.disabled = !ready;
  }

  async function render() {
    const id = ++renderId;
    const text = state.text.trim();
    pngUrl = null;
    if (!text) return setPreview('<p class="muted">Your QR code will appear here.</p>', false);

    try {
      const { dataUrl } = await draw(text, "canvas");
      if (id !== renderId) return; // a newer render started meanwhile
      pngUrl = dataUrl;
      setPreview(`<img src="${dataUrl}" alt="QR code">`, true);
    } catch {
      // EasyQRCodeJS throws when the text doesn't fit at this error-correction level.
      if (id !== renderId) return;
      setPreview('<p class="is-error">That’s too much text for a QR code. Shorten it or lower the error correction.</p>', false);
    }
  }

  let renderTimer;
  const renderSoon = () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 150);
  };

  // A filename from the first few words of the text, e.g. "qr-example-com.png".
  function filename(ext) {
    const slug = state.text
      .trim()
      .replace(/^https?:\/\//i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return `qr${slug ? "-" + slug : ""}.${ext}`;
  }

  function downloadUrl(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }

  pngBtn.addEventListener("click", () => pngUrl && downloadUrl(pngUrl, filename("png")));

  svgBtn.addEventListener("click", async () => {
    const { holder } = await draw(state.text.trim(), "svg");
    const svg = holder.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename("svg"));
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  copyBtn.addEventListener("click", async () => {
    try {
      const blob = await (await fetch(pngUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash(copyBtn, "Copied");
    } catch {
      flash(copyBtn, "Can’t copy here");
    }
  });

  function flash(btn, label) {
    const original = btn.textContent;
    btn.textContent = label;
    setTimeout(() => (btn.textContent = original), 1200);
  }

  // Text box
  textEl.value = state.text;
  textEl.addEventListener("input", () => {
    state.text = textEl.value;
    save();
    renderSoon();
  });

  // Option fields, matched to state by their name attribute.
  const fields = [...optionsEl.querySelectorAll("input[name], select[name]")];

  function showPercents() {
    optionsEl.querySelector('[name="dotScaleOut"]').value = `${Math.round(state.dotScale * 100)}%`;
    optionsEl.querySelector('[name="logoScaleOut"]').value = `${Math.round(state.logoScale * 100)}%`;
  }

  function syncFields() {
    for (const el of fields) el.value = state[el.name];
    showPercents();
  }

  for (const el of fields) {
    el.addEventListener("input", () => {
      let value = el.value;
      if (el.type === "number" || el.type === "range") {
        if (value === "") return; // mid-typing
        value = Math.min(Number(el.max), Math.max(Number(el.min), Number(value) || 0));
      }
      state[el.name] = value;
      showPercents();
      save();
      renderSoon();
    });
    // Show the clamped value once the user leaves a number field.
    if (el.type === "number") el.addEventListener("change", () => (el.value = state[el.name]));
  }

  // Logo and background image pickers
  for (const row of optionsEl.querySelectorAll("[data-image]")) {
    const kind = row.dataset.image;
    const input = row.querySelector("input[type=file]");
    const removeBtn = row.querySelector("[data-remove]");

    input.addEventListener("change", async () => {
      const file = input.files[0];
      input.value = "";
      if (!file) return;
      try {
        images[kind] = await readImage(file);
      } catch {
        return alert("Couldn’t read that image.");
      }
      // A logo hides part of the code, so it needs the strongest error correction.
      if (kind === "logo" && state.level !== "H") {
        state.level = "H";
        syncFields();
        save();
      }
      updateImageRows();
      render();
    });

    removeBtn.addEventListener("click", () => {
      images[kind] = null;
      updateImageRows();
      render();
    });
  }

  function updateImageRows() {
    for (const row of optionsEl.querySelectorAll("[data-image]")) {
      const has = !!images[row.dataset.image];
      row.querySelector("[data-remove]").hidden = !has;
      row.querySelector("label.btn").firstChild.textContent = has ? "Change image" : "Choose image";
    }
    logoScaleEl.hidden = !images.logo;
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ url: reader.result, ratio: img.naturalWidth / img.naturalHeight });
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  $("reset-options").addEventListener("click", () => {
    Object.assign(state, { ...DEFAULTS, text: state.text });
    images.logo = images.background = null;
    syncFields();
    updateImageRows();
    save();
    render();
  });

  syncFields();
  updateImageRows();
  render();

  /* ================= Scan ================= */

  const scannerEl = $("scanner");
  const video = $("video");
  const videoWrap = $("video-wrap");
  const startBtn = $("camera-start");
  const stopBtn = $("camera-stop");
  const cameraSelect = $("camera-select");
  const torchBtn = $("torch");
  const statusEl = $("scan-status");
  const resultEl = $("result");
  const resultText = $("result-text");
  const openLink = $("result-open");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let stream = null;
  let scanTimer = null;
  let torchOn = false;

  const setStatus = (msg) => (statusEl.textContent = msg);

  // Scale the source down to at most maxSide pixels, then look for a code.
  function decode(source, width, height, maxSide, thorough) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data, canvas.width, canvas.height, {
      inversionAttempts: thorough ? "attemptBoth" : "dontInvert",
    });
  }

  function showResult(text) {
    resultEl.hidden = false;
    resultText.textContent = text || "(empty)";
    let url = null;
    if (/^https?:\/\//i.test(text.trim())) {
      try {
        url = new URL(text.trim()).href;
      } catch {}
    }
    openLink.hidden = !url;
    if (url) openLink.href = url;
    setStatus("");
    resultEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  $("result-copy").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(resultText.textContent);
      flash(e.currentTarget, "Copied");
    } catch {
      flash(e.currentTarget, "Can’t copy here");
    }
  });

  // ----- Camera -----

  async function startCamera(deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      return setStatus("The camera needs a secure (https) page.");
    }
    stopCamera();
    setStatus("Starting camera…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } },
      });
    } catch (err) {
      stream = null;
      return setStatus(err.name === "NotAllowedError" ? "Camera permission was denied." : "Couldn’t start the camera.");
    }

    video.srcObject = stream;
    await video.play().catch(() => {});
    videoWrap.hidden = stopBtn.hidden = false;
    startBtn.hidden = true;

    const track = stream.getVideoTracks()[0];
    torchBtn.hidden = !track.getCapabilities?.().torch;
    await listCameras(track.getSettings().deviceId);

    setStatus("Point the camera at a QR code.");
    scanFrame();
  }

  function stopCamera() {
    clearTimeout(scanTimer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    torchOn = false;
    video.srcObject = null;
    videoWrap.hidden = stopBtn.hidden = torchBtn.hidden = cameraSelect.hidden = true;
    startBtn.hidden = false;
  }

  function scanFrame() {
    if (!stream) return;
    if (video.readyState >= 2) {
      const code = decode(video, video.videoWidth, video.videoHeight, 720, false);
      if (code) {
        stopCamera();
        navigator.vibrate?.(60);
        return showResult(code.data);
      }
    }
    scanTimer = setTimeout(scanFrame, 120);
  }

  // Device labels are only available once camera permission is granted.
  async function listCameras(activeId) {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    cameraSelect.innerHTML = cams
      .map((c, i) => `<option value="${c.deviceId}">${c.label || `Camera ${i + 1}`}</option>`)
      .join("");
    cameraSelect.value = activeId;
    cameraSelect.hidden = cams.length < 2;
  }

  startBtn.addEventListener("click", () => {
    resultEl.hidden = true;
    startCamera();
  });
  stopBtn.addEventListener("click", () => {
    stopCamera();
    setStatus("");
  });
  cameraSelect.addEventListener("change", () => startCamera(cameraSelect.value));
  torchBtn.addEventListener("click", async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => {});
    torchBtn.textContent = torchOn ? "Torch off" : "Torch";
  });

  // Don't keep the camera running in a hidden tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && stream) {
      stopCamera();
      setStatus("");
    }
  });

  // ----- Images: pick, paste or drop -----

  async function scanImage(file) {
    if (!file?.type.startsWith("image/")) return;
    stopCamera();
    resultEl.hidden = true;
    setStatus("Reading image…");
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return setStatus("Couldn’t read that image.");
    }
    // Try a quick pass first, then a larger one for small codes in big photos.
    for (const side of [1000, 2400]) {
      const code = decode(bitmap, bitmap.width, bitmap.height, side, true);
      if (code) return showResult(code.data);
      if (side >= Math.max(bitmap.width, bitmap.height)) break;
    }
    setStatus("No QR code found in that image.");
  }

  $("scan-file").addEventListener("change", (e) => {
    scanImage(e.target.files[0]);
    e.target.value = "";
  });

  document.addEventListener("paste", (e) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      scanImage(file);
    }
  });

  scannerEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    scannerEl.classList.add("is-dragging");
  });
  scannerEl.addEventListener("dragleave", (e) => {
    if (!scannerEl.contains(e.relatedTarget)) scannerEl.classList.remove("is-dragging");
  });
  scannerEl.addEventListener("drop", (e) => {
    e.preventDefault();
    scannerEl.classList.remove("is-dragging");
    scanImage(e.dataTransfer.files[0]);
  });
})();
