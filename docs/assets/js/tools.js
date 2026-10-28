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
    slug: "timer",
    name: "Interval Timer",
    desc: "Work/rest intervals for workouts, with saved presets.",
    icon: '<circle cx="12" cy="13" r="8"/><path d="M12 13V9M10 2h4M12 2v3"/>',
    status: "soon",
  },
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
    slug: "ocr",
    name: "Image to Text",
    desc: "Extract text from images, entirely in the browser.",
    icon: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 9h8M8 12h8M8 15h5"/>',
    status: "soon",
  },
  {
    slug: "timezone",
    name: "Time Zones",
    desc: "Convert times across zones at a glance.",
    icon: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    status: "soon",
  },
  {
    slug: "noisee",
    name: "Noisee",
    desc: "Mix ambient sounds — rain, sea, birds, bonfire.",
    icon: '<path d="M2 12h1M6 8v8M10 4v16M14 9v6M18 6v12M22 11v2"/>',
    status: "soon",
  },
  {
    slug: "scribble",
    name: "Scribble Pad",
    desc: "A quick canvas for sketches and notes.",
    icon: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/>',
    status: "soon",
  },
];
