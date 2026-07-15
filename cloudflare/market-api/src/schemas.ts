import { z } from "zod";
import { EXPECTED_STALL_IDS, EXPECTED_STALL_SET } from "./expected-stalls";

const shortString = z.string().min(1).max(128);
const isoDate = z.iso.datetime({ offset: true });
const coordinate = z.number().int().min(-30_000_000).max(30_000_000);
const nonnegative = z.number().int().min(0).max(2_147_483_647);
const positive = z.number().int().positive().max(2_147_483_647);
const bannerColorSchema = z.enum([
  "WHITE", "ORANGE", "MAGENTA", "LIGHT_BLUE", "YELLOW", "LIME", "PINK", "GRAY",
  "LIGHT_GRAY", "CYAN", "PURPLE", "BLUE", "BROWN", "GREEN", "RED", "BLACK",
]);
const bannerPatternTypeSchema = z.enum([
  "SQUARE_BOTTOM_LEFT", "SQUARE_BOTTOM_RIGHT", "SQUARE_TOP_LEFT", "SQUARE_TOP_RIGHT",
  "STRIPE_BOTTOM", "STRIPE_TOP", "STRIPE_LEFT", "STRIPE_RIGHT", "STRIPE_CENTER",
  "STRIPE_MIDDLE", "STRIPE_DOWNRIGHT", "STRIPE_DOWNLEFT", "STRIPE_SMALL", "CROSS",
  "STRAIGHT_CROSS", "TRIANGLE_BOTTOM", "TRIANGLE_TOP", "TRIANGLES_BOTTOM", "TRIANGLES_TOP",
  "DIAGONAL_LEFT", "DIAGONAL_RIGHT", "DIAGONAL_LEFT_MIRROR", "DIAGONAL_RIGHT_MIRROR",
  "CIRCLE", "RHOMBUS", "HALF_VERTICAL", "HALF_HORIZONTAL", "HALF_VERTICAL_MIRROR",
  "HALF_HORIZONTAL_MIRROR", "BORDER", "CURLY_BORDER", "GRADIENT", "GRADIENT_UP",
  "BRICKS", "GLOBE", "CREEPER", "SKULL", "FLOWER", "MOJANG", "PIGLIN", "FLOW", "GUSTER",
]);
const bannerDesignSchema = z.object({
  baseColor: bannerColorSchema,
  patterns: z.array(z.object({ type: bannerPatternTypeSchema, color: bannerColorSchema }).strict()).max(6),
}).strict();
const publicHeadUrlSchema = z.string().url().max(2048).regex(/^https:\/\/minotar\.net\/helm\/[A-Za-z0-9._%+-]+\/96\.png$/);

const enchantmentSchema = z.object({
  id: shortString,
  displayName: z.string().min(1).max(256),
  level: z.number().int().min(-255).max(255),
}).strict();

const potionEffectSchema = z.object({
  name: z.string().min(1).max(128),
  amplifier: z.number().int().min(0).max(255),
  durationSeconds: nonnegative,
}).strict();

const potionSchema = z.object({
  id: shortString,
  basePotion: z.string().min(1).max(256),
  form: z.string().min(1).max(32),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  effects: z.array(potionEffectSchema).max(64),
}).strict();

const armorTrimSchema = z.object({ pattern: shortString, material: shortString }).strict();
const smithingTemplateSchema = z.object({ type: z.string().min(1).max(128) }).strict();
const writtenBookSchema = z.object({
  title: z.string().min(1).max(256),
  author: z.string().min(1).max(128),
  generation: z.string().min(1).max(64),
  pageCount: nonnegative.max(10_000),
}).strict();

export interface PublicItem {
  material: string;
  displayName: string;
  amount: number;
  icon: string | null;
  metadata: {
    customName?: string | null;
    enchantments?: Array<z.infer<typeof enchantmentSchema>> | null;
    storedEnchantments?: Array<z.infer<typeof enchantmentSchema>> | null;
    potion?: z.infer<typeof potionSchema> | null;
    armorTrim?: z.infer<typeof armorTrimSchema> | null;
    smithingTemplate?: z.infer<typeof smithingTemplateSchema> | null;
    writtenBook?: z.infer<typeof writtenBookSchema> | null;
    shulkerColor?: string | null;
    container?: {
      type: string;
      slots?: number | null;
      capacityUsed?: number | null;
      capacityMax?: number | null;
      contents: Array<{ slot?: number | null; item: PublicItem }>;
    } | null;
  };
}

