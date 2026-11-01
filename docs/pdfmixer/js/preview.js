/* Large page preview in a <dialog>, with previous/next through a list of pages. */

import { getFile } from "./state.js";
import { renderPage } from "./pdf.js";
import { icon } from "./ui.js";

const dialog = document.getElementById("preview");
const titleEl = document.getElementById("preview-title");
const pageEl = document.getElementById("preview-page");
const posEl = document.getElementById("preview-pos");
const prevBtn = document.getElementById("preview-prev");
const nextBtn = document.getElementById("preview-next");

let pages = []; // [{ fileId, page }]
let index = 0;
let renderId = 0;

/** Show pages[start]; the arrows step through the rest of `list`. */
export function openPreview(list, start) {
  pages = list;
  index = start;
  if (!dialog.open) dialog.showModal();
  show();
}

async function show() {
  const { fileId, page } = pages[index];
  const file = getFile(fileId);
  if (!file) return dialog.close();

  titleEl.textContent = `${file.name} · page ${page} of ${file.pageCount}`;
  posEl.textContent = pages.length > 1 ? `${index + 1} of ${pages.length}` : "";
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === pages.length - 1;

  const id = ++renderId;
  pageEl.classList.add("is-loading");
  const box = pageEl.getBoundingClientRect();
  try {
    const canvas = await renderPage(file.doc, page, box.width - 32, box.height - 32);
    if (id !== renderId) return; // the user moved on while this was rendering
    canvas.style.width = `${canvas.width / (window.devicePixelRatio || 1)}px`;
    pageEl.replaceChildren(canvas);
  } catch {
    if (id === renderId) pageEl.textContent = "This page couldn’t be shown.";
  } finally {
    if (id === renderId) pageEl.classList.remove("is-loading");
  }
}

function step(delta) {
  const next = index + delta;
  if (next < 0 || next >= pages.length) return;
  index = next;
  show();
}

document.getElementById("preview-close").innerHTML = icon("x");
document.getElementById("preview-close").addEventListener("click", () => dialog.close());
prevBtn.addEventListener("click", () => step(-1));
nextBtn.addEventListener("click", () => step(1));

dialog.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
// Clicking the dimmed backdrop closes it.
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});
dialog.addEventListener("close", () => pageEl.replaceChildren());
