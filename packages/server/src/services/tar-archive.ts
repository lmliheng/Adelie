/**
 * The npm tarball reader: one of the two archive formats a plugin can arrive in, beside the zip
 * the rest of the import path has always taken (see plugin-download.ts for where a `.tgz` comes
 * from and http/routes/plugins.ts for what is done with it).
 *
 * A tarball is a gzipped tar, and there is no sync reader for one in the dependencies — `tar` is
 * a streaming package, and the plugin parser is a pure synchronous function (it is unit-tested
 * that way and called that way by both import routes), so the header walk lives here instead.
 * Only what an npm package needs is implemented: ustar names, the `prefix` field, pax extended
 * headers and GNU long names, base-256 sizes, and regular files. Links, devices and sparse
 * members are skipped rather than followed — a plugin is a directory of files.
 *
 * Two caps, and one set of numbers for the content: `gunzipBounded` bounds the INFLATED size
 * before a byte of tar is read (the compressed archive is already bounded at 32MB by the download
 * path, but gzip is a ratio, and 32MB of zeros is tens of gigabytes of tar), and `untarBounded`
 * applies the plugin limits the zip reader applies (skill-import-limits.ts), on the sizes the
 * headers declare — the same reason they are read there rather than counted afterwards.
 */
import { gunzipSync } from "node:zlib";
import { HttpError } from "../http/errors.js";
import { badRequest } from "../http/validate.js";
import { MAX_ARCHIVE_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from "./skill-import-limits.js";

/** The tar block every member starts on. */
const BLOCK = 512;

/**
 * How large a tarball may be once gunzipped, before any of it is parsed. Generous next to the
 * archives the path accepts (the largest shipped plugin is under 200KB packed, the download cap is
 * 32MB) and small enough to bound one request's memory: what this refuses is a decompression bomb,
 * not a large package.
 */
export const MAX_INFLATED_TARBALL_BYTES = 64 * 1024 * 1024;

/** Whether these bytes are gzipped — the one signature that says "tarball" rather than "zip". */
export function isGzip(archive: Uint8Array): boolean {
  return archive[0] === 0x1f && archive[1] === 0x8b;
}

/**
 * Gunzips a tarball, refusing one that inflates past the cap instead of allocating it. The
 * compression bomb is the whole point: 32MB of plausible-looking upload can expand to gigabytes,
 * and the header walk below would only get to see that after it is already in memory.
 */
export function gunzipBounded(archive: Uint8Array): Uint8Array {
  try {
    return gunzipSync(archive, { maxOutputLength: MAX_INFLATED_TARBALL_BYTES });
  } catch (err) {
    // zlib's own answer to the cap (ERR_BUFFER_TOO_LARGE) is the one refusal that is about size
    // rather than about the bytes; everything else is a corrupt or non-gzip body.
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
      throw new HttpError(
        413,
        "plugin_too_large",
        `The npm tarball unpacks to more than ${MAX_INFLATED_TARBALL_BYTES / (1024 * 1024)}MB.`,
      );
    }
    throw badRequest("The archive is not a valid npm tarball.");
  }
}

/** One regular-file member of a tar, as its header declares it. */
interface TarMember {
  name: string;
  /** The size the header claims; the walker has already checked the archive holds that much. */
  size: number;
  /** Where the member's bytes start in the archive. */
  dataOffset: number;
}

/**
 * Every regular-file member of a tar, in archive order, reading headers alone — the tar equivalent
 * of the zip central-directory scan `entryNames` does, and what makes the two-pass import cheap:
 * locating the plugin root costs a walk, not a copy.
 *
 * Throws (a 400) on structural damage — a bad checksum, a truncated member, an entry path that
 * would land outside a directory (see checkEntryName) — rather than skipping it: half an archive
 * is not a smaller archive, and the caller's answer to any of these is the same.
 */
