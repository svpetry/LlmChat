import dns from "node:dns/promises";
import net from "node:net";

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface WebsiteContent {
    url: string;
    title: string;
    content: string;
    contentType: string;
    truncated: boolean;
}

const MAX_WEBSITE_BYTES = 1_000_000;
const MAX_WEBSITE_CHARS = 20_000;
const MAX_WEBSITE_REDIRECTS = 5;
const WEBSITE_FETCH_TIMEOUT_MS = 15_000;

export async function searchBrave(
    query: string,
    apiKey: string,
): Promise<SearchResult[]> {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const response = await fetch(url, {
        headers: { "X-Subscription-Token": apiKey },
    });
    if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.status}`);
    }
    const data = (await response.json()) as {
        web?: {
            results?: { title: string; url: string; description?: string }[];
        };
    };
    return (data.web?.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description ?? "",
    }));
}

export async function searchSearxng(
    query: string,
    instanceUrl: string,
): Promise<SearchResult[]> {
    const base = instanceUrl.replace(/\/+$/, "");
    const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`SearXNG error: ${response.status}`);
    }
    const data = (await response.json()) as {
        results?: { title: string; url: string; content?: string }[];
    };
    return (data.results ?? []).slice(0, 5).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content ?? "",
    }));
}

export async function fetchWebsiteContent(
    url: string,
): Promise<WebsiteContent> {
    let currentUrl = await validatePublicHttpUrl(url);

    for (let redirectCount = 0; ; redirectCount++) {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            WEBSITE_FETCH_TIMEOUT_MS,
        );

        let response: Response;
        try {
            response = await fetch(currentUrl.href, {
                redirect: "manual",
                signal: controller.signal,
                headers: {
                    Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
                    "User-Agent": "LLMChat/1.0 (+https://localhost)",
                },
            });
        } finally {
            clearTimeout(timeout);
        }

        if (isRedirect(response.status)) {
            if (redirectCount >= MAX_WEBSITE_REDIRECTS) {
                throw new Error("Too many redirects");
            }

            const location = response.headers.get("location");
            if (!location) {
                throw new Error("Redirect response missing location");
            }

            currentUrl = await validatePublicHttpUrl(
                new URL(location, currentUrl).href,
            );
            continue;
        }

        if (!response.ok) {
            throw new Error(`Website returned HTTP ${response.status}`);
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!isReadableContentType(contentType)) {
            throw new Error(
                contentType
                    ? `Unsupported content type: ${contentType}`
                    : "Unsupported content type",
            );
        }

        const { text, truncated: byteTruncated } =
            await readLimitedResponseText(response, MAX_WEBSITE_BYTES);
        const extracted = extractReadableText(
            text,
            currentUrl.href,
            contentType,
        );
        const charTruncated = extracted.content.length > MAX_WEBSITE_CHARS;

        return {
            url: currentUrl.href,
            title: extracted.title,
            content: charTruncated
                ? extracted.content.slice(0, MAX_WEBSITE_CHARS).trimEnd()
                : extracted.content,
            contentType,
            truncated: byteTruncated || charTruncated,
        };
    }
}

async function validatePublicHttpUrl(input: string): Promise<URL> {
    let parsed: URL;
    try {
        parsed = new URL(input);
    } catch {
        throw new Error("Invalid URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Only http and https URLs are supported");
    }

    if (parsed.username || parsed.password) {
        throw new Error("URLs with embedded credentials are not supported");
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (isLocalHostname(hostname)) {
        throw new Error("Local or private network URLs are not supported");
    }

    const addresses = await dns.lookup(hostname, { all: true });
    if (
        addresses.length === 0 ||
        addresses.some((address) => isPrivateAddress(address.address))
    ) {
        throw new Error("Local or private network URLs are not supported");
    }

    return parsed;
}

function normalizeHostname(hostname: string) {
    return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

function isLocalHostname(hostname: string) {
    const lower = hostname.toLowerCase();
    return (
        lower === "localhost" ||
        lower.endsWith(".localhost") ||
        lower === "0" ||
        isPrivateAddress(lower)
    );
}

function isPrivateAddress(address: string) {
    const ipv4FromMappedIpv6 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (ipv4FromMappedIpv6) {
        return isPrivateAddress(ipv4FromMappedIpv6[1]);
    }

    const ipVersion = net.isIP(address);
    if (ipVersion === 4) {
        const parts = address.split(".").map(Number);
        const [a, b] = parts;
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 198 && (b === 18 || b === 19)) ||
            a >= 224
        );
    }

    if (ipVersion === 6) {
        const lower = address.toLowerCase();
        return (
            lower === "::1" ||
            lower === "::" ||
            lower.startsWith("fc") ||
            lower.startsWith("fd") ||
            lower.startsWith("fe80:")
        );
    }

    return false;
}

function isRedirect(status: number) {
    return [301, 302, 303, 307, 308].includes(status);
}

function isReadableContentType(contentType: string) {
    if (!contentType) {
        return true;
    }

    const mime = contentType.split(";")[0].trim().toLowerCase();
    return (
        mime === "text/html" ||
        mime === "text/plain" ||
        mime === "application/xhtml+xml" ||
        mime === "application/xml" ||
        mime === "text/xml" ||
        mime.startsWith("text/")
    );
}

async function readLimitedResponseText(
    response: Response,
    maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
    if (!response.body) {
        return { text: "", truncated: false };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let truncated = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        if (received + value.length > maxBytes) {
            const remaining = maxBytes - received;
            if (remaining > 0) {
                chunks.push(value.slice(0, remaining));
                received += remaining;
            }
            truncated = true;
            await reader.cancel();
            break;
        }

        chunks.push(value);
        received += value.length;
    }

    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }

    return {
        text: decodeResponse(bytes, response.headers.get("content-type") ?? ""),
        truncated,
    };
}

function decodeResponse(bytes: Uint8Array, contentType: string) {
    const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim();
    try {
        return new TextDecoder(charset || "utf-8").decode(bytes);
    } catch {
        return new TextDecoder("utf-8").decode(bytes);
    }
}

function extractReadableText(
    raw: string,
    url: string,
    contentType: string,
): { title: string; content: string } {
    const mime = contentType.split(";")[0].trim().toLowerCase();
    if (mime && !mime.includes("html") && !mime.includes("xml")) {
        return {
            title: new URL(url).hostname,
            content: normalizeText(raw),
        };
    }

    const title = decodeHtmlEntities(
        raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
    ).trim();
    const content = raw
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
        .replace(/<canvas\b[\s\S]*?<\/canvas>/gi, " ")
        .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(
            /<\/?(article|aside|blockquote|br|dd|div|dl|dt|figcaption|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi,
            "\n",
        )
        .replace(/<[^>]+>/g, " ");

    return {
        title: title || new URL(url).hostname,
        content: normalizeText(decodeHtmlEntities(content)),
    };
}

function normalizeText(text: string) {
    return text
        .replace(/\r/g, "\n")
        .replace(/[ \t\f\v]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function decodeHtmlEntities(text: string) {
    const namedEntities: Record<string, string> = {
        amp: "&",
        apos: "'",
        gt: ">",
        hellip: "...",
        lt: "<",
        mdash: "-",
        nbsp: " ",
        ndash: "-",
        quot: '"',
    };

    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, value) => {
        const lower = value.toLowerCase();
        if (lower.startsWith("#x")) {
            return decodeNumericEntity(entity, parseInt(lower.slice(2), 16));
        }
        if (lower.startsWith("#")) {
            return decodeNumericEntity(entity, parseInt(lower.slice(1), 10));
        }
        return namedEntities[lower] ?? entity;
    });
}

function decodeNumericEntity(entity: string, codePoint: number) {
    if (
        !Number.isFinite(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff
    ) {
        return entity;
    }

    return String.fromCodePoint(codePoint);
}

export const webSearchTool = {
    type: "function" as const,
    function: {
        name: "web_search",
        description:
            "Search the web for current information. Use this when you need up-to-date facts, recent events, or information beyond your training data.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query",
                },
            },
            required: ["query"],
        },
    },
};

export const readWebsiteTool = {
    type: "function" as const,
    function: {
        name: "read_website",
        description:
            "Read the text content of a public web page by URL. Use this when the user provides a link, asks about a specific page, or search results need deeper source content.",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The full http or https URL to read",
                },
            },
            required: ["url"],
        },
    },
};
