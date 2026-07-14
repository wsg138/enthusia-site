(function () {
  "use strict";

  const API_ORIGIN = "https://market-api.enthusia.info";
  const SNAPSHOT_PATH = "/v1/market";
  const LIVE_PATH = "/v1/live";
  const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
  const FETCH_TIMEOUT = 7000;
  const FALLBACK_RETRY_DELAY = 60000;

  const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const isInteger = value => Number.isInteger(value) && value >= 0;
  const isString = value => typeof value === "string" && value.length > 0;

  function validItem(item, depth = 0) {
    if (!isObject(item) || depth > 4 || !isString(item.material) || !isString(item.displayName) || !Number.isInteger(item.amount) || item.amount <= 0 || !isObject(item.metadata)) return false;
    const contents = item.metadata.container?.contents;
    return contents === undefined || Array.isArray(contents) && contents.length <= 1024 && contents.every(entry => isObject(entry) && validItem(entry.item, depth + 1));
  }

  function validStall(stall, expectedIds) {
    if (!isObject(stall) || !expectedIds.has(stall.id) || !isString(stall.buildingId) || !Number.isInteger(stall.floor) || !isObject(stall.location) || !isObject(stall.owner) || !Array.isArray(stall.members) || !Array.isArray(stall.shops)) return false;
    if (!isString(stall.owner.type) || !isString(stall.owner.name) || stall.members.some(member => typeof member !== "string")) return false;
    return stall.shops.every(shop => isObject(shop) && Number.isInteger(shop.id) && isObject(shop.owner) && isString(shop.owner.name) && ["BUY", "SELL", "TRADE"].includes(shop.direction) && validItem(shop.sellItem) && validItem(shop.costItem) && isObject(shop.interaction) && isInteger(shop.stockCount) && isInteger(shop.availableTrades));
  }

  function validateSnapshot(value, expectedStallIds) {
    if (!isObject(value) || value.schemaVersion !== 1 || value.serverId !== "enthusia-main" || !isInteger(value.sequence) || !Number.isInteger(value.snapshotRevision) || value.snapshotRevision <= 0 || !Array.isArray(value.stalls) || value.stalls.length !== expectedStallIds.length) return null;
    const expected = new Set(expectedStallIds), ids = new Set(value.stalls.map(stall => stall?.id));
    if (ids.size !== expected.size || [...expected].some(id => !ids.has(id)) || !value.stalls.every(stall => validStall(stall, expected))) return null;
    return value;
  }

  class MarketApiClient {
    constructor(options) {
      this.apiOrigin = options.apiOrigin || API_ORIGIN;
      if (this.apiOrigin !== API_ORIGIN) throw new Error("Unsupported Market API origin");
      this.expectedStallIds = [...options.expectedStallIds];
      this.fallbackSnapshot = options.fallbackSnapshot;
      this.fetchImpl = options.fetchImpl || window.fetch.bind(window);
      this.WebSocketImpl = options.WebSocketImpl || window.WebSocket;
      this.onSnapshot = options.onSnapshot || (() => {});
      this.onStallUpdate = options.onStallUpdate || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.setTimeoutImpl = options.setTimeoutImpl || window.setTimeout.bind(window);
      this.clearTimeoutImpl = options.clearTimeoutImpl || window.clearTimeout.bind(window);
      this.sequence = 0;
      this.snapshot = null;
      this.source = "fallback";
      this.lastUpdatedAt = null;
      this.socket = null;
      this.reconnectAttempt = 0;
      this.reconnectTimer = null;
      this.snapshotRetryTimer = null;
      this.refreshPromise = null;
      this.stopped = false;
      this.online = typeof navigator === "undefined" || navigator.onLine !== false;
      this.handleOnline = () => { this.online = true; this.reconnectAttempt = 0; this.scheduleReconnect(0); };
      this.handleOffline = () => { this.online = false; this.closeSocket(); this.emitStatus("offline"); };
      this.handleVisibility = () => { if (document.visibilityState === "visible" && !this.isSocketOpen()) this.scheduleReconnect(0); };
      window.addEventListener?.("online", this.handleOnline);
      window.addEventListener?.("offline", this.handleOffline);
      document.addEventListener?.("visibilitychange", this.handleVisibility);
    }

    emitStatus(state) {
      this.onStatus({ state, source: this.source, sequence: this.sequence, updatedAt: this.lastUpdatedAt });
    }

    async fetchSnapshot() {
      const controller = new AbortController();
      const timeout = this.setTimeoutImpl(() => controller.abort(), FETCH_TIMEOUT);
      try {
        const response = await this.fetchImpl(`${this.apiOrigin}${SNAPSHOT_PATH}`, { cache: "no-store", credentials: "omit", signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Market API returned ${response.status}`);
        const snapshot = validateSnapshot(await response.json(), this.expectedStallIds);
        if (!snapshot) throw new Error("Market API returned an invalid snapshot");
        return snapshot;
      } finally {
        this.clearTimeoutImpl(timeout);
      }
    }

    useSnapshot(snapshot, source, notify = true) {
      if (source === "api" && this.snapshotRetryTimer) this.clearTimeoutImpl(this.snapshotRetryTimer);
      if (source === "api") this.snapshotRetryTimer = null;
      this.snapshot = snapshot;
      this.sequence = source === "api" ? snapshot.sequence : 0;
      this.source = source;
      this.lastUpdatedAt = source === "api" ? new Date().toISOString() : null;
      if (notify) this.onSnapshot(snapshot, { source, sequence: this.sequence, updatedAt: this.lastUpdatedAt });
      return snapshot;
    }

    async loadInitialSnapshot() {
      this.emitStatus("connecting");
      if (window.location?.protocol === "file:") {
        const fallback = { ...this.fallbackSnapshot, stalls: [...this.fallbackSnapshot.stalls] };
        this.useSnapshot(fallback, "fallback", false); this.emitStatus("fallback"); return fallback;
      }
      try {
        return this.useSnapshot(await this.fetchSnapshot(), "api", false);
      } catch {
        const fallback = { ...this.fallbackSnapshot, stalls: [...this.fallbackSnapshot.stalls] };
        this.useSnapshot(fallback, "fallback", false);
        this.emitStatus("fallback");
        this.scheduleSnapshotRetry();
        return fallback;
      }
    }

    startLive() {
      if (this.stopped) return;
      if (this.source !== "api") { this.emitStatus("fallback"); this.scheduleSnapshotRetry(); return; }
      this.connect();
    }

    async refreshSnapshot(reason = "resync") {
      if (this.refreshPromise) return this.refreshPromise;
      this.refreshPromise = (async () => {
        try {
          const snapshot = await this.fetchSnapshot();
          this.useSnapshot(snapshot, "api", true);
          this.reconnectAttempt = 0;
          if (!this.isSocketOpen()) this.scheduleReconnect(0);
          return snapshot;
        } catch (error) {
          if (this.source !== "api") this.emitStatus("fallback");
          else this.emitStatus(this.online ? "reconnecting" : "offline");
          this.scheduleSnapshotRetry();
          if (reason === "resync") this.closeSocket();
          return null;
        } finally {
          this.refreshPromise = null;
        }
      })();
      return this.refreshPromise;
    }

    connect() {
      if (this.stopped || !this.online || this.source !== "api" || this.isSocketOpen()) return;
      this.clearReconnectTimer();
      this.emitStatus(this.reconnectAttempt ? "reconnecting" : "connecting");
      const url = new URL(`${this.apiOrigin}${LIVE_PATH}`);
      url.protocol = "wss:";
      url.searchParams.set("since", String(this.sequence));
      let socket;
      try { socket = new this.WebSocketImpl(url.toString()); }
      catch { this.scheduleReconnect(); return; }
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (socket !== this.socket) return;
        if (this.snapshotRetryTimer) this.clearTimeoutImpl(this.snapshotRetryTimer);
        this.snapshotRetryTimer = null;
        this.reconnectAttempt = 0;
        this.emitStatus("live");
      });
      socket.addEventListener("message", event => {
        if (socket !== this.socket) return;
        this.handleMessage(event.data);
      });
      socket.addEventListener("close", () => {
        if (socket !== this.socket) return;
        this.socket = null;
        if (!this.stopped) this.scheduleReconnect();
      });
      socket.addEventListener("error", () => { try { socket.close(); } catch {} });
    }

    handleMessage(raw) {
      let event;
      try { event = JSON.parse(raw); } catch { return; }
      if (!isObject(event) || typeof event.type !== "string") return;
      if (event.type === "hello") {
        if (!isInteger(event.sequence)) { this.refreshSnapshot(); return; }
        this.emitStatus("live");
        return;
      }
      if (event.type === "market.replaced" || event.type === "resync_required") {
        this.refreshSnapshot("resync");
        return;
      }
      if (event.type !== "stall.updated" || !isInteger(event.sequence) || event.sequence <= this.sequence) return;
      if (event.sequence !== this.sequence + 1) { this.refreshSnapshot("resync"); return; }
      const expected = new Set(this.expectedStallIds);
      if (!expected.has(event.stallId) || event.stall?.id !== event.stallId || !validStall(event.stall, expected)) { this.refreshSnapshot("resync"); return; }
      const index = this.snapshot?.stalls.findIndex(stall => stall.id === event.stallId) ?? -1;
      if (index < 0) { this.refreshSnapshot("resync"); return; }
      const stalls = [...this.snapshot.stalls];
      stalls[index] = event.stall;
      this.snapshot = { ...this.snapshot, sequence: event.sequence, updatedAt: event.updatedAt, stalls };
      this.sequence = event.sequence;
      this.lastUpdatedAt = event.updatedAt || new Date().toISOString();
      this.onStallUpdate(event.stallId, event.stall, this.snapshot, { sequence: this.sequence, updatedAt: this.lastUpdatedAt });
      this.emitStatus("live");
    }

    scheduleReconnect(delayOverride) {
      if (this.stopped || !this.online || this.reconnectTimer || this.isSocketOpen()) return;
      const delay = delayOverride ?? RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
      if (delayOverride === undefined) this.reconnectAttempt += 1;
      this.emitStatus(this.source === "api" ? "reconnecting" : "fallback");
      this.reconnectTimer = this.setTimeoutImpl(() => { this.reconnectTimer = null; this.source === "api" ? this.connect() : this.refreshSnapshot("retry"); }, delay);
    }

    scheduleSnapshotRetry() {
      if (this.stopped || this.snapshotRetryTimer || this.isSocketOpen()) return;
      this.snapshotRetryTimer = this.setTimeoutImpl(() => { this.snapshotRetryTimer = null; this.refreshSnapshot("retry"); }, FALLBACK_RETRY_DELAY);
    }

    isSocketOpen() { return this.socket?.readyState === 1; }
    clearReconnectTimer() { if (this.reconnectTimer) this.clearTimeoutImpl(this.reconnectTimer); this.reconnectTimer = null; }
    closeSocket() { const socket = this.socket; this.socket = null; if (socket) try { socket.close(); } catch {} }
    stop() {
      this.stopped = true;
      this.clearReconnectTimer();
      if (this.snapshotRetryTimer) this.clearTimeoutImpl(this.snapshotRetryTimer);
      this.snapshotRetryTimer = null;
      this.closeSocket();
      window.removeEventListener?.("online", this.handleOnline);
      window.removeEventListener?.("offline", this.handleOffline);
      document.removeEventListener?.("visibilitychange", this.handleVisibility);
    }
  }

  window.EnthusiaMarketApi = { MarketApiClient, validateSnapshot, API_ORIGIN };
})();
