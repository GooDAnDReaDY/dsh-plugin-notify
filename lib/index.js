import { spawn } from 'node:child_process';
import Schema from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';

export const name = '@goodandready-private/dsh-plugin-notify';
/** Settings namespace shared with the Web settings card. */
export const NS = '@goodandready-private/dsh-plugin-notify';

// Session firehose + credentials (webhook URL refs) + settings scope for the card + webServer for SSE events.
export const inject = ['sessions', 'credentials', 'settings', 'webServer'];

const webhookRef = (label) => Schema.string()
    .role('credential-ref')
    .description(`${label}: DSH credential name whose value is the full webhook URL (not the URL itself). Empty disables the channel.`);

export const Config = Schema.object({
    webhooks: Schema.object({
        feishu: webhookRef('Feishu custom bot'),
        wecom: webhookRef('WeCom group bot'),
        dingtalk: webhookRef('DingTalk group bot'),
        slack: webhookRef('Slack Incoming Webhook'),
        discord: webhookRef('Discord webhook'),
        custom: webhookRef('Custom generic webhook (POST JSON)'),
    }).description('Per-channel credential refs for webhook URLs; leave empty to disable'),
    events: Schema.array(Schema.string())
        .description('Events that trigger notifications: task_done / error / approval_requested'),
    local: Schema.boolean().default(true).description('Also emit a local system notification (macOS osascript)'),
    enableSound: Schema.boolean().default(false).description('Play synthesized audio chime on completion, error, or approval'),
    enableToasts: Schema.boolean().default(false).description('Show in-app on-screen toast notifications across sessions'),
    enableDesktopNotifications: Schema.boolean().default(false).description('Show native desktop/OS push notifications (Windows, macOS, Linux)'),
    notifyBackgroundOnly: Schema.boolean().default(false).description('Notify only if the event occurred in a background/inactive session'),
    timeoutMs: Schema.number().default(5000).description('Per-webhook request timeout (ms)'),
    dnd: Schema.object({
        start: Schema.string().default('').description('Do-not-disturb start (HH:MM, empty disables)'),
        end: Schema.string().default('').description('Do-not-disturb end (HH:MM, cross-midnight ok)'),
    }).description('DND window: events are logged but no local/webhook emission'),
    includeSession: Schema.boolean().default(true).description('Include the session line in notification text'),
    includeDuration: Schema.boolean().default(true).description('Include the duration line in notification text'),
    excludeSessionPrefixes: Schema.array(Schema.string())
        .default([])
        .description('Skip notifications when session id starts with any prefix (e.g. msgw- for messenger-gateway)'),
});

function isExcludedSession(sessionId, prefixes) {
    const sid = String(sessionId);
    for (const p of prefixes ?? []) {
        if (typeof p === 'string' && p.length > 0 && sid.startsWith(p))
            return true;
    }
    return false;
}

const DEFAULT_EVENTS = ['task_done', 'error', 'approval_requested'];
/** Per-session last `turn/start` epoch ms, for turn-duration reporting. */
const turnStarts = new Map();
const warnedLegacyUrls = new Set();

/** Resolve a config value to a webhook URL: credential ref (preferred), env fallback, or legacy raw URL. */
export async function resolveWebhookValue(ctx, refOrUrl) {
    if (!refOrUrl || typeof refOrUrl !== 'string') return '';
    const v = refOrUrl.trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) {
        if (!warnedLegacyUrls.has(v)) {
            warnedLegacyUrls.add(v);
            ctx?.logger?.warn?.('[plugin-notify] raw webhook URL in Config is deprecated; store the URL in Credentials and put only the credential name in settings');
        }
        return v;
    }
    if (ctx?.credentials && typeof ctx.credentials.resolve === 'function') {
        try {
            const hit = await ctx.credentials.resolve(credentialRef(v));
            if (hit?.value) return String(hit.value);
        } catch (error) {
            ctx?.logger?.warn?.(`[plugin-notify] credential resolve skipped for ${v}: ${String(error)}`);
        }
    }
    return process.env[v] || '';
}

export async function resolveWebhooks(ctx, webhooks = {}) {
    const out = {};
    for (const [channel, ref] of Object.entries(webhooks || {})) {
        const url = await resolveWebhookValue(ctx, ref);
        if (url) out[channel] = url;
    }
    return out;
}

const sseClients = new Set();

function isLoopback(address) {
    if (!address) return false;
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === 'localhost';
}

/**
 * Fail-closed origin check for internal SSE events stream.
 * Accepts same-origin sec-fetch-site, matching origin and host, loopback remote address, or DSH auth.
 */
export function isTrustedRequest(request) {
    if (!request || !request.headers) return false;

    const authHeader = request.headers['authorization'] || request.headers['x-dsh-auth'];
    if (authHeader && authHeader.length > 5) return true;

    const remoteAddr = request.socket?.remoteAddress || request.connection?.remoteAddress;
    if (remoteAddr && isLoopback(remoteAddr)) return true;

    const secFetchSite = request.headers['sec-fetch-site'];
    if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
        return true;
    }

    const origin = request.headers['origin'];
    const host = request.headers['host'];
    if (origin && host) {
        try {
            const originHost = new URL(origin).host;
            if (originHost === host) return true;
        } catch { /* invalid origin URL */ }
    }

    return false;
}

