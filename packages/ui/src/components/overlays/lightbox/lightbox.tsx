/**
 * The lightbox: an image shown large over the page, with a close glyph in the top-right corner
 * (no title bar) and, below it, the bar of things one can actually do with the picture — download
 * it, and step through the batch it came in. Closable via Esc or clicking the overlay.
 * `ZoomableImage` is the thumbnail that opens it: the thumbnail keeps the caller's styling, and a
 * click zooms in.
 *
 * The lightbox is rendered via portal to body — the thumbnail may be nested inside a card with a
 * transform entrance animation or overflow-hidden, and a `fixed` layer rendered in place would get
 * hijacked or clipped by that ancestor (the same reason the Select panel portals). Escape goes
 * through the shared Escape-layer stack like every other overlay's, so a lightbox opened from
 * inside a dialog closes alone and leaves the dialog up.
 *
 * The bar carries only what the page can really do: save the file (a plain `download` link, no
 * request of its own) and move within the batch. Editing actions a generation service would back
 * have no endpoint behind them here, and a row of buttons that cannot work is worse than none.
 */
import { useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { createPortal } from "react-dom";
import { useUiStrings } from "../../../strings";
import { ICONS } from "../../icons/icons";
import { GlyphIcon } from "../../icons/glyph-icon/glyph-icon";
import { CloseIcon, DownloadIcon } from "../../icons/marks/marks";
import { useEscLayer } from "../esc-layers/esc-layers";
import { downloadName, pixelSizeLabel, stepIndex } from "./image-board";
import type { LightboxImage } from "./image-board";

export type { LightboxImage };

export interface LightboxProps {
  open: boolean;
  src: string;
  alt: string;
  onClose: () => void;
  /** The close glyph's accessible name; defaults to the interface's word for "close". */
  closeLabel?: string;
  /**
   * The batch the picture belongs to — the attachments of one message, the results of one
   * generation — so the lightbox can show them side by side and step between them. `src` picks
   * the one it opens on. Omitted, the batch is the single picture and the bar is just the
   * download.
   */
  images?: readonly LightboxImage[];
}

export function Lightbox({ open, src, alt, onClose, closeLabel, images }: LightboxProps) {
  const strings = useUiStrings();
  // Closing resets the step, so the next opening starts on the caller's own picture rather than on
  // whichever one the reader last looked at.
  const close = () => {
    setStep(null);
    onClose();
  };
  useEscLayer(open, close);
  // The step the reader took from the caller's picture, or null while they have taken none.
  const [step, setStep] = useState<number | null>(null);
  /**
   * The pixel size of the picture that loaded, tagged with its src: switching pictures leaves the
   * previous reading behind, and the badge must not show another picture's numbers while the next
   * one is still arriving.
   */
  const [measured, setMeasured] = useState<{ src: string; width: number; height: number } | null>(
    null,
  );

  if (!open) return null;

  const batch = images !== undefined && images.length > 0 ? images : [{ src, alt }];
  const opening = Math.max(
    batch.findIndex((image) => image.src === src),
    0,
  );
  const at = Math.min(Math.max(step ?? opening, 0), batch.length - 1);
  const shown = batch[at] ?? { src, alt };
  const badge =
    measured !== null && measured.src === shown.src
      ? pixelSizeLabel(measured.width, measured.height)
      : null;
  const multi = batch.length > 1;

  return createPortal(
    <div
      // ui-scrim: the overlay is the dimmed layer, with the image and its bar inside it.
      className="ui-scrim anim-fade fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[var(--ui-overlay-backdrop)] p-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="anim-pop relative">
        {/* Close glyph: top-right inside the frame, floating over the image on a translucent
            disc of the ink colour, which keeps it visible on any image. */}
        <button
          type="button"
          aria-label={closeLabel ?? strings.close}
          onClick={close}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-fg/50 text-canvas transition-colors duration-150 hover:bg-fg/70"
        >
          <CloseIcon />
        </button>
        <img
          key={shown.src}
          src={shown.src}
          alt={shown.alt}
          onLoad={(e) =>
            setMeasured({
              src: shown.src,
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          className="max-h-[85vh] max-w-[88vw] rounded-lg border border-line bg-surface"
        />
        {/* The picture's own pixel size, opposite the close glyph: what the file is, not what the
            window made of it. */}
        {badge !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-fg/50 px-2 py-0.5 text-xs tabular-nums text-canvas">
            {badge}
          </span>
        )}
      </div>

      {multi && (
        <div className="anim-fade flex max-w-[88vw] items-center gap-2 overflow-x-auto">
          {batch.map((image, i) => (
            <button
              key={`${i}-${image.src}`}
              type="button"
              aria-label={image.alt}
              aria-current={i === at ? "true" : undefined}
              onClick={() => setStep(i)}
              className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border transition-colors duration-150 ${
                i === at ? "border-line-emphasis" : "border-line hover:border-fg-muted"
              }`}
            >
              <img src={image.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* The capsule bar: step within the batch on the left, save on the right. */}
      <div className="anim-pop flex items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-1">
        {multi && (
          <>
            <button
              type="button"
              aria-label={strings.previousImage}
              onClick={() => setStep(stepIndex(at, -1, batch.length))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted transition-colors duration-150 hover:bg-surface-muted hover:text-fg"
            >
              <GlyphIcon d={ICONS.arrowLeftCentered} size={14} />
            </button>
            <button
              type="button"
              aria-label={strings.nextImage}
              onClick={() => setStep(stepIndex(at, 1, batch.length))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-fg-muted transition-colors duration-150 hover:bg-surface-muted hover:text-fg"
            >
              <GlyphIcon d={ICONS.arrowRightCentered} size={14} />
            </button>
            <span className="px-1 text-xs tabular-nums text-fg-muted">
              {at + 1} / {batch.length}
            </span>
          </>
        )}
        <a
          href={shown.src}
          download={downloadName(shown.src)}
          className="flex h-7 items-center gap-1.5 rounded-full px-2 text-xs text-fg transition-colors duration-150 hover:bg-surface-muted"
        >
          <DownloadIcon />
          <span>{strings.download}</span>
        </a>
      </div>
    </div>,
    document.body,
  );
}

/** A clickable image that opens itself in the {@link Lightbox}. */
export function ZoomableImage({
  src,
  alt,
  className,
  closeLabel,
  lazy = false,
  group,
  ...imgProps
}: {
  src: string;
  alt: string;
  /** Style for the thumbnail img (keeps the caller's original class). */
  className?: string;
  /** The lightbox's close glyph's accessible name; defaults to the interface's word for "close". */
  closeLabel?: string;
  /** Fetch the thumbnail only as it nears the viewport (a long list of fetched images, e.g. a transcript's). */
  lazy?: boolean;
  /** The batch this picture belongs to, when the caller has one (a message's attachments). */
  group?: readonly LightboxImage[];
} & Omit<ComponentPropsWithoutRef<"img">, "src" | "alt" | "className" | "loading">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="block cursor-zoom-in" onClick={() => setOpen(true)}>
        {/* Everything else the caller's img already had — a Markdown picture's title, width and
            height — belongs to the thumbnail: those are how it fits the text it sits in. The
            lightbox shows the file at its own size and takes only src, alt and the batch. */}
        <img
          {...imgProps}
          src={src}
          alt={alt}
          className={className}
          loading={lazy ? "lazy" : undefined}
        />
      </button>
      <Lightbox
        open={open}
        src={src}
        alt={alt}
        onClose={() => setOpen(false)}
        closeLabel={closeLabel}
        {...(group !== undefined ? { images: group } : {})}
      />
    </>
  );
}
