import type {
    BrowserSettings,
    ExecuteSettings,
    FileAccessSettings,
    MemorySettings,
    SearchSettings,
    ToolCall,
} from "../atoms.js";

export function canUseTools(
    searchSettings: SearchSettings,
    fileAccessSettings: FileAccessSettings,
    memorySettings: MemorySettings,
    executeSettings?: ExecuteSettings,
    browserSettings?: BrowserSettings,
) {
    return (
        searchSettings.enabled ||
        fileAccessSettings.enabled ||
        memorySettings.enabled ||
        executeSettings?.enabled ||
        browserSettings?.enabled
    );
}

export function getToolDisplay(toolCall: ToolCall) {
    let args: Record<string, unknown> = {};
    try {
        args = JSON.parse(toolCall.arguments) as Record<string, unknown>;
    } catch {
        // ignore invalid tool arguments in historical messages
    }

    if (toolCall.name === "web_search") {
        return {
            label: "Search",
            detail: typeof args.query === "string" ? args.query : "",
        };
    }

    if (toolCall.name === "read_website") {
        return {
            label: "Read website",
            detail: typeof args.url === "string" ? args.url : "",
        };
    }

    if (toolCall.name === "save_memory") {
        return {
            label: "Save memory",
            detail: typeof args.content === "string" ? args.content : "",
        };
    }

    if (toolCall.name === "search_memory") {
        return {
            label: "Search memory",
            detail: typeof args.query === "string" ? args.query : "",
        };
    }

    if (toolCall.name === "list_memories") {
        return { label: "List memories", detail: "" };
    }

    if (toolCall.name === "update_memory") {
        return {
            label: "Update memory",
            detail: typeof args.content === "string" ? args.content : "",
        };
    }

    if (toolCall.name === "delete_memory") {
        return {
            label: "Delete memory",
            detail: typeof args.id === "string" ? args.id : "",
        };
    }

    if (toolCall.name === "clear_memories") {
        return { label: "Clear memories", detail: "" };
    }

    const fileToolLabels: Record<string, string> = {
        list_home_directory: "List files",
        get_home_path_info: "Inspect path",
        search_home_paths: "Search files",
        read_home_file: "Read file",
        read_home_image: "Display image",
        search_home_file_text: "Search file text",
        edit_home_file_lines: "Edit file",
        create_home_path: "Create path",
        download_home_file: "Download file",
        delete_home_path: "Delete path",
    };

    if (toolCall.name in fileToolLabels) {
        const detail =
            typeof args.path === "string"
                ? args.path
                : typeof args.query === "string"
                  ? args.query
                  : "";
        return { label: fileToolLabels[toolCall.name], detail };
    }

    return { label: toolCall.name, detail: toolCall.arguments };
}
