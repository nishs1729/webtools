/*
 * All app state. The output queue is the single source of truth for selection:
 * a page counts as selected while at least one queue entry points at it, so the
 * workspace and the queue can never disagree.
 */

// { id, name, file (File), doc (PDF.js document), pageCount }
export const files = [];
// { qid, fileId, page } in output order
export const queue = [];

let nextId = 1;
const newId = () => nextId++;

export const getFile = (id) => files.find((f) => f.id === id);

export function addFile(props) {
  const file = { id: newId(), ...props };
  files.push(file);
  return file;
}

export const isSelected = (fileId, page) => queue.some((e) => e.fileId === fileId && e.page === page);

export function selectedPages(fileId) {
  return new Set(queue.filter((e) => e.fileId === fileId).map((e) => e.page));
}

// Append pages that aren't already in the queue, in the order given.
export function select(fileId, pages) {
  const already = selectedPages(fileId);
  for (const page of pages) {
    if (!already.has(page)) queue.push({ qid: newId(), fileId, page });
  }
}

// Remove every queue entry (duplicates included) for these pages.
export function deselect(fileId, pages) {
  const drop = new Set(pages);
  removeWhere((e) => e.fileId === fileId && drop.has(e.page));
}

export function removeEntry(qid) {
  removeWhere((e) => e.qid === qid);
}

export function duplicateEntry(qid) {
  const i = queue.findIndex((e) => e.qid === qid);
  if (i === -1) return null;
  const copy = { ...queue[i], qid: newId() };
  queue.splice(i + 1, 0, copy);
  return copy;
}

export function moveEntry(from, to) {
  if (to < 0 || to >= queue.length || from === to) return false;
  queue.splice(to, 0, queue.splice(from, 1)[0]);
  return true;
}

export function removeFile(id) {
  files.splice(files.findIndex((f) => f.id === id), 1);
  removeWhere((e) => e.fileId === id);
}

export function clearAll() {
  files.length = 0;
  queue.length = 0;
}

function removeWhere(test) {
  for (let i = queue.length - 1; i >= 0; i--) if (test(queue[i])) queue.splice(i, 1);
}
