/**
 * Markdown as reading text: `Md` renders a Markdown string through the shared pipeline
 * (markdown-plugins.ts), and `Prose` is `Md` in its reading box — the `.md-body` typography in
 * prose.css, in one of three densities.
 *
 * `Md` is memoized by text identity. A chat's stream model mutates items in place and only
 * reassigns `text` when a delta arrives, so every settled message keeps the same string instance
 * across the per-frame version bumps — the shallow prop compare then skips its entire
 * micromark → mdast → React re-parse, and only the actively-streaming message re-renders. Without
 * this, each animation frame during a stream re-parsed the WHOLE transcript (O(n²) over a long
 * reply), which visibly froze the UI while large code blocks streamed in.
 *
 * Fenced code blocks render through CodeBlock (language chrome + copy button + highlighting).
 * `streaming` disables highlighting while deltas are still arriving — re-tokenizing a growing
 * block every frame is O(n²) work — and the settle re-render (new string instance,
 * streaming=false) highlights each block exactly once. Inline code keeps the default rendering
 * (`.md-body code` in prose.css).
 *
 * KaTeX is held back the same way, for the same reason: `streaming` swaps the rehype stage out, so
 * a formula shows its own TeX source until the message settles and is typeset once (see
 * NO_REHYPE_PLUGINS in markdown-plugins.ts for the measurements). KaTeX's own stylesheet is
 * imported here, so a consumer never loads it on its own; the `.katex` rules in prose.css out-rank
 * it by specificity, whichever of the two a bundle happens to emit first.
 *
 * Links open in a new tab unless a `ProseLinksProvider` above decides otherwise — the Web App's
 * conversation sends a link to a Workspace file to its Files panel that way.
 *
 * A picture is a plain `<img>` — unless a `ProseImagesProvider` above turns `zoomable` on, which is
 * what a conversation does: there a click opens the picture in the lightbox, because a 2000px
 * screenshot fitted to the reading column is too small to read and there was no way to see it whole
 * short of the Files panel. Every other surface keeps the still picture a README expects.
 *
 * Two optional props open the renderer to a surface with its own nodes — the channel message body,
 * which keeps `@mentions` as chips — without a second copy of the pipeline drifting from this one.
 * They only ever ADD to the shared stage and to the maps below; nothing a surface passes can take
 * the shared plugins away.
 */
import { createContext, isValidElement, memo, useContext } from "react";
import type { ComponentPropsWithoutRef, MouseEvent, ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components, ExtraProps, Options } from "react-markdown";
import { CodeBlock } from "../code-block/code-block";
import { ZoomableImage } from "../../overlays/lightbox/lightbox";
import { NO_REHYPE_PLUGINS, REHYPE_PLUGINS, REMARK_PLUGINS } from "./markdown-plugins";
import "katex/dist/katex.min.css";
import "./prose.css";

/** Flatten a react-markdown code element's children to plain text (string or string array in practice). */
function codeText(children: unknown): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.filter((c) => typeof c === "string").join("");
  return "";
}

/**
 * Fenced-block adapter: unwraps the <pre><code class="language-x"> pair react-markdown emits into
 * CodeBlock.
 *
 * `language-math` is the exception. remark-math models block math as a fence in that language and
 * rehype-katex replaces the whole pair before this adapter is consulted — except while streaming,
 * where the rehype stage is off, and the block would otherwise pick up CodeBlock's chrome and copy
 * button for the few hundred milliseconds before it settles into a formula. A plain <pre> is the
 * source either way, so the settle changes the typesetting and nothing else.
 */
function MdPre({ children, streaming }: { children?: ReactNode; streaming: boolean }) {
  if (isValidElement(children)) {
    const props = children.props as { className?: string; children?: unknown };
    const language = /language-([\w+-]+)/.exec(props.className ?? "")?.[1] ?? "";
    if (language === "math") return <pre>{children}</pre>;
    return (
      <CodeBlock
        language={language}
        code={codeText(props.children).replace(/\n$/, "")}
        highlight={!streaming}
      />
    );
  }
  return <pre>{children}</pre>;
}