export function broadcastSse(eventData) {
    if (sseClients.size === 0) return 0;
    const raw = `data: ${JSON.stringify(eventData)}\n\n`;
    let sent = 0;
    for (const res of sseClients) {
        try {
            res.write(raw);
            sent++;
        } catch {
            sseClients.delete(res);
        }
    }
    return sent;
}

export function handleSseConnection(req, res) {
    if (req.method !== 'GET') {
        if (typeof res.writeHead === 'function') res.writeHead(405, { 'Content-Type': 'text/plain' });
        if (typeof res.end === 'function') res.end('Method Not Allowed');
        return;
    }
    if (!isTrustedRequest(req)) {
        if (typeof res.writeHead === 'function') res.writeHead(403, { 'Content-Type': 'text/plain' });
        if (typeof res.end === 'function') res.end('Forbidden');
        return;
    }
    if (typeof res.writeHead === 'function') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        });
    }
    if (typeof res.write === 'function') {
        res.write(': connected\n\n');
    }
    sseClients.add(res);

    const onEnd = () => {
        sseClients.delete(res);
    };
    if (typeof req.on === 'function') req.on('close', onEnd);
    if (typeof res.on === 'function') {
        res.on('close', onEnd);
        res.on('error', onEnd);
    }
}

function mountWebServer(targetCtx) {
    if (!targetCtx?.webServer?.register) return;
    const routeDef = {
        kind: 'exact',
        path: '/dsh-plugin-notify/events',
        handler: (req, res) => handleSseConnection(req, res),
    };
    if (typeof targetCtx.effect === 'function') {
        targetCtx.effect(() => targetCtx.webServer.register(routeDef), 'dsh-plugin-notify: sse events');
    } else {
        targetCtx.webServer.register(routeDef);
    }
}

export function apply(ctx, config = {}) {
    let getConfig = () => config ?? {};

    let webServerMounted = false;
    const tryMountWebServer = (target) => {
        if (webServerMounted) return;
        if (target?.webServer?.register) {
            webServerMounted = true;
            mountWebServer(target);
        }
    };

    if (typeof ctx.inject === 'function') {
        ctx.inject(['settings'], (sctx) => {
            const scope = sctx.settings.register(NS, Config, { base: config ?? {} });
            getConfig = () => scope.get() ?? config ?? {};
        });
        ctx.inject(['webServer'], (wctx) => tryMountWebServer(wctx));
    }
    if (ctx.webServer) {
        tryMountWebServer(ctx);
    }

    const dispatch = (n) => {
        const cfg = getConfig();
        const dnd = cfg.dnd;
        if (inDnd(dnd)) {
            (ctx?.logger?.debug ?? ctx?.logger?.info)?.(`[plugin-notify] ${n.kind} · ${n.title} · session ${n.sessionId} · DND (${dnd?.start}-${dnd?.end}), logged only`);
            return;
        }
        const timeoutMs = cfg.timeoutMs ?? 5000;
        const local = cfg.local ?? true;
        const includeSession = cfg.includeSession ?? true;
        const includeDuration = cfg.includeDuration ?? true;

        // Broadcast to connected web/desktop clients via SSE
        broadcastSse({
            kind: n.kind,
            title: n.title,
            sessionId: n.sessionId,
            summary: n.summary,
            reason: n.reason,
            durationMs: n.durationMs,
            timestamp: Date.now(),
        });

        // Resolve credential refs then fire-and-forget posts; never block the agent loop.
        Promise.resolve()
            .then(() => resolveWebhooks(ctx, cfg.webhooks ?? {}))
            .then((urls) => send(ctx, n, urls, timeoutMs, local, includeSession, includeDuration))
            .catch((error) => {
                ctx?.logger?.warn?.(`[plugin-notify] webhook resolve/send failed: ${String(error)}`);
            });
    };

    ctx.on('session/event', (session, event) => {
        const cfg = getConfig();
        const events = new Set(normalizeEvents(cfg.events));
        const excludeSessionPrefixes = cfg.excludeSessionPrefixes ?? [];

        if (event.type === 'turn/start') {
            turnStarts.set(String(session.id), Date.now());
            return;
        }
        if (event.type === 'turn/end') {
            if (isExcludedSession(session.id, excludeSessionPrefixes))
                return;
            const reason = event.data.reason;
            const kind = reason.kind === 'completed' ? 'task_done' : 'error';
            if (!events.has(kind))
                return;
            const started = turnStarts.get(String(session.id));
            turnStarts.delete(String(session.id));
            dispatch({
                kind,
                title: sessionTitle(session),
                sessionId: String(session.id),
                summary: summarizeTurn(session, event.data.turn),
                reason: reasonLabel(reason),
                durationMs: started === undefined ? undefined : Date.now() - started,
            });
            return;
        }
        if (event.type === 'approval/asked') {
            if (isExcludedSession(session.id, excludeSessionPrefixes))
                return;
            if (!events.has('approval_requested'))
                return;
            const data = event.data;
            dispatch({
                kind: 'approval_requested',
                title: sessionTitle(session),
                sessionId: String(session.id),
                summary: `Waiting for approval: tool ${data.toolName}${data.reason ? ` (${data.reason})` : ''}`,
            });
        }
    });
}

