export default {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://enthusia.info/schemas/prestige-snapshot.v1.json",
  "title": "Enthusia Hall of Prestige snapshot (schemaVersion 1)",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "generatedAt",
    "revision",
    "maxTier",
    "tiers",
    "guilds",
    "recent",
    "totals"
  ],
  "$defs": {
    "uuid": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    },
    "time": {
      "type": "string",
      "format": "date-time",
      "description": "UTC ISO-8601 with Z"
    },
    "tier": {
      "type": "integer",
      "minimum": 1,
      "maximum": 6
    },
    "roman": {
      "type": "string",
      "enum": [
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI"
      ]
    },
    "dye": {
      "type": "string",
      "enum": [
        "WHITE",
        "ORANGE",
        "MAGENTA",
        "LIGHT_BLUE",
        "YELLOW",
        "LIME",
        "PINK",
        "GRAY",
        "LIGHT_GRAY",
        "CYAN",
        "PURPLE",
        "BLUE",
        "BROWN",
        "GREEN",
        "RED",
        "BLACK"
      ]
    },
    "hex": {
      "type": "string",
      "pattern": "^#[0-9A-Fa-f]{6}$"
    },
    "banner": {
      "type": [
        "object",
        "null"
      ],
      "additionalProperties": false,
      "required": [
        "baseColor",
        "baseColorHex",
        "patterns"
      ],
      "description": "Same shape as BannerDto in the existing guild directory feed; render with public/assets/guild-banner-renderer.js.",
      "properties": {
        "baseColor": {
          "$ref": "#/$defs/dye"
        },
        "baseColorHex": {
          "$ref": "#/$defs/hex"
        },
        "patterns": {
          "type": "array",
          "maxItems": 16,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "type",
              "color",
              "colorHex"
            ],
            "properties": {
              "type": {
                "type": "string",
                "maxLength": 64
              },
              "color": {
                "$ref": "#/$defs/dye"
              },
              "colorHex": {
                "$ref": "#/$defs/hex"
              }
            }
          }
        }
      }
    },
    "guildRef": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "guildId",
        "name",
        "reachedAt",
        "disbanded"
      ],
      "properties": {
        "guildId": {
          "$ref": "#/$defs/uuid"
        },
        "name": {
          "type": "string",
          "maxLength": 32
        },
        "reachedAt": {
          "$ref": "#/$defs/time"
        },
        "disbanded": {
          "type": "boolean"
        }
      }
    },
    "historyEntry": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "tier",
        "reachedAt",
        "firstOnServer",
        "keptReward",
        "feePaid",
        "credited",
        "creditedTotal"
      ],
      "properties": {
        "tier": {
          "$ref": "#/$defs/tier"
        },
        "reachedAt": {
          "$ref": "#/$defs/time",
          "description": "When this guild FIRST reached this tier."
        },
        "firstOnServer": {
          "type": "boolean",
          "description": "This guild was the first on the server to reach this tier."
        },
        "keptReward": {
          "type": [
            "object",
            "null"
          ],
          "additionalProperties": false,
          "required": [
            "id",
            "name"
          ],
          "properties": {
            "id": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9-]{0,63}$"
            },
            "name": {
              "type": "string",
              "maxLength": 48
            }
          }
        },
        "feePaid": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 0,
          "description": "Guild bank gold paid for this prestige; null if unknown."
        },
        "credited": {
          "type": "array",
          "maxItems": 100,
          "items": {
            "$ref": "#/$defs/uuid"
          },
          "description": "Minecraft UUIDs of the members in the guild at reachedAt. Kept even if they later left. Names are resolved by the website from the players snapshot."
        },
        "creditedTotal": {
          "type": "integer",
          "minimum": 0,
          "description": "Full count; larger than credited.length when the list was capped."
        }
      }
    },
    "guild": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "name",
        "tag",
        "tier",
        "hallRank",
        "reachedAt",
        "level",
        "memberCount",
        "banner",
        "history"
      ],
      "properties": {
        "id": {
          "$ref": "#/$defs/uuid"
        },
        "name": {
          "type": "string",
          "maxLength": 32
        },
        "tag": {
          "type": [
            "string",
            "null"
          ],
          "maxLength": 32,
          "description": "Plain-text tag (no colour codes)."
        },
        "tier": {
          "$ref": "#/$defs/tier",
          "description": "Current prestige count (respects staff adjustments)."
        },
        "hallRank": {
          "type": "integer",
          "minimum": 1,
          "description": "Same order as the in-game Hall: tier desc, then earliest reachedAt, then id."
        },
        "reachedAt": {
          "$ref": "#/$defs/time",
          "description": "When the guild first reached its current tier."
        },
        "level": {
          "type": "integer",
          "minimum": 0
        },
        "memberCount": {
          "type": "integer",
          "minimum": 0
        },
        "banner": {
          "$ref": "#/$defs/banner"
        },
        "history": {
          "type": "array",
          "minItems": 1,
          "maxItems": 6,
          "items": {
            "$ref": "#/$defs/historyEntry"
          },
          "description": "Ascending by tier; only tiers <= current tier."
        }
      }
    }
  },
  "properties": {
    "schemaVersion": {
      "const": 1
    },
    "generatedAt": {
      "$ref": "#/$defs/time"
    },
    "revision": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$",
      "description": "SHA-256 of the canonical payload; changes whenever any public field changes."
    },
    "maxTier": {
      "type": "integer",
      "minimum": 1,
      "maximum": 6
    },
    "tiers": {
      "type": "array",
      "minItems": 6,
      "maxItems": 6,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "tier",
          "roman",
          "fee",
          "perks",
          "first",
          "guildCount"
        ],
        "properties": {
          "tier": {
            "$ref": "#/$defs/tier"
          },
          "roman": {
            "$ref": "#/$defs/roman"
          },
          "fee": {
            "type": "integer",
            "minimum": 0,
            "description": "Current configured fee in guild-bank gold."
          },
          "perks": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "second_ally_home",
                "extra_stall",
                "second_vault"
              ]
            },
            "description": "Only perks that are live on the server. Unlocked at this tier and kept above it."
          },
          "first": {
            "anyOf": [
              {
                "$ref": "#/$defs/guildRef"
              },
              {
                "type": "null"
              }
            ],
            "description": "First guild ever to reach this tier, including disbanded guilds; null = unclaimed."
          },
          "guildCount": {
            "type": "integer",
            "minimum": 0,
            "description": "Active guilds whose current tier equals this tier."
          }
        }
      }
    },
    "guilds": {
      "type": "array",
      "maxItems": 200,
      "items": {
        "$ref": "#/$defs/guild"
      },
      "description": "Active (not disbanded) guilds with tier >= 1, ordered by hallRank."
    },
    "recent": {
      "type": "array",
      "maxItems": 10,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "guildId",
          "name",
          "tier",
          "reachedAt",
          "disbanded"
        ],
        "properties": {
          "guildId": {
            "$ref": "#/$defs/uuid"
          },
          "name": {
            "type": "string",
            "maxLength": 32
          },
          "tier": {
            "$ref": "#/$defs/tier"
          },
          "reachedAt": {
            "$ref": "#/$defs/time"
          },
          "disbanded": {
            "type": "boolean"
          }
        }
      },
      "description": "Newest first. Every applied prestige, including ones by guilds since disbanded."
    },
    "totals": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "prestiges",
        "guildsPrestiged",
        "tiersClaimed",
        "goldSpent"
      ],
      "properties": {
        "prestiges": {
          "type": "integer",
          "minimum": 0
        },
        "guildsPrestiged": {
          "type": "integer",
          "minimum": 0
        },
        "tiersClaimed": {
          "type": "integer",
          "minimum": 0,
          "maximum": 6
        },
        "goldSpent": {
          "type": "integer",
          "minimum": 0
        }
      }
    }
  }
};
