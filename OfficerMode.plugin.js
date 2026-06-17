/**
 * @name OfficerMode
 * @author Codex
 * @description Adds a toggleable officer desk for ticket and application channels while keeping the main chat readable.
 * @version 0.2.6
 */

const PLUGIN_NAME = "OfficerMode";
const SETTINGS_KEY = "settings";
const STYLE_ID = "OfficerMode";
const DISCORD_EPOCH = 1420070400000n;
const SHARE_SCAN_DATA_KEY = "robloxShareScan";
const ROBLOX_SHARE_SCAN = {
    SERVER_LOGS_CHANNEL_ID: "1489879731569426485",
    EGG_CHAT_CHANNEL_ID: "1515759898565148884",
    AUDIT_AUTHOR_IDS: ["165533461241659403"],
    SHARE_PREFIX: "https://www.roblox.com/share",
    SHARE_PATTERNS: [
        /https?:\/\/(?:www\.)?roblox\.com\/share\?code=/i,
        /https?:\/\/(?:www\.)?roblox\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/8737899170\/Pet-Simulator-99\?privateServerLinkCode=/i,
        /(?:^|\s)\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/8737899170\/Pet-Simulator-99\?privateServerLinkCode=/i
    ],
    START_MS: new Date(2026, 5, 13, 10, 0, 0).getTime(),
    END_MS: new Date(2026, 5, 19, 10, 0, 0).getTime(),
    PAGE_LIMIT: 100,
    MAX_PAGES: 800
};

const CHANNEL_TYPES = {
    GUILD_TEXT: 0,
    GUILD_VOICE: 2,
    GUILD_CATEGORY: 4,
    GUILD_ANNOUNCEMENT: 5,
    ANNOUNCEMENT_THREAD: 10,
    PUBLIC_THREAD: 11,
    PRIVATE_THREAD: 12,
    GUILD_STAGE_VOICE: 13,
    GUILD_FORUM: 15,
    GUILD_MEDIA: 16
};

const TEXT_LIKE_CHANNELS = new Set([
    CHANNEL_TYPES.GUILD_TEXT,
    CHANNEL_TYPES.GUILD_ANNOUNCEMENT,
    CHANNEL_TYPES.ANNOUNCEMENT_THREAD,
    CHANNEL_TYPES.PUBLIC_THREAD,
    CHANNEL_TYPES.PRIVATE_THREAD,
    CHANNEL_TYPES.GUILD_FORUM,
    CHANNEL_TYPES.GUILD_MEDIA
]);

const THREAD_CHANNELS = new Set([
    CHANNEL_TYPES.ANNOUNCEMENT_THREAD,
    CHANNEL_TYPES.PUBLIC_THREAD,
    CHANNEL_TYPES.PRIVATE_THREAD
]);

const DEFAULT_SETTINGS = {
    enabled: false,
    panelWidth: 352,
    keepOpenOnNavigate: true,
    showReadChannels: true,
    includeVoiceChannels: false,
    activeView: "desk",
    query: "",
    collapsedSections: {},
    ticketTerms: [
        "member-ticket",
        "member tickets",
        "open tickets",
        "wmsy tickets",
        "loa-members",
        "loa members",
        "non-members",
        "non members"
    ].join("\n"),
    applicationTerms: [
        "apply",
        "application",
        "applications",
        "cold apply",
        "cold-apply"
    ].join("\n"),
    ticketIgnoreTerms: [
        "ticket-logs",
        "ticket logs",
        "ticket-vote",
        "ticket vote",
        "transcripts"
    ].join("\n")
};

const CSS = `
#officer-mode-host,
#officer-mode-host * {
    box-sizing: border-box;
}

.om-toggle {
    position: fixed;
    left: 86px;
    top: 50px;
    z-index: 10010;
    height: 30px;
    min-width: 92px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    background: var(--background-floating, #18191c);
    color: var(--text-normal, #dbdee1);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.om-toggle:hover {
    background: var(--background-modifier-hover, #35373c);
}

.om-toggle.is-active {
    border-color: rgba(88, 101, 242, 0.65);
    color: #fff;
    background: #5865f2;
}

.om-toggle.is-toolbar {
    position: static;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    min-width: 24px;
    height: 24px;
    margin: 0 2px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    box-shadow: none;
    color: var(--interactive-normal, #b5bac1);
}

.om-toggle.is-toolbar:hover {
    background: transparent;
    color: var(--interactive-hover, #fff);
}

.om-toggle.is-toolbar.is-active {
    background: transparent;
    color: var(--interactive-active, #fff);
}

.om-toggle.is-toolbar svg {
    width: 20px;
    height: 20px;
    display: block;
}

.om-toggle.is-floating {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 11px;
}

.om-panel {
    --om-panel-width: 352px;
    --om-panel-left: 72px;
    --om-panel-top: 32px;
    --om-panel-bottom: 52px;
    position: fixed;
    left: var(--om-panel-left);
    top: var(--om-panel-top);
    bottom: var(--om-panel-bottom);
    z-index: 10005;
    display: flex;
    flex-direction: column;
    width: var(--om-panel-width);
    min-width: 292px;
    max-width: min(480px, calc(100vw - var(--om-panel-left)));
    overflow: hidden;
    border-right: 1px solid var(--background-modifier-accent, rgba(255, 255, 255, 0.08));
    border-radius: 0;
    background: var(--background-secondary, #2b2d31);
    color: var(--text-normal, #dbdee1);
    box-shadow: none;
}

.om-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--background-modifier-accent, rgba(255, 255, 255, 0.08));
    background: var(--background-secondary-alt, #232428);
}

.om-title {
    min-width: 0;
    flex: 1 1 auto;
}

.om-title-main {
    overflow: hidden;
    color: var(--header-primary, #f2f3f5);
    font-size: 14px;
    font-weight: 800;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.om-title-sub {
    overflow: hidden;
    color: var(--text-muted, #949ba4);
    font-size: 11px;
    font-weight: 600;
    line-height: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.om-icon-button {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--interactive-normal, #b5bac1);
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
}

.om-icon-button:hover {
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.08));
    color: var(--interactive-hover, #fff);
}

.om-icon-button:disabled {
    opacity: 0.55;
    cursor: wait;
}

.om-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid var(--background-modifier-accent, rgba(255, 255, 255, 0.08));
}

.om-search {
    width: 100%;
    height: 32px;
    border: 1px solid transparent;
    border-radius: 6px;
    outline: none;
    background: var(--background-tertiary, #1e1f22);
    color: var(--text-normal, #dbdee1);
    font-size: 13px;
    line-height: 32px;
    padding: 0 10px;
}

.om-search:focus {
    border-color: rgba(88, 101, 242, 0.65);
}

.om-tabs,
.om-filter-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.om-tabs {
    overflow-x: auto;
    scrollbar-width: thin;
}

.om-tab,
.om-filter-button {
    height: 28px;
    min-width: 0;
    flex: 0 0 auto;
    border: 0;
    border-radius: 6px;
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.06));
    color: var(--interactive-normal, #b5bac1);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    padding: 0 10px;
    cursor: pointer;
}

.om-tab:hover,
.om-filter-button:hover {
    color: var(--interactive-hover, #fff);
    background: var(--background-modifier-selected, rgba(255, 255, 255, 0.1));
}

.om-tab.is-active,
.om-filter-button.is-active {
    color: #fff;
    background: #5865f2;
}

.om-filter-button {
    margin-left: auto;
}

.om-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
}

.om-stat {
    min-width: 0;
    border-radius: 6px;
    background: var(--background-tertiary, #1e1f22);
    padding: 7px 8px;
}

.om-stat-number {
    color: var(--header-primary, #f2f3f5);
    font-size: 15px;
    font-weight: 800;
    line-height: 18px;
}

.om-stat-label {
    overflow: hidden;
    color: var(--text-muted, #949ba4);
    font-size: 10px;
    font-weight: 700;
    line-height: 13px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
}

.om-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 8px 8px 14px;
    scrollbar-width: thin;
}

.om-section {
    margin-bottom: 10px;
}

.om-section-header {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--channels-default, #949ba4);
    cursor: pointer;
    padding: 0 6px;
    text-align: left;
}

.om-section-header:hover {
    color: var(--interactive-hover, #fff);
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.06));
}

.om-section-chevron {
    flex: 0 0 16px;
    width: 16px;
    color: inherit;
    font-size: 11px;
    font-weight: 800;
}

.om-section-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0;
    line-height: 16px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
}

.om-section-count {
    flex: 0 0 auto;
    color: inherit;
    font-size: 11px;
    font-weight: 800;
    line-height: 16px;
}

.om-group {
    margin: 4px 0 8px;
}

.om-group-title {
    overflow: hidden;
    color: var(--text-muted, #949ba4);
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    padding: 2px 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.om-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--channels-default, #949ba4);
    cursor: pointer;
    padding: 5px 8px;
    text-align: left;
}

.om-row:hover {
    color: var(--interactive-hover, #fff);
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.06));
}

.om-row.is-active {
    color: var(--interactive-active, #fff);
    background: var(--background-modifier-selected, rgba(255, 255, 255, 0.12));
}

.om-row.has-unread .om-channel-name {
    color: var(--interactive-active, #fff);
    font-weight: 800;
}

.om-row-main {
    min-width: 0;
}

.om-channel-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.om-channel-prefix {
    flex: 0 0 auto;
    color: var(--text-muted, #949ba4);
    font-size: 16px;
    font-weight: 700;
    line-height: 18px;
}

.om-channel-name {
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: 14px;
    font-weight: 600;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.om-channel-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-left: 20px;
    color: var(--text-muted, #949ba4);
    font-size: 11px;
    font-weight: 600;
    line-height: 15px;
}

.om-channel-category {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.om-badges {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
}

.om-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    padding: 0 6px;
    color: #fff;
    background: var(--status-danger, #da373c);
    font-size: 11px;
    font-weight: 800;
    line-height: 18px;
}

.om-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #23a55a;
}

.om-empty {
    color: var(--text-muted, #949ba4);
    font-size: 13px;
    line-height: 18px;
    padding: 10px 8px 14px;
}

.om-settings {
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: var(--text-normal, #dbdee1);
    padding: 8px 0;
}

.om-setting {
    display: grid;
    gap: 6px;
}

.om-setting-label {
    color: var(--header-primary, #f2f3f5);
    font-size: 14px;
    font-weight: 800;
}

.om-setting-note {
    color: var(--text-muted, #949ba4);
    font-size: 12px;
    line-height: 17px;
}

.om-setting input[type="text"],
.om-setting input[type="number"],
.om-setting textarea {
    width: 100%;
    border: 1px solid var(--background-modifier-accent, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    outline: none;
    background: var(--input-background, #1e1f22);
    color: var(--text-normal, #dbdee1);
    font: inherit;
    padding: 8px 10px;
}

.om-setting textarea {
    min-height: 94px;
    resize: vertical;
}

.om-setting input:focus,
.om-setting textarea:focus {
    border-color: rgba(88, 101, 242, 0.65);
}

.om-checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
`;

function copySettings(settings) {
    return Object.assign({}, DEFAULT_SETTINGS, settings || {}, {
        collapsedSections: Object.assign({}, DEFAULT_SETTINGS.collapsedSections, settings?.collapsedSections || {})
    });
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
}

function getOfficerIcon() {
    return [
        '<svg viewBox="0 0 24 24" aria-hidden="true">',
        '<path d="M12 3l7 3v5c0 4.5-2.8 8.4-7 10-4.2-1.6-7-5.5-7-10V6l7-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
        '<path d="M9 12l2 2 4-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
        '</svg>'
    ].join("");
}

function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeRoutePath(href) {
    if (!href) return "";
    try {
        const url = new URL(href, location.origin);
        return `${url.pathname}${url.search}${url.hash}`;
    }
    catch (_) {
        const match = String(href).match(/\/channels\/[^ "'<>]+/);
        return match?.[0] || "";
    }
}

function parseTerms(value) {
    return String(value || "")
        .split(/[\n,]/)
        .map(term => term.trim())
        .filter(Boolean);
}

function textMatchesTerms(text, terms) {
    const rawText = String(text || "").toLowerCase();
    const normalizedText = normalize(text);
    return terms.some(term => {
        const rawTerm = term.toLowerCase();
        const normalizedTerm = normalize(term);
        return (rawTerm && rawText.includes(rawTerm)) || (normalizedTerm && normalizedText.includes(normalizedTerm));
    });
}

function debounce(callback, wait) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => callback(...args), wait);
    };
}

