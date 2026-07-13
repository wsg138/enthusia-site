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

  function containerEntries(item, side, container = null, path = [], depth = 0, ancestors = new Set()) {
    const direct = [{item, side, container, contained: Boolean(container), path, depth}];
    if (!item || depth >= 4 || ancestors.has(item)) return direct;
    const contents = item?.metadata?.container?.contents || [];
    const nextAncestors = new Set(ancestors).add(item);
    return direct.concat(contents.flatMap((entry, index) => containerEntries(entry.item, side, item, [...path, {index, slot: entry.slot ?? null}], depth + 1, nextAncestors)));
  }

  class StaticMarketAdapter {
    constructor(layout, snapshot) {
      this.layout = layout;
      this.snapshot = snapshot;
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
    suggest(query, limit = 6) {
      const value = normalize(query);
      if (value.length < 2) return [];
      const names = [...new Set(this.searchEntries().flatMap(entry => [entry.match.item.displayName, materialName(entry.match.item.material), entry.match.item.metadata?.customName]).filter(Boolean))];
      return names.filter(name => normalize(name).startsWith(value)).sort().slice(0, limit);
    }
  }

  window.EnthusiaMarketAdapter = {StaticMarketAdapter, itemTerms, containerEntries};
})();
