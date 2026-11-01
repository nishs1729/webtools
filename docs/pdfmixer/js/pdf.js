/*
 * PDF work: opening and rendering with PDF.js, building the output with pdf-lib.
 * Both libraries are classic scripts in ../vendor that set window globals.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.js", import.meta.url).href;

export const THUMB_WIDTH = 140; // CSS px; thumbnails are rendered once at this width

/** Open a File with PDF.js. Throws an Error whose message finishes "… couldn't be opened: <reason>". */
export async function openPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    // isEvalSupported: false closes CVE-2024-4367 (font code execution) in this PDF.js version.
    return await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  } catch (err) {
    const reason =
      err?.name === "PasswordException" ? "it’s password-protected"
      : err?.name === "InvalidPDFException" ? "it isn’t a valid PDF"
      : "it couldn’t be read";
    throw new Error(reason);
  }
}

/** Render a page to a new canvas that fits in maxWidth × maxHeight CSS pixels. */
export async function renderPage(doc, pageNum, maxWidth, maxHeight = Infinity) {
  const page = await doc.getPage(pageNum);
  const base = page.getViewport({ scale: 1 }); // includes the page's own rotation
  const fit = Math.min(maxWidth / base.width, maxHeight / base.height);
  const viewport = page.getViewport({ scale: fit * (window.devicePixelRatio || 1) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  page.cleanup();
  return canvas;
}

/* ---------- Thumbnail cache: each page is rendered once, then copied wherever it's shown ---------- */

const thumbs = new Map(); // "fileId:page" → Promise<canvas>

export function thumbnail(file, page) {
  const key = `${file.id}:${page}`;
  if (!thumbs.has(key)) {
    const job = renderPage(file.doc, page, THUMB_WIDTH).catch((err) => {
      thumbs.delete(key);
      throw err;
    });
    thumbs.set(key, job);
  }
  return thumbs.get(key);
}

/** Draw a page's thumbnail into an existing canvas. */
export async function drawThumbnail(file, page, target) {
  const src = await thumbnail(file, page);
  target.width = src.width;
  target.height = src.height;
  target.getContext("2d").drawImage(src, 0, 0);
}

/** Free everything held for a file. */
export function closeFile(file) {
  for (const key of thumbs.keys()) if (key.startsWith(`${file.id}:`)) thumbs.delete(key);
  file.doc.destroy();
}

/* ---------- Building the output ---------- */

// Open each source once with pdf-lib. A source it can't read (encrypted, mostly)
// maps to null, and its pages are rendered to images instead.
async function loadSources(entries, getFile) {
  const { PDFDocument } = PDFLib;
  const sources = new Map();
  const rasterized = [];
  for (const fileId of new Set(entries.map((e) => e.fileId))) {
    const file = getFile(fileId);
    try {
      sources.set(fileId, await PDFDocument.load(await file.file.arrayBuffer(), { updateMetadata: false }));
    } catch {
      sources.set(fileId, null);
      rasterized.push(file.name);
    }
  }
  return { sources, rasterized };
}

/**
 * Build a PDF from queue entries ({ fileId, page }) in order.
 * Pages are copied as-is (text, vectors, size and rotation kept). If pdf-lib can't
 * read a source — encrypted files, mostly — its pages are rendered to images instead.
 * Returns { bytes, rasterized: [file names] }.
 */
export async function buildPdf(entries, getFile, onProgress) {
  const out = await PDFLib.PDFDocument.create();
  const parts = new Array(entries.length); // per entry: a copied page, or { image, width, height }
  const { sources, rasterized } = await loadSources(entries, getFile);
  let done = 0;

  for (const [fileId, src] of sources) {
    const file = getFile(fileId);
    const positions = entries.flatMap((e, i) => (e.fileId === fileId ? [i] : []));
    if (src) {
      // copyPages returns a separate copy per index, so duplicates are fine.
      const copied = await out.copyPages(src, positions.map((i) => entries[i].page - 1));
      positions.forEach((pos, k) => (parts[pos] = copied[k]));
      done += positions.length;
      onProgress(done, entries.length);
    } else {
      for (const pos of positions) {
        parts[pos] = await rasterPage(out, file.doc, entries[pos].page);
        onProgress(++done, entries.length);
      }
    }
  }

  parts.forEach((part) => addPart(out, part));
  return { bytes: await out.save(), rasterized };
}

/**
 * One single-page PDF per queue entry, in order.
 * Returns { files: [bytes], rasterized: [file names] }.
 */
export async function burstPdf(entries, getFile, onProgress) {
  const { sources, rasterized } = await loadSources(entries, getFile);
  const files = [];
  for (const [i, { fileId, page }] of entries.entries()) {
    const out = await PDFLib.PDFDocument.create();
    const src = sources.get(fileId);
    addPart(out, src ? (await out.copyPages(src, [page - 1]))[0] : await rasterPage(out, getFile(fileId).doc, page));
    files.push(await out.save());
    onProgress(i + 1, entries.length);
  }
  return { files, rasterized };
}

function addPart(out, part) {
  if (part.image) {
    out.addPage([part.width, part.height]).drawImage(part.image, { x: 0, y: 0, width: part.width, height: part.height });
  } else {
    out.addPage(part);
  }
}

// Render a page at 2× (144 dpi) and embed it as a JPEG of the same page size.
async function rasterPage(out, doc, pageNum) {
  const page = await doc.getPage(pageNum);
  const size = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  const image = await out.embedJpg(await blob.arrayBuffer());
  return { image, width: size.width, height: size.height };
}
