/*
 * Tool registry — the single source of truth for every tool.
 * The index grid and the header breadcrumb are both built from this list.
 *
 *   slug    folder name under docs/ (the tool lives at docs/<slug>/index.html)
 *   name    display name
 *   desc    one-line description shown on the index card
 *   icon    inner markup of a 24×24 stroke SVG
 *   status  "live" once ported, "soon" until then
 */
window.TOOLS = [
  {
    slug: "pomodoro",
    name: "Pomodoro",
    desc: "Focus and break cycles to keep work moving.",
    icon: '<circle cx="12" cy="14" r="7"/><path d="M12 7c0-2 1-3.5 3-4M9 5.5c1.2 0 2.4.6 3 1.5.6-.9 1.8-1.5 3-1.5"/>',
    status: "soon",
  },
  {
    slug: "qr",
    name: "QR Code",
    desc: "Generate QR codes from text or links.",
    icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M17 21h4v-4M14 21v.01"/>',
    status: "soon",
  },
  {
    slug: "noisee",
    name: "Noisee",
    desc: "Mix ambient sounds — rain, sea, birds, bonfire.",
    icon: '<path d="M2 12h1M6 8v8M10 4v16M14 9v6M18 6v12M22 11v2"/>',
    status: "live",
  },
  {
    slug: "scribble",
    name: "Scribble Pad",
    desc: "A quick canvas for sketches and notes.",
    icon: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/>',
    status: "soon",
  },
];
