/* The output queue panel. Rendering and drag-to-reorder — app.js handles button clicks. */

import { queue, getFile, moveEntry } from "./state.js";
import { drawThumbnail } from "./pdf.js";
import { icon, esc } from "./ui.js";

const listEl = document.getElementById("queue");

export function initQueue(onReorder) {
  Sortable.create(listEl, {
    handle: ".pm-q__handle",
    animation: 150,
    ghostClass: "is-ghost",
    onEnd: (e) => moveEntry(e.oldIndex, e.newIndex) && onReorder(),
  });
}

/** Rebuild the list from state. focus: { qid, action } to put keyboard focus back on a button. */
export function renderQueue(focus) {
  listEl.innerHTML = queue.map(cardHtml).join("");

  listEl.querySelectorAll("canvas").forEach((canvas, i) => {
    const { fileId, page } = queue[i];
    drawThumbnail(getFile(fileId), page, canvas).catch(() => {});
  });

  if (focus) {
    const card = listEl.querySelector(`[data-qid="${focus.qid}"]`);
    const btn = card?.querySelector(`[data-action="${focus.action}"]`);
    // A move button may have just become disabled (top/bottom of the list).
    (btn && !btn.disabled ? btn : card?.querySelector("button:not(:disabled)"))?.focus();
  }
}

function cardHtml(entry, i) {
  const { name } = getFile(entry.fileId);
  const last = i === queue.length - 1;
  return `
    <li class="pm-q" data-qid="${entry.qid}">
      <span class="pm-q__handle" title="Drag to reorder" aria-hidden="true">${icon("grip")}</span>
      <span class="pm-q__pos">${i + 1}</span>
      <canvas class="pm-q__thumb"></canvas>
      <span class="pm-q__meta">
        <strong>Page ${entry.page}</strong>
        <span title="${esc(name)}">${esc(name)}</span>
      </span>
      <span class="pm-q__btns">
        <button class="icon-btn" type="button" data-action="up" title="Move up" aria-label="Move up"${i === 0 ? " disabled" : ""}>${icon("up")}</button>
        <button class="icon-btn" type="button" data-action="down" title="Move down" aria-label="Move down"${last ? " disabled" : ""}>${icon("down")}</button>
        <button class="icon-btn" type="button" data-action="duplicate" title="Add this page again" aria-label="Duplicate">${icon("copy")}</button>
        <button class="icon-btn" type="button" data-action="preview" title="Preview" aria-label="Preview">${icon("zoom")}</button>
        <button class="icon-btn" type="button" data-action="remove" title="Remove" aria-label="Remove">${icon("x")}</button>
      </span>
    </li>`;
}
