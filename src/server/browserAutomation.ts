import { chromium, Browser, BrowserContext, Locator, Page } from "playwright";

const MAX_NAVIGATE_MS = 30_000;
const MAX_SCREENSHOT_BYTES = 4_000_000; // 4 MB
const MAX_GET_TEXT_CHARS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;

type BrowserToolResult = {
    summary: string;
    content: string;
    image?: {
        path: string;
        name: string;
        mimeType: string;
        bytes: number;
        dataUrl: string;
    };
};

// --- Singleton browser context ---

let browserInstance: Browser | null = null;
let browserContext: BrowserContext | null = null;
let currentUrl = "";

async function ensurePage(): Promise<Page> {
    if (!browserContext) {
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ],
        });
        browserContext = await browserInstance.newContext({
            viewport: { width: 1280, height: 900 },
            userAgent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        });
    }
    const pages = browserContext.pages();
    let page = pages[0];
    if (!page || page.isClosed()) {
        page = await browserContext.newPage();
    }
    return page;
}

export async function shutdownBrowser(): Promise<void> {
    if (browserContext) {
        await browserContext.close().catch(() => {});
        browserContext = null;
    }
    if (browserInstance) {
        await browserInstance.close().catch(() => {});
        browserInstance = null;
    }
    currentUrl = "";
}

// --- Tool definitions ---

