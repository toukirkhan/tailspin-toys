// Extension: triage-board
// Kanban-style issue triage board: top-3 "needs attention" lane + backlog lane,
// each card with an "Add to context" button that pushes the issue into the
// current session's composer.

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

const HERE = dirname(fileURLToPath(import.meta.url));
const COPILOT_HOME = process.env.COPILOT_HOME || join(homedir(), ".copilot");
const BOARD_DIR = join(COPILOT_HOME, "extensions", "triage-board", "artifacts", "boards");

const issueSchema = {
    type: "object",
    required: ["number", "title", "url"],
    properties: {
        number: { type: "integer" },
        title: { type: "string" },
        url: { type: "string" },
        state: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
        summary: { type: "string", description: "Short description of the issue's content." },
        justification: { type: "string", description: "Why this issue needs attention now (top cards)." },
        referenceType: { type: "string", enum: ["issue", "pr", "discussion"] },
    },
};

const boardSchema = {
    type: "object",
    properties: {
        repo: { type: "string", description: "owner/repo. Used as the durable board ID." },
        title: { type: "string" },
        top: { type: "array", items: issueSchema, maxItems: 3 },
        rest: { type: "array", items: issueSchema },
    },
};

// instanceId -> { server, url, repo, clients:Set<res> }
const servers = new Map();
let session;

const boardFile = (repo) => join(BOARD_DIR, `${repo.replace(/[^A-Za-z0-9._-]/g, "__")}.json`);
const lastFile = join(BOARD_DIR, "_last.json");

async function saveBoard(board) {
    await mkdir(BOARD_DIR, { recursive: true });
    const data = { ...board, updatedAt: new Date().toISOString() };
    await writeFile(boardFile(board.repo), JSON.stringify(data, null, 2));
    await writeFile(lastFile, JSON.stringify({ repo: board.repo }));
    return data;
}

async function loadBoard(repo) {
    try {
        if (!repo) repo = JSON.parse(await readFile(lastFile, "utf8")).repo;
        return JSON.parse(await readFile(boardFile(repo), "utf8"));
    } catch {
        return null;
    }
}

function findIssue(board, number) {
    return [...(board?.top ?? []), ...(board?.rest ?? [])].find((i) => i.number === number);
}

async function addToContext(instanceId, board, number) {
    const issue = findIssue(board, number);
    if (!issue) throw new CanvasError("issue_not_found", `Issue #${number} is not on this board`);
    const ref = {
        type: "github_reference",
        number: issue.number,
        title: issue.title,
        referenceType: issue.referenceType ?? "issue",
        state: issue.state ?? "open",
        url: issue.url,
    };
    try {
        await session.rpc.extensions.sendAttachmentsToMessage({ instanceId, attachments: [ref] });
    } catch (err) {
        // Fall back to an extension_context pill if the host rejects github_reference.
        await session.rpc.extensions.sendAttachmentsToMessage({
            instanceId,
            attachments: [{ type: "extension_context", title: `${board.repo}#${issue.number}`, payload: { repo: board.repo, ...issue } }],
        });
    }
    return issue;
}

function broadcast(repo) {
    for (const entry of servers.values()) {
        if (entry.repo !== repo) continue;
        for (const res of entry.clients) res.write(`event: board\ndata: {}\n\n`);
    }
}

async function startServer(instanceId) {
    const html = await readFile(join(HERE, "ui.html"), "utf8");
    const entry = { server: null, url: "", repo: undefined, clients: new Set() };
    entry.server = createServer(async (req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");
        try {
            if (req.method === "GET" && url.pathname === "/") {
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                return res.end(html);
            }
            if (req.method === "GET" && url.pathname === "/api/board") {
                res.setHeader("Content-Type", "application/json");
                return res.end(JSON.stringify(await loadBoard(entry.repo)));
            }
            if (req.method === "GET" && url.pathname === "/events") {
                res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
                res.write(": connected\n\n");
                entry.clients.add(res);
                req.on("close", () => entry.clients.delete(res));
                return;
            }
            const m = url.pathname.match(/^\/api\/context\/(\d+)$/);
            if (req.method === "POST" && m) {
                const issue = await addToContext(instanceId, await loadBoard(entry.repo), Number(m[1]));
                res.setHeader("Content-Type", "application/json");
                return res.end(JSON.stringify({ ok: true, number: issue.number }));
            }
            res.statusCode = 404;
            res.end("Not found");
        } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
        }
    });
    await new Promise((resolve) => entry.server.listen(0, "127.0.0.1", resolve));
    entry.url = `http://127.0.0.1:${entry.server.address().port}/`;
    return entry;
}

session = await joinSession({
    canvases: [
        createCanvas({
            id: "triage-board",
            displayName: "Triage board",
            description: "Kanban-style issue triage board: top-3 attention lane with summaries and justifications, a backlog lane, and add-to-context buttons.",
            inputSchema: boardSchema,
            actions: [
                {
                    name: "set_board",
                    description: "Replace the board contents (top <=3 prioritized issues with summary + justification, rest in backlog).",
                    inputSchema: { ...boardSchema, required: ["repo", "top", "rest"] },
                    handler: async (ctx) => {
                        const saved = await saveBoard(ctx.input);
                        const entry = servers.get(ctx.instanceId);
                        if (entry) entry.repo = saved.repo;
                        broadcast(saved.repo);
                        return { ok: true, repo: saved.repo, top: saved.top.length, rest: saved.rest.length };
                    },
                },
                {
                    name: "add_to_context",
                    description: "Push an issue from the board into the current session's composer as an attachment.",
                    inputSchema: { type: "object", required: ["number"], properties: { number: { type: "integer" } } },
                    handler: async (ctx) => {
                        const entry = servers.get(ctx.instanceId);
                        const issue = await addToContext(ctx.instanceId, await loadBoard(entry?.repo), ctx.input.number);
                        return { ok: true, number: issue.number, title: issue.title };
                    },
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                const input = ctx.input ?? {};
                if (input.repo && (input.top || input.rest)) {
                    await saveBoard({ repo: input.repo, title: input.title, top: input.top ?? [], rest: input.rest ?? [] });
                    broadcast(input.repo);
                }
                const board = await loadBoard(input.repo ?? entry.repo);
                entry.repo = board?.repo ?? input.repo;
                return { title: entry.repo ? `Triage · ${entry.repo}` : "Triage board", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    for (const res of entry.clients) res.end();
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