export const publicItemSchema: z.ZodType<PublicItem> = z.lazy(() => z.object({
  material: z.string().regex(/^[A-Z0-9_]{1,128}$/),
  displayName: z.string().min(1).max(256),
  amount: positive.max(64_000),
  icon: z.string().url().max(2048).nullable(),
  metadata: z.object({
    customName: z.string().min(1).max(256).nullable().optional(),
    enchantments: z.array(enchantmentSchema).max(128).nullable().optional(),
    storedEnchantments: z.array(enchantmentSchema).max(128).nullable().optional(),
    potion: potionSchema.nullable().optional(),
    armorTrim: armorTrimSchema.nullable().optional(),
    smithingTemplate: smithingTemplateSchema.nullable().optional(),
    writtenBook: writtenBookSchema.nullable().optional(),
    shulkerColor: z.string().min(1).max(64).nullable().optional(),
    container: z.object({
      type: z.string().min(1).max(32),
      slots: nonnegative.max(1024).nullable().optional(),
      capacityUsed: nonnegative.max(1_000_000).nullable().optional(),
      capacityMax: nonnegative.max(1_000_000).nullable().optional(),
      contents: z.array(z.object({ slot: nonnegative.max(1023).nullable().optional(), item: publicItemSchema }).strict()).max(1024),
    }).strict().nullable().optional(),
  }).strict(),
}).strict());

const identitySchema = z.object({ id: shortString, name: z.string().min(1).max(64) }).strict();
const locationSchema = z.object({ world: shortString, x: coordinate, y: coordinate, z: coordinate }).strict();

export const stallSchema = z.object({
  id: z.string().regex(/^stall(?:[1-9]|[1-6][0-9]|7[01])$/),
  buildingId: z.string().regex(/^building-[1-9][0-9]*$/).max(64),
  floor: z.number().int().min(-64).max(1024),
  location: locationSchema,
  owner: z.object({
    type: z.enum(["NONE", "PLAYER", "GUILD"]),
    id: z.string().max(128).nullable(),
    uuid: z.guid().nullable(),
    name: z.string().min(1).max(64),
    avatarUrl: publicHeadUrlSchema.nullable(),
    avatar: z.object({
      kind: z.string().min(1).max(32),
      source: z.string().min(1).max(32).nullable().optional(),
      includesOuterLayer: z.boolean().nullable().optional(),
      url: z.string().max(2048).optional(),
      banner: bannerDesignSchema.nullable().optional(),
    }).strict(),
  }).strict(),
  stallState: z.enum(["UNOWNED", "AUCTIONING", "OWNED", "GRACE", "RE_AUCTIONING", "EMERGENCY_AUCTIONING"]),
  ownerSince: isoDate.nullable(),
  nextRentAt: isoDate.nullable(),
  graceEndsAt: isoDate.nullable(),
  rentTimingStatus: z.enum(["PERSISTED", "LEGACY_DERIVED", "UNAVAILABLE", "NOT_APPLICABLE"]),
  members: z.array(z.string().min(1).max(64)).max(256),
  shops: z.array(z.object({
    id: positive,
    owner: identitySchema,
    direction: z.enum(["BUY", "SELL", "TRADE"]),
    sellItem: publicItemSchema,
    sellAmount: positive,
    costItem: publicItemSchema,
    costAmount: positive,
    interaction: locationSchema.extend({ source: z.string().min(1).max(64) }).strict(),
    stockCount: nonnegative,
    availableTrades: nonnegative,
    searchable: z.boolean(),
  }).strict()).max(256),
}).strict().superRefine((stall, ctx) => {
  if (!EXPECTED_STALL_SET.has(stall.id)) ctx.addIssue({ code: "custom", message: "Unknown stall ID", path: ["id"] });
  if (stall.stallState === "GRACE" && stall.ownerSince !== null && stall.graceEndsAt === null) {
    ctx.addIssue({ code: "custom", message: "GRACE stalls require graceEndsAt", path: ["graceEndsAt"] });
  }
  if (stall.stallState !== "GRACE" && stall.graceEndsAt !== null) {
    ctx.addIssue({ code: "custom", message: "Only GRACE stalls may expose graceEndsAt", path: ["graceEndsAt"] });
  }
});

export type Stall = z.infer<typeof stallSchema>;

const envelope = {
  schemaVersion: z.literal(1),
  serverId: z.literal("enthusia-main"),
  serverEpoch: z.string().min(1).max(128).regex(/^[\x21-\x7e]+$/),
  eventId: z.string().min(1).max(128).regex(/^[\x21-\x7e]+$/),
  sentAt: isoDate,
};

export const testRequestSchema = z.object({ ...envelope, probe: z.string().min(1).max(1024) }).strict();
export const stallUpdateSchema = z.object({ ...envelope, revision: positive, stall: stallSchema }).strict();
export const fullSyncSchema = z.object({
  ...envelope,
  snapshotRevision: positive,
  generatedAt: isoDate,
  stalls: z.array(z.object({ revision: positive, stall: stallSchema }).strict()).length(EXPECTED_STALL_IDS.length),
}).strict().superRefine((value, ctx) => {
  const ids = value.stalls.map((entry) => entry.stall.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate stall IDs", path: ["stalls"] });
  for (const id of EXPECTED_STALL_IDS) {
    if (!unique.has(id)) ctx.addIssue({ code: "custom", message: `Missing canonical stall ${id}`, path: ["stalls"] });
  }
});

export function validateRouteStall(stallId: string, stall: Stall): boolean {
  return EXPECTED_STALL_SET.has(stallId) && stall.id === stallId;
}
