/*
 * Centre column: the output as it will be saved — a grid of pages, or one large
 * page per row ("reader"). Items are reused across renders (keyed by queue id),
 * so rendered pages survive reordering. Rendering only — app.js handles clicks.
 */

import { queue, getFile } from "./state.js";
import { drawThumbnail, renderPage } from "./pdf.js";
import { icon, esc, DRAG } from "./ui.js";

const listEl = document.getElementById("result");
const items = new Map(); // qid → <li>
let view = "grid";

// Pages are drawn as they come into view. Large reader pages are dropped again
// when far away, so a long document doesn't hold hundreds of big canvases.
// The margin is measured against whatever scrolls: the column on wide screens,
// the page itself on narrow ones (where the column doesn't scroll).
const narrow = matchMedia("(max-width: 900px)");
let lazy = makeObserver();

function makeObserver() {
  return new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) draw(target);
        else if (target.dataset.drawn === "reader") release(target);
      }
    },
    { root: narrow.matches ? null : listEl.parentElement, rootMargin: "800px" }
  );
}

narrow.addEventListener("change", () => {
  lazy.disconnect();
  lazy = makeObserver();
  for (const li of items.values()) lazy.observe(li);
});

async function draw(li) {
  const mode = view;
  if (li.dataset.drawn === mode || li.dataset.drawing === mode) return;
  const entry = queue.find((e) => e.qid === Number(li.dataset.qid));
  if (!entry) return;
  const file = getFile(entry.fileId);
  const box = li.querySelector(".pm-res__page");
  if (!box.clientWidth) return; // hidden (another tab on a phone); redrawn when shown
  li.dataset.drawing = mode;
  try {
    let canvas;
    if (mode === "grid") {
      canvas = document.createElement("canvas");
      await drawThumbnail(file, entry.page, canvas);
    } else {
      canvas = await renderPage(file.doc, entry.page, box.clientWidth);
    }
    if (view !== mode) return; // view switched while drawing
    box.replaceChildren(canvas);
    // Remember the page shape so the reader keeps its height while a page is released.
    box.style.setProperty("--ratio", `${canvas.width} / ${canvas.height}`);
    li.dataset.drawn = mode;
  } catch {
    // Leave the placeholder; the preview dialog reports render errors.
  } finally {
    delete li.dataset.drawing;
  }
}

function release(li) {
  li.querySelector(".pm-res__page").replaceChildren();
  delete li.dataset.drawn;
}

export function initResult({ onMove, onInsert }) {
  Sortable.create(listEl, {
    ...DRAG,
    group: { name: "pages", pull: false, put: true },
    filter: "button",
    preventOnFilter: false,
    onEnd: (e) => e.from === e.to && onMove(e.oldIndex, e.newIndex),
    onAdd: (e) => {
      // A page dragged in from a source PDF: put the original back and insert a queue entry instead.
      const { fileId, page } = e.item.dataset;
      e.clone.replaceWith(e.item);
      onInsert(Number(fileId), Number(page), e.newIndex);
    },
  });
}

export function setView(next) {
  view = next;
  listEl.classList.toggle("is-grid", view === "grid");
  listEl.classList.toggle("is-reader", view === "reader");
  // Re-observing makes the observer report every item again, so visible ones redraw.
  for (const li of items.values()) {
    lazy.unobserve(li);
    lazy.observe(li);
  }
}

/** Bring the list in line with the queue, reusing existing items. */
export function renderResult() {
  const live = new Set(queue.map((e) => e.qid));
  for (const [qid, li] of items) {
    if (live.has(qid)) continue;
    lazy.unobserve(li);
    li.remove();
    items.delete(qid);
  }

  queue.forEach((entry, i) => {
    let li = items.get(entry.qid);
    if (!li) {
      li = createItem(entry);
      items.set(entry.qid, li);
    }
    li.querySelector(".pm-res__pos").textContent = i + 1;
    if (listEl.children[i] !== li) listEl.insertBefore(li, listEl.children[i] ?? null);
    if (!li.dataset.observed) {
      li.dataset.observed = "1";
      lazy.observe(li);
    }
  });
}

function createItem(entry) {
  const { name } = getFile(entry.fileId);
  const li = document.createElement("li");
  li.className = "pm-res";
  li.dataset.qid = entry.qid;
  li.innerHTML = `
    <div class="pm-res__page"></div>
    <div class="pm-res__bar">
      <span class="pm-res__pos"></span>
      <span class="pm-res__src" title="${esc(name)}, page ${entry.page}">p.${entry.page} · ${esc(name)}</span>
    </div>
    <div class="pm-res__tools">
      <button class="icon-btn" type="button" data-action="duplicate" title="Add this page again" aria-label="Duplicate page">${icon("copy")}</button>
      <button class="icon-btn" type="button" data-action="preview" title="Preview" aria-label="Preview page">${icon("zoom")}</button>
      <button class="icon-btn" type="button" data-action="remove" title="Remove" aria-label="Remove page">${icon("x")}</button>
    </div>`;
  return li;
}

/** Scroll a page into view and flash it (used when clicking it in the output list). */
export function highlight(qid) {
  const li = items.get(qid);
  if (!li) return;
  // Scroll only the result column when it scrolls on its own (wide screens), not the whole page.
  const body = listEl.parentElement;
  if (body.scrollHeight > body.clientHeight) {
    body.scrollTo({ top: li.offsetTop - (body.clientHeight - li.offsetHeight) / 2, behavior: "smooth" });
  } else {
    li.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  li.classList.remove("is-flash");
  void li.offsetWidth; // restart the animation
  li.classList.add("is-flash");
}
