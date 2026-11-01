/*
 * Left column: one block per loaded PDF, its pages stacked vertically.
 * Click a page to pick it; drag it into the result or output list to insert it at a spot.
 * Rendering only — app.js handles clicks.
 */

import { getFile, selectedPages } from "./state.js";
import { drawThumbnail } from "./pdf.js";
import { icon, esc, plural, DRAG } from "./ui.js";

const sourcesEl = document.getElementById("sources");

// Thumbnails are rendered when they come near the visible part of the column.
const lazy = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      lazy.unobserve(entry.target);
      const canvas = entry.target;
      const thumb = canvas.closest(".pm-thumb");
      const file = getFile(Number(thumb.dataset.fileId));
      if (!file) continue;
      drawThumbnail(file, Number(thumb.dataset.page), canvas)
        .then(() => thumb.classList.add("is-ready"))
        .catch(() => thumb.classList.add("is-failed"));
    }
  },
  { rootMargin: "600px" }
);

export function renderFile(file) {
  const section = document.createElement("section");
  section.className = "pm-src";
  section.dataset.fileId = file.id;
  section.innerHTML = `
    <header class="pm-src__head">
      <button class="icon-btn pm-src__collapse" type="button" data-action="collapse" aria-expanded="true" aria-label="Hide pages">${icon("chevron")}</button>
      <div class="pm-src__title">
        <h2 title="${esc(file.name)}">${esc(file.name)}</h2>
        <p class="muted">${plural(file.pageCount, "page")} · <span data-count>none picked</span></p>
      </div>
      <button class="icon-btn" type="button" data-action="remove" title="Remove this PDF" aria-label="Remove ${esc(file.name)}">${icon("x")}</button>
    </header>
    <div class="pm-src__tools">
      <button class="btn btn--sm" type="button" data-action="all">All</button>
      <button class="btn btn--sm" type="button" data-action="none">None</button>
      <input class="input pm-src__range" type="text" placeholder="1-3, 7" title="Pick pages by number, then press Enter" aria-label="Pick pages by number" spellcheck="false" autocomplete="off">
    </div>
    <p class="pm-src__error" role="alert" hidden></p>
    <ol class="pm-src__pages">${Array.from({ length: file.pageCount }, (_, i) => thumbHtml(file, i + 1)).join("")}</ol>`;
  sourcesEl.append(section);

  const list = section.querySelector(".pm-src__pages");
  list.querySelectorAll("canvas").forEach((c) => lazy.observe(c));
  // Pages can be dragged out (copied) into the result or output list, never reordered here.
  Sortable.create(list, {
    ...DRAG,
    group: { name: "pages", pull: "clone", put: false },
    sort: false,
    filter: ".pm-thumb__zoom",
    preventOnFilter: false,
  });
  return section;
}

function thumbHtml(file, page) {
  return `
    <li class="pm-thumb" data-file-id="${file.id}" data-page="${page}">
      <button class="pm-thumb__pick" type="button" data-action="toggle" aria-pressed="false" aria-label="Page ${page}">
        <span class="pm-thumb__img"><canvas></canvas></span>
        <span class="pm-thumb__num">${page}</span>
      </button>
      <span class="pm-thumb__check" aria-hidden="true">${icon("check")}</span>
      <button class="pm-thumb__zoom" type="button" data-action="preview" title="Preview" aria-label="Preview page ${page}">${icon("zoom")}</button>
    </li>`;
}

/** Bring a file block's selection marks and count in line with the queue. */
export function syncFile(fileId) {
  const section = sourcesEl.querySelector(`.pm-src[data-file-id="${fileId}"]`);
  if (!section) return;
  const picked = selectedPages(fileId);
  for (const thumb of section.querySelectorAll(".pm-thumb")) {
    const on = picked.has(Number(thumb.dataset.page));
    thumb.classList.toggle("is-selected", on);
    thumb.firstElementChild.setAttribute("aria-pressed", on);
  }
  section.querySelector("[data-count]").textContent = picked.size ? `${picked.size} picked` : "none picked";
}

/** Parse "1-4, 7, 10-12" into sorted page numbers. Returns { pages } or { error }. */
export function parseRange(text, max) {
  const pages = new Set();
  for (const part of text.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*(?:-\s*(\d*))?$/); // "5", "2-6", or "8-" (to the end)
    if (!m) return { error: `“${part}” isn’t a page number or range.` };
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : m[2] === "" ? max : Number(m[2]);
    if (from < 1 || to > max || from > to) {
      return { error: `“${part}” is outside this PDF’s pages (1–${max}).` };
    }
    for (let p = from; p <= to; p++) pages.add(p);
  }
  return { pages: [...pages].sort((a, b) => a - b) };
}
