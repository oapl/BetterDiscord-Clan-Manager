/**
 * @name c0ld server leaderboard
 * @author oapl
 * @description i hate my life
 * @version 0.5.0
 */

const PLUGIN_NAME = "RobloxShareLeaderboard";
const SETTINGS_KEY = "settings";
const STATE_KEY = "webhookState";
const DISCORD_EPOCH = 1420070400000n;

const DEFAULT_SETTINGS = {
    webhookUrl: "",
    webhookMessageId: "",
    threadId: "",

    serverLogsChannelId: "1489879731569426485",
    eggChatChannelId: "1515759898565148884",
    sapphireBotUserId: "1489881332241666139",

    startLocal: "2026-06-13T10:00",
    endLocal: "2026-06-19T10:00",

    autoUpdate: true,
    intervalMinutes: 15,
    maxPages: 2000,
    pageLimit: 100,
    logScanGraceDays: 30,
    contentLimit: 1950,

    serverLogsUseHttpFirst: true,
    showDiagnostics: true,
    showAuditSamples: false,
    auditAuthorQuery: "souli",
    auditSampleLimit: 12,

    inspectLogId: ""
};

const ANY_LINK_RE = /(?:https?:\/\/|www\.)[^\s<>()]+|(?:discord\.gg|discord\.com\/invite|roblox\.com|youtu\.be|youtube\.com|tiktok\.com|x\.com|twitter\.com|clips\.twitch\.tv|twitch\.tv|cdn\.discordapp\.com|media\.discordapp\.net)\/[^\s<>()]+/i;
const VIDEO_FILE_RE = /\b[^\s<>|`"']+\.(?:mp4|mov|webm|mkv|avi|wmv|m4v|flv|mpeg|mpg)(?:\?[^\s<>)]*)?\b/i;

function clean(value) {
    return String(value || "")
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n?/g, "\n");
}

function normalize(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function copySettings(settings) {
    return Object.assign({}, DEFAULT_SETTINGS, settings || {});
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);

    return element;
}

function snowflakeToTimestamp(id) {
    try {
        return id ? Number((BigInt(String(id)) >> 22n) + DISCORD_EPOCH) : 0;
    }
    catch (_) {
        return 0;
    }
}

function timestampToSnowflake(ms) {
    try {
        return String((BigInt(Math.max(0, Number(ms) || 0)) - DISCORD_EPOCH) << 22n);
    }
    catch (_) {
        return "";
    }
}

function timestampFromMessage(message) {
    const timestamp = message?.timestamp || message?.editedTimestamp || message?.edited_timestamp;

    if (timestamp instanceof Date) return timestamp.getTime();
    if (typeof timestamp === "number") return timestamp;

    const parsed = timestamp ? Date.parse(String(timestamp)) : NaN;
    return Number.isFinite(parsed) ? parsed : snowflakeToTimestamp(message?.id);
}

function formatDuration(ms) {
    const minutes = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    const parts = [];

    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (mins || !parts.length) parts.push(`${mins}m`);

    return parts.join(" ");
}

function deepText(value, seen = new Set(), depth = 0) {
    if (value === undefined || value === null || depth > 8) return "";

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (typeof value === "function" || typeof value !== "object") return "";

    if (seen.has(value)) return "";
    seen.add(value);

    if (Array.isArray(value)) {
        return value.map(item => deepText(item, seen, depth + 1)).filter(Boolean).join("\n");
    }

    if (value instanceof Map || value instanceof Set) {
        return Array.from(value.values()).map(item => deepText(item, seen, depth + 1)).filter(Boolean).join("\n");
    }

    try {
        if (typeof value.toArray === "function") {
            const text = deepText(value.toArray(), seen, depth + 1);
            if (text) return text;
        }
    }
    catch (_) {}

    try {
        if (typeof value.toJS === "function") {
            const text = deepText(value.toJS(), seen, depth + 1);
            if (text) return text;
        }
    }
    catch (_) {}

    try {
        if (typeof value.toJSON === "function") {
            const text = deepText(value.toJSON(), seen, depth + 1);
            if (text) return text;
        }
    }
    catch (_) {}

    const parts = [];

    for (const key of [
        "content", "text", "name", "value", "label", "title", "description",
        "children", "child", "props", "message", "channel", "channel_id", "channelId", "id",
        "username", "globalName", "global_name", "displayName", "display_name",
        "filename", "fileName", "url", "rawUrl", "proxyUrl", "proxy_url", "href",
        "fields", "embeds", "attachments"
    ]) {
        try {
            if (value[key] !== undefined) {
                const text = deepText(value[key], seen, depth + 1);
                if (text) parts.push(text);
            }
        }
        catch (_) {}

        try {
            if (typeof value.get === "function") {
                const got = value.get(key);

                if (got !== undefined) {
                    const text = deepText(got, seen, depth + 1);
                    if (text) parts.push(text);
                }
            }
        }
        catch (_) {}
    }

    try {
        for (const key of Reflect.ownKeys(value)) {
            let item;

            try {
                item = value[key];
            }
            catch (_) {
                continue;
            }

            const text = deepText(item, seen, depth + 1);
            if (text) parts.push(text);
        }
    }
    catch (_) {}

    return Array.from(new Set(parts.filter(Boolean))).join("\n");
}

function toMessageArray(value, output = [], seen = new Set(), depth = 0) {
    if (!value || output.length > 5000 || depth > 8) return output;

    if (Array.isArray(value)) {
        for (const item of value) toMessageArray(item, output, seen, depth + 1);
        return output;
    }

    if (value instanceof Map || value instanceof Set) {
        value.forEach(item => toMessageArray(item, output, seen, depth + 1));
        return output;
    }

    if (typeof value !== "object" || seen.has(value)) return output;
    seen.add(value);

    try {
        if (typeof value.toArray === "function") toMessageArray(value.toArray(), output, seen, depth + 1);
    }
    catch (_) {}

    try {
        if (typeof value.toJS === "function") toMessageArray(value.toJS(), output, seen, depth + 1);
    }
    catch (_) {}

    try {
        if (typeof value.toJSON === "function") toMessageArray(value.toJSON(), output, seen, depth + 1);
    }
    catch (_) {}

    if (value.id && (value.content !== undefined || value.embeds !== undefined || value.timestamp !== undefined)) {
        output.push(value);
        return output;
    }

    for (const key of ["body", "data", "messages", "items", "results", "records", "_array", "array", "_map", "map", "cache"]) {
        if (value[key]) toMessageArray(value[key], output, seen, depth + 1);
    }

    return output;
}

function collectSnowflakeIds(value, output = new Set(), seen = new Set(), depth = 0) {
    if (!value || output.size > 5000 || depth > 8) return output;

    if (typeof value === "string") {
        if (/^\d{14,24}$/.test(value)) output.add(value);
        return output;
    }

    if (Array.isArray(value)) {
        value.forEach(item => collectSnowflakeIds(item, output, seen, depth + 1));
        return output;
    }

    if (value instanceof Map || value instanceof Set) {
        value.forEach(item => collectSnowflakeIds(item, output, seen, depth + 1));
        return output;
    }

    if (typeof value !== "object" || seen.has(value)) return output;
    seen.add(value);

    try {
        if (typeof value.toArray === "function") collectSnowflakeIds(value.toArray(), output, seen, depth + 1);
    }
    catch (_) {}

    try {
        if (typeof value.toJS === "function") collectSnowflakeIds(value.toJS(), output, seen, depth + 1);
    }
    catch (_) {}

    try {
        if (typeof value.toJSON === "function") collectSnowflakeIds(value.toJSON(), output, seen, depth + 1);
    }
    catch (_) {}

    for (const key of ["id", "messageId", "message_id"]) {
        if (/^\d{14,24}$/.test(String(value[key] || ""))) output.add(String(value[key]));
    }

    for (const key of ["_array", "array", "messages", "items", "records", "_map", "map", "cache"]) {
        if (value[key]) collectSnowflakeIds(value[key], output, seen, depth + 1);
    }

    return output;
}

module.exports = class RobloxShareLeaderboard {
    constructor() {
        this.settings = copySettings();
        this.intervalTimer = null;
        this.startupTimer = null;
        this.running = false;
        this.modules = {};
    }

    start() {
        this.settings = copySettings(BdApi.Data.load(PLUGIN_NAME, SETTINGS_KEY));
        this.resolveModules();
        this.restartTimer();
        BdApi.UI?.showToast?.(`${PLUGIN_NAME} loaded`, {type: "info"});
    }

    stop() {
        this.stopTimer();
    }

    resolveModules() {
        const wp = BdApi?.Webpack;
        const byKeys = wp?.Filters?.byKeys;

        this.modules.MessageActions = wp?.getModule?.(byKeys?.("fetchMessages", "sendMessage"), {searchExports: true})
            || wp?.getModule?.(byKeys?.("fetchMessages"), {searchExports: true})
            || wp?.getModule?.(byKeys?.("loadMessages"), {searchExports: true})
            || wp?.getByKeys?.("fetchMessages", "sendMessage")
            || wp?.getByKeys?.("fetchMessages")
            || wp?.getByKeys?.("loadMessages")
            || null;

        this.modules.MessageStore = wp?.getStore?.("MessageStore")
            || wp?.Stores?.MessageStore
            || wp?.getByKeys?.("getMessages", "getMessage")
            || wp?.getByKeys?.("getMessages")
            || null;

        this.modules.HTTP = wp?.getModule?.(m =>
            m
            && typeof m.get === "function"
            && typeof m.post === "function"
            && (typeof m.del === "function" || typeof m.delete === "function"),
            {searchExports: true}
        )
            || wp?.getByKeys?.("get", "post", "put", "del")
            || wp?.getByKeys?.("get", "post", "put", "delete")
            || null;
    }

    getSettingsPanel() {
        const root = createElement("div");
        root.style.cssText = "display:flex;flex-direction:column;gap:10px;padding:12px;max-width:760px";

        root.append(createElement("div", null, "Counts live egg-chat posts and Sapphire deleted egg-chat logs. Server logs use HTTP-first pagination for stable raw embed fields."));

        const fields = [
            ["webhookUrl", "Discord webhook URL", "password"],
            ["webhookMessageId", "Initialized webhook message ID", "text"],
            ["threadId", "Webhook thread ID (blank unless posting into a thread)", "text"],
            ["serverLogsChannelId", "Server logs channel ID", "text"],
            ["eggChatChannelId", "Egg chat channel ID", "text"],
            ["sapphireBotUserId", "Sapphire bot user ID", "text"],
            ["startLocal", "Event start", "datetime-local"],
            ["endLocal", "Event end", "datetime-local"],
            ["auditAuthorQuery", "Audit author query", "text"],
            ["auditSampleLimit", "Audit sample limit", "number"],
            ["intervalMinutes", "Interval minutes", "number"],
            ["maxPages", "Max pages", "number"],
            ["logScanGraceDays", "Deleted-log grace days", "number"],
            ["contentLimit", "Webhook content limit", "number"],
            ["inspectLogId", "Inspect Sapphire log ID", "text"]
        ];

        for (const [key, label, type] of fields) root.append(this.createInput(key, label, type));

        root.append(
            this.createCheckbox("autoUpdate", "Auto-update webhook", () => this.restartTimer()),
            this.createCheckbox("serverLogsUseHttpFirst", "Use HTTP-first scan for server logs", () => this.saveSettings()),
            this.createCheckbox("showDiagnostics", "Show scan diagnostics in webhook", () => this.saveSettings()),
            this.createCheckbox("showAuditSamples", "Show audit samples in webhook", () => this.saveSettings())
        );

        const buttons = createElement("div");
        buttons.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";

        const test = createElement("button", null, "Test webhook only");
        test.type = "button";
        test.addEventListener("click", () => this.testWebhookOnly());

        const run = createElement("button", null, "Run REAL scan + update webhook now");
        run.type = "button";
        run.addEventListener("click", () => this.runManual());

        const loader = createElement("button", null, "Test scan loader");
        loader.type = "button";
        loader.addEventListener("click", () => this.testScanLoader());

        const inspect = createElement("button", null, "Inspect Sapphire log ID");
        inspect.type = "button";
        inspect.addEventListener("click", () => this.inspectLogId());

        const forget = createElement("button", null, "Forget stored message ID");
        forget.type = "button";
        forget.addEventListener("click", () => {
            BdApi.Data.save(PLUGIN_NAME, STATE_KEY, {});
            this.settings.webhookMessageId = "";
            this.saveSettings();
            BdApi.UI?.showToast?.("Stored webhook message ID cleared", {type: "success"});
        });

        buttons.append(test, run, loader, inspect, forget);
        root.append(buttons);

        return root;
    }

    createCheckbox(key, label, afterChange) {
        const wrap = createElement("label");
        wrap.style.cssText = "display:flex;gap:8px;align-items:center";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(this.settings[key]);

        checkbox.addEventListener("change", () => {
            this.settings[key] = checkbox.checked;
            this.saveSettings();
            afterChange?.();
        });

        wrap.append(checkbox, createElement("span", null, label));
        return wrap;
    }

    createInput(key, label, type) {
        const wrap = createElement("label");
        wrap.style.cssText = "display:grid;gap:4px";

        const input = document.createElement("input");
        input.type = type;
        input.value = this.settings[key] ?? "";
        input.style.cssText = "padding:8px;border-radius:6px;border:1px solid var(--background-modifier-accent);background:var(--input-background);color:var(--text-normal)";

        input.addEventListener("change", () => {
            const numeric = ["intervalMinutes", "maxPages", "logScanGraceDays", "auditSampleLimit", "contentLimit"].includes(key);
            this.settings[key] = numeric ? Math.max(1, Number(input.value) || DEFAULT_SETTINGS[key]) : input.value.trim();
            input.value = String(this.settings[key]);
            this.saveSettings();
            this.restartTimer();
        });

        wrap.append(createElement("b", null, label), input);
        return wrap;
    }

    saveSettings() {
        BdApi.Data.save(PLUGIN_NAME, SETTINGS_KEY, this.settings);
    }

    stopTimer() {
        clearInterval(this.intervalTimer);
        clearTimeout(this.startupTimer);
        this.intervalTimer = null;
        this.startupTimer = null;
    }

    restartTimer() {
        this.stopTimer();

        if (!this.settings.autoUpdate) return;

        this.startupTimer = setTimeout(() => this.runScheduled("startup"), 30000);
        this.intervalTimer = setInterval(() => this.runScheduled("interval"), Math.max(1, Number(this.settings.intervalMinutes) || 15) * 60000);
    }

    testScanLoader() {
        this.resolveModules();

        const ok = Boolean(this.modules.MessageActions && this.modules.MessageStore);
        const http = Boolean(this.modules.HTTP);

        BdApi.UI?.showToast?.(
            ok ? `Scan loader OK. HTTP: ${http}` : `Scan loader weak: actions=${Boolean(this.modules.MessageActions)} store=${Boolean(this.modules.MessageStore)} http=${http}`,
            {type: ok ? "success" : "error", timeout: 8000}
        );
    }

    async testWebhookOnly() {
        try {
            await this.webhookRequest(this.getWebhookCreateUrl(), "POST", {
                content: `**${PLUGIN_NAME} webhook-only test**`,
                allowed_mentions: {parse: []}
            });

            BdApi.UI?.showToast?.("Webhook-only test sent", {type: "success"});
        }
        catch (error) {
            console.error(error);
            BdApi.UI?.showToast?.(`Webhook test failed: ${error?.message || error}`, {type: "error", timeout: 8000});
        }
    }

    async inspectLogId() {
        const messageId = String(this.settings.inspectLogId || "").trim();

        if (!/^\d{14,24}$/.test(messageId)) {
            BdApi.UI?.showToast?.("Enter a valid Sapphire log message ID first.", {type: "error", timeout: 6000});
            return;
        }

        try {
            BdApi.UI?.showToast?.("Inspecting Sapphire log...", {type: "info"});

            const message = await this.fetchSingleMessageHttp(this.settings.serverLogsChannelId, messageId)
                || this.getMessageFromStore(this.settings.serverLogsChannelId, messageId);

            if (!message) throw new Error("Could not fetch or find that message.");

            const {startMs, endMs} = this.getWindow();
            const logTimestamp = timestampFromMessage(message);
            const result = this.evaluateDeletedLog(message, logTimestamp, startMs, endMs);
            const text = this.flattenMessage(message);
            const channelValues = this.getLogFieldValues(message, "Channel", text);
            const messageBlock = this.getOriginalDeletedMessageBlock(message, text);
            const attachmentBlock = this.extractDeletedAttachmentBlock(text);
            const eligibility = this.getDeletedLogEligibility(message, text);

            const report = [
                `**Sapphire log inspect**`,
                `Message ID: ${messageId}`,
                `Result: ${result.match ? "COUNTED" : `REJECTED ${result.reject || "unknown"}`}`,
                `Egg detected: ${this.hasEggChatReference(text, channelValues)}`,
                `Eligibility: ${eligibility.reason} ${eligibility.evidence || ""}`,
                `Source message ID: ${this.extractSourceMessageId(message, text) || "(none)"}`,
                `Channel values: ${this.truncateCell(channelValues.join(" | ") || "(none)", 400)}`,
                `Message block: ${this.truncateCell(messageBlock || "(none)", 500)}`,
                `Attachment block: ${this.truncateCell(attachmentBlock || "(none)", 500)}`,
                "",
                "```text",
                this.truncateCell(text, 900),
                "```"
            ].join("\n");

            await this.webhookRequest(this.getWebhookCreateUrl(), "POST", {
                content: report.slice(0, 1950),
                allowed_mentions: {parse: []}
            });

            BdApi.UI?.showToast?.("Inspection posted to webhook.", {type: "success"});
        }
        catch (error) {
            console.error(error);
            BdApi.UI?.showToast?.(`Inspect failed: ${error?.message || error}`, {type: "error", timeout: 10000});
        }
    }

    async runManual() {
        try {
            BdApi.UI?.showToast?.("Running REAL scan now...", {type: "info"});
            const result = await this.runScheduled("manual");

            if (result) BdApi.UI?.showToast?.(`Real scan updated: ${result.totalMatches} posts, ${result.summary.length} members`, {type: "success"});
        }
        catch (error) {
            console.error(error);
            BdApi.UI?.showToast?.(`Real scan failed: ${error?.message || error}`, {type: "error", timeout: 10000});
        }
    }

    async runScheduled(reason) {
        if (this.running) return null;
        this.running = true;

        try {
            const result = await this.scan();
            BdApi.Data.save(PLUGIN_NAME, "lastScan", result);
            await this.updateWebhook(result);
            return result;
        }
        catch (error) {
            this.saveState(Object.assign({}, this.loadState(), {
                lastError: error?.message || String(error),
                lastErrorAt: new Date().toISOString(),
                reason
            }));

            if (reason === "manual") throw error;

            console.error(`${PLUGIN_NAME} update failed`, error);
            return null;
        }
        finally {
            this.running = false;
        }
    }

    getWindow() {
        const startMs = Date.parse(this.settings.startLocal);
        const endMs = Date.parse(this.settings.endLocal);

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
            throw new Error("Invalid event date window");
        }

        return {startMs, endMs};
    }

    async scan() {
        const {startMs, endMs} = this.getWindow();
        const now = Date.now();
        const activeUntil = Math.min(now, endMs);
        const logEnd = Math.min(now, endMs + Math.max(0, Number(this.settings.logScanGraceDays) || 0) * 86400000);

        const diagnostics = {
            livePages: 0,
            liveMessages: 0,
            liveEligible: 0,
            logPages: 0,
            logMessages: 0,
            logEligible: 0,
            serverLogHttpPages: 0,
            serverLogActionPages: 0,
            rejected: {},
            actionAttempts: [],
            audit: this.createAuditState()
        };

        const liveMatches = await this.scanLive(startMs, activeUntil, diagnostics);
        const deletedMatches = await this.scanLogs(startMs, logEnd, startMs, endMs, diagnostics);
        const evidenceMatches = this.dedupeEvidence(deletedMatches, liveMatches);
        const summary = this.summarize(evidenceMatches);

        diagnostics.audit = this.finalizeAudit(diagnostics.audit, evidenceMatches, summary);

        return {
            generatedAt: new Date().toISOString(),
            start: new Date(startMs).toISOString(),
            end: new Date(endMs).toISOString(),
            totalMatches: evidenceMatches.length,
            summary,
            diagnostics,
            audit: diagnostics.audit,
            evidenceMatches,
            deletedMatches,
            liveMatches
        };
    }

    async scanLive(startMs, endMs, diagnostics) {
        const matches = [];
        let before = timestampToSnowflake(endMs + 1);
        let reachedStart = false;

        for (let page = 0; page < Number(this.settings.maxPages) && !reachedStart; page += 1) {
            const messages = await this.fetchMessagePageActionsFirst(this.settings.eggChatChannelId, before, diagnostics, "live");

            diagnostics.livePages += 1;
            diagnostics.liveMessages += messages.length;

            if (!messages.length) break;

            for (const message of messages) {
                const timestamp = timestampFromMessage(message);

                if (timestamp && timestamp < startMs) {
                    reachedStart = true;
                    continue;
                }

                if (!timestamp || timestamp > endMs || timestamp < startMs) continue;

                const result = this.evaluateLiveMessage(message, timestamp, endMs);
                this.auditLive(message, timestamp, result.match, diagnostics.audit);

                if (result.match) {
                    matches.push(result.match);
                    diagnostics.liveEligible += 1;
                }
            }

            before = messages[messages.length - 1]?.id || "";

            if (!before) break;
            if (!reachedStart) await wait(175);
        }

        return matches;
    }

    async scanLogs(scanStartMs, scanEndMs, eventStartMs, eventEndMs, diagnostics) {
        const matches = [];
        let before = timestampToSnowflake(scanEndMs + 1);
        let reachedStart = false;

        for (let page = 0; page < Number(this.settings.maxPages) && !reachedStart; page += 1) {
            const messages = await this.fetchServerLogPage(before, diagnostics);

            diagnostics.logPages += 1;
            diagnostics.logMessages += messages.length;

            if (!messages.length) break;

            for (const message of messages) {
                const logTimestamp = timestampFromMessage(message);

                if (logTimestamp && logTimestamp < scanStartMs) {
                    reachedStart = true;
                    continue;
                }

                if (!logTimestamp || logTimestamp > scanEndMs || logTimestamp < scanStartMs) continue;

                const result = this.evaluateDeletedLog(message, logTimestamp, eventStartMs, eventEndMs);
                this.auditLog(message, logTimestamp, eventStartMs, eventEndMs, result, diagnostics.audit);

                if (result.match) {
                    matches.push(result.match);
                    diagnostics.logEligible += 1;
                }
                else if (result.reject) {
                    this.reject(diagnostics, result.reject);
                }
            }

            before = messages[messages.length - 1]?.id || "";

            if (!before) break;
            if (!reachedStart) await wait(250);
        }

        return matches;
    }

    async fetchServerLogPage(before, diagnostics) {
        const detail = {source: "logs", channelId: this.settings.serverLogsChannelId, before, attempts: []};
        let messages = [];

        if (this.settings.serverLogsUseHttpFirst) {
            messages = await this.fetchMessagesWithHttp(this.settings.serverLogsChannelId, before, detail);

            if (messages.length) diagnostics.serverLogHttpPages += 1;
        }

        if (!messages.length) {
            messages = await this.fetchMessagesWithDiscordActions(this.settings.serverLogsChannelId, before, detail);

            if (messages.length) diagnostics.serverLogActionPages += 1;
        }

        diagnostics.actionAttempts.push(detail);
        return messages;
    }

    evaluateLiveMessage(message, timestamp, activeUntil) {
        const text = this.flattenMessage(message);
        const eligibility = this.getEligibilityFromTextAndAttachments(message, text);

        if (!eligibility.eligible) return {reject: "no_link_or_video"};

        const author = this.getLiveAuthorContext(message);
        const guildId = this.getGuildId() || "@me";
        const activeMs = Math.max(0, activeUntil - timestamp);

        return {
            match: {
                source: "egg-chat-live",
                author: author.line || "Unknown author",
                authorKey: author.key || this.normalizeAuthorKey(author.line),
                liveMessageId: message.id,
                eventId: message.id,
                timestamp: new Date(timestamp).toISOString(),
                activeMs,
                activeDuration: formatDuration(activeMs),
                messageUrl: `https://discord.com/channels/${guildId}/${this.settings.eggChatChannelId}/${message.id}`,
                reason: eligibility.reason,
                evidence: eligibility.evidence
            }
        };
    }

    evaluateDeletedLog(message, logTimestamp, eventStartMs, eventEndMs) {
        const text = this.flattenMessage(message);

        if (this.getMessageAuthorId(message) !== String(this.settings.sapphireBotUserId)) {
            return {reject: "not_sapphire", text};
        }

        if (!/message\s+deleted/i.test(text)) {
            return {reject: "not_deletedlog", text};
        }

        const sourceMessageId = this.extractSourceMessageId(message, text);
        const sourceTimestamp = sourceMessageId ? snowflakeToTimestamp(sourceMessageId) : logTimestamp;

        if (!sourceTimestamp || sourceTimestamp < eventStartMs || sourceTimestamp > eventEndMs) {
            return {reject: "outside_window", text, sourceMessageId};
        }

        const channelValues = this.getLogFieldValues(message, "Channel", text);
        const egg = this.hasEggChatReference(text, channelValues);

        if (!egg) {
            return {reject: "not_egg_chat", text, sourceMessageId, channelValues};
        }

        const eligibility = this.getDeletedLogEligibility(message, text);

        if (!eligibility.eligible) {
            return {reject: "no_link_or_video", text, sourceMessageId};
        }

        const author = this.getFirstLogFieldValue(message, ["Message author", "Message Author", "Author", "User"], text)
            || this.extractMentionPair(text)
            || "Unknown author";

        const guildId = this.getGuildId() || "@me";

        return {
            match: {
                source: "server-log",
                author,
                authorKey: this.normalizeAuthorKey(author),
                sourceMessageId,
                logMessageId: message.id,
                eventId: message.id,
                timestamp: new Date(sourceTimestamp).toISOString(),
                deletedLogTimestamp: new Date(logTimestamp).toISOString(),
                messageUrl: `https://discord.com/channels/${guildId}/${this.settings.serverLogsChannelId}/${message.id}`,
                reason: eligibility.reason,
                evidence: eligibility.evidence
            },
            text
        };
    }

    async fetchMessagePageActionsFirst(channelId, before, diagnostics, source) {
        const detail = {source, channelId, before, attempts: []};
        let messages = await this.fetchMessagesWithDiscordActions(channelId, before, detail);

        if (!messages.length) {
            messages = await this.fetchMessagesWithHttp(channelId, before, detail);
        }

        diagnostics.actionAttempts.push(detail);
        return messages;
    }

    async fetchMessagesWithDiscordActions(channelId, before, detail = {}) {
        this.resolveModules();

        const actions = this.modules.MessageActions;

        if (!actions) {
            this.recordActionAttempt(detail, "message actions unavailable", 0, null);
            return this.getCachedMessagesForChannel(channelId, before);
        }

        const limit = Math.max(1, Math.min(100, Number(this.settings.pageLimit) || 100));
        const methods = ["fetchMessages", "loadMessages"].filter(method => typeof actions[method] === "function");
        const attempts = [];

        for (const method of methods) {
            attempts.push([`${method} object`, () => actions[method]({channelId, before, limit})]);
            attempts.push([`${method} object guild`, () => actions[method]({channelId, guildId: this.getGuildId(), before, limit})]);
            attempts.push([`${method} args`, () => actions[method](channelId, {before, limit})]);
            attempts.push([`${method} args bool`, () => actions[method](channelId, before, limit)]);
        }

        for (const [name, attempt] of attempts) {
            try {
                const result = await attempt();
                await wait(450);

                const messages = this.extractActionMessages(result, channelId, before);
                this.recordActionAttempt(detail, name, messages.length, result);

                if (messages.length) return messages;
            }
            catch (error) {
                this.recordActionAttempt(detail, name, 0, null, error);
            }
        }

        const cached = this.getCachedMessagesForChannel(channelId, before);
        this.recordActionAttempt(detail, "message cache final", cached.length, null);

        return cached;
    }

    async fetchMessagesWithHttp(channelId, before, detail = {}) {
        this.resolveModules();

        const http = this.modules.HTTP;

        if (!http?.get) {
            this.recordActionAttempt(detail, "http unavailable", 0, null);
            return [];
        }

        const limit = Math.max(1, Math.min(100, Number(this.settings.pageLimit) || 100));
        const url = `/channels/${channelId}/messages`;

        const queryObject = {limit};
        if (before) queryObject.before = before;

        const queryString = new URLSearchParams(queryObject).toString();

        const attempts = [
            ["http get object", () => http.get({url, query: queryObject})],
            ["http get string", () => http.get(`${url}?${queryString}`)]
        ];

        for (const [name, attempt] of attempts) {
            try {
                const result = await attempt();
                await wait(200);

                const messages = this.extractDiscordMessages(result);
                const filtered = this.filterMessagePage(messages, before);

                this.recordActionAttempt(detail, name, filtered.length, result);

                if (filtered.length) return filtered;
            }
            catch (error) {
                this.recordActionAttempt(detail, name, 0, null, error);
            }
        }

        return [];
    }

    async fetchSingleMessageHttp(channelId, messageId) {
        this.resolveModules();

        const http = this.modules.HTTP;
        if (!http?.get) return null;

        const url = `/channels/${channelId}/messages`;
        const attempts = [
            () => http.get({url, query: {around: messageId, limit: 3}}),
            () => http.get(`${url}?around=${encodeURIComponent(messageId)}&limit=3`)
        ];

        for (const attempt of attempts) {
            try {
                const result = await attempt();
                await wait(200);

                const messages = this.extractDiscordMessages(result);
                const found = messages.find(message => String(message?.id) === String(messageId));

                if (found) return found;
            }
            catch (_) {}
        }

        return null;
    }

    extractActionMessages(result, channelId, before) {
        const direct = this.extractDiscordMessages(result).concat(toMessageArray(result));
        const cached = this.getCachedMessagesForChannel(channelId, before);

        return this.filterMessagePage(direct.concat(cached), before);
    }

    extractDiscordMessages(result) {
        const value = this.normalizeResponse(result);

        if (Array.isArray(value)) return value;

        for (const path of [
            value?.body,
            value?.data,
            value?.messages,
            value?.body?.messages,
            value?.data?.messages,
            value?.results
        ]) {
            if (Array.isArray(path)) {
                return path.flat(Infinity).filter(item => item?.id && (item.content !== undefined || item.embeds !== undefined));
            }
        }

        return [];
    }

    normalizeResponse(result) {
        let value = result;

        for (let i = 0; i < 4; i += 1) {
            if (value?.body !== undefined) value = value.body;
            else if (value?.data !== undefined) value = value.data;
            else if (value?.response?.body !== undefined) value = value.response.body;
            else if (value?.rawBody !== undefined) value = value.rawBody;
            else break;
        }

        if (typeof value === "string") {
            try {
                return JSON.parse(value);
            }
            catch (_) {}
        }

        return value;
    }

    getMessageFromStore(channelId, messageId) {
        const store = this.modules.MessageStore;
        if (!store) return null;

        return this.safeCall(store, "getMessage", channelId, messageId)
            || this.safeCall(store, "getMessage", messageId)
            || this.safeCall(store, "getMessageById", channelId, messageId)
            || this.safeCall(store, "getMessageById", messageId)
            || null;
    }

    getCachedMessagesForChannel(channelId, before) {
        const store = this.modules.MessageStore;

        const sources = [
            this.safeCall(store, "getMessages", channelId),
            this.safeCall(store, "getMessagesForChannel", channelId),
            this.safeCall(store, "getMessageIds", channelId),
            this.safeCall(store, "getRawMessages", channelId)
        ];

        const messages = [];

        for (const source of sources) {
            messages.push(...toMessageArray(source));

            for (const id of collectSnowflakeIds(source)) {
                const message = this.getMessageFromStore(channelId, id);
                if (message) messages.push(message);
            }
        }

        return this.filterMessagePage(messages, before);
    }

    filterMessagePage(messages, before) {
        const beforeTime = before ? snowflakeToTimestamp(before) : Infinity;
        const deduped = new Map();

        for (const message of messages) {
            if (!message?.id) continue;

            const timestamp = timestampFromMessage(message) || snowflakeToTimestamp(message.id);

            if (timestamp && timestamp >= beforeTime) continue;

            deduped.set(String(message.id), message);
        }

        return Array.from(deduped.values())
            .sort((a, b) => (timestampFromMessage(b) || snowflakeToTimestamp(b.id)) - (timestampFromMessage(a) || snowflakeToTimestamp(a.id)))
            .slice(0, Math.max(1, Math.min(100, Number(this.settings.pageLimit) || 100)));
    }

    recordActionAttempt(detail, method, messageCount, result, error = null) {
        if (!detail?.attempts) return;

        detail.attempts.push({
            method,
            count: messageCount,
            error: error?.message || ""
        });
    }

    safeCall(target, method, ...args) {
        try {
            if (typeof target?.[method] === "function") return target[method](...args);
        }
        catch (_) {}

        return undefined;
    }

    getEligibilityFromTextAndAttachments(message, text) {
        const flat = clean(text);
        const linkMatch = flat.match(ANY_LINK_RE);
        const video = this.getVideoEvidenceFromMessageOrText(message, flat);

        if (linkMatch) return {eligible: true, reason: "link", evidence: linkMatch[0]};
        if (video) return {eligible: true, reason: "video", evidence: video};

        return {eligible: false, reason: "none", evidence: ""};
    }

    getDeletedLogEligibility(message, flattenedText) {
        const messageBlock = this.getOriginalDeletedMessageBlock(message, flattenedText);
        const attachmentBlock = this.extractDeletedAttachmentBlock(flattenedText);

        const linkScope = clean(`${messageBlock}\n${attachmentBlock}`);
        const linkMatch = linkScope.match(ANY_LINK_RE);

        if (linkMatch) return {eligible: true, reason: "link", evidence: linkMatch[0]};

        const videoScope = clean(`${attachmentBlock}\n${messageBlock}\n${flattenedText}`);
        const video = this.getVideoEvidenceFromMessageOrText(message, videoScope);

        if (video) return {eligible: true, reason: "video", evidence: video};

        return {eligible: false, reason: "none", evidence: ""};
    }

    getOriginalDeletedMessageBlock(message, flattenedText) {
        const messageFields = this.getLogFieldValues(message, "Message", flattenedText);

        return messageFields.join("\n") || this.extractMessageBlock(flattenedText);
    }

    extractDeletedAttachmentBlock(text) {
        const cleaned = clean(text)
            .replace(/\*\*/g, "")
            .replace(/`/g, "");

        const lines = cleaned.split("\n");
        const blocks = [];

        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i].trim();

            if (!/^\d+\s+Attachment\(s\)/i.test(line)) continue;

            const block = [line];

            const inlineAfterColon = line.split(/[:：]/).slice(1).join(":").trim();
            if (inlineAfterColon) block.push(inlineAfterColon);

            for (let n = i + 1; n < lines.length; n += 1) {
                const next = lines[n].trim();

                if (!next) continue;
                if (/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/i.test(next)) break;
                if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/i.test(next)) break;
                if (this.looksLikeLogLabelLine(next)) break;

                const normalized = this.normalizeLogLabel(next);

                if (["message", "channel", "message id", "message author", "message created", "author", "user"].includes(normalized)) break;

                block.push(next);
            }

            blocks.push(block.join("\n"));
        }

        for (const line of lines) {
            const video = line.match(VIDEO_FILE_RE)?.[0];
            const link = line.match(ANY_LINK_RE)?.[0];

            if (video) blocks.push(video);
            if (link && /(?:cdn\.discordapp\.com|media\.discordapp\.net|attachments)/i.test(link)) blocks.push(link);
        }

        return Array.from(new Set(blocks.filter(Boolean))).join("\n");
    }

    getVideoEvidenceFromMessageOrText(message, text) {
        const textHit = clean(text).match(VIDEO_FILE_RE)?.[0] || "";

        if (textHit) return textHit;

        for (const attachment of this.toArray(this.readValue(message, ["attachments", "rawAttachments"]))) {
            const filename = this.readText(attachment, ["filename", "name", "title"]);
            const mime = this.readText(attachment, ["contentType", "content_type", "mimeType", "mime_type"]);
            const url = this.readText(attachment, ["url", "rawUrl", "proxyUrl", "proxy_url"]);

            if (/^video\//i.test(mime) || VIDEO_FILE_RE.test(filename) || VIDEO_FILE_RE.test(url)) {
                return filename || url || mime;
            }
        }

        return "";
    }

    dedupeEvidence(deletedMatches, liveMatches) {
        const byKey = new Map();

        for (const match of liveMatches.concat(deletedMatches)) {
            byKey.set(`${match.source}:${match.eventId}`, match);
        }

        return Array.from(byKey.values()).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    }

    summarize(matches) {
        const byAuthor = new Map();

        for (const match of matches) {
            const row = byAuthor.get(match.authorKey) || {
                authorKey: match.authorKey,
                author: match.author,
                count: 0,
                eggChatLiveCount: 0,
                totalCount: 0,
                linkCount: 0,
                videoCount: 0,
                liveActiveMs: 0,
                liveActiveTime: "",
                logMessageIds: [],
                eggChatLiveMessageIds: []
            };

            if (!row.author || row.author === "Unknown author") row.author = match.author;

            if (match.reason === "link") row.linkCount += 1;
            if (match.reason === "video") row.videoCount += 1;

            if (match.source === "egg-chat-live") {
                row.eggChatLiveCount += 1;
                if (match.liveMessageId) row.eggChatLiveMessageIds.push(match.liveMessageId);
                row.liveActiveMs += Number(match.activeMs) || 0;
            }
            else {
                row.count += 1;
                if (match.logMessageId) row.logMessageIds.push(match.logMessageId);
            }

            byAuthor.set(match.authorKey, row);
        }

        for (const row of byAuthor.values()) {
            row.logMessageIds = Array.from(new Set(row.logMessageIds.filter(Boolean)));
            row.eggChatLiveMessageIds = Array.from(new Set(row.eggChatLiveMessageIds.filter(Boolean)));
            row.totalCount = row.count + row.eggChatLiveCount;
            row.liveActiveTime = formatDuration(row.liveActiveMs);
        }

        return Array.from(byAuthor.values()).sort((a, b) =>
            b.totalCount - a.totalCount
            || b.count - a.count
            || String(a.author).localeCompare(String(b.author))
        );
    }

    reject(diagnostics, reason) {
        diagnostics.rejected[reason] = (diagnostics.rejected[reason] || 0) + 1;
    }

    createAuditState() {
        return {
            query: clean(this.settings.auditAuthorQuery),
            enabled: Boolean(clean(this.settings.auditAuthorQuery).trim()),
            live: {author: 0, eligible: 0, link: 0, video: 0},
            logs: {author: 0, eligible: 0, link: 0, video: 0, egg: 0, outside: 0},
            samples: []
        };
    }

    auditLive(message, timestamp, match, audit) {
        if (!audit?.enabled) return;

        const author = this.getLiveAuthorContext(message);

        if (!this.matchesAuditAuthor(`${author.line} ${author.id}`)) return;

        audit.live.author += 1;

        if (match) {
            audit.live.eligible += 1;
            if (match.reason === "link") audit.live.link += 1;
            if (match.reason === "video") audit.live.video += 1;
        }
        else {
            this.addAuditSample(audit, {source: "live", id: message.id, reason: "no_link_or_video"});
        }
    }

    auditLog(message, logTimestamp, eventStartMs, eventEndMs, result, audit) {
        if (!audit?.enabled) return;

        const text = this.flattenMessage(message);

        if (this.getMessageAuthorId(message) !== String(this.settings.sapphireBotUserId) || !/message\s+deleted/i.test(text)) return;

        const author = this.getFirstLogFieldValue(message, ["Message author", "Message Author", "Author", "User"], text)
            || this.extractMentionPair(text)
            || "Unknown author";

        if (!this.matchesAuditAuthor(author)) return;

        audit.logs.author += 1;

        const egg = this.hasEggChatReference(text, this.getLogFieldValues(message, "Channel", text));
        const sourceMessageId = this.extractSourceMessageId(message, text);
        const sourceTimestamp = sourceMessageId ? snowflakeToTimestamp(sourceMessageId) : logTimestamp;

        if (egg) audit.logs.egg += 1;
        if (!sourceTimestamp || sourceTimestamp < eventStartMs || sourceTimestamp > eventEndMs) audit.logs.outside += 1;

        if (result?.match) {
            audit.logs.eligible += 1;

            if (result.match.reason === "link") audit.logs.link += 1;
            if (result.match.reason === "video") audit.logs.video += 1;
        }
        else {
            this.addAuditSample(audit, {source: "deleted-log", id: message.id, reason: result?.reject || "unknown"});
        }
    }

    addAuditSample(audit, item) {
        if (audit.samples.length < Math.max(1, Math.min(30, Number(this.settings.auditSampleLimit) || 12))) {
            audit.samples.push(item);
        }
    }

    matchesAuditAuthor(value) {
        const query = clean(this.settings.auditAuthorQuery).trim();

        if (!query) return false;

        const raw = clean(value).toLowerCase();
        const norm = normalize(value);
        const qRaw = query.toLowerCase();
        const qNorm = normalize(query);

        return raw.includes(qRaw)
            || norm.includes(qNorm)
            || (/^\d{14,24}$/.test(query) && raw.includes(query));
    }

    finalizeAudit(audit, evidenceMatches, summary) {
        if (!audit?.enabled) return audit;

        const row = summary.find(r => this.matchesAuditAuthor(`${r.author || ""} ${r.authorKey || ""}`));

        return Object.assign(audit, {
            reportRowTotal: row?.totalCount || 0,
            reportRow: row
        });
    }

    async updateWebhook(result) {
        if (!this.settings.webhookUrl) throw new Error("Set webhook URL in plugin settings");

        const payload = {
            content: this.formatWebhookContent(result),
            allowed_mentions: {parse: []}
        };

        const state = this.loadState();
        let targetMessageId = String(this.settings.webhookMessageId || state.messageId || "").trim();
        let message = null;
        let action = "";

        if (targetMessageId) {
            try {
                message = await this.webhookRequest(this.getWebhookMessageUrl(targetMessageId), "PATCH", payload);
                action = "patched";
            }
            catch (error) {
                const missing = error?.status === 404 || /Unknown Message/i.test(error?.message || "");

                if (!missing) throw error;

                targetMessageId = "";
                this.settings.webhookMessageId = "";
                this.saveSettings();
                action = "recreated_after_missing";
            }
        }

        if (!message) {
            message = await this.webhookRequest(this.getWebhookCreateUrl(), "POST", payload);
            if (!action) action = "created";

            targetMessageId = String(message?.id || "").trim();

            if (targetMessageId) {
                this.settings.webhookMessageId = targetMessageId;
                this.saveSettings();
            }
        }
        else {
            targetMessageId = String(message?.id || targetMessageId).trim();
        }

        this.saveState(Object.assign({}, state, {
            messageId: targetMessageId,
            threadId: this.settings.threadId || "",
            lastAction: action,
            lastUpdatedAt: new Date().toISOString(),
            lastTotalMatches: result.totalMatches,
            lastAuthorCount: result.summary.length,
            lastError: ""
        }));
    }

    getWebhookCreateUrl() {
        const base = this.settings.webhookUrl.replace(/\/+$/, "");
        const params = new URLSearchParams({wait: "true"});

        if (this.settings.threadId) params.set("thread_id", this.settings.threadId);

        return `${base}?${params.toString()}`;
    }

    getWebhookMessageUrl(messageId) {
        const base = this.settings.webhookUrl.replace(/\/+$/, "");
        const params = new URLSearchParams();

        if (this.settings.threadId) params.set("thread_id", this.settings.threadId);

        const query = params.toString();

        return `${base}/messages/${encodeURIComponent(messageId)}${query ? `?${query}` : ""}`;
    }

    async webhookRequest(url, method, payload) {
        const response = await this.fetch(url, {
            method,
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });

        const data = await this.readResponse(response);
        const status = response?.status || response?.statusCode || 0;
        const ok = response?.ok ?? (!status || (status >= 200 && status < 300));

        if (!ok || (data?.code && data?.message)) {
            const error = new Error(`Webhook ${method} failed: ${status || "unknown"} ${data?.message || ""}`.trim());
            error.status = status;
            throw error;
        }

        return data || {};
    }

    formatWebhookContent(result) {
        const now = Math.floor(Date.now() / 1000);
        const start = Math.floor(Date.parse(result.start) / 1000);
        const end = Math.floor(Date.parse(result.end) / 1000);
        const diagnostics = result.diagnostics || {};

        const lines = [
            "**C0LD Egg Server Leaderboard**",
            `_Window <t:${start}:f> to <t:${end}:f> • Updated <t:${now}:R>_`,
            `_Counted ${result.totalMatches} eligible posts across ${result.summary.length} members. Rule: egg-chat live/deleted logs + any link or video attachment link._`
        ];

        if (this.settings.showDiagnostics) lines.push(this.formatDiagnostics(diagnostics));
        if (result.audit?.enabled) lines.push(this.formatAudit(result.audit));

        lines.push("", "```text", `${"rank".padEnd(5)} ${"author".padEnd(42)} total del live link vid`);

        const footer = ["```"];

        for (let i = 0; i < result.summary.length; i += 1) {
            const row = result.summary[i];
            const line = `${String(i + 1).padEnd(5)} ${this.truncateCell(row.author || row.authorKey || "Unknown", 42).padEnd(42)} ${String(row.totalCount || 0).padEnd(5)} ${String(row.count || 0).padEnd(3)} ${String(row.eggChatLiveCount || 0).padEnd(4)} ${String(row.linkCount || 0).padEnd(4)} ${String(row.videoCount || 0)}`;

            if (lines.concat(line, footer).join("\n").length > Number(this.settings.contentLimit || 1950)) break;

            lines.push(line);
        }

        if (lines[lines.length - 1].includes("link vid")) {
            lines.push(`${"-".padEnd(5)} ${"No matching posts found".padEnd(42)} 0     0   0    0    0`);
        }

        lines.push(...footer);
        return lines.join("\n");
    }

    formatDiagnostics(diagnostics) {
        const rejects = Object.entries(diagnostics.rejected || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([key, value]) => `${key}:${value}`)
            .join(",") || "none";

        const last = diagnostics.actionAttempts?.slice(-1)[0];
        const loader = last
            ? ` • loader ${last.source}:${last.attempts?.map(a => `${a.method}:${a.count}`).join("/").slice(0, 100)}`
            : "";

        return `_Diag live ${diagnostics.livePages || 0}p/${diagnostics.liveMessages || 0}m/${diagnostics.liveEligible || 0} eligible • logs ${diagnostics.logPages || 0}p/${diagnostics.logMessages || 0}m/${diagnostics.logEligible || 0} eligible • logPages http/action ${diagnostics.serverLogHttpPages || 0}/${diagnostics.serverLogActionPages || 0} • rejects ${rejects}${loader}_`;
    }

    formatAudit(audit) {
        const samples = this.settings.showAuditSamples && audit.samples?.length
            ? ` • samples ${audit.samples.map(s => `${s.source}:${s.id}:${s.reason}`).join(" | ")}`
            : "";

        return `_Audit "${this.truncateCell(audit.query, 24)}": report ${audit.reportRowTotal || 0} • live ${audit.live.author}/${audit.live.eligible}/${audit.live.link}/${audit.live.video} • logs ${audit.logs.author}/${audit.logs.eligible}/${audit.logs.link}/${audit.logs.video}/egg${audit.logs.egg}/out${audit.logs.outside}${samples}_`;
    }

    truncateCell(value, length) {
        const text = clean(value).replace(/\s+/g, " ").replace(/`/g, "'").trim();

        return text.length <= length ? text : `${text.slice(0, length - 3)}...`;
    }

    loadState() {
        try {
            return BdApi.Data.load(PLUGIN_NAME, STATE_KEY) || {};
        }
        catch (_) {
            return {};
        }
    }

    saveState(state) {
        BdApi.Data.save(PLUGIN_NAME, STATE_KEY, state || {});
    }

    async fetch(url, options) {
        if (typeof BdApi?.Net?.fetch === "function") return BdApi.Net.fetch(url, options);
        if (typeof fetch === "function") return fetch(url, options);

        throw new Error("No fetch available");
    }

    async readResponse(response) {
        if (!response) return null;
        if (Array.isArray(response)) return response;
        if (typeof response === "string") return this.parseResponse(response);

        if (typeof response.json === "function") {
            try {
                return this.parseResponse(await response.json());
            }
            catch (_) {}
        }

        if (typeof response.text === "function") {
            try {
                return this.parseResponse(await response.text());
            }
            catch (_) {}
        }

        for (const key of ["data", "body", "rawBody"]) {
            const value = response[key];

            if (value === undefined || value === null || value === "") continue;
            if (typeof value === "string") return this.parseResponse(value);
            if (Array.isArray(value)) return value;
            if (typeof value === "object") return value;
        }

        return response;
    }

    parseResponse(value) {
        if (typeof value === "string") {
            try {
                return value ? JSON.parse(value) : null;
            }
            catch (_) {
                return value;
            }
        }

        return value;
    }

    getMessageAuthorId(message) {
        const author = this.readValue(message, ["author"]);

        if (typeof author === "string" && /^\d{14,24}$/.test(author)) return author;

        return this.readText(author, ["id"])
            || this.readText(message, ["authorId", "author_id", "userId", "user_id"])
            || "";
    }

    getLiveAuthorContext(message) {
        const author = this.readValue(message, ["author"]) || {};
        const id = this.getMessageAuthorId(message);
        const username = this.readText(author, ["username", "name", "tag"]);
        const globalName = this.readText(author, ["globalName", "global_name", "displayName", "nick"]);
        let line = "";

        if (globalName && username && globalName !== username) line = `${globalName} (@${username})${id ? ` (<@${id}>)` : ""}`;
        else if (globalName) line = `${globalName}${id ? ` (<@${id}>)` : ""}`;
        else if (username) line = `${username}${id ? ` (<@${id}>)` : ""}`;
        else if (id) line = `<@${id}>`;

        return {
            id,
            line,
            key: id ? `<@${id}>` : this.normalizeAuthorKey(line)
        };
    }

    normalizeAuthorKey(authorLine) {
        const text = clean(authorLine).replace(/\s+/g, " ").trim();
        const mentionId = text.match(/<@!?(\d{14,24})>/)?.[1];

        if (mentionId) return `<@${mentionId}>`;

        const leadingHandle = text.match(/@([^\s()]+)(?:\s|\(|$)/)?.[1];

        if (leadingHandle) return leadingHandle.toLowerCase();

        const parenthetical = text.match(/\((@?[^()]+)\)/)?.[1];

        return (parenthetical || text)
            .replace(/^@/, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase() || "unknown";
    }

    flattenMessage(message) {
        const parts = [];
        this.collectTextParts(message, parts);

        return clean(parts.filter(Boolean).join("\n"));
    }

    collectTextParts(source, parts, seen = new Set(), depth = 0) {
        if (!source || depth > 8) return;

        if (typeof source === "string") {
            parts.push(source);
            return;
        }

        if (Array.isArray(source) || source instanceof Map || source instanceof Set) {
            for (const item of this.toArray(source)) this.collectTextParts(item, parts, seen, depth + 1);
            return;
        }

        if (typeof source !== "object" || seen.has(source)) return;
        seen.add(source);

        parts.push(this.readText(source, ["content", "cleanContent", "rawContent", "text"]));

        for (const embed of this.toArray(this.readValue(source, ["embeds", "rawEmbeds"]))) {
            parts.push(
                this.readText(embed, ["title", "rawTitle"]),
                this.readText(embed, ["description", "rawDescription"]),
                this.readText(embed, ["url", "rawUrl"]),
                this.readText(this.readValue(embed, ["footer", "rawFooter"]), ["text", "rawText"]),
                this.readText(this.readValue(embed, ["author", "rawAuthor"]), ["name", "rawName"])
            );

            for (const field of this.toArray(this.readValue(embed, ["fields", "rawFields", "_fields"]))) {
                const nameRaw = this.readValue(field, ["name", "rawName"]);
                const valueRaw = this.readValue(field, ["value", "rawValue"]);

                const name = this.readText(field, ["name", "rawName"]) || deepText(nameRaw);
                const value = this.readText(field, ["value", "rawValue"]) || deepText(valueRaw);

                if (name || value) parts.push(`${name}: ${value}`);
                if (nameRaw) parts.push(deepText(nameRaw));
                if (valueRaw) parts.push(deepText(valueRaw));
            }
        }

        for (const attachment of this.toArray(this.readValue(source, ["attachments", "rawAttachments"]))) {
            parts.push(
                this.readText(attachment, ["url", "rawUrl"]),
                this.readText(attachment, ["proxyUrl", "proxy_url"]),
                this.readText(attachment, ["filename", "name", "title", "description"]),
                this.readText(attachment, ["contentType", "content_type", "mimeType", "mime_type"])
            );
        }

        for (const key of [
            "messageSnapshots", "message_snapshots", "messageSnapshot", "message_snapshot", "snapshots",
            "forwardedMessages", "forwarded_messages", "forwardedMessage", "forwarded_message",
            "message", "snapshot", "sourceMessage", "source_message", "referencedMessage", "referenced_message",
            "originalMessage", "original_message"
        ]) {
            const nested = this.readValue(source, [key]);

            if (nested) this.collectTextParts(nested, parts, seen, depth + 1);
        }
    }

    getLogFieldValues(message, label, flattenedText) {
        const values = [];
        const wanted = this.normalizeLogLabel(label);

        for (const embed of this.toArray(this.readValue(message, ["embeds", "rawEmbeds"]))) {
            for (const field of this.toArray(this.readValue(embed, ["fields", "rawFields", "_fields"]))) {
                const nameRaw = this.readValue(field, ["name", "rawName"]);
                const valueRaw = this.readValue(field, ["value", "rawValue"]);

                const name = this.readText(field, ["name", "rawName"]) || deepText(nameRaw);
                const value = this.readText(field, ["value", "rawValue"]) || deepText(valueRaw);

                if (this.normalizeLogLabel(name) === wanted && value) {
                    values.push(clean(value).trim());
                }
            }
        }

        const plain = clean(flattenedText).replace(/```/g, "").replace(/\*\*/g, "").replace(/`/g, "");
        values.push(...this.getColonLabelBlocks(label, plain), ...this.getStandaloneHeaderBlocks(label, plain));

        return Array.from(new Set(values.filter(Boolean)));
    }

    getColonLabelBlocks(label, text) {
        const values = [];
        const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const lineRegex = new RegExp(`^\\s*(?:[>\\-•]\\s*)?${escaped}\\s*[:：]\\s*(.*)$`, "i");
        const lines = text.split("\n");

        for (let i = 0; i < lines.length; i += 1) {
            const match = lines[i].match(lineRegex);

            if (!match) continue;

            const block = [match[1].trim()].filter(Boolean);

            for (let n = i + 1; n < lines.length; n += 1) {
                const line = lines[n].trim();

                if (this.isBlockStopLine(line)) break;
                if (line) block.push(line);
            }

            values.push(block.join("\n").trim());
        }

        return values;
    }

    getStandaloneHeaderBlocks(label, text) {
        const values = [];
        const wanted = this.normalizeLogLabel(label);
        const lines = text.split("\n");

        for (let i = 0; i < lines.length; i += 1) {
            if (this.normalizeLogLabel(lines[i]) !== wanted) continue;

            const block = [];

            for (let n = i + 1; n < lines.length; n += 1) {
                const line = lines[n].trim();

                if (this.isBlockStopLine(line)) break;
                if (line) block.push(line);
            }

            values.push(block.join("\n").trim());
        }

        return values;
    }

    getFirstLogFieldValue(message, labels, flattenedText) {
        for (const label of labels) {
            const value = this.getLogFieldValues(message, label, flattenedText)[0];

            if (value) return value;
        }

        return "";
    }

    isBlockStopLine(line) {
        const text = String(line || "").trim();

        if (!text || /^https?:\/\//i.test(text)) return false;
        if (/^\d+\s+Attachment\(s\)/i.test(text) || /^\d{1,2}\/\d{1,2}\/\d{4},/i.test(text)) return true;

        return this.looksLikeLogLabelLine(text)
            || ["message", "channel", "message id", "message author", "message created", "author", "user"].includes(this.normalizeLogLabel(text));
    }

    looksLikeLogLabelLine(line) {
        const text = String(line || "").trim();

        if (/^https?:\/\//i.test(text)) return false;

        return /^(?:[>\-•]\s*)?[A-Za-z][A-Za-z0-9 _-]{1,44}\s*[:：]/.test(text);
    }

    normalizeLogLabel(value) {
        return clean(value)
            .replace(/[>*_`~|]/g, "")
            .replace(/[:：]/g, "")
            .trim()
            .toLowerCase();
    }

    hasEggChatReference(text, channelValues) {
        const combined = [text].concat(channelValues || []).map(value => clean(value)).join("\n");
        const raw = combined.toLowerCase();
        const normalized = normalize(combined);

        return raw.includes(String(this.settings.eggChatChannelId))
            || raw.includes("egg-chat")
            || raw.includes("egg_chat")
            || normalized.includes("egg chat")
            || normalized.includes("eggchat");
    }

    extractMessageBlock(text) {
        const plain = clean(text).replace(/\*\*/g, "").replace(/`/g, "");

        return this.getColonLabelBlocks("Message", plain)[0]
            || this.getStandaloneHeaderBlocks("Message", plain)[0]
            || "";
    }

    extractSourceMessageId(message, flattenedText) {
        return String(this.getFirstLogFieldValue(message, ["Message ID", "Message Id", "Deleted Message ID", "Deleted Message Id"], flattenedText) || "")
            .match(/\d{14,24}/)?.[0] || "";
    }

    extractMentionPair(text) {
        const value = clean(text);

        return value.match(/@[\w.'-]{2,40}\s*\([^\n]+\)/)?.[0]
            || value.match(/<@!?\d{14,24}>/)?.[0]
            || "";
    }

    readValue(source, keys) {
        if (!source) return undefined;

        const candidates = [source];

        try {
            if (typeof source.toJS === "function") candidates.push(source.toJS());
        }
        catch (_) {}

        try {
            if (typeof source.toJSON === "function") candidates.push(source.toJSON());
        }
        catch (_) {}

        for (const candidate of candidates) {
            if (!candidate) continue;

            for (const key of keys) {
                try {
                    const value = candidate[key];

                    if (value !== undefined && typeof value !== "function") return value;
                }
                catch (_) {}

                try {
                    if (typeof candidate.get === "function") {
                        const value = candidate.get(key);

                        if (value !== undefined && typeof value !== "function") return value;
                    }
                }
                catch (_) {}
            }
        }

        return undefined;
    }

    readText(source, keys) {
        const value = this.readValue(source, keys);

        if (value === undefined || value === null) return "";
        if (["string", "number", "boolean"].includes(typeof value)) return String(value);

        const text = deepText(value);

        return text === "[object Object]" ? "" : text;
    }

    toArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (value instanceof Map || value instanceof Set) return Array.from(value.values());

        try {
            if (typeof value.toArray === "function") return value.toArray();
        }
        catch (_) {}

        try {
            if (typeof value.valueSeq === "function") return value.valueSeq().toArray();
        }
        catch (_) {}

        try {
            if (typeof value.toJS === "function") {
                const raw = value.toJS();

                return Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
            }
        }
        catch (_) {}

        try {
            if (typeof value.toJSON === "function") {
                const raw = value.toJSON();

                return Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);
            }
        }
        catch (_) {}

        return typeof value === "object" ? Object.values(value) : [];
    }

    getGuildId() {
        return String(location?.pathname || "").match(/\/channels\/(\d+)/)?.[1] || "";
    }
};