export function tarMembers(archive: Uint8Array): TarMember[] {
  const members: TarMember[] = [];
  // Set by the pax/GNU header immediately BEFORE the member it describes, and cleared by that
  // member whichever branch takes it: an extended header applies to exactly one entry.
  let pendingName: string | undefined;
  let pendingSize: number | undefined;
  let offset = 0;
  while (offset + BLOCK <= archive.byteLength) {
    const header = archive.subarray(offset, offset + BLOCK);
    // Two zero blocks end a tar; a single one is the padding some writers leave. Either way the
    // rest of the archive is padding, and what came before it is the whole archive.
    if (isZeroBlock(header)) break;
    checkChecksum(header, offset);
    const type = String.fromCharCode(header[156] ?? 0);
    const isFile = type === "0" || type === "\0";
    // A file's size is what the header says, unless a pax record corrected it (the octal field is
    // what past-GB sizes cannot be written into); every other header describes its own data.
    const size = (isFile ? pendingSize : undefined) ?? readNumber(header, 124, 12) ?? 0;
    if (offset + BLOCK + size > archive.byteLength) {
      throw badRequest("The npm tarball is truncated.");
    }
    const data = archive.subarray(offset + BLOCK, offset + BLOCK + size);
    const padded = Math.ceil(size / BLOCK) * BLOCK;

    if (type === "x" || type === "X") {
      // A pax extended header: "length key=value\n" records, applied to the next member.
      const records = parsePax(data);
      pendingName = records.get("path") ?? pendingName;
      const paxSize = records.get("size");
      if (paxSize !== undefined) {
        const parsed = Number(paxSize);
        if (!Number.isSafeInteger(parsed) || parsed < 0) {
          throw badRequest("The npm tarball declares an unusable member size.");
        }
        pendingSize = parsed;
      }
    } else if (type === "L") {
      // GNU long name: the member's own name, in the data of this header.
      pendingName = text(data).replace(/\0+$/, "");
    } else if (isFile) {
      const name = pendingName ?? joinPrefix(header);
      checkEntryName(name);
      members.push({ name, size, dataOffset: offset + BLOCK });
      pendingName = undefined;
      pendingSize = undefined;
    } else {
      // Directories, links, devices, sparse members: nothing a plugin is made of, and nothing to
      // follow — a tar may describe a link whose target is outside the archive entirely.
      pendingName = undefined;
      pendingSize = undefined;
    }
    offset += BLOCK + padded;
  }
  return members;
}

/** Every member name, in archive order (the tar half of what pluginRootIn reads). */
export function tarEntryNames(archive: Uint8Array): string[] {
  return tarMembers(archive).map((member) => member.name);
}

/**
 * `tarMembers` with the plugin caps enforced and the wanted members copied out — the tar
 * counterpart of `unzipBounded`, and bounded the same way: against the sizes the headers declare,
 * before a byte is copied. `wanted` is asked before the counting, so a tarball holding a whole
 * package beside the plugin is bounded on the plugin (see that function's note).
 *
 * Members are copied, not viewed: the returned buffers outlive this call and are written to disk
 * by the installer, and a view onto the caller's download would keep the whole archive alive.
 */
export function untarBounded(
  archive: Uint8Array,
  wanted: (name: string) => boolean = () => true,
): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  let count = 0;
  let declared = 0;
  for (const member of tarMembers(archive)) {
    if (!wanted(member.name)) continue;
    count += 1;
    if (count > MAX_ARCHIVE_FILES) {
      throw badRequest(`The tar archive exceeds the ${MAX_ARCHIVE_FILES}-file limit.`);
    }
    if (member.size > MAX_FILE_BYTES) {
      throw badRequest(`Tar member exceeds the 5MB uncompressed limit: ${member.name}`);
    }
    declared += member.size;
    if (declared > MAX_TOTAL_BYTES) {
      throw badRequest("The tar archive exceeds the 20MB uncompressed limit.");
    }
    files[member.name] = archive.slice(member.dataOffset, member.dataOffset + member.size);
  }
  return files;
}

