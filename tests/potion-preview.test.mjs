import assert from "node:assert/strict";
import test from "node:test";

await import("../public/assets/market/potion-preview-fix.js");
const { colorIndex, potionId, visitItem } = globalThis.EnthusiaPotionPreview;

test("normalizes unnamespaced potion IDs", () => {
  assert.equal(potionId("strong_strength"), "minecraft:strong_strength");
  assert.equal(potionId("minecraft:long_swiftness"), "minecraft:long_swiftness");
});

test("applies exact manifest colors recursively inside shulker boxes", () => {
  const colors = colorIndex({ items: [
    { potionId: "minecraft:strong_strength", form: "POTION", exactTintColor: "#932423" },
    { potionId: "minecraft:long_swiftness", form: "SPLASH", exactTintColor: "#7CAFC6" }
  ] });
  const item = {
    material: "PURPLE_SHULKER_BOX",
    metadata: {
      container: {
        contents: [
          { slot: 0, item: { material: "POTION", metadata: { potion: { basePotion: "strong_strength" } } } },
          { slot: 1, item: { material: "SPLASH_POTION", metadata: { potion: { id: "minecraft:long_swiftness" } } } }
        ]
      }
    }
  };

  visitItem(item, colors);
  const [strength, swiftness] = item.metadata.container.contents.map(entry => entry.item.metadata.potion);
  assert.deepEqual(strength, { basePotion: "strong_strength", id: "minecraft:strong_strength", color: "#932423" });
  assert.deepEqual(swiftness, { id: "minecraft:long_swiftness", color: "#7cafc6" });
});

test("does not overwrite unknown potion colors with the water default", () => {
  const potion = { material: "POTION", metadata: { potion: { basePotion: "custom_unknown", color: "#123456" } } };
  visitItem(potion, new Map());
  assert.equal(potion.metadata.potion.id, "minecraft:custom_unknown");
  assert.equal(potion.metadata.potion.color, "#123456");
});
