/**
 * The Windows installer's artwork, as `electron-builder.yml` points NSIS at it.
 *
 * NSIS's assisted installer draws two bitmaps, and both fail in silence when they are wrong:
 * a sidebar that is not exactly 164×314, or a header that is not exactly 150×57, is simply not
 * drawn (the page falls back to NSIS's stock graphic and a blank header bar), and a 32-bit BMP
 * is refused the same way. A person installing Adelie would then see none of Adelie's own
 * interface, with nothing in the build output saying so — hence this test: it reads the two
 * committed files, parses their headers, and checks them against the sizes the config names.
 *
 * The pixels come from scripts/render-installer-art.mjs, which the files' own headers describe;
 * regenerating is a manual step, so the files are committed rather than built.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Width and height NSIS's MUI requires, per file, as `nsis:` in electron-builder.yml names them. */
const EXPECTED = [
  { file: "build/nsis/installerSidebar.bmp", width: 164, height: 314 },
  { file: "build/nsis/installerHeader.bmp", width: 150, height: 57 },
];

function readBmp(file: string): {
  width: number;
  height: number;
  bits: number;
  compression: number;
} {
  const buf = fs.readFileSync(path.join(pkgDir, file));
  expect(buf.subarray(0, 2).toString("ascii"), `${file} is not a BMP`).toBe("BM");
  expect(buf.readUInt32LE(14), `${file} is not a BITMAPINFOHEADER bitmap`).toBe(40);
  return {
    width: buf.readInt32LE(18),
    height: buf.readInt32LE(22),
    bits: buf.readUInt16LE(28),
    compression: buf.readUInt32LE(30),
  };
}

describe("NSIS installer artwork", () => {
  it.each(EXPECTED)(
    "$file is a 24-bit bitmap of exactly $width×$height",
    ({ file, width, height }) => {
      const bmp = readBmp(file);
      expect(bmp.width).toBe(width);
      // Positive height: rows are stored bottom-up, which is the only layout NSIS accepts.
      expect(bmp.height).toBe(height);
      expect(bmp.bits).toBe(24);
      expect(bmp.compression).toBe(0);
      // Rows padded to 4 bytes, plus the 54-byte header — the file is exactly as long as it says.
      const pixelBytes = Math.ceil((width * 3) / 4) * 4 * height;
      expect(fs.statSync(path.join(pkgDir, file)).size).toBe(54 + pixelBytes);
    },
  );

  it("is the artwork electron-builder.yml actually configures", () => {
    const config = fs.readFileSync(path.join(pkgDir, "electron-builder.yml"), "utf8");
    const configured = (key: string): string => {
      const value = new RegExp(`^\\s*${key}:\\s*(\\S+)\\s*$`, "m").exec(config)?.[1];
      expect(value, `electron-builder.yml does not set nsis.${key}`).toBeDefined();
      // electron-builder resolves a custom resource against the build resources dir first and
      // the package dir second; both are inside this package, so the second is the one to try.
      const resolved = path.resolve(pkgDir, value!);
      expect(fs.existsSync(resolved), `nsis.${key} points at a missing file: ${value}`).toBe(true);
      return path.relative(pkgDir, resolved);
    };
    expect(configured("installerSidebar")).toBe("build/nsis/installerSidebar.bmp");
    expect(configured("installerHeader")).toBe("build/nsis/installerHeader.bmp");
  });
});