export const browserAutomationTools = [
    {
        type: "function" as const,
        function: {
            name: "browser_navigate",
            description:
                "Navigate the browser to a URL. Opens the page and waits for it to load. Use this before any other browser action.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description: "The URL to navigate to (http/https).",
                    },
                },
                required: ["url"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "browser_screenshot",
            description:
                "Take a screenshot of the current page. Returns an image that vision-capable models can see. Use this to inspect the visual state of the page before deciding what to click or type.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "browser_get_text",
            description:
                "Extract the visible text content and accessibility information from the current page. Returns page title, URL, links, headings, and readable text. Use this to understand page structure without a screenshot.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "browser_click",
            description:
                "Click an element on the page. Specify the target by visible text, accessibility role+name, role+text, or CSS selector. The browser waits for navigation if the click triggers one.",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description:
                            "Visible text of the element to click (e.g. 'Submit', 'Learn more'). Can also be used as the accessible name when role is specified.",
                    },
                    role: {
                        type: "string",
                        description:
                            "Accessibility role of the element (e.g. 'button', 'link', 'checkbox') paired with name or text. Mutually exclusive with selector.",
                    },
                    name: {
                        type: "string",
                        description:
                            "Accessible name to pair with role. If omitted, text is used as the role name.",
                    },
                    selector: {
                        type: "string",
                        description:
                            "CSS selector of the element to click (e.g. '#submit-btn', '.nav > a:first-child'). Mutually exclusive with text and role.",
                    },
                },
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "browser_type",
            description:
                "Type text into an input field on the page. Specify the target by placeholder, label, or CSS selector. By default appends to existing content; set clear=true to replace.",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "The text to type into the field.",
                    },
                    placeholder: {
                        type: "string",
                        description:
                            "Placeholder attribute of the target input (e.g. 'Search...'). Mutually exclusive with label and selector.",
                    },
                    label: {
                        type: "string",
                        description:
                            "Label text associated with the target input (e.g. 'Username'). Mutually exclusive with placeholder and selector.",
                    },
                    selector: {
                        type: "string",
                        description:
                            "CSS selector of the target input (e.g. '#search-input', 'input[name=q]'). Mutually exclusive with placeholder and label.",
                    },
                    clear: {
                        type: "boolean",
                        description:
                            "Clear existing content before typing. Defaults to false.",
                    },
                },
                required: ["text"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "browser_select_option",
            description:
                "Select an option from a <select> dropdown. Specify the target by label or CSS selector, and provide the value or visible text of the option to select.",
            parameters: {
                type: "object",
                properties: {
                    label: {
                        type: "string",
                        description:
                            "Label text associated with the <select> element. Mutually exclusive with selector.",
                    },
                    selector: {
                        type: "string",
                        description:
                            "CSS selector of the <select> element. Mutually exclusive with label.",
                    },
                    value: {
                        type: "string",
                        description:
                            "The value attribute or visible text of the option to select.",
                    },
                },
                required: ["value"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "browser_scroll",
            description:
                "Scroll the page. Use 'down' to scroll to the bottom, 'up' to return to the top, or 'delta' for pixel-based scrolling (positive = down, negative = up).",
            parameters: {
                type: "object",
                properties: {
                    direction: {
                        type: "string",
                        enum: ["up", "down", "delta"],
                        description:
                            "Scroll direction. 'down' scrolls to bottom, 'up' to top, 'delta' uses pixels.",
                    },
                    pixels: {
                        type: "number",
                        description:
                            "Number of pixels to scroll (used with delta direction). Positive = down, negative = up.",
                    },
                },
                required: ["direction"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "browser_go_back",
            description:
                "Navigate back to the previous page in the browser history.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "browser_refresh",
            description: "Reload the current page.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
] as const;

// --- Tool execution ---

export async function executeBrowserTool(
    name: string,
    rawArguments: string,
): Promise<BrowserToolResult> {
    let args: Record<string, unknown>;
    try {
        args = JSON.parse(rawArguments);
    } catch {
        throw new Error("Invalid tool call arguments");
    }

    const page = await ensurePage();

    switch (name) {
        case "browser_navigate":
            return handleNavigate(page, args);
        case "browser_screenshot":
            return handleScreenshot(page);
        case "browser_get_text":
            return handleGetText(page);
        case "browser_click":
            return handleClick(page, args);
        case "browser_type":
            return handleType(page, args);
        case "browser_select_option":
            return handleSelectOption(page, args);
        case "browser_scroll":
            return handleScroll(page, args);
        case "browser_go_back":
            return handleGoBack(page);
        case "browser_refresh":
            return handleRefresh(page);
        default:
            throw new Error(`Unknown browser tool: ${name}`);
    }
}

async function handleNavigate(
    page: Page,
    args: Record<string, unknown>,
): Promise<BrowserToolResult> {
    const url = requireString(args.url, "url");
    if (!/^https?:\/\//i.test(url)) {
        throw new Error("URL must start with http:// or https://");
    }

    try {
        await page.goto(url, {
            timeout: MAX_NAVIGATE_MS,
            waitUntil: "domcontentloaded",
        });
        currentUrl = page.url();
        const title = await page.title();
        return jsonResult(`Navigated to ${currentUrl}`, {
            url: currentUrl,
            title,
            status: "ok",
        });
    } catch (err) {
        throw new Error(`Navigation failed: ${(err as Error).message}`);
    }
}

async function handleScreenshot(page: Page): Promise<BrowserToolResult> {
    const url = page.url() || "(blank page)";

    const screenshot = await page.screenshot({
        type: "jpeg",
        quality: 80,
        fullPage: false, // viewport screenshot for performance
    });

    if (screenshot.length > MAX_SCREENSHOT_BYTES) {
        // Retry with lower quality
        const smaller = await page.screenshot({
            type: "jpeg",
            quality: 40,
            fullPage: false,
        });
        if (smaller.length > MAX_SCREENSHOT_BYTES) {
            smaller.resize?.(800, 600); // not available on Buffer, skip
        }
        const dataUrl = `data:image/jpeg;base64,${smaller.toString("base64")}`;
        return {
            summary: `Screenshot of ${url}`,
            content: JSON.stringify(
                { url, bytes: smaller.length, note: "quality reduced" },
                null,
                2,
            ),
            image: {
                path: url,
                name: "screenshot.jpg",
                mimeType: "image/jpeg",
                bytes: smaller.length,
                dataUrl,
            },
        };
    }

    const dataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
    return {
        summary: `Screenshot of ${url}`,
        content: JSON.stringify({ url, bytes: screenshot.length }, null, 2),
        image: {
            path: url,
            name: "screenshot.jpg",
            mimeType: "image/jpeg",
            bytes: screenshot.length,
            dataUrl,
        },
    };
}

async function handleGetText(page: Page): Promise<BrowserToolResult> {
    const url = page.url() || "(blank page)";
    const title = await page.title();

    // Gather structured page info via evaluation
    const info = await page.evaluate((maxChars) => {
        const links: Array<{ text: string; href: string }> = [];
        document.querySelectorAll("a[href]").forEach((el) => {
            const text = el.textContent?.trim();
            const href = el.getAttribute("href");
            if (text && href) {
                links.push({ text, href });
            }
        });

        const headings: Array<{ tag: string; text: string }> = [];
        document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
            const text = el.textContent?.trim();
            if (text) {
                headings.push({ tag: el.tagName.toLowerCase(), text });
            }
        });

        // Get visible text from body, excluding scripts/styles
        const bodyClone = document.body.cloneNode(true) as HTMLElement;
        bodyClone
            .querySelectorAll("script, style, noscript, svg")
            .forEach((el) => el.remove());
        const bodyText =
            bodyClone.textContent
                ?.replace(/\s+/g, " ")
                .trim()
                .slice(0, maxChars) ?? "";

        // Get form inputs with their labels/placeholders
        const inputs: Array<{
            type: string;
            name: string;
            placeholder: string;
            label: string;
            ariaLabel: string;
        }> = [];
        document.querySelectorAll("input, textarea, select").forEach((el) => {
            const inputEl = el as HTMLInputElement;
            const label =
                document
                    .querySelector(`label[for="${inputEl.id}"]`)
                    ?.textContent?.trim() ??
                inputEl.closest("label")?.textContent?.trim() ??
                "";
            inputs.push({
                type: inputEl.type ?? inputEl.tagName.toLowerCase(),
                name: inputEl.name ?? "",
                placeholder: inputEl.placeholder ?? "",
                label,
                ariaLabel: inputEl.getAttribute("aria-label") ?? "",
            });
        });

        return { links, headings, bodyText, inputs };
    }, MAX_GET_TEXT_CHARS);

    const textContent = [
        `Title: ${title}`,
        `URL: ${url}`,
        "",
        "=== Headings ===",
        info.headings.map((h) => `${h.tag}: ${h.text}`).join("\n") || "(none)",
        "",
        "=== Links ===",
        info.links
            .slice(0, 200)
            .map((l) => `[${l.text}](${l.href})`)
            .join("\n") || "(none)",
        "",
        "=== Form Inputs ===",
        info.inputs
            .map(
                (i) =>
                    `<${i.type}> name="${i.name}" placeholder="${i.placeholder}" label="${i.label}" aria-label="${i.ariaLabel}"`,
            )
            .join("\n") || "(none)",
        "",
        "=== Page Text (truncated to 30k chars) ===",
        info.bodyText,
    ].join("\n");

    return jsonResult(`Extracted text from ${url}`, {
        url,
        title,
        headingCount: info.headings.length,
        linkCount: info.links.length,
        inputCount: info.inputs.length,
        textLength: info.bodyText.length,
        text: textContent,
    });
}

async function handleClick(
    page: Page,
    args: Record<string, unknown>,
): Promise<BrowserToolResult> {
    const text = getString(args.text);
    const role = getString(args.role);
    const name = getString(args.name);
    const selector = getString(args.selector);
    const roleName = role ? (name ?? text) : null;

    if (selector && (text || role || name)) {
        throw new Error("Specify selector without text, role, or name");
    }
    if (!selector && role && !roleName) {
        throw new Error("Specify name or text when role is specified");
    }
    if (!selector && !role && !text) {
        throw new Error("Specify text, role + name, role + text, or selector");
    }

    let clicked = false;
    const urlBefore = page.url();

    try {
        if (selector) {
            const el = page.locator(selector);
            if ((await el.count()) > 0) {
                await el.click({ timeout: DEFAULT_TIMEOUT_MS });
                clicked = true;
            }
        } else if (role && roleName) {
            const el = page.getByRole(
                role as Parameters<typeof page.getByRole>[0],
                { name: roleName },
            );
            if ((await el.count()) > 0) {
                await el.click({ timeout: DEFAULT_TIMEOUT_MS });
                clicked = true;
            }
        } else if (text) {
            // Try getting element by text content
            const el = await page
                .locator(`:has-text("${escapeCss(text)}")`)
                .first();
            if ((await el.count()) > 0) {
                await el.click({ timeout: DEFAULT_TIMEOUT_MS });
                clicked = true;
            }
        }

        if (!clicked) {
            throw new Error("Element not found on the page");
        }

        // Wait for potential navigation
        await page
            .waitForLoadState("domcontentloaded", {
                timeout: 5000,
            })
            .catch(() => {});

        const urlAfter = page.url();
        const title = await page.title();
        currentUrl = urlAfter;

        return jsonResult(`Clicked element${clicked ? " successfully" : ""}`, {
            target: selector ?? (role ? `${role}[${roleName}]` : text),
            navigated: urlBefore !== urlAfter,
            url: urlAfter,
            title,
        });
    } catch (err) {
        if ((err as Error).message.includes("Element not found")) {
            throw err;
        }
        throw new Error(`Click failed: ${(err as Error).message}`);
    }
}

async function handleType(
    page: Page,
    args: Record<string, unknown>,
): Promise<BrowserToolResult> {
    const text = requireString(args.text, "text");
    const placeholder = getString(args.placeholder);
    const label = getString(args.label);
    const selector = getString(args.selector);
    const clear = args.clear === true;

    const targets = [placeholder, label, selector].filter(Boolean).length;
    if (targets === 0) {
        throw new Error(
            "Specify at least one of: placeholder, label, or selector",
        );
    }

    const candidates: Array<{ target: string; locator: Locator }> = [];
    if (selector) {
        candidates.push({ target: selector, locator: page.locator(selector) });
    }
    if (label) {
        candidates.push({ target: label, locator: page.getByLabel(label) });
    }
    if (placeholder) {
        candidates.push({
            target: placeholder,
            locator: page.getByPlaceholder(placeholder),
        });
        candidates.push({
            target: placeholder,
            locator: page.getByLabel(placeholder),
        });
        candidates.push({
            target: placeholder,
            locator: page.locator(
                `input[aria-label="${escapeAttr(placeholder)}"],textarea[aria-label="${escapeAttr(placeholder)}"]`,
            ),
        });
    }

    for (const candidate of candidates) {
        const el = candidate.locator.first();
        if ((await el.count()) === 0) {
            continue;
        }

        if (clear) {
            await el.clear({ timeout: DEFAULT_TIMEOUT_MS });
        }
        await el.fill(text, { timeout: DEFAULT_TIMEOUT_MS });

        return jsonResult(`Typed text into field`, {
            target: candidate.target,
            charactersTyped: text.length,
            cleared: clear,
        });
    }

    throw new Error("Input element not found on the page");
}

async function handleSelectOption(
    page: Page,
    args: Record<string, unknown>,
): Promise<BrowserToolResult> {
    const value = requireString(args.value, "value");
    const label = getString(args.label);
    const selector = getString(args.selector);

    if (!label && !selector) {
        throw new Error("Specify either label or selector");
    }
    if (label && selector) {
        throw new Error("Specify only one of: label or selector");
    }

    let el: Locator;
    if (label) {
        // Find select by associated label
        el = page.locator("select").filter({ hasText: label });
        if ((await el.count()) === 0) {
            el = page.locator(
                `label:has-text("${escapeCss(label)}") + select, label:has-text("${escapeCss(label)}") ~ select`,
            );
        }
    } else {
        el = page.locator(selector!);
    }

    if ((await el.count()) === 0) {
        throw new Error("Select element not found on the page");
    }

    await el.selectOption({ label: value }, { timeout: DEFAULT_TIMEOUT_MS });

    return jsonResult(`Selected option in dropdown`, {
        target: label ?? selector,
        selectedValue: value,
    });
}

async function handleScroll(
    page: Page,
    args: Record<string, unknown>,
): Promise<BrowserToolResult> {
    const direction = requireString(args.direction, "direction");
    const pixels = getOptionalNumber(args.pixels);

    let description = "";
    switch (direction) {
        case "down":
            await page.evaluate(() =>
                window.scrollTo(0, document.body.scrollHeight),
            );
            description = "Scrolled to bottom";
            break;
        case "up":
            await page.evaluate(() => window.scrollTo(0, 0));
            description = "Scrolled to top";
            break;
        case "delta": {
            const delta = pixels ?? 300;
            await page.evaluate((px) => window.scrollBy(0, px), delta);
            description = `Scrolled ${delta > 0 ? "down" : "up"} by ${Math.abs(delta)}px`;
            break;
        }
        default:
            throw new Error("direction must be up, down, or delta");
    }

    return jsonResult(description, {
        direction,
        pixels,
        url: page.url(),
    });
}

async function handleGoBack(page: Page): Promise<BrowserToolResult> {
    const urlBefore = page.url();
    await page.goBack({ timeout: MAX_NAVIGATE_MS }).catch((err) => {
        throw new Error(`Cannot go back: ${err.message}`);
    });
    await page
        .waitForLoadState("domcontentloaded", { timeout: 5000 })
        .catch(() => {});

    currentUrl = page.url();
    const title = await page.title();

    return jsonResult(`Navigated back`, {
        from: urlBefore,
        to: currentUrl,
        title,
    });
}

async function handleRefresh(page: Page): Promise<BrowserToolResult> {
    await page.reload({
        timeout: MAX_NAVIGATE_MS,
        waitUntil: "domcontentloaded",
    });

    currentUrl = page.url();
    const title = await page.title();

    return jsonResult(`Refreshed page`, {
        url: currentUrl,
        title,
    });
}

// --- Helpers ---

function jsonResult(summary: string, payload: unknown): BrowserToolResult {
    return { summary, content: JSON.stringify(payload, null, 2) };
}

function requireString(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Missing ${name} parameter`);
    }
    return value.trim();
}

function getString(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value.trim();
    return null;
}

function getOptionalNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return undefined;
}

function escapeCss(s: string): string {
    return s.replace(/"/g, '\\"').replace(/\n/g, "\\A");
}

function escapeAttr(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
