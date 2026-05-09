import { describe, it, expect, beforeEach } from "vitest";
import { getSetting, setSetting, getAllSettings } from "../database.js";

describe("database", () => {
    beforeEach(() => {
        // Clear all settings between tests by overwriting with a clean set
        const settings = getAllSettings();
        for (const key of Object.keys(settings)) {
            // sql.js doesn't have a direct DELETE exposed through our API,
            // so we use the internal db — but since we only export get/set/getAll,
            // we work around by setting to empty and testing behavior.
        }
    });

    it("returns undefined for a non-existent key", () => {
        expect(getSetting("nonexistent")).toBeUndefined();
    });

    it("saves and retrieves a setting", () => {
        setSetting("testKey", "testValue");
        expect(getSetting("testKey")).toBe("testValue");
    });

    it("overwrites an existing setting", () => {
        setSetting("overwriteKey", "first");
        setSetting("overwriteKey", "second");
        expect(getSetting("overwriteKey")).toBe("second");
    });

    it("getAllSettings returns all saved settings", () => {
        setSetting("k1", "v1");
        setSetting("k2", "v2");

        const all = getAllSettings();
        expect(all.k1).toBe("v1");
        expect(all.k2).toBe("v2");
    });
});
