/**
 * A PDF preview the app draws itself, instead of handing the file to the browser's own viewer.
 *
 * The iframe the pane used to mount was only ever as good as the client: Chromium renders a PDF
 * frame, but a browser with its viewer disabled (or a download-on-navigate policy), and any
 * engine that treats `application/pdf` as an attachment, leave a blank rectangle with no way to
 * tell a broken preview from a slow one. The Files panel answers "what is in this file" for
 * every other type; a PDF should not depend on where the app is being viewed.
 *
 * So the bytes are fetched with the session's credentials like any other preview, pdf.js paints
 * each page onto a canvas at the pane's width, and the pane scrolls through them. Canvas output
 * carries no script surface: an Agent-written PDF cannot reach the app's DOM. The viewer keeps
 * the browser out of the picture entirely — nothing here navigates to the file URL.
 *
 * Pages render when they scroll into view (a 200-page manual is not 200 canvases on open), and
 * a placeholder holds each page's height in the meantime so the scrollbar doesn't jump.
 */
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

/** A page taller than this many pane-widths still renders: the cap is on the canvas, not the page. */
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;
/** Lazy rendering: a page starts painting this close to the viewport (in px). */
const PRELOAD_MARGIN = 600;

/** The pane's inner width, kept current while the dock is resized. */
function useWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** One page: a placeholder of the right height until it is near the viewport, then a canvas. */
function PdfPage({
  doc,
  pageNumber,
  width,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Page geometry (width/height ratio) so the placeholder reserves the page's height before it
  // is painted — without it, every page would be zero-height until it rendered and the list
  // would grow under the reader's scrollbar.
  useEffect(() => {
    let cancelled = false;
    void doc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const view = page.getViewport({ scale: 1 });
        setAspect(view.height / view.width);
        page.cleanup();
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber]);

  useEffect(() => {
    const el = hostRef.current;
    if (el === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: `${PRELOAD_MARGIN}px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Paint. Re-runs when the pane is resized: the canvas is redrawn at the new width rather than
  // stretched, which keeps text crisp.
  useEffect(() => {
    if (!visible || width <= 0 || aspect === null) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        let scale = (width * ratio) / base.width;
        const pixels = (base.width * scale * (base.height * scale)) | 0;
        if (pixels > MAX_CANVAS_PIXELS)
          scale = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (canvas === null) {
          page.cleanup();
          return;
        }
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
        const render = page.render({ canvas, viewport });
        task = render;
        await render.promise;
        page.cleanup();
      } catch (error) {
        // A cancelled render (resize, unmount) is not a failure; anything else leaves the page
        // blank rather than taking the whole preview down.
        const name = (error as { name?: string })?.name;
        if (!cancelled && name !== "RenderingCancelledException") setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width, visible, aspect]);

  return (
    <div
      ref={hostRef}
      data-page={pageNumber}
      className="flex flex-col items-center gap-1"
      style={aspect === null ? { minHeight: 240 } : undefined}
    >
      <div
        className="overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-black/5"
        style={
          aspect === null
            ? { width: width > 0 ? width : undefined, height: 240 }
            : { width: width > 0 ? width : undefined, aspectRatio: `1 / ${aspect}` }
        }
      >
        {failed ? (
          <p className="p-3 text-xs text-fg-subtle">{`p.${pageNumber}`}</p>
        ) : (
          <canvas ref={canvasRef} aria-label={`p.${pageNumber}`} className="block h-full w-full" />
        )}
      </div>
      <span className="text-xs tabular-nums text-fg-subtle">{pageNumber}</span>
    </div>
  );
}

export function PdfPreview({
  src,
  title,
  reloadKey,
  loadingLabel,
  errorLabel,
}: {
  src: string;
  title: string;
  /** Remount-and-refetch key: the same URL is unchanged when the Agent rewrites the file. */
  reloadKey?: number;
  loadingLabel: string;
  errorLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const width = useWidth(scrollRef);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    setDoc(null);
    setFailed(false);
    void (async () => {
      try {
        // The worker is its own asset: pdf.js parses on a thread of its own, so a long document
        // cannot freeze the conversation behind it.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).href;
        const response = await fetch(src, { credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        const data = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const document = await task.promise;
        if (cancelled) {
          void task.destroy();
          task = null;
          return;
        }
        setDoc(document);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    // The loading task owns the worker and is what tears both down — a document proxy has no
    // `destroy` of its own in this pdf.js version, and calling one was a TypeError on unmount.
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [src, reloadKey]);

  // The scroll box is always mounted, even while the document is loading: it is what the width
  // is measured from, and an element that only appears after the fetch would report 0 to the
  // measurement effect that already ran (and never re-run it).
  return (
    <div
      ref={scrollRef}
      aria-label={title}
      tabIndex={0}
      className="h-full w-full overflow-auto rounded-md border border-line bg-gray-100 p-2 dark:bg-gray-900"
    >
      {failed ? (
        <p className="p-1 text-sm text-tone-danger-fg">{errorLabel}</p>
      ) : doc === null ? (
        <p className="p-1 text-sm text-fg-subtle" role="status">
          {loadingLabel}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} width={Math.max(width - 16, 0)} />
          ))}
        </div>
      )}
    </div>
  );
}