function safeCall(target, method, ...args) {
    if (!target || typeof target[method] !== "function") return undefined;
    try {
        return target[method].call(target, ...args);
    }
    catch (_) {
        return undefined;
    }
}

function toArrayDeep(value, output = [], seen = new Set(), depth = 0) {
    if (!value || output.length > 1200 || depth > 5) return output;
    if (Array.isArray(value)) {
        for (const item of value) toArrayDeep(item, output, seen, depth + 1);
        return output;
    }
    if (value instanceof Map) {
        for (const item of value.values()) toArrayDeep(item, output, seen, depth + 1);
        return output;
    }
    if (typeof value !== "object") return output;
    if (seen.has(value)) return output;
    seen.add(value);
    if (value.channel) {
        toArrayDeep(value.channel, output, seen, depth + 1);
        return output;
    }
    if (value.id && (value.name || value.type !== undefined)) {
        output.push(value);
        return output;
    }
    const directValues = Object.values(value);
    for (const item of directValues.slice(0, 2000)) {
        toArrayDeep(item, output, seen, depth + 1);
        if (output.length > 1200) break;
    }
    for (const key of ["channels", "guildChannels", "selectable", "vocal", "threads", "activeThreads", "joinedThreads", "_array"]) {
        if (value[key]) toArrayDeep(value[key], output, seen, depth + 1);
    }
    return output;
}

function toMessageArray(value, output = [], seen = new Set(), depth = 0) {
    if (!value || output.length > 1500 || depth > 5) return output;
    if (Array.isArray(value)) {
        for (const item of value) toMessageArray(item, output, seen, depth + 1);
        return output;
    }
    if (value instanceof Map || value instanceof Set) {
        value.forEach(item => toMessageArray(item, output, seen, depth + 1));
        return output;
    }
    if (typeof value !== "object") return output;
    if (seen.has(value)) return output;
    seen.add(value);

    if (typeof value.toArray === "function") {
        try {
            toMessageArray(value.toArray(), output, seen, depth + 1);
        }
        catch (_) {}
    }

    if (value.id && (value.content !== undefined || value.embeds !== undefined || value.timestamp !== undefined)) {
        output.push(value);
        return output;
    }

    for (const key of ["_array", "array", "messages", "items", "records", "_map", "map", "cache"]) {
        if (value[key]) toMessageArray(value[key], output, seen, depth + 1);
    }
    return output;
}

function collectSnowflakeIds(value, output = new Set(), seen = new Set(), depth = 0) {
    if (!value || output.size > 1200 || depth > 5) return output;
    if (typeof value === "string") {
        if (/^\d{14,24}$/.test(value)) output.add(value);
        return output;
    }
    if (typeof value !== "object") return output;
    if (seen.has(value)) return output;
    seen.add(value);

    if (Array.isArray(value)) {
        value.forEach(item => collectSnowflakeIds(item, output, seen, depth + 1));
        return output;
    }
    if (value instanceof Map || value instanceof Set) {
        value.forEach(item => collectSnowflakeIds(item, output, seen, depth + 1));
        return output;
    }

    for (const key of ["ids", "threadIds", "channels", "threads", "activeThreads", "joinedThreads", "_array"]) {
        if (value[key]) collectSnowflakeIds(value[key], output, seen, depth + 1);
    }
    return output;
}

function snowflakeToTimestamp(id) {
    if (!id) return 0;
    try {
        return Number((BigInt(String(id)) >> 22n) + DISCORD_EPOCH);
    }
    catch (_) {
        return 0;
    }
}

function timestampToSnowflake(timestamp) {
    try {
        return String((BigInt(Math.max(0, Number(timestamp) || 0)) - DISCORD_EPOCH) << 22n);
    }
    catch (_) {
        return "";
    }
}

function timestampFromMessage(message) {
    if (!message) return 0;
    const timestamp = message.timestamp || message.editedTimestamp;
    if (!timestamp) return snowflakeToTimestamp(message.id);
    if (typeof timestamp === "number") return timestamp;
    if (timestamp instanceof Date) return timestamp.getTime();
    if (typeof timestamp.valueOf === "function") {
        const value = timestamp.valueOf();
        if (Number.isFinite(value)) return value;
    }
    const parsed = Date.parse(String(timestamp));
    return Number.isFinite(parsed) ? parsed : snowflakeToTimestamp(message.id);
}

function formatAge(timestamp) {
    if (!timestamp) return "";
    const diff = Math.max(0, Date.now() - timestamp);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return "now";
    if (diff < hour) return `${Math.floor(diff / minute)}m`;
    if (diff < day) return `${Math.floor(diff / hour)}h`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
    return new Date(timestamp).toLocaleDateString(undefined, {month: "short", day: "numeric"});
}

function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes || !parts.length) parts.push(`${minutes}m`);
    return parts.join(" ");
}

function compareByActivity(a, b) {
    if (b.mentions !== a.mentions) return b.mentions - a.mentions;
    if (Number(b.unread) !== Number(a.unread)) return Number(b.unread) - Number(a.unread);
    if (b.lastTimestamp !== a.lastTimestamp) return b.lastTimestamp - a.lastTimestamp;
    return compareByPosition(a, b);
}

function compareByPosition(a, b) {
    if (a.categoryPosition !== b.categoryPosition) return a.categoryPosition - b.categoryPosition;
    if (a.position !== b.position) return a.position - b.position;
    return a.name.localeCompare(b.name);
}

