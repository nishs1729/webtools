/*
 * PDF Mixer: pick pages from several PDFs, order them, save one PDF.
 * Everything runs in the browser; files are never uploaded.
 *
 * Layout: sources (left) → result (centre) → output list and save (right).
 * On narrow screens the three columns become tabs.
 *
 *   state.js    files + output queue (the source of truth for selection)
 *   pdf.js      PDF.js open/render, thumbnail cache, pdf-lib export
 *   sources.js  left column: source PDFs, pages stacked
 *   result.js   centre column: the output as a grid or as full pages
 *   queue.js    right column: compact output list
 *   preview.js  large page preview dialog
 */

import * as state from "./state.js";
import { openPdf, closeFile, buildPdf } from "./pdf.js";
import { renderFile, syncFile, parseRange } from "./sources.js";
import { initResult, renderResult, setView, highlight } from "./result.js";
import { initQueue, renderQueue } from "./queue.js";
import { openPreview } from "./preview.js";
import { icon, esc, plural, toast } from "./ui.js";

const $ = (id) => document.getElementById(id);
const pmEl = $("pm");
const sourcesEl = $("sources");
const resultEl = $("result");
const queueEl = $("queue");
const fileInput = $("file-input");
const createBtn = $("create");
const filenameEl = $("filename");
const progressEl = $("progress");
const STORE_KEY = "webtools-pdfmixer";

let exporting = false;

/** Redraw everything that depends on the selection. */
function refresh(focus) {
  for (const f of state.files) syncFile(f.id);
  renderResult();
  renderQueue(focus);

  const files = state.files.length;
  const pages = state.queue.length;
  $("stats").textContent = files ? `${plural(files, "PDF")} · ${plural(pages, "page")} picked` : "";
  $("result-count").textContent = pages ? plural(pages, "page") : "";
  $("queue-count").textContent = pages ? plural(pages, "page") : "";
  document.querySelector('[data-tab="result"] [data-badge]').textContent = pages || "";
  $("result-empty").hidden = pages > 0;
  $("queue-empty").hidden = pages > 0;
  $("empty").hidden = files > 0;
  $("clear-all").hidden = files === 0;
  createBtn.disabled = pages === 0 || exporting;
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
      if (picked && !confirm(`Remove “${file.name}”? Its ${plural(picked, "page")} will leave the output too.`)) return;
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

/* ---------- Centre and right: the output ---------- */

// Both the result and the output list can be reordered, and both accept pages dragged from the left.
const dragHandlers = {
  onMove: (from, to) => state.moveEntry(from, to) && refresh(),
  onInsert: (fileId, page, index) => {
    state.insertAt(fileId, page, index);
    refresh();
  },
};
initResult(dragHandlers);
initQueue(dragHandlers);

// Buttons on result pages and output rows do the same things.
function onEntryAction(action, qid) {
  const i = state.queue.findIndex((entry) => entry.qid === qid);
  if (i === -1) return;
  if (action === "up") state.moveEntry(i, i - 1);
  if (action === "down") state.moveEntry(i, i + 1);
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

queueEl.addEventListener("click", (e) => {
  const card = e.target.closest(".pm-q");
  if (!card) return;
  const btn = e.target.closest("[data-action]");
  if (btn) onEntryAction(btn.dataset.action, Number(card.dataset.qid));
  else highlight(Number(card.dataset.qid)); // clicking a row finds that page in the result
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

async function createPdf() {
  if (!state.queue.length || exporting) return;
  const name = (filenameEl.value.trim().replace(/\.pdf$/i, "") || "combined").replace(/[\\/:*?"<>|]+/g, "-");
  const count = state.queue.length;

  exporting = true;
  createBtn.disabled = true;
  progressEl.hidden = false;
  const setProgress = (done, total) => {
    progressEl.firstElementChild.style.width = `${(done / total) * 100}%`;
    createBtn.textContent = `Creating… ${done}/${total}`;
  };
  setProgress(0, count);

  try {
    const { bytes, rasterized } = await buildPdf([...state.queue], state.getFile, setProgress);
    download(bytes, `${name}.pdf`);
    if (rasterized.length) {
      toast(`Saved ${name}.pdf. Pages from ${rasterized.join(", ")} are protected, so they were saved as images (text isn’t selectable).`, "warn");
    } else {
      toast(`Saved ${name}.pdf (${plural(count, "page")}).`);
    }
  } catch (err) {
    console.error(err);
    toast(`Couldn’t create the PDF: ${err.message || "something went wrong"}.`, "error");
  } finally {
    exporting = false;
    progressEl.hidden = true;
    createBtn.textContent = "Create PDF";
    refresh();
  }
}

function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

createBtn.addEventListener("click", createPdf);
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
