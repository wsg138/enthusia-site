(function (root) {
  "use strict";

  const minotarHeadUrlPattern = /^https:\/\/minotar\.net\/helm\/[A-Za-z0-9._%+-]+\/96\.png$/;
  const capturedHeadUrlPattern = /^https:\/\/market-api\.enthusia\.info\/v1\/player-heads\/[0-9a-f]{64}\.png$/;

  function ownerHeadUrl(owner) {
    const url = owner?.avatarUrl;
    if (typeof url !== "string" || url.length > 2048) return null;
    return minotarHeadUrlPattern.test(url) || capturedHeadUrlPattern.test(url) ? url : null;
  }

  root.EnthusiaMarketOwnerUrl = Object.freeze({ ownerHeadUrl });
})(typeof window === "undefined" ? globalThis : window);
