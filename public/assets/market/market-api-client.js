(function () {
  "use strict";

  const API_ORIGIN = "https://market-api.enthusia.info";
  const SNAPSHOT_PATH = "/v1/market";
  const LIVE_PATH = "/v1/live";
  const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
  const FETCH_TIMEOUT = 7000;
  const FALLBACK_RETRY_DELAY = 60000;

  const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const isInteger = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
  const isPositive = value => isInteger(value) && value > 0;
  const isString = value => typeof value === "string" && value.length > 0;
  const minotarHeadUrlPattern = /^https:\/\/minotar\.net\/helm\/[A-Za-z0-9._%+-]+\/96\.png$/;
  const capturedHeadUrlPattern = /^https:\/\/market-api\.enthusia\.info\/v1\/player-heads\/[0-9a-f]{64}\.png$/;
  const bannerColors = new Set(["WHITE","ORANGE","MAGENTA","LIGHT_BLUE","YELLOW","LIME","PINK","GRAY","LIGHT_GRAY","CYAN","PURPLE","BLUE","BROWN","GREEN","RED","BLACK"]);
  const bannerPatterns = new Set(["SQUARE_BOTTOM_LEFT","SQUARE_BOTTOM_RIGHT","SQUARE_TOP_LEFT","SQUARE_TOP_RIGHT","STRIPE_BOTTOM","STRIPE_TOP","STRIPE_LEFT","STRIPE_RIGHT","STRIPE_CENTER","STRIPE_MIDDLE","STRIPE_DOWNRIGHT","STRIPE_DOWNLEFT","STRIPE_SMALL","CROSS","STRAIGHT_CROSS","TRIANGLE_BOTTOM","TRIANGLE_TOP","TRIANGLES_BOTTOM","TRIANGLES_TOP","DIAGONAL_LEFT","DIAGONAL_RIGHT","DIAGONAL_LEFT_MIRROR","DIAGONAL_RIGHT_MIRROR","CIRCLE","RHOMBUS","HALF_VERTICAL","HALF_HORIZONTAL","HALF_VERTICAL_MIRROR","HALF_HORIZONTAL_MIRROR","BORDER","CURLY_BORDER","GRADIENT","GRADIENT_UP","BRICKS","GLOBE","CREEPER","SKULL","FLOWER","MOJANG","PIGLIN","FLOW","GUSTER"]);
  const stallStates = new Set(["UNOWNED", "AUCTIONING", "OWNED", "GRACE", "RE_AUCTIONING", "EMERGENCY_AUCTIONING"]);
  const rentTimingStatuses = new Set(["PERSISTED", "LEGACY_DERIVED", "UNAVAILABLE", "NOT_APPLICABLE"]);

  function validAvatar(owner) {
    if (!isObject(owner.avatar) || !isString(owner.avatar.kind)) return false;
    if (owner.avatarUrl !== null && !minotarHeadUrlPattern.test(owner.avatarUrl) && !capturedHeadUrlPattern.test(owner.avatarUrl)) return false;
    if (owner.avatar.kind === "MINECRAFT_HEAD") {
      if (!isString(owner.avatar.source) || typeof owner.avatar.includesOuterLayer !== "boolean") return false;
      if (owner.avatar.source === "BEDROCK_CAPTURED") return capturedHeadUrlPattern.test(owner.avatarUrl || "") && owner.avatar.includesOuterLayer === true;
      return ["JAVA", "FLOODGATE", "PROXY"].includes(owner.avatar.source) && (owner.avatarUrl === null || minotarHeadUrlPattern.test(owner.avatarUrl));
    }
    if (owner.avatar.kind === "NONE") return owner.type === "NONE" && owner.avatarUrl === null;
    if (owner.avatar.kind !== "GUILD_BANNER") return false;
    const banner = owner.avatar.banner;
    if (banner === undefined || banner === null) return true;
    return isObject(banner) && bannerColors.has(banner.baseColor) && Array.isArray(banner.patterns) && banner.patterns.length <= 6
      && banner.patterns.every(pattern => isObject(pattern) && bannerPatterns.has(pattern.type) && bannerColors.has(pattern.color));
  }

  function validItem(item, depth = 0) {
    if (!isObject(item) || depth > 4 || !isString(item.material) || !isString(item.displayName) || !isPositive(item.amount) || item.amount > 64000 || !isObject(item.metadata)) return false;
    const contents = item.metadata.container?.contents;
    return contents === undefined || Array.isArray(contents) && contents.length <= 1024 && contents.every(entry => isObject(entry) && validItem(entry.item, depth + 1));
  }

  function validStall(stall, expectedIds) {
    if (!isObject(stall) || !expectedIds.has(stall.id) || !isString(stall.buildingId) || !Number.isInteger(stall.floor) || !isObject(stall.location) || !isObject(stall.owner) || !Array.isArray(stall.members) || !Array.isArray(stall.shops)) return false;
    if (!isString(stall.owner.type) || !isString(stall.owner.name) || !validAvatar(stall.owner) || stall.members.some(member => typeof member !== "string")) return false;
    if (stall.stallState !== undefined && !stallStates.has(stall.stallState)) return false;
    if (stall.rentTimingStatus !== undefined && !rentTimingStatuses.has(stall.rentTimingStatus)) return false;
    if (stall.graceEndsAt !== undefined && stall.graceEndsAt !== null && typeof stall.graceEndsAt !== "string") return false;
    return stall.shops.every(shop => isObject(shop) && isPositive(shop.id) && isObject(shop.owner) && isString(shop.owner.name) && ["BUY", "SELL", "TRADE"].includes(shop.direction) && validItem(shop.sellItem) && isPositive(shop.sellAmount) && validItem(shop.costItem) && isPositive(shop.costAmount) && isObject(shop.interaction) && isInteger(shop.stockCount) && isInteger(shop.availableTrades));
  }

  function validateSnapshot(value, expectedStallIds) {
    if (!isObject(value) || value.schemaVersion !== 1 || value.serverId !== "enthusia-main" || !isInteger(value.sequence) || !isPositive(value.snapshotRevision) || !Array.isArray(value.stalls) || value.stalls.length !== expectedStallIds.length) return null;
    const expected = new Set(expectedStallIds), ids = new Set(value.stalls.map(stall => stall?.id));
    if (ids.size !== expected.size || [...expected].some(id => !ids.has(id)) || !value.stalls.every(stall => validStall(stall, expected))) return null;
    return value;
  }

  class MarketApiClient {
    constructor(options) {
      this.apiOrigin = options.apiOrigin || API_ORIGIN;
      if (this.apiOrigin !== API_ORIGIN) throw new Error("Unsupported Market API origin");
      this.expectedStallIds = [...options.expectedStallIds];
      this.fixtureSnapshot = options.fixtureSnapshot || null;
      this.fetchImpl = options.fetchImpl || window.fetch.bind(window);
      this.WebSocketImpl = options.WebSocketImpl || window.WebSocket;
      this.onSnapshot = options.onSnapshot || (() => {});
      this.onStallUpdate = options.onStallUpdate || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.setTimeoutImpl = options.setTimeoutImpl || window.setTimeout.bind(window);
      this.clearTimeoutImpl = options.clearTimeoutImpl || window.clearTimeout.bind(window);
      this.sequence = 0;
      this.snapshot = null;
      this.source = "unavailable";
      this.lastUpdatedAt = null;
      this.socket = null;
      this.reconnectAttempt = 0;
      this.reconnectTimer = null;
      this.snapshotRetryTimer = null;
      this.refreshPromise = null;
      this.stopped = false;
      this.online = typeof navigator === "undefined" || navigator.onLine !== false;
      this.handleOnline = () => { this.online = true; this.reconnectAttempt = 0; this.source === "api" ? this.scheduleReconnect(0) : this.scheduleSnapshotRetry(0); };
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
        if (!this.fixtureSnapshot) throw new Error("A local Market fixture is required for file previews");
        const fixture = { ...this.fixtureSnapshot, stalls: [...this.fixtureSnapshot.stalls] };
        this.useSnapshot(fixture, "fixture", false); this.emitStatus("fixture"); return fixture;
      }
      try {
        return this.useSnapshot(await this.fetchSnapshot(), "api", false);
      } catch {
        this.source = "unavailable";
        this.emitStatus("unavailable");
        this.scheduleSnapshotRetry();
        return null;
      }
    }

    startLive() {
      if (this.stopped) return;
      if (this.source !== "api") { this.emitStatus("unavailable"); this.scheduleSnapshotRetry(); return; }
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
          if (this.source !== "api") this.emitStatus("unavailable");
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
      this.emitStatus(this.source === "api" ? "reconnecting" : "unavailable");
      this.reconnectTimer = this.setTimeoutImpl(() => { this.reconnectTimer = null; this.source === "api" ? this.connect() : this.refreshSnapshot("retry"); }, delay);
    }

    scheduleSnapshotRetry(delay = FALLBACK_RETRY_DELAY) {
      if (this.stopped || this.snapshotRetryTimer || this.isSocketOpen()) return;
      this.snapshotRetryTimer = this.setTimeoutImpl(() => { this.snapshotRetryTimer = null; this.refreshSnapshot("retry"); }, delay);
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
