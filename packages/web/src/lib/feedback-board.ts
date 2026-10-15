/**
 * The product's public feedback board (Tencent's 兔小巢 hosts it): where anyone using the app can
 * post a bug report or a request in the open, and read what others already reported.
 *
 * It stands BESIDE the account menu's own feedback dialog rather than replacing it. That dialog
 * files into the operator's queue (ADELIE_FEEDBACK_URL, see the server's feedback route) and is
 * only offered where the install has that switch turned on; the board belongs to the product, so it
 * is the same address in every install and is offered always.
 *
 * A module rather than a literal inside the row: the address is the product's, not a preference,
 * and saying so here is what lets the test pin both the address and the way it is opened.
 */

/** Where the public board lives. */
export const FEEDBACK_BOARD_URL = "https://txc.qq.com/products/802227";

/**
 * Opens the board in a new tab, isolated from this one (`noopener,noreferrer`) — the shape the app
 * opens every off-app destination with (the Link component's `external`, terminal links). In the
 * desktop window the shell hands a foreign address to the system browser, which is what leaving the
 * app for the board should do.
 */
export function openFeedbackBoard(): void {
  window.open(FEEDBACK_BOARD_URL, "_blank", "noopener,noreferrer");
}
