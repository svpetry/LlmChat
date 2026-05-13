import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDnsLookup = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
    default: {
        lookup: mockDnsLookup,
    },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { fetchPublicUrlBytes, fetchWebsiteContent } =
    await import("../search.js");

function streamResponse(
    bytes: Uint8Array,
    headers: Record<string, string> = {},
) {
    let read = false;
    return {
        ok: true,
        status: 200,
        headers: {
            get: (name: string) => headers[name.toLowerCase()] ?? null,
        },
        body: {
            getReader: () => ({
                read: vi.fn(async () => {
                    if (read) return { done: true };
                    read = true;
                    return { done: false, value: bytes };
                }),
                cancel: vi.fn(async () => {}),
            }),
        },
    };
}

describe("fetchWebsiteContent", () => {
    beforeEach(() => {
        mockDnsLookup.mockResolvedValue([
            { address: "93.184.216.34", family: 4 },
        ]);
        mockFetch.mockReset();
    });

    it("downloads direct image URLs for chat display", async () => {
        const pngBytes = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
            "base64",
        );
        mockFetch.mockResolvedValue(
            streamResponse(pngBytes, { "content-type": "image/png" }),
        );

        const result = await fetchWebsiteContent(
            "https://example.com/anime_girl.png",
        );

        expect(result.title).toBe("anime_girl.png");
        expect(result.contentType).toBe("image/png");
        expect(result.content).toContain("Displayed to user: true");
        expect(result.image).toEqual(
            expect.objectContaining({
                name: "anime_girl.png",
                mimeType: "image/png",
                bytes: pngBytes.length,
                dataUrl: expect.stringContaining("data:image/png;base64,"),
            }),
        );
    });

    it("detects image bytes even when a server uses octet-stream", async () => {
        const pngBytes = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
            "base64",
        );
        mockFetch.mockResolvedValue(
            streamResponse(pngBytes, {
                "content-type": "application/octet-stream",
            }),
        );

        const result = await fetchWebsiteContent(
            "https://example.com/download?id=1",
        );

        expect(result.contentType).toBe("image/png");
        expect(result.image?.mimeType).toBe("image/png");
    });

    it("downloads public URL bytes for filesystem tools", async () => {
        const bytes = Buffer.from([0, 1, 2, 3]);
        mockFetch.mockResolvedValue(
            streamResponse(bytes, {
                "content-type": "application/octet-stream",
                "content-length": String(bytes.length),
            }),
        );

        const result = await fetchPublicUrlBytes(
            "https://example.com/file.bin",
            100,
        );

        expect(result.finalUrl).toBe("https://example.com/file.bin");
        expect(result.contentType).toBe("application/octet-stream");
        expect(Buffer.from(result.bytes)).toEqual(bytes);
    });
});