/** Whether a 512-byte block is all zeroes (the end-of-archive marker). */
function isZeroBlock(header: Uint8Array): boolean {
  for (const byte of header) {
    if (byte !== 0) return false;
  }
  return true;
}

/**
 * Verifies the header's checksum: the sum of its bytes with the checksum field itself read as
 * spaces. Cheap (512 bytes) and the one integrity check a tar carries — a corrupt download is
 * caught here rather than as a nonsense member list.
 */
function checkChecksum(header: Uint8Array, offset: number): void {
  const declared = readNumber(header, 148, 8);
  if (declared === undefined) throw badRequest("The npm tarball member has no checksum.");
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) {
    // The checksum field (bytes 148-155) contributes as if it were spaces.
    sum += i >= 148 && i < 156 ? 0x20 : (header[i] ?? 0);
  }
  if (sum !== declared) {
    throw badRequest(`The npm tarball member at byte ${offset} is corrupt.`);
  }
}

/**
 * The member's name: the ustar `prefix` field in front of `name` when both are present, which is
 * how a path longer than 100 bytes is stored without a pax header.
 */
function joinPrefix(header: Uint8Array): string {
  const name = text(header.subarray(0, 100));
  const prefix = text(header.subarray(345, 500));
  return prefix === "" ? name : `${prefix}/${name}`;
}

/** A NUL-terminated field, read as UTF-8 (npm writes UTF-8 names; tar's own default is ASCII). */
function text(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return Buffer.from(end === -1 ? bytes : bytes.subarray(0, end)).toString("utf8");
}

/**
 * A numeric header field: octal ASCII, or base-256 for the GNU/POSIX binary form (values past
 * what octal fits, marked by the high bit of the first byte).
 */
function readNumber(header: Uint8Array, offset: number, length: number): number | undefined {
  const first = header[offset] ?? 0;
  if ((first & 0x80) !== 0) {
    let value = first & 0x7f;
    for (let i = 1; i < length; i += 1) {
      value = value * 256 + (header[offset + i] ?? 0);
    }
    return Number.isSafeInteger(value) ? value : undefined;
  }
  const raw = text(header.subarray(offset, offset + length)).trim();
  if (raw === "") return 0;
  const value = Number.parseInt(raw, 8);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** The records of a pax extended header: `"<length> <key>=<value>\n"`, length counting the whole record. */
function parsePax(data: Uint8Array): Map<string, string> {
  const records = new Map<string, string>();
  const raw = Buffer.from(data).toString("utf8");
  let offset = 0;
  while (offset < raw.length) {
    const space = raw.indexOf(" ", offset);
    if (space === -1) break;
    const length = Number.parseInt(raw.slice(offset, space), 10);
    // A record that does not fit the buffer it claims to be in is the end of the usable part.
    if (!Number.isFinite(length) || length <= 0 || offset + length > raw.length) break;
    const record = raw.slice(space + 1, offset + length - 1);
    const equals = record.indexOf("=");
    if (equals !== -1) records.set(record.slice(0, equals), record.slice(equals + 1));
    offset += length;
  }
  return records;
}

/**
 * The one entry-path rule, the tar side of `assertSafeEntryPath`: no absolute path, no backslash
 * and no ".." segment. Enforced on EVERY member rather than on the chosen plugin root alone (which
 * is where the zip reader runs it), because a tar's member list is what the plugin root is chosen
 * FROM — a root found under a `..` would otherwise be trusted for one step.
 */
function checkEntryName(name: string): void {
  if (name.includes("\\")) throw badRequest(`Invalid tar entry path (backslash): ${name}`);
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
    throw badRequest(`Invalid tar entry path (absolute): ${name}`);
  }
  if (name.split("/").some((segment) => segment === "..")) {
    throw badRequest(`Invalid tar entry path (traversal): ${name}`);
  }
}
