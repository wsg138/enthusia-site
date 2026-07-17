(function () {
  "use strict";

  const normalize = value => String(value ?? "").trim().toLowerCase();
  const materialName = value => normalize(value).replaceAll("_", " ");
  const itemSearchKey = value => normalize(stripMinecraftFormatting(value))
    .replace(/^minecraft:/, "")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ");
  const romanLevel = level => ({1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X"})[level] || String(level);
  const stripMinecraftFormatting = value => String(value ?? "")
    .replace(/<\/?!?(?:[a-z][a-z0-9_-]*|#[0-9a-f]{6})(?::[^<>]*)?>/gi, "")
    .replace(/(?:§x(?:§[0-9a-f]){6}|&x(?:&[0-9a-f]){6})/gi, "")
    .replace(/&#[0-9a-f]{6}/gi, "")
    .replace(/[§&][0-9a-fk-orx]/gi, "")
    .trim();
  const titleMaterialName = material => materialName(material).replace(/\b\w/g, character => character.toUpperCase());
  const canonicalBlockName = (material, displayName) => String(material || "").endsWith("_BLOCK") && /\bblock of\b/i.test(displayName)
    ? titleMaterialName(material)
    : displayName;
  const canonicalBlockQuery = value => normalize(value)
    .replace(/^block of (.+)$/, "$1 block")
    .replace(/^(.+?) block of (.+)$/, "$1 $2 block");
  const enchantmentDisplay = enchantment => {
    const displayName = stripMinecraftFormatting(enchantment?.displayName);
    const numeral = romanLevel(enchantment?.level);
    return displayName === numeral || displayName.endsWith(` ${numeral}`) ? displayName : `${displayName} ${numeral}`.trim();
  };
  const formatStackQuantity = amount => {
    const total = Number(amount);
    if (!Number.isInteger(total) || total < 64) return String(amount);
    const stacks = Math.floor(total / 64), remainder = total % 64;
    return `${stacks} ${stacks === 1 ? "stack" : "stacks"}${remainder ? ` + ${remainder}` : ""}`;
  };
  const formatTransactionQuantity = (amount, direction, side) => direction !== "TRADE" && side === "costItem" ? String(amount) : formatStackQuantity(amount);
  const rawGold = Object.freeze({material: "RAW_GOLD", displayName: "Raw Gold", amount: 1, icon: null, metadata: {}});
  const publicShop = shop => shop.direction === "TRADE" ? shop : {...shop, costItem: {...rawGold, metadata: {}}};
  const publicStall = stall => ({
    ...stall,
    stallState: stall.stallState || (stall.owner.type === "NONE" ? "UNOWNED" : "OWNED"),
    graceEndsAt: stall.graceEndsAt ?? null,
    rentTimingStatus: stall.rentTimingStatus || (stall.owner.type === "NONE" ? "NOT_APPLICABLE" : stall.nextRentAt ? "PERSISTED" : "UNAVAILABLE"),
    shops: stall.shops.map(publicShop),
  });
  const publicSnapshot = snapshot => ({...(snapshot || {}), stalls: (snapshot?.stalls || []).map(publicStall)});
  const exactAliases = new Map([
    ["gap", "golden apple"], ["god apple", "enchanted golden apple"], ["notch apple", "enchanted golden apple"],
    ["enchanted golden apple", "enchanted golden apple"], ["pearl", "ender pearl"], ["enderpearl", "ender pearl"],
    ["skulker", "shulker"], ["skulker box", "shulker box"], ["invis", "invisibility"], ["infestation", "infested"]
  ]);
  const categories = [
    {id: "SWORD", queries: ["sword"], matches: material => /^(WOODEN|STONE|COPPER|GOLDEN|IRON|DIAMOND|NETHERITE)_SWORD$/.test(material)},
    {id: "ARMOR", queries: ["armor"], matches: material => /^(LEATHER|CHAINMAIL|COPPER|GOLDEN|IRON|DIAMOND|NETHERITE)_(HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/.test(material) || material === "TURTLE_HELMET"},
    {id: "WOOD", queries: ["wood"], matches: material => /_(LOG|WOOD|STEM|HYPHAE|PLANKS)$/.test(material)},
    {id: "LOG", queries: ["log", "logs"], matches: material => /_(LOG|WOOD|STEM|HYPHAE)$/.test(material)},
    {id: "PLANK", queries: ["plank", "planks"], matches: material => /_PLANKS$/.test(material)},
    {id: "SHULKER", queries: ["shulker", "shulker box", "skulker", "skulker box"], matches: material => material === "SHULKER_BOX" || /_SHULKER_BOX$/.test(material)}
  ];
  const shulkerColors = ["white", "orange", "magenta", "light blue", "yellow", "lime", "pink", "gray", "light gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
  function querySpec(value) {
    const original = canonicalBlockQuery(value).replace(/\bskulker\b/g, "shulker");
    const shulkerColor = shulkerColors.find(color => original === `${color} shulker` || original === `${color} shulker box`);
    if (shulkerColor) return {original, normalized: original, category: null, exactMaterial: `${shulkerColor.replaceAll(" ", "_").toUpperCase()}_SHULKER_BOX`};
    const normalized = exactAliases.get(original) || original;
    return {original, normalized, category: categories.find(category => category.queries.includes(normalized)) || null, exactMaterial: null};
  }
  const normalizeQuery = value => {
    return querySpec(value).normalized;
  };

  function itemPresentation(item) {
    const metadata = item?.metadata || {};
    const armorTrimTemplate = item?.material?.match(/^(.+)_ARMOR_TRIM_SMITHING_TEMPLATE$/);
    const compactTrimName = armorTrimTemplate ? `${armorTrimTemplate[1].split("_").map(word => word[0] + word.slice(1).toLowerCase()).join(" ")} Armor Trim` : null;
    const publicDisplayName = canonicalBlockName(item?.material, stripMinecraftFormatting(item?.displayName));
    const publicCustomName = stripMinecraftFormatting(metadata.customName);
    const baseDisplayName = item?.material === "ENCHANTED_BOOK" ? "Enchanted Book" : item?.material === "WRITTEN_BOOK" ? "Written Book" : compactTrimName || publicDisplayName || materialName(item?.material);
    const customDisplayName = publicCustomName && publicCustomName !== baseDisplayName ? publicCustomName : null;
    const variants = [
      ...(metadata.storedEnchantments || []).map(enchantmentDisplay),
      ...(metadata.enchantments || []).map(enchantmentDisplay),
      ...(metadata.potion?.effects || []).map(effect => `${effect.name}${effect.amplifier ? ` ${romanLevel(effect.amplifier + 1)}` : ""}${effect.durationSeconds ? ` · ${Math.floor(effect.durationSeconds / 60)}:${String(effect.durationSeconds % 60).padStart(2, "0")}` : ""}`),
      metadata.armorTrim ? `${metadata.armorTrim.material} ${metadata.armorTrim.pattern}` : null,
      metadata.smithingTemplate?.type, metadata.goatHornInstrument, metadata.writtenBook?.title,
      metadata.shulkerColor ? `${metadata.shulkerColor} Shulker Box` : null, metadata.publicVariantId
    ].filter(Boolean);
    return {baseDisplayName, customDisplayName, variantSummary: variants.join(" · "), searchableTerms: itemTerms(item)};
  }

  function itemTerms(item) {
    if (!item) return [];
    const metadata = item.metadata || {};
    const displayName = stripMinecraftFormatting(item.displayName);
    return [
      item.material, materialName(item.material), displayName, canonicalBlockName(item.material, displayName), stripMinecraftFormatting(metadata.customName),
      ...(metadata.enchantments || []).flatMap(enchantment => [enchantment.id, stripMinecraftFormatting(enchantment.displayName), `${stripMinecraftFormatting(enchantment.displayName)} ${enchantment.level}`, enchantmentDisplay(enchantment)]),
      ...(metadata.storedEnchantments || []).flatMap(enchantment => [enchantment.id, stripMinecraftFormatting(enchantment.displayName), `${stripMinecraftFormatting(enchantment.displayName)} ${enchantment.level}`, enchantmentDisplay(enchantment)]),
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
    constructor(layout, snapshot, catalog = window.ENTHUSIA_MINECRAFT_ITEM_CATALOG, variants = window.ENTHUSIA_MINECRAFT_ITEM_VARIANTS) {
      this.layout = layout;
      this.snapshot = publicSnapshot(snapshot);
      this.catalog = (catalog?.items || []).map(entry => {
        const displayName = canonicalBlockName(entry.material, stripMinecraftFormatting(entry.displayName));
        return {...entry, displayName, subtitle: entry.subtitle == null ? entry.subtitle : stripMinecraftFormatting(entry.subtitle), searchQuery: entry.searchQuery == null ? displayName : canonicalBlockName(entry.material, stripMinecraftFormatting(entry.searchQuery))};
      });
      this.variants = (variants?.items || []).map(source => {
        const entry = {...source, displayName: stripMinecraftFormatting(source.displayName), subtitle: source.subtitle == null ? source.subtitle : stripMinecraftFormatting(source.subtitle), searchQuery: source.searchQuery == null ? source.searchQuery : stripMinecraftFormatting(source.searchQuery)};
        if (entry.kind === "ENCHANTMENT") return {...entry, displayName: "Enchanted Book"};
        if (entry.kind === "POTION") {
          const [primary, duration] = entry.displayName.split(" — ");
          return {...entry, displayName: primary, subtitle: duration || entry.subtitle?.replace(/^.*? — /, "") || null};
        }
        return entry;
      });
      this.suggestionCatalog = [
        ...this.catalog.map(item => { const publicItem = {material: item.material, displayName: item.displayName, amount: 1, metadata: {}}; return {...item, displayName: itemPresentation(publicItem).baseDisplayName, kind: "MATERIAL", searchQuery: item.displayName, subtitle: null, item: publicItem}; }),
        ...this.variants
      ];
      this.stalls = new Map(this.snapshot.stalls.map(stall => [stall.id, stall]));
    }
    replaceSnapshot(snapshot) {
      this.snapshot = publicSnapshot(snapshot);
      this.stalls = new Map(this.snapshot.stalls.map(stall => [stall.id, stall]));
    }
    replaceStall(stall) {
      const replacement = publicStall(stall), index = this.snapshot.stalls.findIndex(candidate => candidate.id === replacement.id);
      if (index < 0) return false;
      const stalls = [...this.snapshot.stalls]; stalls[index] = replacement;
      this.snapshot = {...this.snapshot, stalls}; this.stalls.set(replacement.id, replacement); return true;
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
      const spec = querySpec(query), friendly = spec.normalized, material = friendly.replaceAll(" ", "_");
      if (!friendly) return [];
      const entries = this.searchEntries();
      const categoryMatches = spec.category ? entries.filter(entry => spec.category.matches(entry.match.item.material)) : [];
      const exact = spec.exactMaterial ? entries.filter(entry => entry.match.item.material === spec.exactMaterial) : spec.category ? categoryMatches : entries.filter(entry => itemTerms(entry.match.item).some(term => term === friendly || term === material));
      const selected = spec.exactMaterial || spec.category ? exact : exact.length ? exact : friendly.length < 2 ? [] : entries.filter(entry => itemTerms(entry.match.item).some(term => term.startsWith(friendly) || term.startsWith(material) || term.includes(` ${friendly}`) || term.includes(friendly)));
      const seen = new Set();
      return selected.filter(entry => {
        const key = `${entry.id}:${entry.match.side}:${entry.match.item.material}:${entry.match.contained}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    suggest(query, limit = 15) {
      const spec = querySpec(query), value = itemSearchKey(spec.normalized);
      if (value.length < 1) return [];
      const available = new Set(this.searchEntries().flatMap(entry => [entry.match.item.displayName, entry.match.item.material].map(itemSearchKey)));
      const matches = this.suggestionCatalog.filter(entry => {
        if (spec.exactMaterial) return (entry.material || entry.item?.material) === spec.exactMaterial;
        if (spec.category) return spec.category.matches(entry.material || entry.item?.material);
        const terms = [entry.displayName, entry.subtitle, entry.searchQuery, entry.material, entry.id, ...itemTerms(entry.item)].filter(Boolean).map(itemSearchKey);
        return terms.some(term => term.startsWith(value) || term.includes(` ${value}`));
      });
      const rank = entry => itemSearchKey(entry.displayName).startsWith(value) ? 0 : itemSearchKey(entry.subtitle).startsWith(value) || itemSearchKey(entry.searchQuery).startsWith(value) ? 1 : 2;
      const seen = new Set();
      return matches.sort((a, b) => rank(a) - rank(b) || Number(available.has(itemSearchKey(b.displayName)) || available.has(itemSearchKey(b.material))) - Number(available.has(itemSearchKey(a.displayName)) || available.has(itemSearchKey(a.material))) || a.displayName.localeCompare(b.displayName)).filter(entry => {
        const key = `${entry.kind}:${entry.displayName}:${entry.subtitle || ""}`; if (seen.has(key)) return false; seen.add(key); return true;
      }).slice(0, limit);
    }
  }

  window.EnthusiaMarketAdapter = {StaticMarketAdapter, itemTerms, itemPresentation, containerEntries, normalizeQuery, querySpec, categories, stripMinecraftFormatting, enchantmentDisplay, formatStackQuantity, formatTransactionQuantity};
})();