/** The attributes a rendered link adds on top of its own. */
export interface ProseLinkBehavior {
  target?: "_blank";
  rel?: "noreferrer";
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/** Decides what a link does from its href. */
export type ProseLinkResolver = (href: string | undefined) => ProseLinkBehavior;

/**
 * A new tab with no handle back to this window (`noreferrer` implies `noopener`): every link when
 * no resolver is provided.
 */
export const PROSE_NEW_TAB: ProseLinkBehavior = { target: "_blank", rel: "noreferrer" };

const ProseLinksContext = createContext<ProseLinkResolver | null>(null);

/**
 * Hands the Markdown below a link resolver; `null` restores the default, a new tab for every link.
 * A context change re-renders every link in the tree, memoized bodies included, so pass a resolver
 * that keeps its identity while its inputs do.
 */
export function ProseLinksProvider({
  resolve,
  children,
}: {
  resolve: ProseLinkResolver | null;
  children?: ReactNode;
}): ReactElement {
  return <ProseLinksContext.Provider value={resolve}>{children}</ProseLinksContext.Provider>;
}

/**
 * What an image in the Markdown points at, as the surface above decides it: the src an `<img>`
 * gets. `null` keeps the one the Markdown wrote.
 */
export type ProseImageResolver = (src: string, alt: string) => { src: string } | null;

const ProseImagesContext = createContext<ProseImageResolver | null>(null);

/** Whether a click on a picture below opens it in the lightbox; off unless a provider turns it on. */
const ProseImageZoomContext = createContext(false);

/**
 * Whether the picture below sits inside a link. `MdLink` sets it for its own children, so it is
 * always `false` unless a link put it there; a consumer only reads it.
 */
const ProseInLinkContext = createContext(false);

/**
 * Hands the Markdown below an image resolver; `null` restores the default, the src as written.
 *
 * Same shape and same cost as the link resolver above: a context change re-renders every image in
 * the tree, memoized bodies included, so pass a resolver that keeps its identity while its inputs
 * do. It exists because a relative src in a reply names a file of the Session's Workspace, which
 * the browser resolves against the App's own origin — a broken image. The surface that knows how
 * to serve a Workspace file says so here; every other Markdown surface renders untouched.
 *
 * `zoomable` is independent of the resolver: it says the pictures below are read at their own size
 * (a conversation, where a reply's screenshot is the subject), not decoration (a README's badge,
 * where a click opening an overlay would only get in the way). Off by default, and it is a plain
 * boolean, so a surface that leaves it out pays nothing.
 */
export function ProseImagesProvider({
  resolve,
  zoomable = false,
  children,
}: {
  resolve: ProseImageResolver | null;
  zoomable?: boolean;
  children?: ReactNode;
}): ReactElement {
  return (
    <ProseImageZoomContext.Provider value={zoomable}>
      <ProseImagesContext.Provider value={resolve}>{children}</ProseImagesContext.Provider>
    </ProseImageZoomContext.Provider>
  );
}

/**
 * Link adapter. With no resolver above, every link opens in a new tab (`target="_blank"` +
 * `rel="noreferrer"`, which also implies `noopener`), unconditionally, so a click never navigates
 * the app away. A resolver decides per href. All other anchor props react-markdown supplies
 * (`href`, ...) are forwarded as-is — only its non-DOM `node` prop is stripped — and the behaviour
 * sits after the spread so it always wins. A link title (`[text](url "title")`) becomes the shared
 * tooltip's text rather than a native `title`, like every other hover hint. Long-URL wrapping is
 * CSS (`.md-body a` in prose.css).
 *
 * The children are wrapped in {@link ProseInLinkContext}: a picture the author made into a link
 * (`[![shot](shot.png)](…)`) belongs to the link, and the image adapter below has to know that.
 */
function MdLink({
  node: _node,
  children,
  title,
  ...anchorProps
}: ComponentPropsWithoutRef<"a"> & ExtraProps) {
  const resolve = useContext(ProseLinksContext);
  const behavior = resolve === null ? PROSE_NEW_TAB : resolve(anchorProps.href);
  return (
    <a {...anchorProps} data-tooltip={title} {...behavior}>
      <ProseInLinkContext.Provider value>{children}</ProseInLinkContext.Provider>
    </a>
  );
}

/**
 * Image adapter. With no resolver above, an image keeps the src the Markdown wrote — every surface
 * that renders a README, a handbook page or a document gets exactly what react-markdown gave it
 * before this adapter existed. A resolver may point it somewhere else (the Web App's conversation
 * sends a Workspace-relative src to that Session's file route, see lib/reply-image.ts). An empty
 * src renders no `src` attribute at all rather than `src=""`, which would ask the browser for the
 * page itself. Everything else react-markdown supplies (width, height, title, ...) is forwarded;
 * only its non-DOM `node` prop is stripped. Sizing is CSS (`.md-body img` in prose.css), so an
 * oversized picture fits the reading column instead of widening the transcript.
 *
 * With `zoomable` above, the picture becomes a {@link ZoomableImage} and a click opens it whole —
 * which is the difference between seeing that a screenshot is a screenshot and reading what is in
 * it. Two cases keep the still `<img>`: an empty src, where there is nothing to enlarge (the
 * lightbox would open on the browser's broken-image placeholder), and a picture the author wrapped
 * in a link (`[![shot](shot.png)](…)`) — there the click is the link's, and a button in an anchor
 * would fire both (measured: the button's own handler, then the anchor's navigation), so the
 * picture would open a tab and an overlay at once. An author who made the picture a link meant the
 * link.
 */
function MdImage({
  node: _node,
  src,
  alt,
  ...imageProps
}: ComponentPropsWithoutRef<"img"> & ExtraProps) {
  const resolve = useContext(ProseImagesContext);
  const zoomable = useContext(ProseImageZoomContext);
  const inLink = useContext(ProseInLinkContext);
  const written = typeof src === "string" ? src : "";
  const resolved = written === "" ? null : (resolve?.(written, alt ?? "") ?? null);
  const href = resolved?.src ?? written;
  if (zoomable && !inLink && href !== "") {
    return <ZoomableImage src={href} alt={alt ?? ""} lazy {...imageProps} />;
  }
  return (
    <img {...imageProps} {...(href === "" ? {} : { src: href })} alt={alt ?? ""} loading="lazy" />
  );
}

/**
 * The two `components` maps, built once at module scope instead of inline per render.
 * react-markdown uses `components.pre` as the element **type**, so a fresh arrow each render is
 * a new type on every commit: React unmounts and remounts every code block, dropping the user's
 * text selection and resetting each block's Copy-button state — ~8 times a second while a reply
 * streams, including for blocks that closed long ago. `streaming` is the only thing the adapter
 * closes over, so one frozen map per value is enough; the single flip between them happens on
 * the settle render, which re-parses the message anyway — the same render the rehype stage
 * flips on. The `a` and `img` adapters close over nothing — their resolvers come from context,
 * not from a closure — so both maps share the one reference to each.
 */
const STREAMING_COMPONENTS: Components = {
  pre: (props) => <MdPre streaming>{props.children}</MdPre>,
  a: MdLink,
  img: MdImage,
};
const SETTLED_COMPONENTS: Components = {
  pre: (props) => <MdPre streaming={false}>{props.children}</MdPre>,
  a: MdLink,
  img: MdImage,
};

/**
 * The settled map, for a read-only Markdown surface that renders through react-markdown itself
 * and keeps the code-block chrome. A surface that only swaps the link and image adapters (the
 * file browser) passes them to `Md` instead.
 */
export const SETTLED_MD_COMPONENTS: Components = SETTLED_COMPONENTS;

export interface MdProps {
  text: string;
  /** The text is still arriving: no highlighting, no KaTeX, until it settles. */
  streaming?: boolean;
  /**
   * Remark plugins a surface adds to the shared stage, for a node of its own — the channel
   * message body adds the pass that turns its `@mentions` into elements. They are appended to
   * REMARK_PLUGINS rather than replacing it: a renderer that dropped the shared list would end
   * bare URLs and typeset math differently from every other one, which is the drift
   * markdown-plugins.ts exists to prevent.
   */
  extraPlugins?: NonNullable<Options["remarkPlugins"]>;
  /**
   * Element overrides merged over the two maps above, which keep `pre` and `a`. A module
   * constant, for the same reason those are: react-markdown uses a component as the element
   * *type*, so a fresh function per render remounts everything it renders.
   */
  components?: Components;
}

/** The Markdown alone, for a caller that supplies its own `.md-body` box. */
export const Md = memo(function Md({ text, streaming = false, extraPlugins, components }: MdProps) {
  const base = streaming ? STREAMING_COMPONENTS : SETTLED_COMPONENTS;
  return (
    <ReactMarkdown
      remarkPlugins={
        extraPlugins === undefined ? REMARK_PLUGINS : [...REMARK_PLUGINS, ...extraPlugins]
      }
      rehypePlugins={streaming ? NO_REHYPE_PLUGINS : REHYPE_PLUGINS}
      components={components === undefined ? base : { ...base, ...components }}
    >
      {text}
    </ReactMarkdown>
  );
});

/**
 * How dense the reading box is: `body` the full typography; `compact` one size tighter, for a
 * message that is a line in a stream (a channel bubble); `flush` the full typography with the
 * outermost block's margins dropped, for a box that brings its own inset.
 */
export type ProseVariant = "body" | "compact" | "flush";

const VARIANT: Record<ProseVariant, string> = {
  body: "md-body",
  compact: "md-body md-compact",
  flush: "md-body md-body-flush",
};

export interface ProseProps extends MdProps {
  variant?: ProseVariant;
  /** Size, ink and layout from the caller; the box sets the reading face and the typography. */
  className?: string;
}

/** Markdown in its reading box. */
export function Prose({ variant = "body", className = "", ...md }: ProseProps) {
  return (
    <div className={`${VARIANT[variant]} font-sans ${className}`}>
      <Md {...md} />
    </div>
  );
}
