/**
 * The feedback entry in the account menu, and the dialog behind it.
 *
 * Two fields, and only one of them is required: a one-line title and an optional detail. That
 * pair is the shape the endpoint files (the requirements box's own `{title, detail}`), so
 * nothing is derived here — what the user types as the title is what the queue shows as the
 * item's name.
 *
 * Where the words go is the server's business (ADELIE_FEEDBACK_URL, see the server's feedback
 * route): the browser never learns the endpoint or its key, and the only state it needs is
 * whether there is one at all — {@link useFeedbackChannel} asks that once per menu mount. The
 * row is the caller's to place; the dialog belongs OUTSIDE the menu panel, which unmounts its
 * children the moment the menu closes (user-menu.tsx).
 *
 * `feedback_not_configured` can still come back if the operator turns the endpoint off while
 * the dialog is open, and its own sentence says so rather than blaming the network.
 */
import { useEffect, useState } from "react";
import { Button, Input, Modal, Textarea, toastSuccess } from "@lmliheng/penguin-ui";
import * as api from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { S } from "../../lib/strings";

/**
 * Whether this install has a feedback channel, and the dialog's open state. Fails closed — an
 * unreadable answer leaves the row out rather than offering a submission that would land in a
 * 503 — and never re-asks: the endpoint is the operator's launch environment, which does not
 * change under a running server.
 */
export function useFeedbackChannel(): {
  configured: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
} {
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getFeedbackConfig()
      .then((res) => {
        if (alive) setConfigured(res.configured);
      })
      .catch(() => {
        if (alive) setConfigured(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { configured, open, setOpen };
}

/**
 * What a failed submission says. One server code means the operator's switch, and it says so in
 * its own words rather than blaming the network; everything else is the same sentence, because
 * from here the user can act on none of them differently. A pure function because vitest runs
 * node-only (no click reaches a handler) and this is the whole of the dialog's error handling.
 */
export function feedbackErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code === "feedback_not_configured"
    ? S.feedback.notConfigured
    : S.feedback.sendFailed;
}

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Closing clears the draft, so a re-open never shows the previous submission's text. */
  const close = () => {
    if (busy) return;
    setTitle("");
    setDetail("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (trimmed === "") {
      setError(S.feedback.titleRequired);
      return;
    }
    setBusy(true);
    try {
      const result = await api.sendFeedback({ title: trimmed, detail: detail.trim() });
      toastSuccess(result.id ? S.feedback.submittedWithId(result.id) : S.feedback.submitted);
      setTitle("");
      setDetail("");
      setError(null);
      onClose();
    } catch (e) {
      setError(feedbackErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={S.feedback.title}
      onClose={close}
      footer={
        <>
          <Button size="sm" onClick={close} disabled={busy}>
            {S.common.cancel}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || title.trim() === ""}
            onClick={() => void submit()}
          >
            {S.feedback.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">{S.feedback.intro}</p>
        <Input
          size="sm"
          label={S.feedback.titleLabel}
          placeholder={S.feedback.titlePlaceholder}
          value={title}
          // The one field this dialog insists on — the red "*" says so, not the label's words
          // (the detail beside it carries no mark, which is what makes it optional).
          required
          // The endpoint's own cap; refusing an over-long title here saves a round trip.
          maxLength={200}
          autoFocus
          error={error ?? undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim() !== "" && !busy) void submit();
          }}
        />
        <Textarea
          size="sm"
          rows={5}
          label={S.feedback.detailLabel}
          placeholder={S.feedback.detailPlaceholder}
          value={detail}
          maxLength={20000}
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>
    </Modal>
  );
}