function normalizeEvents(configured) {
    if (!configured || configured.length === 0)
        return [...DEFAULT_EVENTS];
    const known = ['task_done', 'error', 'approval_requested'];
    return known.filter(kind => configured.includes(kind));
}

function send(ctx, n, webhooks, timeoutMs, local, includeSession, includeDuration) {
    const text = renderText(n, includeSession, includeDuration);
    const signal = AbortSignal.timeout(timeoutMs);
    const channels = Object.keys(webhooks);
    (ctx?.logger?.debug ?? ctx?.logger?.info)?.(`[plugin-notify] ${n.kind} · ${n.title} · session ${n.sessionId} · channels ${channels.join(',') || 'none'} · local ${local}`);
    const post = (url, body) => {
        fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        }).catch(error => {
            ctx?.logger?.warn?.(`[plugin-notify] webhook POST failed (${String(url).slice(0, 64)}…): ${String(error)}`);
        });
    };
    if (webhooks.feishu)
        post(webhooks.feishu, { msg_type: 'text', content: { text } });
    if (webhooks.wecom)
        post(webhooks.wecom, { msgtype: 'text', text: { content: text } });
    if (webhooks.dingtalk)
        post(webhooks.dingtalk, { msgtype: 'text', text: { content: text } });
    if (webhooks.slack)
        post(webhooks.slack, { text });
    if (webhooks.discord)
        post(webhooks.discord, { content: text });
    if (webhooks.custom) {
        post(webhooks.custom, {
            text,
            kind: n.kind,
            title: n.title,
            sessionId: n.sessionId,
            durationMs: n.durationMs,
            time: new Date().toISOString(),
        });
    }
    if (local)
        notifyLocal(n.kind === 'task_done' ? '✅ Task done' : n.kind === 'error' ? '⚠️ Error' : '⏸️ Approval needed', text);
}

function renderText(n, includeSession, includeDuration) {
    const kindLabel = n.kind === 'task_done' ? 'Task done' : n.kind === 'error' ? 'Error' : 'Approval needed';
    const lines = [`【${kindLabel}】${n.title}`];
    if (n.summary)
        lines.push(`Summary: ${n.summary}`);
    if (n.reason)
        lines.push(`Reason: ${n.reason}`);
    if (includeDuration && n.durationMs !== undefined)
        lines.push(`Duration: ${formatDuration(n.durationMs)}`);
    if (includeSession)
        lines.push(`Session: ${n.sessionId}`);
    return lines.join('\n');
}

function parseHM(v) {
    if (!v)
        return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m)
        return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59)
        return null;
    return h * 60 + mi;
}

function inDnd(dnd, now = new Date()) {
    const s = parseHM(dnd?.start);
    const e = parseHM(dnd?.end);
    if (s === null || e === null || s === e)
        return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

function formatDuration(ms) {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function reasonLabel(reason) {
    switch (reason.kind) {
        case 'completed': return 'completed';
        case 'error': return 'error';
        case 'aborted': return 'aborted';
        case 'blocked': return 'blocked';
        case 'max-tokens': return 'max-tokens';
        case 'interrupted': return 'interrupted';
        default: return reason.kind;
    }
}

function textOf(content) {
    let out = '';
    for (const block of content) {
        if (typeof block === 'object' && block !== null && block.type === 'text') {
            const text = block.text;
            if (typeof text === 'string')
                out += text;
        }
    }
    return out;
}

function sessionTitle(session) {
    for (const event of session.events) {
        if (event.type === 'user/message') {
            const text = textOf(event.data.content).replace(/\s+/g, ' ').trim();
            if (text)
                return text.length > 60 ? `${text.slice(0, 60)}…` : text;
        }
    }
    return String(session.id);
}

function summarizeTurn(session, turn) {
    let toolCalls = 0;
    let lastText = '';
    for (const event of session.events) {
        if (event.type === 'tool/call' && event.data.turn === turn)
            toolCalls += 1;
        if (event.type === 'assistant/message' && event.data.turn === turn) {
            const text = textOf(event.data.message.content);
            if (text)
                lastText = text;
        }
    }
    const parts = [];
    if (lastText) {
        const trimmed = lastText.replace(/\s+/g, ' ').trim();
        parts.push(trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed);
    }
    if (toolCalls > 0)
        parts.push(`called ${toolCalls} tools`);
    return parts.join('; ') || '(no text output)';
}

function notifyLocal(title, text) {
    if (process.platform !== 'darwin')
        return;
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const script = `display notification "${esc(text)}" with title "${esc(title)}"`;
    spawn('osascript', ['-e', script], { stdio: 'ignore' })
        .on('error', () => { })
        .unref();
}
