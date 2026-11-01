/*
 * PDF Mixer: pick pages from several PDFs, order them, save one PDF.
 * Everything runs in the browser; files are never uploaded.
 *
 * Layout: sources (left) → preview of the new PDF, with reorder and save (right).
 * On narrow screens the two columns become tabs.
 *
 *   state.js    files + output queue (the source of truth for selection)
 *   pdf.js      PDF.js open/render, thumbnail cache, pdf-lib export
 *   sources.js  left column: source PDFs, pages stacked
 *   result.js   preview column: the output as a grid or as full pages
 *   zip.js      bundles burst pages into one download
 *   preview.js  large page preview dialog
 */

import * as state from "./state.js";
import { openPdf, closeFile, buildPdf, burstPdf } from "./pdf.js";
import { makeZip } from "./zip.js";
import { renderFile, syncFile, parseRange } from "./sources.js";
import { initResult, renderResult, setView } from "./result.js";
import { openPreview } from "./preview.js";
import { icon, esc, plural, toast } from "./ui.js";

const $ = (id) => document.getElementById(id);
const pmEl = $("pm");
const sourcesEl = $("sources");
const resultEl = $("result");
const fileInput = $("file-input");
const createBtn = $("create");
const clearResultBtn = $("clear-result");
const burstBtn = $("burst");
const filenameEl = $("filename");
const progressEl = $("progress");
const STORE_KEY = "webtools-pdfmixer";

let exporting = false;

/** Redraw everything that depends on the selection. */
function refresh(focus) {
  for (const f of state.files) syncFile(f.id);
  renderResult(focus);

  const files = state.files.length;
  const pages = state.queue.length;
  $("stats").textContent = files ? `${plural(files, "PDF")} · ${plural(pages, "page")} picked` : "";
  $("result-count").textContent = pages ? plural(pages, "page") : "";
  document.querySelector('[data-tab="result"] [data-badge]').textContent = pages || "";
  $("result-empty").hidden = pages > 0;
  $("empty").hidden = files > 0;
  $("add-more").hidden = files === 0;
  $("clear-all").hidden = files === 0;
  createBtn.disabled = pages === 0 || exporting;
  clearResultBtn.disabled = pages === 0 || exporting;
  burstBtn.disabled = pages === 0 || exporting;
  filenameEl.placeholder = defaultName();
  fitHeight();
}

// On wide screens the columns fill the rest of the window and scroll on their own.
function fitHeight() {
  pmEl.style.setProperty("--pm-top", `${pmEl.getBoundingClientRect().top + window.scrollY}px`);
}
window.addEventListener("resize", fitHeight);

/* ---------- Adding files ---------- */

async function addFiles(list) {
  const all = [...list];
  const pdfs = all.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  const problems = [];
  const skipped = all.length - pdfs.length;
  if (skipped) problems.push(`skipped ${plural(skipped, "file")} that ${skipped === 1 ? "isn’t a PDF" : "aren’t PDFs"}`);
  if (pdfs.length) $("empty").hidden = true;

  for (const file of pdfs) {
    const loading = document.createElement("p");
    loading.className = "pm-loading muted";
    loading.innerHTML = `Opening <strong>${esc(file.name)}</strong>…`;
    sourcesEl.append(loading);
    try {
      const doc = await openPdf(file);
      renderFile(state.addFile({ name: file.name, file, doc, pageCount: doc.numPages }));
    } catch (err) {
      problems.push(`“${file.name}” couldn’t be opened: ${err.message}`);
    } finally {
      loading.remove();
    }
  }

  refresh();
  if (problems.length) toast(capitalise(problems.join("; ")) + ".", "error");
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

$("add-empty").addEventListener("click", () => fileInput.click());
$("add-more").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

// Dropping files anywhere on the page adds them. (Dragging pages between columns isn't a file drag.)
let dragDepth = 0;
const hasFiles = (e) => [...e.dataTransfer.types].includes("Files");
document.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  $("drop").hidden = false;
});
document.addEventListener("dragleave", (e) => {
  if (hasFiles(e) && --dragDepth <= 0) {
    dragDepth = 0;
    $("drop").hidden = true;
  }
});
document.addEventListener("dragover", (e) => hasFiles(e) && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $("drop").hidden = true;
  addFiles(e.dataTransfer.files);
});

$("clear-all").addEventListener("click", () => {
  if (!confirm("Remove all PDFs and start over?")) return;
  state.files.forEach(closeFile);
  state.clearAll();
  sourcesEl.replaceChildren();
  refresh();
});

