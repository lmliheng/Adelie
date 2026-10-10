/**
 * The demo's storage cleanup, walked end to end through the app's own endpoint wrappers.
 *
 * The gallery's mock answers the same routes the server does, and on the storage page those
 * answers ARE the feature's state machine: the mode gates every write, a scan writes a bill out of
 * the ledger's candidates, a pin takes a path out of the next bill, and an approval is what fills
 * the trash. None of that can be checked by the wrapper sweep in `mock-api.test.ts` — that one
 * only proves a route exists — so the sequence is driven here, in the order a person would click
 * it, and each refusal is the code the page names.
 *
 * What the mock deliberately does not reproduce is the disk: there is no walk, no re-measure and no
 * rename, so the ledger keeps showing what the trash now holds and a restore skips nothing. The
 * server's own rules for those live in `packages/server/test/storage-cleanup.test.ts`; what is
 * protected here is the demo's, which is what the gallery is looked at through.
 */
import { describe, expect, it } from "vitest";
import * as api from "../../web/src/api/endpoints";
import { resetStore } from "../src/app/mock/store";

describe("the demo's reviewed cleanup", () => {
  it("gates on the mode, then scans, pins, applies, restores and purges", async () => {
    const store = resetStore({ lang: "en", signedIn: true });

    // Off by default: every write is refused with the code the page names.
    await expect(api.adminScanStorage()).rejects.toMatchObject({ code: "storage_mode_off" });
    await expect(api.adminPurgeStorageTrash()).rejects.toMatchObject({
      code: "storage_mode_off",
    });

    const on = await api.adminUpdateStorageSettings({ enabled: true });
    expect(on.settings.enabled).toBe(true);

    // A scan writes a bill out of the ledger's candidates.
    const scanned = await api.adminScanStorage();
    const movable = scanned.plan.entries.filter((entry) => entry.executable);
    expect(movable.length).toBe(2);
    expect(scanned.plan.entries.some((entry) => !entry.executable)).toBe(true);
    expect((await api.adminListStoragePlans()).plans[0]?.id).toBe(scanned.plan.id);
    expect((await api.adminGetStoragePlan(scanned.plan.id)).plan.id).toBe(scanned.plan.id);

    // Pinning takes a path out of the next bill and lands in the settings. On the bill that still
    // lists it, an apply is refused for the pin; on the next scan it is not on the bill at all.
    const pins = await api.adminPinStoragePath(scanned.plan.id, {
      path: movable[0]!.path,
      pinned: true,
    });
    expect(pins.settings.pins).toContain(movable[0]!.path);
    await expect(
      api.adminApplyStoragePlan({
        planId: scanned.plan.id,
        fingerprint: scanned.plan.fingerprint,
        paths: [movable[0]!.path],
      }),
    ).rejects.toMatchObject({ code: "pinned_path" });
    const afterPin = await api.adminScanStorage();
    expect(afterPin.plan.entries.some((entry) => entry.path === movable[0]!.path)).toBe(false);
    expect(afterPin.plan.excluded).toContain(movable[0]!.path);
    await expect(
      api.adminApplyStoragePlan({
        planId: afterPin.plan.id,
        fingerprint: afterPin.plan.fingerprint,
        paths: [movable[0]!.path],
      }),
    ).rejects.toMatchObject({ code: "unknown_path" });

    // A wrong fingerprint is refused; the bill's own one moves the selection.
    const targets = afterPin.plan.entries.filter((entry) => entry.executable);
    await expect(
      api.adminApplyStoragePlan({
        planId: afterPin.plan.id,
        fingerprint: "nope",
        paths: targets.map((entry) => entry.path),
      }),
    ).rejects.toMatchObject({ code: "plan_stale" });
    const applied = await api.adminApplyStoragePlan({
      planId: afterPin.plan.id,
      fingerprint: afterPin.plan.fingerprint,
      paths: targets.map((entry) => entry.path),
    });
    expect(applied.moved.length).toBe(targets.length);
    expect(applied.trashId).not.toBeNull();
    expect(applied.freedBytes).toBeGreaterThan(0);
    expect((await api.adminGetStoragePlan(afterPin.plan.id)).plan.usable).toBe(false);
    await expect(
      api.adminApplyStoragePlan({
        planId: afterPin.plan.id,
        fingerprint: afterPin.plan.fingerprint,
        paths: targets.map((entry) => entry.path),
      }),
    ).rejects.toMatchObject({ code: "plan_used" });

    // The move landed in the trash, where restore puts it back and purge deletes for good.
    const trash = await api.adminGetStorageTrash();
    expect(trash.entries[0]?.id).toBe(applied.trashId);
    expect(trash.ttlDays).toBe(14);
    const restored = await api.adminRestoreStorageTrash(applied.trashId!);
    expect(restored.restored.length).toBe(targets.length);
    expect(restored.remaining).toBe(false);
    expect((await api.adminGetStorageTrash()).entries.some((e) => e.id === applied.trashId)).toBe(
      false,
    );
    const expired = (await api.adminGetStorageTrash()).entries.find((entry) => entry.expired)!;
    const purged = await api.adminPurgeStorageTrash(expired.id);
    expect(purged.purged.map((entry) => entry.id)).toEqual([expired.id]);
    // Nothing but the entries past the retention goes without an id.
    expect((await api.adminPurgeStorageTrash()).purged).toEqual([]);
    expect(store.f.storageSettings.pins).toContain(movable[0]!.path);
  });
});
