export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

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
        web?: { results?: { title: string; url: string; description?: string }[] };
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