/* ---------- Left: picking pages ---------- */

const allPages = (file) => Array.from({ length: file.pageCount }, (_, i) => i + 1);
const pagesOf = (file) => allPages(file).map((page) => ({ fileId: file.id, page }));
const queuePages = () => state.queue.map(({ fileId, page }) => ({ fileId, page }));
let lastPick = null; // { fileId, page } for shift-click ranges

sourcesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const section = btn.closest(".pm-src");
  const file = state.getFile(Number(section.dataset.fileId));
  const page = Number(btn.closest(".pm-thumb")?.dataset.page);

  switch (btn.dataset.action) {
    case "toggle": {
      // Shift-click picks every page between the last click and this one.
      if (e.shiftKey && lastPick?.fileId === file.id) {
        const [a, b] = [lastPick.page, page].sort((x, y) => x - y);
        state.select(file.id, allPages(file).slice(a - 1, b));
      } else if (state.isSelected(file.id, page)) {
        state.deselect(file.id, [page]);
      } else {
        state.select(file.id, [page]);
      }
      lastPick = { fileId: file.id, page };
      break;
    }
    case "preview":
      return openPreview(pagesOf(file), page - 1);
    case "all":
      state.select(file.id, allPages(file));
      break;
    case "none":
      state.deselect(file.id, allPages(file));
      break;
    case "collapse": {
      const collapsed = section.classList.toggle("is-collapsed");
      btn.setAttribute("aria-expanded", !collapsed);
      btn.setAttribute("aria-label", collapsed ? "Show pages" : "Hide pages");
      return;
    }
    case "remove": {
      const picked = state.selectedPages(file.id).size;
      if (picked && !confirm(`Remove “${file.name}”? Its ${plural(picked, "page")} will leave the preview too.`)) return;
      state.removeFile(file.id);
      closeFile(file);
      section.remove();
      break;
    }
  }
  refresh();
});

sourcesEl.addEventListener("dblclick", (e) => {
  const thumb = e.target.closest(".pm-thumb");
  if (!thumb) return;
  openPreview(pagesOf(state.getFile(Number(thumb.dataset.fileId))), Number(thumb.dataset.page) - 1);
});

// Typing a range ("1-3, 7") picks exactly those pages of that file.
function applyRange(input) {
  const section = input.closest(".pm-src");
  const file = state.getFile(Number(section.dataset.fileId));
  const errorEl = section.querySelector(".pm-src__error");
  const text = input.value.trim();
  const { pages, error } = text ? parseRange(text, file.pageCount) : { pages: null };

  errorEl.hidden = !error;
  errorEl.textContent = error || "";
  input.setAttribute("aria-invalid", !!error);
  if (!pages) return;

  const keep = new Set(pages);
  state.deselect(file.id, allPages(file).filter((p) => !keep.has(p)));
  state.select(file.id, pages);
  refresh();
}

sourcesEl.addEventListener("change", (e) => {
  if (e.target.matches(".pm-src__range")) applyRange(e.target);
});
sourcesEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches(".pm-src__range")) applyRange(e.target);
});

/* ---------- Right: the preview ---------- */

// Pages are reordered by dragging, and pages dragged in from the left are inserted where dropped.
initResult({
  onMove: (from, to) => state.moveEntry(from, to) && refresh(),
  onInsert: (fileId, page, index) => {
    state.insertAt(fileId, page, index);
    refresh();
  },
});

function onEntryAction(action, qid) {
  const i = state.queue.findIndex((entry) => entry.qid === qid);
  if (i === -1) return;
  if (action === "up") state.moveEntry(i, i - 1);
  if (action === "down") state.moveEntry(i, i + 1);
  if (action === "move-to") {
    const n = state.queue.length;
    const answer = prompt(`Move page ${i + 1} to position (1–${n}):`, i + 1);
    if (answer === null) return;
    const to = Number.parseInt(answer, 10);
    if (!(to >= 1 && to <= n)) return toast(`Enter a number from 1 to ${n}.`, "error");
    state.moveEntry(i, to - 1);
  }
  if (action === "duplicate") state.duplicateEntry(qid);
  if (action === "remove") state.removeEntry(qid);
  if (action === "preview") return openPreview(queuePages(), i);
  refresh({ qid, action });
}

resultEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (btn) onEntryAction(btn.dataset.action, Number(btn.closest(".pm-res").dataset.qid));
});
resultEl.addEventListener("dblclick", (e) => {
  const li = e.target.closest(".pm-res");
  if (li && !e.target.closest("button")) onEntryAction("preview", Number(li.dataset.qid));
});

