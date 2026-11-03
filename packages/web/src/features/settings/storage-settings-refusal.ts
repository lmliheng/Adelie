/**
 * The cleanup mode and the pins — the page's two writes on `StorageSettings` — and the line a
 * refusal leaves beside the control that asked.
 *
 * Neither write moves optimistically, which is exactly why the reason cannot be a toast: a refused
 * switch is still where the server has it (the page acts on the answer, never the click), and a
 * refused pin leaves that row's button saying what it said before. Six seconds later the switch is
 * simply off, or the button simply says "pin" again, and nothing on screen says why — the shape
 * 7.19 bans app-wide. Both controls are where the retry is, so both refusals are drawn there.
 *
 * The mode gates every write on this page, and a mode that silently refused to turn on is the
 * page's whole promise (nothing moves without a review) failing shut; the pin is what keeps a path
 * off later bills, and a pin that silently refused lists it again.
 */
import { S } from "../../lib/strings";

/**
 * The line a refused mode switch leaves under the sentence that describes the switch's position:
 * which way it was asked to move (so the sentence names the action that failed) and the reason the
 * server gave, as it gave it.
 */
export function storageModeRefused(enabled: boolean, reason: string): string {
  return S.settings.storageModeRefused(enabled, reason);
}

/** What a refused pin leaves: the path whose row it belongs under, and the sentence. */
export interface StoragePinRefusal {
  path: string;
  text: string;
}

/**
 * The line a refused pin leaves under that row's own button, in the button's words: pinning and
 * unpinning are two different asks, and a path refused for being pinned says something else than
 * one refused for being let go. The path travels as the bill spells it — that is the row it fits.
 */
export function storagePinRefused(
  path: string,
  pinned: boolean,
  reason: string,
): StoragePinRefusal {
  return {
    path,
    text: pinned
      ? S.settings.storagePinRefused(path, reason)
      : S.settings.storageUnpinRefused(path, reason),
  };
}
