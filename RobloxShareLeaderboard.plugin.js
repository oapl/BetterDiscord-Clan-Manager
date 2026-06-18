/**
 * @name RobloxShareLeaderboard
 * @author ChatGPT
 * @description Webhook-only Roblox private-server leaderboard scanner for C0LD egg-chat. No CSV/XLSX exports.
 * @version 0.1.1
 */

const PLUGIN_NAME = "RobloxShareLeaderboard";
const SETTINGS_KEY = "settings";
const STATE_KEY = "webhookState";
const DISCORD_EPOCH = 1420070400000n;

const DEFAULT_SETTINGS = {
    webhookUrl: "",
    webhookMessageId: "",
    threadId: "1504955979597349166",
    serverLogsChannelId: "1489879731569426485",
    eggChatChannelId: "1515759898565148884",
    sapphireBotUserId: "1489881332241666139",
    startLocal: "2026-06-13T10:00",
    endLocal: "2026-06-19T10:00",
    autoUpdate: true,
    intervalMinutes: 15,
    maxPages: 800,
    pageLimit: 100,
    logScanGraceDays: 7,
    contentLimit: 1950
};

const SHARE_PATTERNS = [
    /https?:\/\/(?:www\.)?roblox\.com\/share\?code=[^\s<>)]+/i,
    /https?:\/\/(?:www\.)?roblox\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/8737899170\/Pet-Simulator-99\?privateServerLinkCode=[^\s<>)]+/i,
    /(?:^|\s)(\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/8737899170\/Pet-Simulator-99\?privateServerLinkCode=[^\s<>)]+)/i
];

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