function cleanLogText(value) {
    return String(value || "")
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n?/g, "\n");
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = class OfficerMode {
    constructor() {
        this.settings = copySettings();
        this.host = null;
        this.toggleButton = null;
        this.panel = null;
        this.routeHints = new Map();
        this.scrollPositions = new Map();
        this.fetchedThreads = new Map();
        this.threadFetches = new Map();
        this.stores = {};
        this.modules = {};
        this.unsubscribe = [];
        this.interval = null;
        this.shareScanRunning = false;
        this.onStoreChange = debounce(() => {
            if (this.settings.enabled) this.render();
            else this.renderToggle();
        }, 700);
        this.onResize = debounce(() => this.updatePanelBounds(), 120);
        this.onKeyDown = this.handleKeyDown.bind(this);
    }

    start() {
        this.settings = copySettings(BdApi.Data.load(PLUGIN_NAME, SETTINGS_KEY));
        if (this.settings.enabled) {
            this.settings.enabled = false;
            this.saveSettings();
        }
        this.resolveModules();
        BdApi.DOM.addStyle(STYLE_ID, CSS);
        this.mount();
        this.subscribeToStores();
        this.interval = setInterval(() => {
            if (this.settings.enabled) this.render();
        }, 60000);
        document.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("resize", this.onResize);
        this.render();
    }

    stop() {
        document.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("resize", this.onResize);
        clearInterval(this.interval);
        this.interval = null;
        this.unsubscribeFromStores();
        this.unmount();
        BdApi.DOM.removeStyle(STYLE_ID);
    }

    onSwitch() {
        this.resolveModules();
        this.render();
    }

    observer() {
        if (!this.host || !document.body.contains(this.host)) {
            this.mount();
        }
    }

    getSettingsPanel() {
        const root = createElement("div", "om-settings");

        root.append(
            this.createCheckboxSetting(
                "Keep Officer Mode open after navigation",
                "When this is off, opening a channel closes the officer desk.",
                "keepOpenOnNavigate"
            ),
            this.createCheckboxSetting(
                "Show read channels",
                "Turn this off to make the desk focus on channels with unread activity.",
                "showReadChannels"
            ),
            this.createCheckboxSetting(
                "Include voice and stage channels",
                "Usually this should stay off for ticket management.",
                "includeVoiceChannels"
            ),
            this.createNumberSetting(
                "Panel width",
                "Width in pixels. The panel still respects the current Discord window size.",
                "panelWidth",
                292,
                480
            ),
            this.createTextareaSetting(
                "Ticket terms",
                "One term per line. A channel is treated as a ticket if the channel or category name contains one of these.",
                "ticketTerms"
            ),
            this.createTextareaSetting(
                "Application terms",
                "One term per line. A channel is treated as an application if the channel or category name contains one of these.",
                "applicationTerms"
            ),
            this.createTextareaSetting(
                "Ticket ignore terms",
                "One term per line. These prevent log and transcript channels from being grouped with live tickets.",
                "ticketIgnoreTerms"
            )
        );

        return root;
    }

    createCheckboxSetting(label, note, key) {
        const wrap = createElement("label", "om-setting om-checkbox-row");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(this.settings[key]);
        const textWrap = createElement("span");
        const labelNode = createElement("div", "om-setting-label", label);
        const noteNode = createElement("div", "om-setting-note", note);
        textWrap.append(labelNode, noteNode);
        input.addEventListener("change", () => {
            this.settings[key] = input.checked;
            this.saveSettings();
            this.render();
        });
        wrap.append(input, textWrap);
        return wrap;
    }

    createNumberSetting(label, note, key, min, max) {
        const wrap = createElement("div", "om-setting");
        const labelNode = createElement("div", "om-setting-label", label);
        const noteNode = createElement("div", "om-setting-note", note);
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.value = String(this.settings[key]);
        input.addEventListener("change", () => {
            const value = Math.max(min, Math.min(max, Number(input.value) || DEFAULT_SETTINGS[key]));
            this.settings[key] = value;
            input.value = String(value);
            this.saveSettings();
            this.render();
        });
        wrap.append(labelNode, noteNode, input);
        return wrap;
    }

    createTextareaSetting(label, note, key) {
        const wrap = createElement("label", "om-setting");
        const labelNode = createElement("div", "om-setting-label", label);
        const noteNode = createElement("div", "om-setting-note", note);
        const textarea = document.createElement("textarea");
        textarea.value = this.settings[key] || "";
        textarea.addEventListener("change", () => {
            this.settings[key] = textarea.value;
            this.saveSettings();
            this.render();
        });
        wrap.append(labelNode, noteNode, textarea);
        return wrap;
    }

    handleKeyDown(event) {
        if (event.ctrlKey && event.shiftKey && event.key?.toLowerCase() === "o") {
            event.preventDefault();
            this.setEnabled(!this.settings.enabled);
        }
    }

    saveSettings() {
        BdApi.Data.save(PLUGIN_NAME, SETTINGS_KEY, this.settings);
    }

    resolveModules() {
        const Webpack = BdApi.Webpack;
        const getStore = name => {
            try {
                return Webpack.getStore?.(name) || Webpack.Stores?.[name] || null;
            }
            catch (_) {
                return null;
            }
        };

        this.stores = {
            SelectedGuildStore: getStore("SelectedGuildStore"),
            GuildChannelStore: getStore("GuildChannelStore"),
            ChannelStore: getStore("ChannelStore"),
            SelectedChannelStore: getStore("SelectedChannelStore"),
            ThreadStore: getStore("ThreadStore"),
            ActiveThreadsStore: getStore("ActiveThreadsStore"),
            ActiveJoinedThreadsStore: getStore("ActiveJoinedThreadsStore"),
            ArchivedThreadsStore: getStore("ArchivedThreadsStore"),
            ReadStateStore: getStore("ReadStateStore"),
            GuildReadStateStore: getStore("GuildReadStateStore"),
            MessageStore: getStore("MessageStore")
        };

        const findByKeys = (...args) => {
            try {
                return Webpack.getByKeys?.(...args, {searchExports: true}) || null;
            }
            catch (_) {
                return null;
            }
        };
        const findByStrings = (...strings) => {
            try {
                const filter = Webpack.Filters?.byStrings?.(...strings);
                if (!filter || typeof Webpack.getModule !== "function") return null;
                return Webpack.getModule(filter, {searchExports: true}) || null;
            }
            catch (_) {
                return null;
            }
        };

        this.modules = {
            HTTP: findByKeys("get", "post", "put", "patch", "del") || findByKeys("get", "post", "del"),
            Auth: findByKeys("getToken"),
            NavigationTransition: findByStrings("transitionTo - Transitioning to "),
            NavigationGuildTransition: findByKeys("transitionToGuildSync")?.transitionToGuildSync || null,
            Router: findByKeys("transitionTo", "replaceWith") || findByKeys("transitionToGuild"),
            ChannelActions: findByKeys("selectChannel", "selectVoiceChannel") || findByKeys("selectChannel"),
            MessageActions: findByKeys("fetchMessages", "sendMessage")
                || findByKeys("fetchMessages")
                || findByKeys("loadMessages")
                || findByStrings("fetchMessages")
        };
    }

    subscribeToStores() {
        this.unsubscribeFromStores();
        const seen = new Set();
        for (const [storeName, store] of Object.entries(this.stores)) {
            if (storeName === "MessageStore") continue;
            if (!store || seen.has(store)) continue;
            seen.add(store);
            if (typeof store.addChangeListener !== "function" || typeof store.removeChangeListener !== "function") continue;
            try {
                store.addChangeListener(this.onStoreChange);
                this.unsubscribe.push(() => store.removeChangeListener(this.onStoreChange));
            }
            catch (_) {}
        }
    }

    unsubscribeFromStores() {
        for (const remove of this.unsubscribe.splice(0)) {
            try {
                remove();
            }
            catch (_) {}
        }
    }

    mount() {
        if (this.host && document.body.contains(this.host)) return;
        this.unmount();
        this.host = createElement("div");
        this.host.id = "officer-mode-host";
        document.body.append(this.host);
    }

    unmount() {
        this.panel = null;
        this.toggleButton?.remove();
        this.toggleButton = null;
        this.host?.remove();
        this.host = null;
    }

    setEnabled(enabled) {
        this.settings.enabled = enabled;
        this.saveSettings();
        this.render();
    }

    render() {
        if (!this.host) this.mount();
        if (!this.host) return;
        const activeElement = document.activeElement;
        const restoreSearch = activeElement?.classList?.contains("om-search");
        const selectionStart = restoreSearch ? activeElement.selectionStart : null;
        const selectionEnd = restoreSearch ? activeElement.selectionEnd : null;

        this.renderToggle();

        if (!this.settings.enabled) {
            this.panel?.remove();
            this.panel = null;
            return;
        }

        this.renderPanel();

        if (restoreSearch) {
            requestAnimationFrame(() => {
                const search = this.panel?.querySelector(".om-search");
                if (!search) return;
                search.focus();
                if (selectionStart !== null && selectionEnd !== null) search.setSelectionRange(selectionStart, selectionEnd);
            });
        }
    }

    renderToggle() {
        if (!this.toggleButton) {
            this.toggleButton = createElement("button", "om-toggle");
            this.toggleButton.type = "button";
            this.toggleButton.title = "Toggle Officer Mode (Ctrl+Shift+O)";
            this.toggleButton.setAttribute("aria-label", "Toggle Officer Mode");
            this.toggleButton.addEventListener("click", () => this.setEnabled(!this.settings.enabled));
        }

        const toolbar = this.getToolbarTarget();
        const useToolbar = Boolean(toolbar);
        const target = toolbar || this.host;
        if (target && this.toggleButton.parentElement !== target) {
            if (useToolbar) target.insertBefore(this.toggleButton, target.firstElementChild);
            else target.append(this.toggleButton);
        }

        this.toggleButton.classList.toggle("is-toolbar", useToolbar);
        this.toggleButton.classList.toggle("is-floating", !useToolbar);
        this.toggleButton.classList.toggle("is-active", Boolean(this.settings.enabled));
        if (useToolbar) this.toggleButton.innerHTML = getOfficerIcon();
        else this.toggleButton.textContent = this.settings.enabled ? "Officer On" : "Officer";
    }

    getToolbarTarget() {
        const labels = [
            "Threads",
            "Notification Settings",
            "Pinned Messages",
            "Member List",
            "Show Member List",
            "Hide Member List"
        ];

        for (const label of labels) {
            const control = document.querySelector(`[aria-label="${label}"], [title="${label}"]`);
            const toolbar = control?.closest?.('[class*="toolbar"], [class*="Toolbar"]');
            if (toolbar) return toolbar;
            if (control?.parentElement?.children?.length > 2) return control.parentElement;
        }

        return null;
    }

    updatePanelBounds() {
        if (!this.panel) return;

        const sidebar = this.getChannelSidebarElement();
        const accountPanel = document.querySelector('[class*="panels_"], [class*="accountProfile"]');
        const sidebarRect = sidebar?.getBoundingClientRect?.();
        const accountRect = accountPanel?.getBoundingClientRect?.();

        const left = Math.max(0, Math.round(sidebarRect?.left ?? 72));
        const top = Math.max(0, Math.round(sidebarRect?.top ?? 32));
        const bottom = Math.max(0, Math.round(accountRect ? window.innerHeight - accountRect.top : 52));

        this.panel.style.setProperty("--om-panel-left", `${left}px`);
        this.panel.style.setProperty("--om-panel-top", `${top}px`);
        this.panel.style.setProperty("--om-panel-bottom", `${bottom}px`);
    }

    getChannelSidebarElement() {
        return document.querySelector('nav[aria-label*="channel" i]')
            || document.querySelector('[class*="sidebarList"]')
            || document.querySelector('[class*="sidebar_"]');
    }

    renderPanel() {
        if (!this.panel) {
            this.panel = createElement("aside", "om-panel");
            this.host.append(this.panel);
        }

        this.captureBodyScroll();
        const scrollKey = this.getScrollKey();
        this.updatePanelBounds();
        this.panel.style.setProperty("--om-panel-width", `${this.settings.panelWidth}px`);
        this.panel.replaceChildren();

        const data = this.getDeskData();
        const body = this.renderBody(data);
        this.panel.append(
            this.renderHeader(data),
            this.renderControls(data),
            body
        );

        requestAnimationFrame(() => {
            const savedScroll = this.scrollPositions.get(scrollKey);
            if (Number.isFinite(savedScroll)) body.scrollTop = savedScroll;
        });
    }

    getScrollKey() {
        return [
            this.getGuildId() || "no-guild",
            this.settings.activeView || "desk",
            this.settings.showReadChannels ? "all" : "unread",
            normalize(this.settings.query)
        ].join("|");
    }

    captureBodyScroll() {
        const body = this.panel?.querySelector?.(".om-body");
        if (!body) return;
        this.scrollPositions.set(this.getScrollKey(), body.scrollTop);
    }

    renderHeader(data) {
        const header = createElement("div", "om-header");
        const title = createElement("div", "om-title");
        const main = createElement("div", "om-title-main", "Officer Desk");
        const sub = createElement("div", "om-title-sub", data.guildName || "Current server");
        title.append(main, sub);

        const refresh = createElement("button", "om-icon-button", "R");
        refresh.type = "button";
        refresh.title = "Refresh";
        refresh.addEventListener("click", () => {
            this.resolveModules();
            this.subscribeToStores();
            this.render();
        });

        const shareScan = createElement("button", "om-icon-button", this.shareScanRunning ? "..." : "S");
        shareScan.type = "button";
        shareScan.title = "Scan Roblox share logs";
        shareScan.disabled = this.shareScanRunning;
        shareScan.addEventListener("click", () => this.runRobloxShareScan());

        const close = createElement("button", "om-icon-button", "X");
        close.type = "button";
        close.title = "Close Officer Mode";
        close.addEventListener("click", () => this.setEnabled(false));

        header.append(title, shareScan, refresh, close);
        return header;
    }

    renderControls(data) {
        const controls = createElement("div", "om-controls");
        controls.append(this.renderStats(data));

        const search = document.createElement("input");
        search.className = "om-search";
        search.type = "search";
        search.placeholder = "Search channels";
        search.value = this.settings.query || "";
        search.addEventListener("input", () => {
            this.settings.query = search.value;
            this.saveSettings();
            this.render();
        });

        const tabs = createElement("div", "om-tabs");
        [
            ["desk", "Desk"],
            ["active", "Active"],
            ["tickets", "Tickets"],
            ["apps", "Apps"],
            ["other", "Other"]
        ].forEach(([id, label]) => {
            const tab = createElement("button", "om-tab", label);
            tab.type = "button";
            tab.classList.toggle("is-active", this.settings.activeView === id);
            tab.addEventListener("click", () => {
                this.settings.activeView = id;
                this.saveSettings();
                this.render();
            });
            tabs.append(tab);
        });

        const filterRow = createElement("div", "om-filter-row");
        const showRead = createElement("button", "om-filter-button", this.settings.showReadChannels ? "All" : "Unread");
        showRead.type = "button";
        showRead.title = "Toggle read channels";
        showRead.classList.toggle("is-active", !this.settings.showReadChannels);
        showRead.addEventListener("click", () => {
            this.settings.showReadChannels = !this.settings.showReadChannels;
            this.saveSettings();
            this.render();
        });
        filterRow.append(search, showRead);

        controls.append(tabs, filterRow);
        return controls;
    }

    renderStats(data) {
        const stats = createElement("div", "om-stats");
        [
            [data.attention.length, "Active"],
            [data.tickets.length, "Tickets"],
            [data.apps.length, "Apps"]
        ].forEach(([number, label]) => {
            const stat = createElement("div", "om-stat");
            stat.append(
                createElement("div", "om-stat-number", number),
                createElement("div", "om-stat-label", label)
            );
            stats.append(stat);
        });
        return stats;
    }

    renderBody(data) {
        const body = createElement("div", "om-body");
        const scrollKey = this.getScrollKey();
        body.addEventListener("scroll", () => {
            this.scrollPositions.set(scrollKey, body.scrollTop);
        }, {passive: true});
        const sections = [];

        if (this.settings.activeView === "desk" || this.settings.activeView === "active") {
            sections.push(["attention", "Needs attention", data.attention, true]);
        }
        if (this.settings.activeView === "desk" || this.settings.activeView === "tickets") {
            sections.push(["tickets", "Member tickets", data.tickets, false]);
        }
        if (this.settings.activeView === "desk" || this.settings.activeView === "apps") {
            sections.push(["apps", "Applications", data.apps, false]);
        }
        if (this.settings.activeView === "desk" || this.settings.activeView === "other") {
            sections.push(["remaining", "Other channels", data.remaining, false]);
        }

        let renderedAny = false;
        for (const [id, title, items, sortByActivity] of sections) {
            const section = this.renderSection(id, title, items, sortByActivity);
            if (section) {
                renderedAny = true;
                body.append(section);
            }
        }

        if (!renderedAny) {
            body.append(createElement("div", "om-empty", data.guildId ? "No matching channels found." : "Select a server to load channels."));
        }

        return body;
    }

    renderSection(id, title, items, sortByActivity) {
        const visibleItems = this.settings.showReadChannels ? items : items.filter(item => item.unread || item.mentions > 0);
        if (!visibleItems.length && this.settings.activeView !== "desk") return null;

        const section = createElement("section", "om-section");
        const collapsed = Boolean(this.settings.collapsedSections[id]);
        const header = createElement("button", "om-section-header");
        header.type = "button";
        header.addEventListener("click", () => {
            this.settings.collapsedSections[id] = !collapsed;
            this.saveSettings();
            this.render();
        });

        header.append(
            createElement("span", "om-section-chevron", collapsed ? ">" : "v"),
            createElement("span", "om-section-title", title),
            createElement("span", "om-section-count", visibleItems.length)
        );
        section.append(header);

        if (collapsed) return section;

        if (!visibleItems.length) {
            section.append(createElement("div", "om-empty", "Nothing needs attention right now."));
            return section;
        }

        if (sortByActivity) {
            const group = createElement("div", "om-group");
            visibleItems.slice().sort(compareByActivity).forEach(item => group.append(this.renderChannelRow(item)));
            section.append(group);
            return section;
        }

        for (const group of this.groupByCategory(visibleItems)) {
            const groupNode = createElement("div", "om-group");
            groupNode.append(createElement("div", "om-group-title", group.name));
            group.items.forEach(item => groupNode.append(this.renderChannelRow(item)));
            section.append(groupNode);
        }

        return section;
    }

    renderChannelRow(item) {
        const row = createElement("button", "om-row");
        row.type = "button";
        row.classList.toggle("has-unread", Boolean(item.unread || item.mentions));
        row.classList.toggle("is-active", item.id === this.getSelectedChannelId());
        row.title = `${item.categoryName} / ${item.name}`;
        row.addEventListener("click", () => this.openChannel(item));

        const main = createElement("div", "om-row-main");
        const line = createElement("div", "om-channel-line");
        line.append(
            createElement("span", "om-channel-prefix", item.prefix),
            createElement("span", "om-channel-name", item.name)
        );

        const meta = createElement("div", "om-channel-meta");
        meta.append(createElement("span", "om-channel-category", item.categoryName));
        if (item.ageLabel) meta.append(createElement("span", null, item.ageLabel));
        main.append(line, meta);

        const badges = createElement("div", "om-badges");
        if (item.mentions > 0) badges.append(createElement("span", "om-badge", item.mentions));
        else if (item.unread) badges.append(createElement("span", "om-dot"));

        row.append(main, badges);
        return row;
    }

    groupByCategory(items) {
        const groups = new Map();
        for (const item of items.slice().sort(compareByPosition)) {
            const key = item.categoryId || "uncategorized";
            if (!groups.has(key)) {
                groups.set(key, {
                    name: item.categoryName || "No category",
                    position: item.categoryPosition,
                    items: []
                });
            }
            groups.get(key).items.push(item);
        }

        return Array.from(groups.values()).sort((a, b) => {
            if (a.position !== b.position) return a.position - b.position;
            return a.name.localeCompare(b.name);
        });
    }

    getDeskData() {
        const guildId = this.getGuildId();
        const guildName = this.getGuildName(guildId);
        const query = normalize(this.settings.query);
        const tickets = [];
        const apps = [];
        const remaining = [];
        const ticketTerms = parseTerms(this.settings.ticketTerms);
        const appTerms = parseTerms(this.settings.applicationTerms);
        const ticketIgnoreTerms = parseTerms(this.settings.ticketIgnoreTerms);
        const threadParentTerms = appTerms.concat(ticketTerms);

        const guildChannels = this.getGuildChannels(guildId, threadParentTerms, appTerms);
        const threadParentIds = new Set(
            guildChannels
                .filter(channel => this.isThreadChannel(channel))
                .map(channel => channel.parent_id || channel.parentId)
                .filter(Boolean)
        );

        for (const channel of guildChannels) {
            if (!this.isUsableChannel(channel)) continue;
            const item = this.makeChannelItem(channel);
            const matchText = `${item.name} ${item.parentChannelName} ${item.categoryName}`;
            if (query && !normalize(matchText).includes(query)) continue;

            const appParentText = `${item.parentChannelName} ${item.categoryName}`;
            const isAppThread = this.isThreadChannel(channel) && textMatchesTerms(appParentText, appTerms);
            const isStandaloneAppChannel = !this.isThreadChannel(channel)
                && textMatchesTerms(item.name, appTerms)
                && !threadParentIds.has(channel.id);

            if (isAppThread || isStandaloneAppChannel) {
                item.kind = "app";
                apps.push(item);
            }
            else if (textMatchesTerms(matchText, ticketTerms) && !textMatchesTerms(matchText, ticketIgnoreTerms)) {
                item.kind = "ticket";
                tickets.push(item);
            }
            else {
                item.kind = "other";
                remaining.push(item);
            }
        }

        tickets.sort(compareByActivity);
        apps.sort(compareByActivity);
        remaining.sort(compareByPosition);

        return {
            guildId,
            guildName,
            tickets,
            apps,
            remaining,
            attention: tickets.concat(apps).filter(item => item.unread || item.mentions > 0).sort(compareByActivity)
        };
    }

    getGuildId() {
        const selected = safeCall(this.stores.SelectedGuildStore, "getGuildId");
        if (selected) return selected;

        const route = `${location.pathname || ""}${location.hash || ""}`;
        const match = route.match(/\/channels\/(\d+)/);
        return match?.[1] || null;
    }

    getSelectedChannelId() {
        const route = `${location.pathname || ""}${location.hash || ""}`;
        const match = route.match(/\/channels\/\d+\/(\d+)/);
        return match?.[1] || null;
    }

    getGuildName(guildId) {
        if (!guildId) return "";
        const GuildStore = (() => {
            try {
                return BdApi.Webpack.getStore?.("GuildStore") || BdApi.Webpack.Stores?.GuildStore || null;
            }
            catch (_) {
                return null;
            }
        })();
        const guild = safeCall(GuildStore, "getGuild", guildId);
        return guild?.name || "";
    }

    getGuildChannels(guildId, threadParentTerms = [], appTerms = []) {
        if (!guildId) return [];

        const channels = new Map();
        this.routeHints.clear();
        const addChannel = channel => {
            const channelGuildId = this.getChannelGuildId(channel);
            if (channel?.id && (!channelGuildId || channelGuildId === guildId)) channels.set(channel.id, channel);
        };
        const addCollection = value => {
            for (const channel of toArrayDeep(value)) {
                addChannel(channel);
            }
        };
        const addChannelIds = value => {
            for (const id of collectSnowflakeIds(value)) {
                addChannel(safeCall(this.stores.ChannelStore, "getChannel", id));
            }
        };
        const addThreadSource = value => {
            addCollection(value);
            addChannelIds(value);
        };

        addCollection(safeCall(this.stores.GuildChannelStore, "getChannels", guildId));
        addCollection(safeCall(this.stores.ChannelStore, "getMutableGuildChannelsForGuild", guildId));
        addCollection(safeCall(this.stores.ChannelStore, "getGuildChannels", guildId));
        addCollection(this.getVisibleChannelListChannels(guildId));
        this.addCachedFetchedThreads(guildId, addChannel);
        addThreadSource(safeCall(this.stores.ActiveThreadsStore, "getThreadsForGuild", guildId));
        addThreadSource(safeCall(this.stores.ActiveJoinedThreadsStore, "getActiveJoinedThreadsForGuild", guildId));
        addThreadSource(safeCall(this.stores.ActiveJoinedThreadsStore, "getActiveUnjoinedThreadsForGuild", guildId));
        addThreadSource(safeCall(this.stores.ActiveJoinedThreadsStore, "getActiveJoinedRelevantThreadsForGuild", guildId));
        this.ensureGuildActiveThreadsLoaded(guildId);

        const possibleThreadParents = Array.from(channels.values())
            .filter(channel => this.canHaveThreads(channel))
            .filter(channel => textMatchesTerms(`${channel.name} ${this.getCategory(channel)?.name || ""}`, threadParentTerms))
            .slice(0, 60);

        for (const parent of possibleThreadParents) {
            for (const method of [
                "getThreadsForParent",
                "getThreadsForChannel",
                "getActiveThreadsForParent",
                "getActiveThreadsForChannel",
                "getThreadIdsForParent",
                "getThreadIdsForChannel"
            ]) {
                addThreadSource(safeCall(this.stores.ThreadStore, method, parent.id));
            }
            addThreadSource(safeCall(this.stores.ActiveThreadsStore, "getThreadsForParent", parent.id));
            addThreadSource(safeCall(this.stores.ActiveJoinedThreadsStore, "getActiveJoinedThreadsForParent", parent.id));
            addThreadSource(safeCall(this.stores.ActiveJoinedThreadsStore, "getActiveUnjoinedThreadsForParent", parent.id));
            addThreadSource(safeCall(this.stores.ActiveJoinedThreadsStore, "getActiveJoinedRelevantThreadsForParent", parent.id));
            addThreadSource(safeCall(this.stores.ArchivedThreadsStore, "getThreads", parent.id));
        }

        const appThreadParents = possibleThreadParents
            .filter(parent => textMatchesTerms(`${parent.name} ${this.getCategory(parent)?.name || ""}`, appTerms))
            .slice(0, 8);
        for (const parent of appThreadParents) this.ensureParentArchivedThreadsLoaded(guildId, parent.id);

        return Array.from(channels.values());
    }

    addCachedFetchedThreads(guildId, addChannel) {
        const guildThreads = this.fetchedThreads.get(`guild:${guildId}`) || [];
        guildThreads.forEach(addChannel);

        for (const [key, threads] of this.fetchedThreads.entries()) {
            if (!key.startsWith(`parent:${guildId}:`)) continue;
            threads.forEach(addChannel);
        }
    }

    ensureGuildActiveThreadsLoaded(guildId) {
        const key = `guild:${guildId}`;
        this.ensureThreadFetch(key, 2 * 60 * 1000, async () => {
            const data = await this.fetchThreadEndpoint(`/guilds/${guildId}/threads/active`);
            this.mergeFetchedThreads(key, this.extractThreads(data, guildId));
        });
    }

    ensureParentArchivedThreadsLoaded(guildId, parentId) {
        const key = `parent:${guildId}:${parentId}`;
        this.ensureThreadFetch(key, 5 * 60 * 1000, async () => {
            const endpoints = [
                `/channels/${parentId}/threads/search?archived=false&limit=50`,
                `/channels/${parentId}/threads/search?archived=true&limit=50`,
                `/channels/${parentId}/threads/archived/public?limit=50`,
                `/channels/${parentId}/threads/archived/private?limit=50`,
                `/channels/${parentId}/users/@me/threads/archived/private?limit=50`
            ];
            const allThreads = [];
            for (const endpoint of endpoints) {
                const data = await this.fetchThreadEndpoint(endpoint);
                allThreads.push(...this.extractThreads(data, guildId, parentId));
            }
            this.mergeFetchedThreads(key, allThreads);
        });
    }

    ensureThreadFetch(key, ttl, task) {
        const now = Date.now();
        const state = this.threadFetches.get(key);
        if (state?.inflight || (state?.last && now - state.last < ttl)) return;

        this.threadFetches.set(key, {inflight: true, last: now});
        Promise.resolve()
            .then(task)
            .catch(() => {})
            .finally(() => {
                this.threadFetches.set(key, {inflight: false, last: Date.now()});
                if (this.settings.enabled) this.render();
            });
    }

    async fetchThreadEndpoint(endpoint) {
        return this.fetchDiscordEndpoint(endpoint);
    }

    async fetchDiscordEndpoint(endpoint) {
        const detail = arguments[1] || {};
        const http = this.modules.HTTP;
        const apiPath = endpoint.startsWith("/api/") ? endpoint : `/api/v9${endpoint}`;
        const url = endpoint.startsWith("/api/") ? endpoint : endpoint;
        const absoluteUrl = `https://discord.com${apiPath}`;
        const attempts = [];

        if (typeof http?.get === "function") {
            attempts.push(["http object apiPath", () => http.get({url: apiPath})]);
            attempts.push(["http object absolute", () => http.get({url: absoluteUrl})]);
            if (endpoint.startsWith("/api/")) attempts.push(["http object url", () => http.get({url})]);
            attempts.push(["http string apiPath", () => http.get(apiPath)]);
            attempts.push(["http string absolute", () => http.get(absoluteUrl)]);
            if (endpoint.startsWith("/api/")) attempts.push(["http string url", () => http.get(url)]);
        }

        for (const [name, attempt] of attempts) {
            try {
                const result = await attempt();
                const normalized = await this.readFetchResponse(result);
                this.recordFetchAttempt(detail, name, result, normalized);
                if (this.shouldAcceptDiscordResponse(normalized, detail)) return normalized;
            }
            catch (error) {
                this.recordFetchAttempt(detail, name, null, null, error);
            }
        }

        if (detail.internalOnly) return null;

        const token = this.getDiscordToken();
        const headers = token ? {Authorization: token} : undefined;
        if (typeof BdApi.Net?.fetch === "function") {
            try {
                const response = await BdApi.Net.fetch(absoluteUrl, {method: "GET", headers});
                const data = await this.readFetchResponse(response);
                this.recordFetchAttempt(detail, "BdApi.Net.fetch absolute", response, data);
                if (this.shouldAcceptDiscordResponse(data, detail)) return data;
            }
            catch (error) {
                this.recordFetchAttempt(detail, "BdApi.Net.fetch absolute", null, null, error);
            }
        }

        try {
            const response = await fetch(absoluteUrl, {credentials: "include", headers});
            const data = await this.readFetchResponse(response);
            this.recordFetchAttempt(detail, "fetch absolute", response, data);
            if (response.ok && this.shouldAcceptDiscordResponse(data, detail)) return data;
        }
        catch (error) {
            this.recordFetchAttempt(detail, "fetch absolute", null, null, error);
        }

        try {
            const response = await fetch(apiPath, {credentials: "include", headers});
            const data = await this.readFetchResponse(response);
            this.recordFetchAttempt(detail, "fetch relative", response, data);
            if (response.ok && this.shouldAcceptDiscordResponse(data, detail)) return data;
        }
        catch (error) {
            this.recordFetchAttempt(detail, "fetch relative", null, null, error);
        }

        return null;
    }

    shouldAcceptDiscordResponse(value, detail = {}) {
        if (value === undefined || value === null || this.isDiscordErrorResponse(value)) return false;
        if (!detail.expectMessages) return true;
        if (Array.isArray(value)) return true;
        return Array.isArray(value?.messages)
            || Array.isArray(value?.body)
            || Array.isArray(value?.data)
            || Array.isArray(value?.body?.messages)
            || Array.isArray(value?.data?.messages)
            || Array.isArray(value?.results);
    }

    normalizeDiscordResponse(result) {
        let value = this.getResponsePayload(result);
        for (let index = 0; index < 3; index += 1) {
            if (value && typeof value === "object" && typeof value.json === "function") break;
            if (value?.body !== undefined) value = value.body;
            else if (value?.data !== undefined) value = value.data;
            else if (value?.response?.body !== undefined) value = value.response.body;
            else if (value?.response?.data !== undefined) value = value.response.data;
            else if (value?.rawBody !== undefined) value = value.rawBody;
            else if (typeof value?.text === "string") value = value.text;
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

    getResponsePayload(response) {
        if (!response || typeof response !== "object") return response;
        for (const key of ["body", "data", "rawBody", "responseBody"]) {
            if (response[key] !== undefined && response[key] !== "") return response[key];
        }
        const xhr = response.xhr || response.req?.xhr || response.request?.xhr;
        if (xhr) {
            for (const key of ["responseJSON", "response", "responseText"]) {
                if (xhr[key] !== undefined && xhr[key] !== "") return xhr[key];
            }
        }
        const req = response.req || response.request;
        if (req) {
            for (const key of ["responseJSON", "response", "responseText", "text"]) {
                if (req[key] !== undefined && req[key] !== "" && typeof req[key] !== "function") return req[key];
            }
        }
        for (const key of ["text", "responseText", "response"]) {
            if (response[key] !== undefined && response[key] !== "" && typeof response[key] !== "function") return response[key];
        }
        return response;
    }

    isDiscordErrorResponse(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        return typeof value.message === "string" && (
            value.code !== undefined
            || /401|403|unauthorized|missing access|missing permissions|rate limit/i.test(value.message)
        );
    }

    async readFetchResponse(response) {
        if (!response) return null;
        const payload = this.getResponsePayload(response);
        if (payload !== response) return this.normalizeDiscordResponse(payload);
        if (typeof response.json === "function") {
            try {
                return this.normalizeDiscordResponse(await response.json());
            }
            catch (_) {}
        }
        if (typeof response.text === "function") {
            try {
                const text = await response.text();
                return this.normalizeDiscordResponse(text ? JSON.parse(text) : null);
            }
            catch (_) {}
        }
        return this.normalizeDiscordResponse(response);
    }

    getDiscordToken() {
        const authToken = this.getTokenFromAuthModule(this.modules.Auth);
        if (authToken) return authToken;

        try {
            const raw = localStorage.getItem("token");
            const parsed = raw ? String(JSON.parse(raw)) : "";
            if (this.looksLikeDiscordToken(parsed)) return parsed;
        }
        catch (_) {}

        try {
            const raw = localStorage.getItem("token");
            const token = raw ? raw.replace(/^"+|"+$/g, "") : "";
            if (this.looksLikeDiscordToken(token)) return token;
        }
        catch (_) {}

        return "";
    }

    getTokenFromAuthModule(module) {
        const candidates = [
            module,
            module?.default,
            module?.Z,
            module?.ZP,
            module?.exports,
            module?.exports?.default
        ];
        for (const candidate of candidates) {
            const token = safeCall(candidate, "getToken");
            if (this.looksLikeDiscordToken(token)) return String(token);
        }
        return "";
    }

    looksLikeDiscordToken(value) {
        const token = String(value || "");
        return token.length > 20 && token !== "undefined" && token !== "null";
    }

    recordFetchAttempt(detail, method, response, data, error = null) {
        if (!detail?.attempts) return;
        const status = response?.status || response?.statusCode || response?.body?.status || "";
        const dataType = Array.isArray(data) ? "array" : (data === null ? "null" : typeof data);
        const dataSize = Array.isArray(data)
            ? data.length
            : Array.isArray(data?.body)
                ? data.body.length
                : Array.isArray(data?.data)
                    ? data.data.length
            : Array.isArray(data?.messages)
                ? data.messages.length
                : Array.isArray(data?.body?.messages)
                    ? data.body.messages.length
                    : "";
        const dataKeys = data && typeof data === "object" && !Array.isArray(data)
            ? Object.keys(data).slice(0, 10).join(" ")
            : "";
        const responseKeys = response && typeof response === "object" && !Array.isArray(response)
            ? Object.keys(response).slice(0, 10).join(" ")
            : "";
        const preview = this.getFetchPreview(response, data);
        detail.attempts.push({
            method,
            status,
            ok: response?.ok ?? "",
            dataType,
            dataSize,
            dataKeys,
            responseKeys,
            preview,
            error: error?.message || "",
            message: typeof data?.message === "string" ? data.message : ""
        });
    }

    getFetchPreview(response, data) {
        const candidates = [
            data,
            this.getResponsePayload(response),
            response?.text,
            response?.xhr?.responseText,
            response?.xhr?.response,
            response?.req?.responseText,
            response?.req?.response
        ];
        for (const candidate of candidates) {
            if (candidate === undefined || candidate === null) continue;
            let text = "";
            try {
                text = typeof candidate === "string" ? candidate : JSON.stringify(candidate);
            }
            catch (_) {
                text = Object.prototype.toString.call(candidate);
            }
            if (text) return cleanLogText(text).slice(0, 220);
        }
        return "";
    }

    async runRobloxShareScan() {
        if (this.shareScanRunning) return;

        this.shareScanRunning = true;
        this.render();
        BdApi.UI?.showToast?.("Scanning Roblox share logs and #egg-chat...", {type: "info"});

        try {
            const result = await this.scanRobloxShareLogs();
            BdApi.Data.save(PLUGIN_NAME, SHARE_SCAN_DATA_KEY, result);
            this.exportShareScanResult(result);

            try {
                await navigator.clipboard?.writeText?.(this.formatShareScanSummary(result));
            }
            catch (_) {}

            BdApi.UI?.showToast?.(
                `Share scan complete: ${result.totalMatches} posts across ${result.summary.length} members.`,
                {type: "success"}
            );
        }
        catch (error) {
            console.error(`${PLUGIN_NAME} share scan failed`, error);
            BdApi.UI?.showToast?.("Share scan failed. Check the console for details.", {type: "error"});
        }
        finally {
            this.shareScanRunning = false;
            this.render();
        }
    }

    async scanRobloxShareLogs() {
        const startMs = ROBLOX_SHARE_SCAN.START_MS;
        const requestedEndMs = ROBLOX_SHARE_SCAN.END_MS;
        const endMs = requestedEndMs;
        const generatedAtMs = Date.now();
        const matches = [];
        const diagnostics = {
            inWindowMessages: 0,
            shareAnywhereMessages: 0,
            eggChannelMessages: 0,
            messageFieldShareMessages: 0,
            liveEggChannelMessages: 0,
            liveEggShareMessages: 0,
            fetches: [],
            liveFetches: [],
            authorAudit: [],
            samples: []
        };
        let before = timestampToSnowflake(endMs + 1) || "";
        let scannedMessages = 0;
        let pages = 0;
        let reachedStart = false;
        let breakReason = "";

        while (!reachedStart && pages < ROBLOX_SHARE_SCAN.MAX_PAGES) {
            const fetchDetail = {page: pages + 1, before, expectMessages: true, internalOnly: true, attempts: []};
            diagnostics.fetches.push(fetchDetail);
            const endpoint = [
                `/channels/${ROBLOX_SHARE_SCAN.SERVER_LOGS_CHANNEL_ID}/messages?limit=${ROBLOX_SHARE_SCAN.PAGE_LIMIT}`,
                before ? `&before=${before}` : ""
            ].join("");
            const messages = await this.fetchMessagesWithDiscordActions(ROBLOX_SHARE_SCAN.SERVER_LOGS_CHANNEL_ID, before, fetchDetail);
            fetchDetail.messageCount = messages.length;
            fetchDetail.responseType = "message-action";
            fetchDetail.endpoint = endpoint;
            if (!messages.length) {
                breakReason = "message action returned no usable message array";
                break;
            }

            pages += 1;
            fetchDetail.firstMessageId = messages[0]?.id || "";
            fetchDetail.lastMessageId = messages[messages.length - 1]?.id || "";
            fetchDetail.firstTimestamp = messages[0]?.timestamp || "";
            fetchDetail.lastTimestamp = messages[messages.length - 1]?.timestamp || "";
            for (const message of messages) {
                scannedMessages += 1;
                const timestamp = timestampFromMessage(message);
                if (timestamp && timestamp < startMs) {
                    reachedStart = true;
                    continue;
                }
                if (!timestamp || timestamp > endMs || timestamp < startMs) continue;

                const inspection = this.inspectRobloxShareLogMessage(message, timestamp);
                diagnostics.inWindowMessages += 1;
                if (inspection.hasShareAnywhere) diagnostics.shareAnywhereMessages += 1;
                if (inspection.hasEggChannel) diagnostics.eggChannelMessages += 1;
                if (inspection.hasMessageFieldShare) diagnostics.messageFieldShareMessages += 1;
                if (diagnostics.samples.length < 120 && (inspection.hasShareAnywhere || inspection.hasEggChannel || inspection.authorValues || diagnostics.samples.length < 20)) {
                    diagnostics.samples.push(inspection);
                }

                const match = this.getRobloxShareLogMatch(message, timestamp, inspection);
                this.recordRobloxShareAuthorAudit(diagnostics, message, timestamp, inspection, match);
                if (match) matches.push(match);
            }

            before = messages[messages.length - 1]?.id || "";
            if (!before) break;
            if (!reachedStart) await wait(175);
        }

        if (!breakReason) {
            breakReason = reachedStart
                ? "reached scan start time"
                : pages >= ROBLOX_SHARE_SCAN.MAX_PAGES
                    ? "hit max page limit"
                    : "completed";
        }

        const liveResult = await this.scanLiveEggChatShares(startMs, endMs, diagnostics, generatedAtMs);
        const liveMatches = liveResult.matches;
        const summary = this.summarizeShareScanMatches(matches, liveMatches);
        return {
            generatedAt: new Date().toISOString(),
            serverLogsChannelId: ROBLOX_SHARE_SCAN.SERVER_LOGS_CHANNEL_ID,
            sourceChannelId: ROBLOX_SHARE_SCAN.EGG_CHAT_CHANNEL_ID,
            sharePrefix: ROBLOX_SHARE_SCAN.SHARE_PREFIX,
            start: new Date(startMs).toISOString(),
            end: new Date(endMs).toISOString(),
            requestedEnd: new Date(requestedEndMs).toISOString(),
            pagesScanned: pages,
            scannedMessages,
            breakReason,
            liveBreakReason: liveResult.breakReason,
            livePagesScanned: liveResult.pagesScanned,
            liveScannedMessages: liveResult.scannedMessages,
            activeTimeCalculatedAt: liveResult.activeUntil,
            cappedByMaxPages: pages >= ROBLOX_SHARE_SCAN.MAX_PAGES && !reachedStart,
            serverLogMatches: matches.length,
            liveEggChatMatches: liveMatches.length,
            totalMatches: matches.length + liveMatches.length,
            diagnostics,
            summary,
            liveMatches,
            matches
        };
    }

    async scanLiveEggChatShares(startMs, endMs, diagnostics, generatedAtMs = Date.now()) {
        const activeUntilMs = Math.min(generatedAtMs, endMs);
        const matches = [];
        let before = timestampToSnowflake(activeUntilMs + 1) || "";
        let scannedMessages = 0;
        let pages = 0;
        let reachedStart = false;
        let breakReason = "";

        while (!reachedStart && pages < ROBLOX_SHARE_SCAN.MAX_PAGES) {
            const fetchDetail = {
                source: "egg-chat-live",
                channelId: ROBLOX_SHARE_SCAN.EGG_CHAT_CHANNEL_ID,
                page: pages + 1,
                before,
                expectMessages: true,
                internalOnly: true,
                attempts: []
            };
            diagnostics.liveFetches.push(fetchDetail);
            const endpoint = [
                `/channels/${ROBLOX_SHARE_SCAN.EGG_CHAT_CHANNEL_ID}/messages?limit=${ROBLOX_SHARE_SCAN.PAGE_LIMIT}`,
                before ? `&before=${before}` : ""
            ].join("");
            const messages = await this.fetchMessagesWithDiscordActions(ROBLOX_SHARE_SCAN.EGG_CHAT_CHANNEL_ID, before, fetchDetail);
            fetchDetail.messageCount = messages.length;
            fetchDetail.responseType = "message-action";
            fetchDetail.endpoint = endpoint;
            if (!messages.length) {
                breakReason = "message action returned no usable live egg-chat message array";
                break;
            }

            pages += 1;
            fetchDetail.firstMessageId = messages[0]?.id || "";
            fetchDetail.lastMessageId = messages[messages.length - 1]?.id || "";
            fetchDetail.firstTimestamp = messages[0]?.timestamp || "";
            fetchDetail.lastTimestamp = messages[messages.length - 1]?.timestamp || "";

            for (const message of messages) {
                scannedMessages += 1;
                const timestamp = timestampFromMessage(message);
                if (timestamp && timestamp < startMs) {
                    reachedStart = true;
                    continue;
                }
                if (!timestamp || timestamp > activeUntilMs || timestamp > endMs || timestamp < startMs) continue;

                diagnostics.liveEggChannelMessages += 1;
                const match = this.getRobloxShareLiveMatch(message, timestamp, activeUntilMs);
                if (!match) continue;
                diagnostics.liveEggShareMessages += 1;
                matches.push(match);
            }

            before = messages[messages.length - 1]?.id || "";
            if (!before) break;
            if (!reachedStart) await wait(175);
        }

        if (!breakReason) {
            breakReason = reachedStart
                ? "reached scan start time"
                : pages >= ROBLOX_SHARE_SCAN.MAX_PAGES
                    ? "hit max page limit"
                    : "completed";
        }

        return {
            matches,
            pagesScanned: pages,
            scannedMessages,
            breakReason,
            activeUntil: new Date(activeUntilMs).toISOString()
        };
    }

    extractDiscordMessages(response) {
        const value = this.normalizeDiscordResponse(response);
        if (Array.isArray(value)) return value;
        if (Array.isArray(value?.body)) return value.body;
        if (Array.isArray(value?.data)) return value.data;
        if (Array.isArray(value?.messages)) {
            return value.messages.flat(Infinity).filter(item => item?.id && (item.content !== undefined || item.embeds !== undefined));
        }
        if (Array.isArray(value?.body?.messages)) {
            return value.body.messages.flat(Infinity).filter(item => item?.id && (item.content !== undefined || item.embeds !== undefined));
        }
        if (Array.isArray(value?.results)) {
            return value.results.flat(Infinity).filter(item => item?.id && (item.content !== undefined || item.embeds !== undefined));
        }
        return [];
    }

    async fetchMessagesWithDiscordActions(channelId, before, detail = {}) {
        const actions = this.modules.MessageActions;
        if (!actions) {
            this.recordActionAttempt(detail, "message actions unavailable", 0, "");
            return [];
        }

        const methods = ["fetchMessages", "loadMessages"].filter(method => typeof actions[method] === "function");
        const attempts = [];
        for (const method of methods) {
            attempts.push([`${method} object`, () => actions[method]({channelId, before, limit: ROBLOX_SHARE_SCAN.PAGE_LIMIT})]);
            attempts.push([`${method} object guild`, () => actions[method]({channelId, guildId: this.getGuildId(), before, limit: ROBLOX_SHARE_SCAN.PAGE_LIMIT})]);
            attempts.push([`${method} args`, () => actions[method](channelId, {before, limit: ROBLOX_SHARE_SCAN.PAGE_LIMIT})]);
            attempts.push([`${method} args bool`, () => actions[method](channelId, before, ROBLOX_SHARE_SCAN.PAGE_LIMIT)]);
        }

        for (const [name, attempt] of attempts) {
            try {
                const result = await attempt();
                await wait(550);
                const messages = this.extractActionMessages(result, channelId, before);
                this.recordActionAttempt(detail, name, messages.length, result);
                if (messages.length) return messages;
            }
            catch (error) {
                this.recordActionAttempt(detail, name, 0, "", error);
            }
        }

        const cachedMessages = this.getCachedMessagesForChannel(channelId, before);
        this.recordActionAttempt(detail, "message cache final", cachedMessages.length, "");
        return cachedMessages;
    }

    extractActionMessages(result, channelId, before) {
        const directMessages = this.extractDiscordMessages(result)
            .concat(toMessageArray(result));
        const cachedMessages = this.getCachedMessagesForChannel(channelId, before);
        return this.filterMessagePage(directMessages.concat(cachedMessages), before);
    }

    getCachedMessagesForChannel(channelId, before) {
        const store = this.stores.MessageStore;
        const sources = [
            safeCall(store, "getMessages", channelId),
            safeCall(store, "getMessagesForChannel", channelId),
            safeCall(store, "getMessageIds", channelId),
            safeCall(store, "getRawMessages", channelId)
        ];
        const messages = [];
        for (const source of sources) {
            messages.push(...toMessageArray(source));
            for (const id of collectSnowflakeIds(source)) {
                const message = safeCall(store, "getMessage", channelId, id)
                    || safeCall(store, "getMessage", id)
                    || safeCall(store, "getMessageById", channelId, id)
                    || safeCall(store, "getMessageById", id);
                if (message) messages.push(message);
            }
        }
        return this.filterMessagePage(messages, before);
    }

    filterMessagePage(messages, before) {
        const beforeTime = snowflakeToTimestamp(before) || Infinity;
        const deduped = new Map();
        for (const message of messages) {
            if (!message?.id) continue;
            const timestamp = timestampFromMessage(message) || snowflakeToTimestamp(message.id);
            if (timestamp && timestamp >= beforeTime) continue;
            deduped.set(message.id, message);
        }
        return Array.from(deduped.values())
            .sort((a, b) => (timestampFromMessage(b) || snowflakeToTimestamp(b.id)) - (timestampFromMessage(a) || snowflakeToTimestamp(a.id)))
            .slice(0, ROBLOX_SHARE_SCAN.PAGE_LIMIT);
    }

    recordActionAttempt(detail, method, messageCount, result, error = null) {
        if (!detail?.attempts) return;
        const resultType = Array.isArray(result) ? "array" : (result === null || result === undefined ? "null" : typeof result);
        const resultKeys = result && typeof result === "object" && !Array.isArray(result)
            ? Object.keys(result).slice(0, 10).join(" ")
            : "";
        detail.attempts.push({
            method,
            status: "action",
            ok: "",
            dataType: resultType,
            dataSize: messageCount,
            dataKeys: resultKeys,
            responseKeys: "",
            preview: this.getFetchPreview(null, result),
            error: error?.message || "",
            message: ""
        });
    }

    inspectRobloxShareLogMessage(message, timestamp) {
        const text = this.flattenDiscordMessage(message);
        const channelValues = this.getLogFieldValues(message, "Channel", text);
        const messageValues = this.getLogFieldValues(message, "Message", text);
        const authorValues = this.getLogFieldValues(message, "Message author", text)
            .concat(this.getLogFieldValues(message, "Author", text))
            .concat(this.getLogFieldValues(message, "User", text));
        const hasShareAnywhere = this.hasSupportedRobloxShareLink(text);
        const hasEggChannel = this.hasEggChatReference(text, channelValues);
        const hasMessageFieldShare = messageValues.some(value => this.hasSupportedRobloxShareLink(value));

        return {
            logMessageId: message?.id || "",
            timestamp: new Date(timestamp).toISOString(),
            hasShareAnywhere,
            hasEggChannel,
            hasMessageFieldShare,
            channelValues: Array.from(new Set(channelValues)).join(" | "),
            authorValues: Array.from(new Set(authorValues)).join(" | "),
            messageValues: messageValues.filter(value => this.hasSupportedRobloxShareLink(value)).slice(0, 3).join(" | "),
            preview: text.slice(0, 700)
        };
    }

    getRobloxShareLogMatch(message, timestamp, inspection = null) {
        const text = this.flattenDiscordMessage(message);
        const check = inspection || this.inspectRobloxShareLogMessage(message, timestamp);
        if (!check.hasEggChannel) return null;

        const messageValues = this.getLogFieldValues(message, "Message", text);
        const shareMessage = this.getShareMessageValue(messageValues, text);
        if (!shareMessage) return null;

        const authorLine = this.getFirstLogFieldValue(message, ["Message author", "Message Author", "Author", "User"], text)
            || this.extractMentionPair(text)
            || "Unknown author";
        const authorKey = this.normalizeShareAuthorKey(authorLine);
        const guildId = this.getGuildId() || this.getChannelGuildId(message) || "@me";
        return {
            author: authorLine,
            authorKey,
            logMessageId: message.id,
            timestamp: new Date(timestamp).toISOString(),
            messageUrl: `https://discord.com/channels/${guildId}/${ROBLOX_SHARE_SCAN.SERVER_LOGS_CHANNEL_ID}/${message.id}`,
            message: shareMessage
        };
    }

    getRobloxShareLiveMatch(message, timestamp, activeUntilMs) {
        const text = this.flattenDiscordMessage(message);
        const shareMessage = this.getShareMessageValue([], text);
        if (!shareMessage || !this.hasSupportedRobloxShareLink(shareMessage)) return null;

        const authorLine = this.getLiveMessageAuthorLine(message);
        const authorId = this.getLiveMessageAuthorId(message);
        const authorKey = authorId ? `<@${authorId}>` : this.normalizeShareAuthorKey(authorLine);
        const guildId = this.getGuildId() || this.getChannelGuildId(message) || "@me";
        const activeMs = Math.max(0, activeUntilMs - timestamp);
        return {
            source: "egg-chat-live",
            author: authorLine,
            authorKey,
            liveMessageId: message.id,
            timestamp: new Date(timestamp).toISOString(),
            activeMs,
            activeDuration: formatDuration(activeMs),
            messageUrl: `https://discord.com/channels/${guildId}/${ROBLOX_SHARE_SCAN.EGG_CHAT_CHANNEL_ID}/${message.id}`,
            message: shareMessage
        };
    }

    getLiveMessageAuthorId(message) {
        const author = this.readObjectValue(message, ["author"]) || {};
        return this.readTextValue(author, ["id"]) || this.readTextValue(message, ["authorId", "author_id"]);
    }

    getLiveMessageAuthorLine(message) {
        const author = this.readObjectValue(message, ["author"]) || {};
        const username = this.readTextValue(author, ["username", "name", "tag"]);
        const globalName = this.readTextValue(author, ["globalName", "global_name", "displayName", "nick"]);
        const authorId = this.getLiveMessageAuthorId(message);
        if (globalName && username && globalName !== username) return `${globalName} (@${username})${authorId ? ` (<@${authorId}>)` : ""}`;
        if (username) return `${username}${authorId ? ` (<@${authorId}>)` : ""}`;
        return authorId ? `<@${authorId}>` : "Unknown author";
    }

    recordRobloxShareAuthorAudit(diagnostics, message, timestamp, inspection, match) {
        const auditIds = ROBLOX_SHARE_SCAN.AUDIT_AUTHOR_IDS || [];
        if (!auditIds.length || !diagnostics?.authorAudit) return;
        const text = this.flattenDiscordMessage(message);
        const haystack = `${inspection?.authorValues || ""}\n${text}`;
        const matchedIds = auditIds.filter(id => haystack.includes(id));
        if (!matchedIds.length) return;
        const messageValues = this.getLogFieldValues(message, "Message", text);
        const shareMessage = this.getShareMessageValue(messageValues, text);
        diagnostics.authorAudit.push({
            auditIds: matchedIds.join(" "),
            logMessageId: message?.id || "",
            timestamp: new Date(timestamp).toISOString(),
            counted: match ? "yes" : "no",
            reason: match
                ? "counted"
                : !inspection?.hasEggChannel
                    ? "not egg-chat"
                    : !shareMessage
                        ? "no supported share link found"
                        : "filtered",
            hasEggChannel: Boolean(inspection?.hasEggChannel),
            hasShareAnywhere: Boolean(inspection?.hasShareAnywhere),
            hasMessageFieldShare: Boolean(inspection?.hasMessageFieldShare),
            authorValues: inspection?.authorValues || "",
            channelValues: inspection?.channelValues || "",
            messageValues: inspection?.messageValues || "",
            extractedShareMessage: shareMessage || "",
            preview: text.slice(0, 900)
        });
    }

    flattenDiscordMessage(message) {
        const parts = [this.readTextValue(message, ["content", "cleanContent"])];
        for (const embed of this.toSimpleArray(this.readObjectValue(message, ["embeds"]))) {
            parts.push(
                this.readTextValue(embed, ["title", "rawTitle"]),
                this.readTextValue(embed, ["description", "rawDescription"]),
                this.readTextValue(embed, ["url", "rawUrl"]),
                this.readTextValue(this.readObjectValue(embed, ["footer", "rawFooter"]), ["text", "rawText"]),
                this.readTextValue(this.readObjectValue(embed, ["author", "rawAuthor"]), ["name", "rawName"])
            );

            for (const field of this.toSimpleArray(this.readObjectValue(embed, ["fields", "rawFields", "_fields"]))) {
                const name = this.readTextValue(field, ["name", "rawName"]);
                const value = this.readTextValue(field, ["value", "rawValue"]);
                if (name || value) parts.push(`${name}: ${value}`);
            }
        }
        return cleanLogText(parts.filter(Boolean).join("\n"));
    }

    getLogFieldValues(message, label, flattenedText = "") {
        const values = [];
        const wanted = this.normalizeLogLabel(label);

        for (const embed of this.toSimpleArray(this.readObjectValue(message, ["embeds"]))) {
            for (const field of this.toSimpleArray(this.readObjectValue(embed, ["fields", "rawFields", "_fields"]))) {
                const fieldName = this.readTextValue(field, ["name", "rawName"]);
                const fieldValue = this.readTextValue(field, ["value", "rawValue"]);
                if (this.normalizeLogLabel(fieldName) === wanted && fieldValue) values.push(cleanLogText(fieldValue).trim());
            }
        }

        const plainText = cleanLogText(flattenedText)
            .replace(/```/g, "")
            .replace(/\*\*/g, "")
            .replace(/`/g, "");
        const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const lineRegex = new RegExp(`^\\s*(?:[>\\-•]\\s*)?${escapedLabel}\\s*[:：]\\s*(.*)$`, "i");
        const lines = plainText.split("\n");

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

    readObjectValue(source, keys) {
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

    readTextValue(source, keys) {
        const value = this.readObjectValue(source, keys);
        if (value === undefined || value === null) return "";
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
            try {
                const text = value.toString();
                return text === "[object Object]" ? "" : text;
            }
            catch (_) {}
        }
        return "";
    }

    toSimpleArray(value) {
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
                if (Array.isArray(raw)) return raw;
                if (raw && typeof raw === "object") return Object.values(raw);
            }
        }
        catch (_) {}
        if (typeof value === "object") return Object.values(value);
        return [];
    }

    getFirstLogFieldValue(message, labels, flattenedText = "") {
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

    hasEggChatReference(text, channelValues = []) {
        const haystacks = [text].concat(channelValues).map(value => cleanLogText(value).toLowerCase());
        return haystacks.some(value => {
            const normalized = normalize(value);
            return value.includes(ROBLOX_SHARE_SCAN.EGG_CHAT_CHANNEL_ID)
                || normalized.includes("egg chat")
                || normalized.includes("eggchat");
        });
    }

    getShareMessageValue(messageValues, flattenedText) {
        const fieldMatch = messageValues.find(value => this.hasSupportedRobloxShareLink(value));
        if (fieldMatch) return fieldMatch;

        const text = cleanLogText(flattenedText);
        const messageBlock = this.getMessageBlockFromText(text);
        if (this.hasSupportedRobloxShareLink(messageBlock)) return messageBlock;

        const shareLine = text.split("\n").find(line => this.hasSupportedRobloxShareLink(line));
        return shareLine?.trim() || "";
    }

    hasSupportedRobloxShareLink(value) {
        const text = cleanLogText(value);
        if (!text) return false;
        return (ROBLOX_SHARE_SCAN.SHARE_PATTERNS || []).some(pattern => {
            pattern.lastIndex = 0;
            return pattern.test(text);
        });
    }

    getMessageBlockFromText(text) {
        const lines = cleanLogText(text).replace(/\*\*/g, "").replace(/`/g, "").split("\n");
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

    extractMentionPair(text) {
        const clean = cleanLogText(text);
        return clean.match(/@[\w.-]{2,40}\s*\(@?[\w.-]{2,40}\)/)?.[0]
            || clean.match(/<@!?\d{14,24}>/)?.[0]
            || "";
    }

    normalizeLogLabel(value) {
        return cleanLogText(value)
            .replace(/[>*_`~|]/g, "")
            .replace(/[:：]/g, "")
            .trim()
            .toLowerCase();
    }

    normalizeShareAuthorKey(authorLine) {
        const text = String(authorLine || "").trim();
        const parenthetical = text.match(/\((@?[^()]+)\)/);
        const key = parenthetical?.[1] || text;
        return key.replace(/^@/, "").replace(/\s+/g, " ").trim().toLowerCase() || "unknown";
    }

    summarizeShareScanMatches(matches, liveMatches = []) {
        const byAuthor = new Map();
        const getRow = match => {
            const existing = byAuthor.get(match.authorKey) || {
                authorKey: match.authorKey,
                author: match.author,
                count: 0,
                eggChatLiveCount: 0,
                totalCount: 0,
                liveActiveMs: 0,
                liveActiveTime: "",
                logMessageIds: [],
                eggChatLiveMessageIds: [],
                firstTimestamp: match.timestamp,
                lastTimestamp: match.timestamp
            };
            if (!existing.author || existing.author === "Unknown author") existing.author = match.author;
            if (match.timestamp < existing.firstTimestamp) existing.firstTimestamp = match.timestamp;
            if (match.timestamp > existing.lastTimestamp) existing.lastTimestamp = match.timestamp;
            byAuthor.set(match.authorKey, existing);
            return existing;
        };

        for (const match of matches) {
            const existing = getRow(match);
            existing.count += 1;
            existing.logMessageIds.push(match.logMessageId);
        }

        for (const match of liveMatches) {
            const existing = getRow(match);
            existing.eggChatLiveCount += 1;
            existing.eggChatLiveMessageIds.push(match.liveMessageId);
            existing.liveActiveMs += Number(match.activeMs) || 0;
        }

        for (const row of byAuthor.values()) {
            row.totalCount = row.count + row.eggChatLiveCount;
            row.liveActiveTime = formatDuration(row.liveActiveMs);
        }

        return Array.from(byAuthor.values())
            .sort((a, b) => b.totalCount - a.totalCount || b.count - a.count || a.author.localeCompare(b.author));
    }

    exportShareScanResult(result) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const summaryCsv = this.makeCsv(result.summary, [
            ["rank", (_, index) => index + 1],
            ["author", row => row.author],
            ["author_key", row => row.authorKey],
            ["count", row => row.count],
            ["egg_chat_live_count", row => row.eggChatLiveCount || 0],
            ["egg_chat_live_time", row => row.liveActiveTime || ""],
            ["egg_chat_live_time_ms", row => row.liveActiveMs || 0],
            ["total_count", row => row.totalCount || row.count],
            ["first_timestamp", row => row.firstTimestamp],
            ["last_timestamp", row => row.lastTimestamp],
            ["log_message_ids", row => row.logMessageIds.join(" ")],
            ["egg_chat_live_message_ids", row => (row.eggChatLiveMessageIds || []).join(" ")]
        ]);
        const evidenceRows = (result.matches || []).map(row => Object.assign({source: "server-log"}, row))
            .concat((result.liveMatches || []).map(row => Object.assign({source: "egg-chat-live"}, row)));
        const evidenceCsv = this.makeCsv(evidenceRows, [
            ["source", row => row.source],
            ["author", row => row.author],
            ["author_key", row => row.authorKey],
            ["timestamp", row => row.timestamp],
            ["active_time", row => row.activeDuration || ""],
            ["active_time_ms", row => row.activeMs || ""],
            ["log_message_id", row => row.logMessageId],
            ["egg_chat_message_id", row => row.liveMessageId],
            ["message_url", row => row.messageUrl],
            ["message", row => row.message]
        ]);

        this.downloadTextFile(`roblox-share-summary-${stamp}.csv`, summaryCsv, "text/csv;charset=utf-8");
        this.downloadTextFile(`roblox-share-evidence-${stamp}.csv`, evidenceCsv, "text/csv;charset=utf-8");
        const statusRows = (result.diagnostics?.fetches || []).map(row => Object.assign({source: "server-log", channelId: result.serverLogsChannelId}, row))
            .concat((result.diagnostics?.liveFetches || []).map(row => Object.assign({source: "egg-chat-live", channelId: result.sourceChannelId}, row)));
        const statusCsv = this.makeCsv(statusRows, [
            ["source", row => row.source],
            ["channel_id", row => row.channelId],
            ["page", row => row.page],
            ["message_count", row => row.messageCount],
            ["response_type", row => row.responseType],
            ["before", row => row.before],
            ["first_timestamp", row => row.firstTimestamp],
            ["last_timestamp", row => row.lastTimestamp],
            ["first_message_id", row => row.firstMessageId],
            ["last_message_id", row => row.lastMessageId],
            ["attempts", row => (row.attempts || []).map(attempt => `${attempt.method}:${attempt.status || attempt.dataType || "unknown"}:${attempt.dataSize || ""}:${attempt.dataKeys || attempt.responseKeys || ""}:${attempt.message || attempt.error || attempt.preview || ""}`).join(" | ")],
            ["endpoint", row => row.endpoint]
        ]);
        this.downloadTextFile(`roblox-share-status-${stamp}.csv`, statusCsv, "text/csv;charset=utf-8");
        if (result.diagnostics?.authorAudit?.length) {
            const auditCsv = this.makeCsv(result.diagnostics.authorAudit, [
                ["audit_ids", row => row.auditIds],
                ["log_message_id", row => row.logMessageId],
                ["timestamp", row => row.timestamp],
                ["counted", row => row.counted],
                ["reason", row => row.reason],
                ["has_egg_channel", row => row.hasEggChannel],
                ["has_share_anywhere", row => row.hasShareAnywhere],
                ["has_message_field_share", row => row.hasMessageFieldShare],
                ["author_values", row => row.authorValues],
                ["channel_values", row => row.channelValues],
                ["message_values", row => row.messageValues],
                ["extracted_share_message", row => row.extractedShareMessage],
                ["preview", row => row.preview]
            ]);
            this.downloadTextFile(`roblox-share-author-audit-${stamp}.csv`, auditCsv, "text/csv;charset=utf-8");
        }
        if (!result.totalMatches) {
            const debugCsv = this.makeCsv(result.diagnostics?.samples || [], [
                ["log_message_id", row => row.logMessageId],
                ["timestamp", row => row.timestamp],
                ["has_egg_channel", row => row.hasEggChannel],
                ["has_share_anywhere", row => row.hasShareAnywhere],
                ["has_message_field_share", row => row.hasMessageFieldShare],
                ["channel_values", row => row.channelValues],
                ["author_values", row => row.authorValues],
                ["message_values", row => row.messageValues],
                ["preview", row => row.preview]
            ]);
            this.downloadTextFile(`roblox-share-debug-${stamp}.csv`, debugCsv, "text/csv;charset=utf-8");
        }
    }

    makeCsv(rows, columns) {
        const header = columns.map(([name]) => this.csvEscape(name)).join(",");
        const lines = rows.map((row, index) => columns
            .map(([, getter]) => this.csvEscape(getter(row, index)))
            .join(","));
        return [header, ...lines].join("\n");
    }

    csvEscape(value) {
        const text = value === undefined || value === null ? "" : String(value).replace(/\r?\n/g, " ");
        if (!/[",\n]/.test(text)) return text;
        return `"${text.replace(/"/g, '""')}"`;
    }

    downloadTextFile(filename, content, type) {
        const blob = new Blob([content], {type});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    formatShareScanSummary(result) {
        const lines = [
            "Roblox share scan",
            `Window: ${new Date(result.start).toLocaleString()} to ${new Date(result.end).toLocaleString()}`,
            `Matched posts: ${result.totalMatches}`,
            `Server-log posts: ${result.serverLogMatches || 0}`,
            `Live #egg-chat posts: ${result.liveEggChatMatches || 0}`,
            `Messages scanned: ${result.scannedMessages}`,
            `Live #egg-chat messages scanned: ${result.liveScannedMessages || 0}`,
            `Pages scanned: ${result.pagesScanned}`,
            `Live #egg-chat pages scanned: ${result.livePagesScanned || 0}`,
            `Break reason: ${result.breakReason}`,
            `Live break reason: ${result.liveBreakReason || ""}`,
            `In-window messages: ${result.diagnostics?.inWindowMessages || 0}`,
            `Share-link messages: ${result.diagnostics?.shareAnywhereMessages || 0}`,
            `Egg-chat messages: ${result.diagnostics?.eggChannelMessages || 0}`,
            `Live #egg-chat share messages: ${result.diagnostics?.liveEggShareMessages || 0}`,
            ""
        ];
        result.summary.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.author} - total ${row.totalCount || row.count}, logs ${row.count}, live ${row.eggChatLiveCount || 0}, live time ${row.liveActiveTime || "0m"} (${row.logMessageIds.join(", ")})`);
        });
        if (result.cappedByMaxPages) lines.push("", "Scan stopped at the page limit before reaching the start time.");
        return lines.join("\n");
    }

    extractThreads(data, guildId, parentId = "") {
        const body = data?.body || data;
        const rawThreads = Array.isArray(body) ? body : body?.threads || [];
        return rawThreads
            .filter(thread => thread?.id && this.isThreadChannel(thread))
            .map(thread => Object.assign({}, thread, {
                guild_id: thread.guild_id || thread.guildId || guildId,
                parent_id: thread.parent_id || thread.parentId || parentId
            }));
    }

    mergeFetchedThreads(key, threads) {
        if (!threads?.length) return;
        const merged = new Map((this.fetchedThreads.get(key) || []).map(thread => [thread.id, thread]));
        for (const thread of threads) merged.set(thread.id, thread);
        this.fetchedThreads.set(key, Array.from(merged.values()));
    }

    getVisibleChannelListChannels(guildId) {
        const channels = [];
        const nodes = document.querySelectorAll('nav [data-list-item-id^="channels___"], nav [href*="/channels/"]');
        for (const node of nodes) {
            const anchor = node.matches?.('[href*="/channels/"]')
                ? node
                : node.querySelector?.('[href*="/channels/"]') || node.closest?.('a[href*="/channels/"]');
            const href = normalizeRoutePath(anchor?.getAttribute?.("href") || "");
            const raw = [
                node.getAttribute?.("data-list-item-id"),
                href
            ].filter(Boolean).join(" ");
            const ids = raw.match(/\d{14,24}/g);
            if (!ids?.length) continue;
            if (guildId && href && ids[0] !== guildId && href.includes("/channels/")) continue;
            const channel = safeCall(this.stores.ChannelStore, "getChannel", ids[ids.length - 1]);
            if (channel) {
                if (href) this.routeHints.set(channel.id, href);
                channels.push(channel);
            }
        }
        return channels;
    }

    getChannelGuildId(channel) {
        const parent = this.getParent(channel);
        const category = parent ? this.getParent(parent) : null;
        return channel?.guild_id
            || channel?.guildId
            || safeCall(channel, "getGuildId")
            || parent?.guild_id
            || parent?.guildId
            || category?.guild_id
            || category?.guildId
            || null;
    }

    getParent(channel) {
        const parentId = channel?.parent_id || channel?.parentId;
        if (!parentId) return null;
        return safeCall(this.stores.ChannelStore, "getChannel", parentId) || null;
    }

    getCategory(channel) {
        const parent = this.getParent(channel);
        if (!parent) return null;
        if (this.isThreadChannel(channel)) return this.getParent(parent);
        return parent;
    }

    isThreadChannel(channel) {
        if (!channel) return false;
        if (THREAD_CHANNELS.has(channel.type)) return true;
        try {
            return Boolean(channel.isThread?.());
        }
        catch (_) {
            return false;
        }
    }

    canHaveThreads(channel) {
        if (!channel || this.isThreadChannel(channel)) return false;
        return channel.type === CHANNEL_TYPES.GUILD_TEXT
            || channel.type === CHANNEL_TYPES.GUILD_ANNOUNCEMENT
            || channel.type === CHANNEL_TYPES.GUILD_FORUM
            || channel.type === CHANNEL_TYPES.GUILD_MEDIA;
    }

    isUsableChannel(channel) {
        if (!channel || !channel.id) return false;
        if (channel.type === CHANNEL_TYPES.GUILD_CATEGORY) return false;
        if (this.settings.includeVoiceChannels && (channel.type === CHANNEL_TYPES.GUILD_VOICE || channel.type === CHANNEL_TYPES.GUILD_STAGE_VOICE)) return true;
        if (TEXT_LIKE_CHANNELS.has(channel.type)) return true;
        try {
            return Boolean(channel.isGuildTextChannel?.() || channel.isThread?.() || channel.isForumChannel?.());
        }
        catch (_) {
            return false;
        }
    }

    makeChannelItem(channel) {
        const isThread = this.isThreadChannel(channel);
        const parent = this.getParent(channel);
        const category = this.getCategory(channel);
        const groupParent = isThread ? parent : category;
        const activity = this.getChannelActivity(channel);
        const isVoice = channel.type === CHANNEL_TYPES.GUILD_VOICE || channel.type === CHANNEL_TYPES.GUILD_STAGE_VOICE;
        const categoryName = groupParent?.name || "No category";

        return {
            id: channel.id,
            channel,
            name: channel.name || channel.id,
            routeHint: this.routeHints.get(channel.id) || "",
            prefix: isVoice || isThread ? ">" : "#",
            categoryId: groupParent?.id || "",
            categoryName,
            parentChannelName: isThread ? parent?.name || "" : "",
            serverCategoryName: category?.name || categoryName,
            categoryPosition: Number((isThread ? category?.position : groupParent?.position) ?? 9999),
            position: Number(channel.position ?? snowflakeToTimestamp(channel.id) ?? 9999),
            mentions: activity.mentions,
            unread: activity.unread,
            lastTimestamp: activity.lastTimestamp,
            ageLabel: formatAge(activity.lastTimestamp),
            kind: "other"
        };
    }

    getChannelActivity(channel) {
        const id = channel.id;
        const readStores = [this.stores.ReadStateStore, this.stores.GuildReadStateStore].filter(Boolean);
        let mentions = 0;
        let unreadCount = 0;
        let unread = false;
        let lastMessageId = channel.lastMessageId || channel.last_message_id || "";
        let lastTimestamp = 0;

        for (const store of readStores) {
            mentions = Math.max(mentions, Number(safeCall(store, "getMentionCount", id) || 0));
            mentions = Math.max(mentions, Number(safeCall(store, "getMentionCountForChannel", id) || 0));
            unreadCount = Math.max(unreadCount, Number(safeCall(store, "getUnreadCount", id) || 0));
            unreadCount = Math.max(unreadCount, Number(safeCall(store, "getUnreadCountForChannel", id) || 0));
            unread = unread || Boolean(safeCall(store, "hasUnread", id));
            unread = unread || Boolean(safeCall(store, "hasUnreadForChannel", id));

            const readState = safeCall(store, "getReadState", id);
            if (readState) {
                mentions = Math.max(mentions, Number(readState.mentionCount || readState._mentionCount || 0));
                unreadCount = Math.max(unreadCount, Number(readState.unreadCount || readState._unreadCount || 0));
                lastMessageId = lastMessageId || readState.lastMessageId || readState._lastMessageId || "";
            }
        }

        const lastMessage = safeCall(this.stores.MessageStore, "getLastMessage", id);
        lastTimestamp = timestampFromMessage(lastMessage) || snowflakeToTimestamp(lastMessageId);

        return {
            mentions,
            unread: unread || unreadCount > 0,
            lastTimestamp
        };
    }

    getChannelRoute(item, guildId) {
        const channel = item.channel || item;
        const hintedPath = normalizeRoutePath(item.routeHint || this.routeHints.get(channel.id));
        if (hintedPath) {
            const ids = hintedPath.match(/\d{14,24}/g) || [];
            const threadId = ids.length > 2 ? ids[2] : null;
            const channelId = ids.length > 2 ? ids[1] : channel.id;
            const paths = [hintedPath];
            if (threadId) paths.push(`/channels/${guildId}/${threadId}`);
            return {
                path: hintedPath,
                paths: Array.from(new Set(paths)),
                channelId,
                threadId
            };
        }

        const parent = this.getParent(channel);
        if (this.isThreadChannel(channel) && parent?.id) {
            return {
                path: `/channels/${guildId}/${channel.id}`,
                paths: [
                    `/channels/${guildId}/${channel.id}`,
                    `/channels/${guildId}/${parent.id}/${channel.id}`
                ],
                channelId: parent.id,
                threadId: channel.id
            };
        }

        return {
            path: `/channels/${guildId}/${channel.id}`,
            paths: [`/channels/${guildId}/${channel.id}`],
            channelId: channel.id,
            threadId: null
        };
    }

    openChannel(item) {
        const channel = item.channel || item;
        const guildId = this.getChannelGuildId(channel) || this.getGuildId();
        if (!guildId || !channel?.id) return;

        const route = this.getChannelRoute(item, guildId);
        const attempts = this.getNavigationAttempts(route, guildId, item);
        this.runNavigationAttempts(attempts, route, 0);
    }

    getNavigationAttempts(route, guildId, item) {
        const router = this.modules.Router;
        const actions = this.modules.ChannelActions;
        const transition = this.modules.NavigationTransition;
        const transitionGuild = this.modules.NavigationGuildTransition;
        const attempts = [];

        if (item.routeHint) attempts.push(() => this.clickVisibleRoute(route.path));

        for (const path of route.paths) {
            if (typeof transition === "function") attempts.push(() => transition(path));
        }

        if (typeof transitionGuild === "function" && !route.threadId) {
            attempts.push(() => transitionGuild(guildId, route.channelId));
        }

        if (typeof actions?.selectChannel === "function") {
            if (route.threadId) {
                attempts.push(() => actions.selectChannel(guildId, route.threadId));
                attempts.push(() => actions.selectChannel(guildId, route.channelId, route.threadId));
                attempts.push(() => actions.selectChannel({guildId, channelId: route.threadId, parentChannelId: route.channelId, threadId: route.threadId}));
            }
            else {
                attempts.push(() => actions.selectChannel(guildId, route.channelId));
                attempts.push(() => actions.selectChannel({guildId, channelId: route.channelId}));
            }
        }

        for (const path of route.paths) {
            if (typeof router?.transitionTo === "function") attempts.push(() => router.transitionTo(path));
        }

        if (typeof router?.transitionToGuild === "function" && !route.threadId) {
            attempts.push(() => router.transitionToGuild(guildId, route.channelId));
        }

        for (const path of route.paths) attempts.push(() => this.clickSyntheticLink(path));
        return attempts;
    }

    runNavigationAttempts(attempts, route, index) {
        if (this.isRouteSelected(route)) {
            this.afterNavigation();
            return;
        }
        if (index >= attempts.length) {
            BdApi.UI?.showToast?.("Officer Mode could not open that channel.", {type: "error"});
            this.afterNavigation();
            return;
        }

        try {
            attempts[index]();
        }
        catch (_) {}

        setTimeout(() => {
            if (this.isRouteSelected(route)) this.afterNavigation();
            else this.runNavigationAttempts(attempts, route, index + 1);
        }, 140);
    }

    isRouteSelected(route) {
        const pathname = location.pathname || "";
        const targetId = route.threadId || route.channelId;
        if (targetId && pathname.includes(targetId)) return true;
        const selected = safeCall(this.stores.SelectedChannelStore, "getChannelId", this.getGuildId())
            || safeCall(this.stores.SelectedChannelStore, "getChannelId");
        return Boolean(targetId && selected === targetId);
    }

    afterNavigation() {
        if (!this.settings.keepOpenOnNavigate) this.setEnabled(false);
        else setTimeout(() => this.render(), 150);
    }

    clickVisibleRoute(path) {
        const normalizedPath = normalizeRoutePath(path);
        if (!normalizedPath) return false;
        const links = document.querySelectorAll('nav a[href*="/channels/"]');
        for (const link of links) {
            if (normalizeRoutePath(link.getAttribute("href")) !== normalizedPath) continue;
            try {
                link.click();
                return true;
            }
            catch (_) {
                return false;
            }
        }
        return false;
    }

    clickSyntheticLink(path) {
        const anchor = document.createElement("a");
        anchor.href = path;
        anchor.style.display = "none";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
    }
};
