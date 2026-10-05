/**
 * The avatars' markup: both defaults are the Adelie mark — an account that stored no image, and an
 * agent, which never has one — a stored account image still wins over it, and a stack shows a few
 * discs then a count, with the avatars themselves hidden from assistive technology.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { AgentAvatar } from "../src/components/icons/avatars/agent-avatar";
import { AvatarStack } from "../src/components/icons/avatars/avatar-stack";
import { USER_AVATAR_SIZE, UserAvatar } from "../src/components/icons/avatars/user-avatar";
import { classTokens, renderStatic } from "../src/testing";

/** The mark's white plate — what tells an Adelie mark apart from any other inline svg. */
const PLATE = "#fefefe";

describe("AgentAvatar", () => {
  it("draws the Adelie mark, not the initial's letter tile", () => {
    const html = renderStatic(createElement(AgentAvatar, { id: "docs-expert", name: "docs" }));
    expect(html).toContain("<svg");
    expect(html).toContain(PLATE);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("</text>");
    expect(html).not.toContain(">D<");
  });
});

describe("UserAvatar", () => {
  it("draws the Adelie mark when no image is stored, circle-cropped", () => {
    const html = renderStatic(
      createElement(UserAvatar, { userId: "admin", displayName: "zoe", size: 28 }),
    );
    expect(html).toContain("<svg");
    expect(html).toContain(PLATE);
    expect(classTokens(html)).toContain("rounded-full");
    expect(html).toContain("width:28px");
    expect(html).not.toContain(">Z<");
  });

  it("shows a stored image cropped to the circle, with no alternative text of its own", () => {
    const html = renderStatic(
      createElement(UserAvatar, {
        userId: "admin",
        avatar: "data:image/png;base64,AAAA",
        size: USER_AVATAR_SIZE.preview,
      }),
    );
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('alt=""');
    expect(html).toContain("width:64px");
    expect(html).not.toContain(PLATE);
  });
});

describe("AvatarStack", () => {
  const items = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id.toUpperCase() }));

  it("draws the first few and counts the rest", () => {
    const html = renderStatic(createElement(AvatarStack, { items, size: 18 }));
    expect(html.match(/<svg/g)).toHaveLength(3);
    expect(html).toContain(">+2</span>");
  });

  it("draws no count when everything fits", () => {
    const html = renderStatic(createElement(AvatarStack, { items: items.slice(0, 2), size: 18 }));
    expect(html).not.toMatch(/>\+\d/);
  });

  it("hides the avatars from assistive technology and rings every disc the same way", () => {
    const html = renderStatic(
      createElement(AvatarStack, {
        items: [
          { id: "qa", name: "QA" },
          { id: "admin", name: "Zoe", kind: "user" as const },
        ],
        size: 18,
      }),
    );
    expect(html).toMatch(/^<span class="[^"]*"><span class="flex -space-x-1" aria-hidden="true">/);
    expect(classTokens(html)).toEqual(
      expect.arrayContaining(["ring-canvas", "rounded-full", "ring-2"]),
    );
  });
});