function copySettings(settings) {
    return Object.assign({}, DEFAULT_SETTINGS, settings || {});
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
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
        try {
            this.modules.Auth = BdApi.Webpack.getByKeys?.("getToken", {searchExports: true}) || null;
        }
        catch (_) {
            this.modules.Auth = null;
        }
    }

    getSettingsPanel() {
        const root = createElement("div");
        root.style.cssText = "display:flex;flex-direction:column;gap:10px;padding:12px;max-width:760px";
        root.append(createElement("div", null, "Webhook-only scanner. Paste the webhook URL locally. After the first successful post, this plugin stores the webhook message ID and PATCHes that same message instead of posting a new one."));

        const fields = [
            ["webhookUrl", "Discord webhook URL", "password"],
            ["webhookMessageId", "Initialized webhook message ID", "text"],
            ["threadId", "Webhook thread ID", "text"],
            ["serverLogsChannelId", "Server logs channel ID", "text"],
            ["eggChatChannelId", "Egg chat channel ID", "text"],
            ["sapphireBotUserId", "Sapphire bot user ID", "text"],
            ["startLocal", "Event start", "datetime-local"],
            ["endLocal", "Event end", "datetime-local"],
            ["intervalMinutes", "Interval minutes", "number"],
            ["maxPages", "Max pages", "number"],
            ["logScanGraceDays", "Deleted-log grace days", "number"]
        ];
        for (const [key, label, type] of fields) root.append(this.createInput(key, label, type));

        const auto = createElement("label");
        auto.style.cssText = "display:flex;gap:8px;align-items:center";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(this.settings.autoUpdate);
        checkbox.addEventListener("change", () => {
            this.settings.autoUpdate = checkbox.checked;
            this.saveSettings();
            this.restartTimer();
        });
        auto.append(checkbox, createElement("span", null, "Auto-update webhook"));
        root.append(auto);

        const buttons = createElement("div");
        buttons.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
        const run = createElement("button", null, "Run scan + update webhook now");
        run.type = "button";
        run.addEventListener("click", () => this.runManual());
        const forget = createElement("button", null, "Forget stored message ID");
        forget.type = "button";
        forget.addEventListener("click", () => {
            BdApi.Data.save(PLUGIN_NAME, STATE_KEY, {});
            this.settings.webhookMessageId = "";
            this.saveSettings();
            BdApi.UI?.showToast?.("Stored webhook message ID cleared", {type: "success"});
        });
        buttons.append(run, forget);
        root.append(buttons);
        return root;
    }

    createInput(key, label, type) {
        const wrap = createElement("label");
        wrap.style.cssText = "display:grid;gap:4px";
        const input = document.createElement("input");
        input.type = type;
        input.value = this.settings[key] ?? "";
        input.style.cssText = "padding:8px;border-radius:6px;border:1px solid var(--background-modifier-accent);background:var(--input-background);color:var(--text-normal)";
        input.addEventListener("change", () => {
            const numeric = ["intervalMinutes", "maxPages", "logScanGraceDays"].includes(key);
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
        this.intervalTimer = setInterval(
            () => this.runScheduled("interval"),
            Math.max(1, Number(this.settings.intervalMinutes) || 15) * 60000
        );
    }

    async runManual() {
        try {
            BdApi.UI?.showToast?.("Scanning Roblox links...", {type: "info"});
            const result = await this.runScheduled("manual");
            if (result) {
                BdApi.UI?.showToast?.(`Leaderboard updated: ${result.totalMatches} posts, ${result.summary.length} members`, {type: "success"});
                console.log(`${PLUGIN_NAME} result`, result);
            }
        }
        catch (error) {
            console.error(error);
            BdApi.UI?.showToast?.(`Scan failed: ${error?.message || error}`, {type: "error", timeout: 8000});
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
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error("Invalid event date window");
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
            liveMatches: 0,
            logPages: 0,
            logMessages: 0,
            logMatches: 0,
            rejected: {},
            dedupedAway: 0
        };

        const liveMatches = await this.scanLive(startMs, activeUntil, diagnostics);
        const deletedMatches = await this.scanLogs(startMs, logEnd, diagnostics);
        const evidenceMatches = this.dedupeEvidence(deletedMatches, liveMatches, diagnostics);
        const summary = this.summarize(evidenceMatches);

        return {
            generatedAt: new Date().toISOString(),
            start: new Date(startMs).toISOString(),
            end: new Date(endMs).toISOString(),
            serverLogsChannelId: this.settings.serverLogsChannelId,
            sourceChannelId: this.settings.eggChatChannelId,
            totalMatches: evidenceMatches.length,
            summary,
            diagnostics,
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
            const messages = await this.fetchMessagePage(this.settings.eggChatChannelId, before);
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
                const match = this.getLiveMatch(message, timestamp, endMs);
                if (match) {
                    matches.push(match);
                    diagnostics.liveMatches += 1;
                }
            }
            before = messages[messages.length - 1]?.id || "";
            if (!before) break;
            if (!reachedStart) await wait(175);
        }
        return matches;
    }

    async scanLogs(startMs, endMs, diagnostics) {
        const matches = [];
        let before = timestampToSnowflake(endMs + 1);
        let reachedStart = false;
        for (let page = 0; page < Number(this.settings.maxPages) && !reachedStart; page += 1) {
            const messages = await this.fetchMessagePage(this.settings.serverLogsChannelId, before);
            diagnostics.logPages += 1;
            diagnostics.logMessages += messages.length;
            if (!messages.length) break;
            for (const message of messages) {
                const timestamp = timestampFromMessage(message);
                if (timestamp && timestamp < startMs) {
                    reachedStart = true;
                    continue;
                }
                if (!timestamp || timestamp > endMs || timestamp < startMs) continue;
                const match = this.getDeletedLogMatch(message, timestamp, startMs, diagnostics);
                if (match) {
                    matches.push(match);
                    diagnostics.logMatches += 1;
                }
            }
            before = messages[messages.length - 1]?.id || "";
            if (!before) break;
            if (!reachedStart) await wait(175);
        }
        return matches;
    }

    reject(diagnostics, reason) {
        diagnostics.rejected[reason] = (diagnostics.rejected[reason] || 0) + 1;
    }

    getDeletedLogMatch(message, logTimestamp, startMs, diagnostics) {
        const text = this.flattenMessage(message);
        if (this.getMessageAuthorId(message) !== String(this.settings.sapphireBotUserId)) {
            this.reject(diagnostics, "not_sapphire");
            return null;
        }
        if (!/message\s+deleted/i.test(text)) {
            this.reject(diagnostics, "not_deleted_log");
            return null;
        }
        const channelValues = this.getLogFieldValues(message, "Channel", text);
        if (!this.hasEggChatReference(text, channelValues)) {
            this.reject(diagnostics, "not_egg_chat");
            return null;
        }
        const shareMessage = this.getShareMessageValue(this.getLogFieldValues(message, "Message", text), text);
        if (!shareMessage) {
            this.reject(diagnostics, "no_link_in_message_block");
            return null;
        }

        const sourceMessageId = this.extractSourceMessageId(message, text);
        const sourceTimestamp = sourceMessageId ? snowflakeToTimestamp(sourceMessageId) : logTimestamp;
        const endTimestamp = Date.parse(this.settings.endLocal);
        if (!sourceTimestamp || sourceTimestamp < startMs || sourceTimestamp > endTimestamp) {
            this.reject(diagnostics, "source_outside_window");
            return null;
        }

        const author = this.getFirstLogFieldValue(message, ["Message author", "Message Author", "Author", "User"], text)
            || this.extractMentionPair(text)
            || "Unknown author";
        const guildId = this.getGuildId() || "@me";
        return {
            source: "server-log",
            author,
            authorKey: this.normalizeAuthorKey(author),
            sourceMessageId,
            canonicalLink: this.extractCanonicalLink(shareMessage),
            logMessageId: message.id,
            timestamp: new Date(sourceTimestamp).toISOString(),
            deletedLogTimestamp: new Date(logTimestamp).toISOString(),
            messageUrl: `https://discord.com/channels/${guildId}/${this.settings.serverLogsChannelId}/${message.id}`,
            message: shareMessage
        };
    }

    getLiveMatch(message, timestamp, activeUntil) {
        const text = this.flattenMessage(message);
        const shareMessage = this.getShareMessageValue([], text);
        if (!shareMessage) return null;
        const author = this.getLiveAuthorContext(message);
        const guildId = this.getGuildId() || "@me";
        const activeMs = Math.max(0, activeUntil - timestamp);
        return {
            source: "egg-chat-live",
            author: author.line || "Unknown author",
            authorKey: author.key || this.normalizeAuthorKey(author.line),
            sourceMessageId: message.id,
            canonicalLink: this.extractCanonicalLink(shareMessage),
            liveMessageId: message.id,
            timestamp: new Date(timestamp).toISOString(),
            activeMs,
            activeDuration: formatDuration(activeMs),
            messageUrl: `https://discord.com/channels/${guildId}/${this.settings.eggChatChannelId}/${message.id}`,
            message: shareMessage
        };
    }

    dedupeEvidence(deletedMatches, liveMatches, diagnostics) {
        const byKey = new Map();
        for (const match of liveMatches) byKey.set(this.getEvidenceKey(match), match);
        for (const match of deletedMatches) byKey.set(this.getEvidenceKey(match), match);
        const evidence = Array.from(byKey.values()).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
        diagnostics.dedupedAway = deletedMatches.length + liveMatches.length - evidence.length;
        return evidence;
    }

    getEvidenceKey(match) {
        if (match?.sourceMessageId) return `message:${match.sourceMessageId}`;
        return [
            match?.authorKey || "unknown",
            match?.canonicalLink || "",
            Math.floor(Date.parse(match?.timestamp || 0) / 60000)
        ].join("|");
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
                liveActiveMs: 0,
                liveActiveTime: "",
                logMessageIds: [],
                eggChatLiveMessageIds: [],
                sourceMessageIds: [],
                firstTimestamp: match.timestamp,
                lastTimestamp: match.timestamp
            };
            if (!row.author || row.author === "Unknown author") row.author = match.author;
            if (match.timestamp < row.firstTimestamp) row.firstTimestamp = match.timestamp;
            if (match.timestamp > row.lastTimestamp) row.lastTimestamp = match.timestamp;
            if (match.source === "egg-chat-live") {
                row.eggChatLiveCount += 1;
                if (match.liveMessageId) row.eggChatLiveMessageIds.push(match.liveMessageId);
                row.liveActiveMs += Number(match.activeMs) || 0;
            }
            else {
                row.count += 1;
                if (match.logMessageId) row.logMessageIds.push(match.logMessageId);
            }
            if (match.sourceMessageId) row.sourceMessageIds.push(match.sourceMessageId);
            byAuthor.set(match.authorKey, row);
        }

        for (const row of byAuthor.values()) {
            row.logMessageIds = Array.from(new Set(row.logMessageIds.filter(Boolean)));
            row.eggChatLiveMessageIds = Array.from(new Set(row.eggChatLiveMessageIds.filter(Boolean)));
            row.sourceMessageIds = Array.from(new Set(row.sourceMessageIds.filter(Boolean)));
            row.totalCount = row.count + row.eggChatLiveCount;
            row.liveActiveTime = formatDuration(row.liveActiveMs);
        }

        return Array.from(byAuthor.values()).sort((a, b) =>
            b.totalCount - a.totalCount
            || b.count - a.count
            || String(a.author).localeCompare(String(b.author))
        );
    }

    async fetchMessagePage(channelId, before) {
        const limit = Math.max(1, Math.min(100, Number(this.settings.pageLimit) || 100));
        const endpoint = `/channels/${channelId}/messages?limit=${limit}${before ? `&before=${before}` : ""}`;
        const data = await this.discordRequest(endpoint);
        return Array.isArray(data) ? data : [];
    }

    getToken() {
        for (const candidate of [this.modules.Auth, this.modules.Auth?.default, this.modules.Auth?.Z, this.modules.Auth?.ZP]) {
            try {
                const token = candidate?.getToken?.();
                if (typeof token === "string" && token.length > 20) return token;
            }
            catch (_) {}
        }
        return "";
    }

    async discordRequest(endpoint) {
        const token = this.getToken();
        if (!token) throw new Error("Could not read Discord token from BetterDiscord Auth module");
        const response = await this.fetch(`https://discord.com/api/v9${endpoint}`, {headers: {Authorization: token}});
        const data = await this.readResponse(response);
        const status = response?.status || response?.statusCode || 0;
        const ok = response?.ok ?? (!status || (status >= 200 && status < 300));
        if (!ok || (data?.code && data?.message)) throw new Error(`Discord API failed: ${status || "unknown"} ${data?.message || ""}`.trim());
        return data;
    }

    async updateWebhook(result) {
        if (!this.settings.webhookUrl) throw new Error("Set webhook URL in plugin settings");
        const payload = {
            content: this.formatWebhookContent(result),
            allowed_mentions: {parse: []}
        };
        const state = this.loadState();
        const configuredMessageId = String(this.settings.webhookMessageId || "").trim();
        let targetMessageId = configuredMessageId || String(state.messageId || "").trim();
        let message = null;
        let action = "";

        if (targetMessageId) {
            try {
                message = await this.webhookRequest(this.getWebhookMessageUrl(targetMessageId), "PATCH", payload);
                action = "patched";
            }
            catch (error) {
                const isMissing = error?.status === 404 || /Unknown Message/i.test(error?.message || "");
                if (configuredMessageId || !isMissing) throw error;
                targetMessageId = "";
            }
        }

        if (!message) {
            message = await this.webhookRequest(this.getWebhookCreateUrl(), "POST", payload);
            action = "created";
            targetMessageId = String(message?.id || "").trim();
            if (!targetMessageId) throw new Error("Webhook POST succeeded but Discord did not return a message ID; stopping to avoid repost loops.");
            if (!this.settings.webhookMessageId) {
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
        const lines = [
            "**C0LD Egg Server Leaderboard**",
            `_Window <t:${start}:f> to <t:${end}:f> • Updated <t:${now}:R>_`,
            `_Counted ${result.totalMatches} unique private-server posts across ${result.summary.length} members._`,
            "",
            "```text",
            `${"rank".padEnd(5)} ${"author".padEnd(46)} total  del  live`
        ];
        const footer = ["```"];
        for (let index = 0; index < result.summary.length; index += 1) {
            const row = result.summary[index];
            const line = `${String(index + 1).padEnd(5)} ${this.truncateCell(row.author || row.authorKey || "Unknown", 46).padEnd(46)} ${String(row.totalCount || 0).padEnd(5)} ${String(row.count || 0).padEnd(4)} ${String(row.eggChatLiveCount || 0)}`;
            if (lines.concat(line, footer).join("\n").length > Number(this.settings.contentLimit || 1950)) break;
            lines.push(line);
        }
        if (lines.length === 6) lines.push(`${"-".padEnd(5)} ${"No matching posts yet".padEnd(46)} 0      0    0`);
        lines.push(...footer);
        return lines.join("\n");
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
        for (const key of ["body", "data", "rawBody"]) {
            if (response[key] !== undefined && response[key] !== "") return this.parseResponse(response[key]);
        }
        if (typeof response.json === "function") {
            try { return this.parseResponse(await response.json()); }
            catch (_) {}
        }
        if (typeof response.text === "function") {
            try { return this.parseResponse(await response.text()); }
            catch (_) {}
        }
        return this.parseResponse(response);
    }

    parseResponse(value) {
        if (typeof value === "string") {
            try { return value ? JSON.parse(value) : null; }
            catch (_) { return value; }
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
        return (parenthetical || text).replace(/^@/, "").replace(/\s+/g, " ").trim().toLowerCase() || "unknown";
    }

    flattenMessage(message) {
        const parts = [];
        this.collectTextParts(message, parts);
        return clean(parts.filter(Boolean).join("\n"));
    }

    collectTextParts(source, parts, seen = new Set(), depth = 0) {
        if (!source || depth > 6) return;
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
                const name = this.readText(field, ["name", "rawName"]);
                const value = this.readText(field, ["value", "rawValue"]);
                if (name || value) parts.push(`${name}: ${value}`);
            }
        }
        for (const attachment of this.toArray(this.readValue(source, ["attachments", "rawAttachments"]))) {
            parts.push(
                this.readText(attachment, ["url", "rawUrl"]),
                this.readText(attachment, ["proxyUrl", "proxy_url"]),
                this.readText(attachment, ["filename", "name", "title", "description"])
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
                const name = this.readText(field, ["name", "rawName"]);
                const value = this.readText(field, ["value", "rawValue"]);
                if (this.normalizeLogLabel(name) === wanted && value) values.push(clean(value).trim());
            }
        }

        const plain = clean(flattenedText).replace(/```/g, "").replace(/\*\*/g, "").replace(/`/g, "");
        const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const lineRegex = new RegExp(`^\\s*(?:[>\\-•]\\s*)?${escapedLabel}\\s*[:：]\\s*(.*)$`, "i");
        const lines = plain.split("\n");
        for (let index = 0; index < lines.length; index += 1) {
            const match = lines[index].match(lineRegex);
            if (!match) continue;
            const block = [match[1].trim()].filter(Boolean);
            for (let next = index + 1; next < lines.length; next += 1) {
                const line = lines[next].trim();
                if (this.looksLikeLogLabelLine(line)) break;
                if (line) block.push(line);
            }
            values.push(block.join("\n").trim());
        }
        return Array.from(new Set(values.filter(Boolean)));
    }

    getFirstLogFieldValue(message, labels, flattenedText) {
        for (const label of labels) {
            const value = this.getLogFieldValues(message, label, flattenedText)[0];
            if (value) return value;
        }
        return "";
    }

    looksLikeLogLabelLine(line) {
        const text = String(line || "").trim();
        if (/^https?:\/\//i.test(text)) return false;
        return /^(?:[>\-•]\s*)?[A-Za-z][A-Za-z0-9 _-]{1,44}\s*[:：]/.test(text);
    }

    normalizeLogLabel(value) {
        return clean(value).replace(/[>*_`~|]/g, "").replace(/[:：]/g, "").trim().toLowerCase();
    }

    hasEggChatReference(text, channelValues) {
        return [text].concat(channelValues).some(value => {
            const raw = clean(value).toLowerCase();
            const normalized = normalize(value);
            return raw.includes(String(this.settings.eggChatChannelId))
                || normalized.includes("egg chat")
                || normalized.includes("eggchat");
        });
    }

    getShareMessageValue(messageValues, flattenedText) {
        const fieldMatch = messageValues.find(value => this.extractCanonicalLink(value));
        if (fieldMatch) return fieldMatch;
        const messageBlock = this.extractMessageBlock(flattenedText);
        if (this.extractCanonicalLink(messageBlock)) return messageBlock;
        return flattenedText.split("\n").find(line => this.extractCanonicalLink(line))?.trim() || "";
    }

    extractMessageBlock(text) {
        const lines = clean(text).replace(/\*\*/g, "").replace(/`/g, "").split("\n");
        for (let index = 0; index < lines.length; index += 1) {
            const match = lines[index].match(/^\s*(?:[>\-•]\s*)?Message\s*[:：]\s*(.*)$/i);
            if (!match) continue;
            const block = [match[1].trim()].filter(Boolean);
            for (let next = index + 1; next < lines.length; next += 1) {
                const line = lines[next].trim();
                if (this.looksLikeLogLabelLine(line)) break;
                if (line) block.push(line);
            }
            return block.join("\n").trim();
        }
        return "";
    }

    extractCanonicalLink(value) {
        const text = clean(value);
        for (const pattern of SHARE_PATTERNS) {
            pattern.lastIndex = 0;
            const match = text.match(pattern);
            if (!match) continue;
            const raw = match[1]?.startsWith("/") ? `https://www.roblox.com${match[1]}` : match[0];
            return raw.trim().replace(/[),.]+$/g, "").replace(/&amp;/g, "&");
        }
        return "";
    }

    extractSourceMessageId(message, flattenedText) {
        return String(this.getFirstLogFieldValue(message, ["Message ID", "Message Id", "Deleted Message ID", "Deleted Message Id"], flattenedText) || "")
            .match(/\d{14,24}/)?.[0] || "";
    }

    extractMentionPair(text) {
        const cleanText = clean(text);
        return cleanText.match(/@[\w.'-]{2,40}\s*\([^\n]+\)/)?.[0]
            || cleanText.match(/<@!?\d{14,24}>/)?.[0]
            || "";
    }

    readValue(source, keys) {
        if (!source) return undefined;
        const candidates = [source];
        try {
            if (typeof source.toJS === "function") candidates.push(source.toJS());
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
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        try {
            if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
                const text = value.toString();
                return text === "[object Object]" ? "" : text;
            }
        }
        catch (_) {}
        return "";
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
            if (typeof value.toJS === "function") {
                const raw = value.toJS();
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
