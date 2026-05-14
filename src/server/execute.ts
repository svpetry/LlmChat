import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const MAX_OUTPUT_BYTES = 200_000;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;

type ExecuteToolResult = { summary: string; content: string };

export const executeTools = [
    {
        type: "function" as const,
        function: {
            name: "execute_command",
            description:
                "Execute a shell command in the user's home directory. Use this to run PowerShell or Python scripts, inspect system state, or perform other command-line tasks. The working directory is the user's home folder. Commands run with the same privileges as the server process.",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description:
                            "The shell command to execute. On Windows this runs via PowerShell; on other platforms via /bin/sh.",
                    },
                    timeout: {
                        type: "number",
                        description:
                            "Maximum execution time in seconds. Defaults to 30, maximum 120.",
                    },
                },
                required: ["command"],
            },
        },
    },
] as const;

export async function executeCommandTool(
    name: string,
    rawArguments: string,
): Promise<ExecuteToolResult> {
    if (name !== "execute_command") {
        throw new Error(`Unknown execute tool: ${name}`);
    }

    let args: Record<string, unknown>;
    try {
        args = JSON.parse(rawArguments) as Record<string, unknown>;
    } catch {
        throw new Error("Invalid tool call arguments");
    }

    const command = requireString(args.command, "command");
    const timeoutSeconds = clampNumber(
        args.timeout,
        1,
        MAX_TIMEOUT_SECONDS,
        DEFAULT_TIMEOUT_SECONDS,
    );

    const home = process.env.LLM_CHAT_HOME_DIR ?? os.homedir();
    const result = await runCommand(command, home, timeoutSeconds * 1000);

    return jsonResult(
        `Command exited with code ${result.exitCode}`,
        {
            command,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stdout: result.stdout,
            stderr: result.stderr,
        },
    );
}

function runCommand(
    command: string,
    cwd: string,
    timeoutMs: number,
): Promise<{
    exitCode: number;
    timedOut: boolean;
    stdout: string;
    stderr: string;
}> {
    return new Promise((resolve) => {
        const isWindows = process.platform === "win32";
        const shell = isWindows ? "powershell.exe" : "/bin/sh";
        const shellArgs = isWindows
            ? ["-NoProfile", "-NonInteractive", "-Command", command]
            : ["-c", command];

        const child = spawn(shell, shellArgs, {
            cwd,
            env: { ...process.env },
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        let stdout = "";
        let stderr = "";
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let stdoutTruncated = false;
        let stderrTruncated = false;
        let timedOut = false;
        let settled = false;

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => {
                if (!settled) {
                    child.kill("SIGKILL");
                }
            }, 3000);
        }, timeoutMs);

        child.stdout.on("data", (chunk: Buffer) => {
            if (stdoutTruncated) return;
            stdoutBytes += chunk.length;
            if (stdoutBytes > MAX_OUTPUT_BYTES) {
                stdoutTruncated = true;
                return;
            }
            stdout += chunk.toString("utf-8");
        });

        child.stderr.on("data", (chunk: Buffer) => {
            if (stderrTruncated) return;
            stderrBytes += chunk.length;
            if (stderrBytes > MAX_OUTPUT_BYTES) {
                stderrTruncated = true;
                return;
            }
            stderr += chunk.toString("utf-8");
        });

        child.on("close", (code) => {
            clearTimeout(timer);
            settled = true;
            resolve({
                exitCode: code ?? 1,
                timedOut,
                stdout: stdoutTruncated ? stdout + "\n... (output truncated)" : stdout,
                stderr: stderrTruncated ? stderr + "\n... (output truncated)" : stderr,
            });
        });

        child.on("error", (err) => {
            clearTimeout(timer);
            settled = true;
            resolve({
                exitCode: 1,
                timedOut: false,
                stdout: "",
                stderr: err.message,
            });
        });
    });
}

function jsonResult(summary: string, payload: unknown): ExecuteToolResult {
    return { summary, content: JSON.stringify(payload, null, 2) };
}

function requireString(value: unknown, name: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Missing ${name} parameter`);
    }
    return value.trim();
}

function clampNumber(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(value)));
}
