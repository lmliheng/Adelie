/**
 * A pet picture out of the file the reader picked (the `picture` figure's data; the preference
 * itself is lib/pet-figure.ts).
 *
 * The Appearance row hands this whatever the file dialog returned, and what the pet needs is one
 * thing: a `data:` URL it can draw at 72px, small enough for `localStorage` and the `storage` event
 * that carries it to the shell's companion window. So the file is decoded, scaled down to
 * {@link PET_PICTURE_MAX_PX} on its long side and re-encoded as PNG — PNG because the point of
 * picking a character drawing is usually that its background is transparent, and JPEG has no alpha
 * channel to keep.
 *
 * NOTHING HERE TOUCHES THE PIXELS. No background is keyed out and no empty margin is trimmed: both
 * are judgement calls about someone's image, and a wrong one (a white hat eaten by a white-key, a
 * drawing cropped at its softest edge) is a mangled picture with no way back. What the row says
 * instead is what the file should already be: a transparent-background image, as the desktop-pet
 * drawings of this kind usually are.
 *
 * The pure half — {@link fitWithin} — is what the suites check; the canvas half is the browser's.
 */

/** The longest side of the stored picture, in pixels. The pet draws at 72, so this is 2× its box
 * on a HiDPI screen: enough to stay crisp, small enough (tens of KB as PNG) that the preference
 * store and the `storage` event carry it without noticing. */
export const PET_PICTURE_MAX_PX = 256;

/** What a picked file can turn out to be: the picture, or why it cannot be one. */
export type PetPictureResult =
  { ok: true; dataUrl: string } | { ok: false; reason: "not_an_image" | "unreadable" };

/** The largest size with the same shape that fits inside a `max`×`max` box, at least 1×1. */
export function fitWithin(
  width: number,
  height: number,
  max: number = PET_PICTURE_MAX_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.max(1, width), height: Math.max(1, height) };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Reads a picked file into a picture the pet can draw. */
export async function pictureDataUrlFromFile(file: File): Promise<PetPictureResult> {
  if (!file.type.startsWith("image/")) return { ok: false, reason: "not_an_image" };
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) return { ok: false, reason: "unreadable" };
    context.drawImage(image, 0, 0, width, height);
    return { ok: true, dataUrl: canvas.toDataURL("image/png") };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The image behind an object URL, or a rejection: a file that is not one decodes to 0×0. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        reject(new Error("unreadable"));
        return;
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error("unreadable"));
    image.src = url;
  });
}
