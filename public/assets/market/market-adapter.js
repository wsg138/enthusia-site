(function () {
  "use strict";

  const normalize = value => String(value ?? "").trim().toLowerCase();
  const materialName = value => normalize(value).replaceAll("_", " ");

  function itemTerms(item) {
    if (!item) return [];
    const metadata = item.metadata || {};
    return [
      item.material, materialName(item.material), item.displayName, metadata.customName,
      ...(metadata.enchantments || []).flatMap(enchantment => [enchantment.id, enchantment.displayName, `${enchantment.displayName} ${enchantment.level}`]),
      ...(metadata.storedEnchantments || []).flatMap(enchantment => [enchantment.id, enchantment.displayName, `${enchantment.displayName} ${enchantment.level}`]),
      metadata.armorTrim?.pattern, metadata.armorTrim?.material,
      metadata.potion?.basePotion, ...(metadata.potion?.effects || []).map(effect => effect.name),
      metadata.smithingTemplate?.type, metadata.shulkerColor,
      metadata.writtenBook?.title, metadata.writtenBook?.author, metadata.goatHornInstrument,
      ...(metadata.fireworkEffects || []).flatMap(effect => [effect.type, effect.description]),
      ...(metadata.bannerPatterns || []).flatMap(pattern => [pattern.pattern, pattern.color]),
      metadata.publicVariantId
    ].filter(Boolean).map(normalize);
  }

  function containerEntries(item, side, container = null, path = [], depth = 0, ancestors = new Set(), containerPath = []) {
    const direct = [{item, side, container, contained: Boolean(container), path, depth, containerPath}];
    if (!item || depth >= 4 || ancestors.has(item)) return direct;
    const contents = item?.metadata?.container?.contents || [];
    const nextAncestors = new Set(ancestors).add(item);
    return direct.concat(contents.flatMap((entry, index) => containerEntries(entry.item, side, item, [...path, {index, slot: entry.slot ?? null}], depth + 1, nextAncestors, [...containerPath, item])));
  }

  class StaticMarketAdapter {
    constructor(layout, snapshot, catalog = window.ENTHUSIA_MINECRAFT_ITEM_CATALOG) {
      this.layout = layout;
      this.snapshot = snapshot;
      this.catalog = catalog?.items || [];
      this.stalls = new Map(snapshot.stalls.map(stall => [stall.id, stall]));
    }
    getStall(id) { return this.stalls.get(id) || null; }
    getBuilding(id) { return this.layout.buildings.find(building => building.id === id) || null; }
    getShops() {
      return this.snapshot.stalls.flatMap(stall => stall.shops.filter(shop => shop.searchable !== false).map(shop => ({...shop, stall})));
    }
    searchEntries() {
      return this.getShops().flatMap(shop => [
        ...containerEntries(shop.sellItem, "sellItem"),
        ...containerEntries(shop.costItem, "costItem")
      ].map(match => ({...shop, match})));
    }
    searchItems(query) {
      const friendly = normalize(query), material = friendly.replaceAll(" ", "_");
      if (!friendly) return [];
      const entries = this.searchEntries();
      const exact = entries.filter(entry => itemTerms(entry.match.item).some(term => term === friendly || term === material));
      const selected = exact.length ? exact : friendly.length < 2 ? [] : entries.filter(entry => itemTerms(entry.match.item).some(term => term.startsWith(friendly) || term.startsWith(material)));
      const seen = new Set();
      return selected.filter(entry => {
        const key = `${entry.id}:${entry.match.side}:${entry.match.item.material}:${entry.match.contained}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    suggest(query, limit = 15) {
      const value = normalize(query);
      if (value.length < 1) return [];
      const available = new Set(this.searchEntries().flatMap(entry => [normalize(entry.match.item.displayName), normalize(entry.match.item.material)]));
      const materialQuery = value.replaceAll(" ", "_"), matches = this.catalog.filter(item => normalize(item.displayName).startsWith(value) || normalize(item.material).startsWith(materialQuery) || normalize(item.id).startsWith(`minecraft:${materialQuery}`));
      const rank = item => normalize(item.displayName).startsWith(value) ? 0 : 1;
      return matches.sort((a, b) => rank(a) - rank(b) || Number(available.has(normalize(b.displayName)) || available.has(normalize(b.material))) - Number(available.has(normalize(a.displayName)) || available.has(normalize(a.material))) || a.displayName.localeCompare(b.displayName)).slice(0, limit).map(item => item.displayName);
    }
  }

  window.EnthusiaMarketAdapter = {StaticMarketAdapter, itemTerms, containerEntries};
})();
