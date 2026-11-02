# Webtools

Set of personal tools that I don't want to rely on other services.

## Tools

-   **QR Generator**: Generate QR codes for text, URLs, etc.
-   **Scribble**: A drawing canvas with layers and filters.
-   **Pomodoro**: A productivity timer with sessions.
-   **Noisee**: Generate ambient sounds and music.
-   **PDF Mixer**: Pick pages from several PDFs, reorder them, and save them as one PDF or burst them into single-page PDFs (zipped).

## Running locally

To run these tools locally, you can use Python's built-in HTTP server:

```bash
python3 -m http.server 4000 --directory docs
```

Then open `http://localhost:4000` in your browser.

## Development

These tools are designed to be self-contained and run entirely in the browser. There are no build steps and nothing is loaded from other servers; the few libraries a tool needs (e.g. PDF.js, pdf-lib and SortableJS for PDF Mixer) are kept in that tool's `vendor/` folder. You can simply edit the HTML/CSS/JS files and run them locally using the command above.

## License

ISC
