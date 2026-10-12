// Keep this visual check on its labeled captured feed; never connect to a live stream.
window.EnthusiaMarketApi.MarketApiClient = class extends window.EnthusiaMarketApi.MarketApiClient {
  connect() {}
};