clearResultBtn.addEventListener("click", () => {
  const n = state.queue.length;
  if (n > 1 && !confirm(`Remove all ${n} pages from the preview? Your source PDFs stay loaded.`)) return;
  state.clearQueue();
  refresh();
});

// Grid or full-page view of the result, remembered between visits.
const viewBtns = [...document.querySelectorAll("[data-view]")];
function chooseView(view) {
  setView(view);
  for (const b of viewBtns) b.setAttribute("aria-pressed", b.dataset.view === view);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ view }));
  } catch {}
}
for (const b of viewBtns) {
  b.innerHTML = icon(b.dataset.view);
  b.addEventListener("click", () => chooseView(b.dataset.view));
}

// Tabs (narrow screens only)
const tabs = [...document.querySelectorAll("[data-tab]")].filter((el) => el.matches("button"));
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    pmEl.dataset.tab = tab.dataset.tab;
    for (const t of tabs) t.setAttribute("aria-selected", t === tab);
    // Pages in a column that was hidden couldn't be measured; draw them now.
    if (tab.dataset.tab === "result") setView(document.querySelector('[data-view][aria-pressed="true"]').dataset.view);
  });
}

/* ---------- Creating the PDF ---------- */

// Named after the first page's source, e.g. "report.pdf" → "report-mixed".
function defaultName() {
  const first = state.queue[0] && state.getFile(state.queue[0].fileId);
  return first ? `${first.name.replace(/\.pdf$/i, "")}-mixed` : "combined";
}

const outputName = () => (filenameEl.value.trim().replace(/\.pdf$/i, "") || defaultName()).replace(/[\\/:*?"<>|]+/g, "-");

// Run one export with the save bar locked and a progress bar on the button pressed.
async function runExport(btn, busyLabel, work) {
  if (!state.queue.length || exporting) return;
  const label = btn.textContent;
  exporting = true;
  for (const b of [createBtn, burstBtn, clearResultBtn]) b.disabled = true;
  progressEl.hidden = false;
  const setProgress = (done, total) => {
    progressEl.firstElementChild.style.width = `${(done / total) * 100}%`;
    btn.textContent = `${busyLabel} ${done}/${total}`;
  };
  setProgress(0, state.queue.length);

  try {
    await work(setProgress);
  } catch (err) {
    console.error(err);
    toast(`Couldn’t create the PDF: ${err.message || "something went wrong"}.`, "error");
  } finally {
    exporting = false;
    progressEl.hidden = true;
    btn.textContent = label;
    refresh();
  }
}

const protectedNote = (rasterized) =>
  `Pages from ${rasterized.join(", ")} are protected, so they were saved as images (text isn’t selectable).`;

function createPdf() {
  return runExport(createBtn, "Creating…", async (setProgress) => {
    const name = outputName();
    const count = state.queue.length;
    const { bytes, rasterized } = await buildPdf([...state.queue], state.getFile, setProgress);
    download(new Blob([bytes], { type: "application/pdf" }), `${name}.pdf`);
    if (rasterized.length) toast(`Saved ${name}.pdf. ${protectedNote(rasterized)}`, "warn");
    else toast(`Saved ${name}.pdf (${plural(count, "page")}).`);
  });
}

// Every page in the preview as its own PDF (name_01.pdf, name_02.pdf, …), zipped.
function burst() {
  return runExport(burstBtn, "Splitting…", async (setProgress) => {
    const name = outputName();
    const { files, rasterized } = await burstPdf([...state.queue], state.getFile, setProgress);
    const width = String(files.length).length; // pad so the files sort in page order
    const zip = makeZip(files.map((bytes, i) => ({ name: `${name}_${String(i + 1).padStart(width, "0")}.pdf`, bytes })));
    download(zip, `${name}.zip`);
    if (rasterized.length) toast(`Saved ${name}.zip. ${protectedNote(rasterized)}`, "warn");
    else toast(`Saved ${name}.zip (${plural(files.length, "PDF")}).`);
  });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

createBtn.addEventListener("click", createPdf);
burstBtn.addEventListener("click", burst);
filenameEl.addEventListener("keydown", (e) => e.key === "Enter" && createPdf());

// Loaded files live only in this tab, so warn before leaving with work in progress.
window.addEventListener("beforeunload", (e) => {
  if (state.files.length) e.preventDefault();
});

/* ---------- Init ---------- */

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
})();
chooseView(saved.view === "reader" ? "reader" : "grid");
refresh();
