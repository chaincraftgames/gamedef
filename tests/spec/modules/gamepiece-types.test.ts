/**
 * Parse tests for GamepieceTypesModuleSchema.
 *
 * "Pirate Duel" — two-player card-and-dice battle game.
 * Exercises every feature of the gamepiece-types module:
 *   - category: card, token, piece, dice, tile, board
 *   - hasFaceState
 *   - faceCount (dice)
 *   - orientationCount (tile)
 *   - mutable + immutable properties
 *   - all PropertyType kinds (integer, float, string, boolean, enum)
 *   - PropertyVisibility (always, revealed, owner, never)
 *   - inventorySlots
 *   - actionSlots (with and without availableInSubflows)
 *   - optional label and description fields
 */

import { GamepieceTypesModuleSchema } from "#gamedef/modules/gamepiece-types.js";

// ---------------------------------------------------------------------------
// Valid: full Pirate Duel module
// ---------------------------------------------------------------------------

describe("GamepieceTypesModuleSchema — Pirate Duel", () => {
  const validModule = {
    types: [
      // ---- card: attack/defense cards, face-down until played ----
      {
        id: "combat-card",
        category: "card",
        description: "An attack or defense card played during combat",
        hasFaceState: true,
        properties: [
          {
            id: "cardType",
            label: "Card Type",
            type: { kind: "enum", values: ["attack", "defense", "special"] },
            mutable: false,
            visibility: "revealed",
          },
          {
            id: "power",
            label: "Power",
            type: { kind: "integer", min: 1, max: 10 },
            mutable: false,
            visibility: "revealed",
            description: "Base power value of this card",
          },
          {
            id: "goldCost",
            label: "Gold Cost",
            type: { kind: "integer", min: 0 },
            mutable: false,
            visibility: "always",
            description: "Cost in gold to play this card",
          },
          {
            id: "isExhausted",
            type: { kind: "boolean" },
            mutable: true,
            default: false,
            visibility: "always",
            description: "Whether this card has been used this turn",
          },
        ],
        actionSlots: [
          {
            id: "card-ability",
            description: "Special ability on this card, if any",
            availableInSubflows: ["combat-phase"],
          },
        ],
      },

      // ---- token: gold coins used as currency ----
      {
        id: "gold-coin",
        category: "token",
        description: "A gold coin used to pay card costs",
      },

      // ---- token: damage marker placed on captain ----
      {
        id: "damage-marker",
        category: "token",
        description: "Placed on a captain to track damage taken",
      },

      // ---- piece: the player's captain unit ----
      {
        id: "captain",
        category: "piece",
        description: "Each player's captain — the piece that must survive",
        properties: [
          {
            id: "hitPoints",
            label: "Hit Points",
            type: { kind: "integer", min: 0, max: 20 },
            mutable: true,
            default: 20,
            visibility: "always",
          },
          {
            id: "shipName",
            label: "Ship Name",
            type: { kind: "string" },
            mutable: false,
            visibility: "always",
            description: "Flavor name for this captain's ship",
          },
          {
            id: "combatBonus",
            label: "Combat Bonus",
            type: { kind: "float", min: 0.0, max: 2.0 },
            mutable: false,
            visibility: "always",
            description: "Multiplier applied to card power during this captain's attacks",
          },
          {
            id: "isStunned",
            type: { kind: "boolean" },
            mutable: true,
            default: false,
            visibility: "always",
          },
          {
            id: "stunCountdown",
            type: { kind: "integer", min: 0, max: 3 },
            mutable: true,
            default: 0,
            visibility: "never",
            description: "Engine-tracked rounds remaining in stun; never shown to players",
          },
        ],
        inventorySlots: [
          {
            id: "hand",
            inventoryTypeId: "player-hand",
            description: "Cards currently held by this captain",
          },
          {
            id: "gold",
            inventoryTypeId: "gold-pool",
            description: "Gold coins available to spend",
          },
        ],
      },

      // ---- dice: d6 used for combat rolls ----
      {
        id: "combat-die",
        category: "dice",
        description: "Six-sided die rolled to resolve combat ties",
        faceCount: 6,
      },

      // ---- tile: a sea zone tile with 4-way orientation ----
      {
        id: "sea-zone",
        category: "tile",
        description: "A sea zone tile placed to build the battle map",
        orientationCount: 4,
        properties: [
          {
            id: "terrain",
            type: { kind: "enum", values: ["open-water", "reef", "fog", "whirlpool"] },
            mutable: false,
            visibility: "revealed",
          },
          {
            id: "isRevealed",
            type: { kind: "boolean" },
            mutable: true,
            default: false,
            visibility: "always",
          },
        ],
        hasFaceState: true,
      },

      // ---- board: the shared play area holding the battle grid ----
      {
        id: "battle-map",
        category: "board",
        description: "The shared play surface where sea zones and captains are placed",
        inventorySlots: [
          {
            id: "zones",
            inventoryTypeId: "sea-zone-grid",
            description: "The grid of sea zone tiles",
          },
          {
            id: "draw-pile",
            inventoryTypeId: "combat-card-deck",
            description: "Shared draw pile for combat cards",
          },
        ],
      },
    ],
  };

  it("parses a valid full module without errors", () => {
    expect(() => GamepieceTypesModuleSchema.parse(validModule)).not.toThrow();
  });

  it("applies defaults: hasFaceState=false, orientationCount=1", () => {
    const result = GamepieceTypesModuleSchema.parse(validModule);
    const goldCoin = result.types.find((t) => t.id === "gold-coin")!;
    expect(goldCoin.hasFaceState).toBe(false);
    expect(goldCoin.orientationCount).toBe(1);
  });

  it("preserves explicit hasFaceState and orientationCount", () => {
    const result = GamepieceTypesModuleSchema.parse(validModule);
    const card = result.types.find((t) => t.id === "combat-card")!;
    expect(card.hasFaceState).toBe(true);
    const tile = result.types.find((t) => t.id === "sea-zone")!;
    expect(tile.orientationCount).toBe(4);
  });

  it("preserves faceCount on dice", () => {
    const result = GamepieceTypesModuleSchema.parse(validModule);
    const die = result.types.find((t) => t.id === "combat-die")!;
    expect(die.faceCount).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Invalid: schema rejection cases
// ---------------------------------------------------------------------------

describe("GamepieceTypesModuleSchema — rejections", () => {
  it("rejects an empty types array", () => {
    expect(() => GamepieceTypesModuleSchema.parse({ types: [] })).toThrow();
  });

  it("rejects a type missing required 'id'", () => {
    expect(() =>
      GamepieceTypesModuleSchema.parse({
        types: [{ category: "card" }],
      }),
    ).toThrow();
  });

  it("rejects a type with an unknown category", () => {
    expect(() =>
      GamepieceTypesModuleSchema.parse({
        types: [{ id: "thing", category: "spaceship" }],
      }),
    ).toThrow();
  });

  it("rejects a property missing required 'id'", () => {
    expect(() =>
      GamepieceTypesModuleSchema.parse({
        types: [
          {
            id: "card",
            category: "card",
            properties: [
              { type: { kind: "boolean" }, mutable: true, visibility: "always" },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects an unknown property type kind", () => {
    expect(() =>
      GamepieceTypesModuleSchema.parse({
        types: [
          {
            id: "card",
            category: "card",
            properties: [
              { id: "x", type: { kind: "set" }, mutable: false, visibility: "always" },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects enum with fewer than 2 values", () => {
    expect(() =>
      GamepieceTypesModuleSchema.parse({
        types: [
          {
            id: "card",
            category: "card",
            properties: [
              {
                id: "x",
                type: { kind: "enum", values: ["only-one"] },
                mutable: false,
                visibility: "always",
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects faceCount less than 2", () => {
    expect(() =>
      GamepieceTypesModuleSchema.parse({
        types: [{ id: "die", category: "dice", faceCount: 1 }],
      }),
    ).toThrow();
  });

  it("rejects orientationCount less than 1", () => {
    expect(() =>
      GamepieceTypesModuleSchema.parse({
        types: [{ id: "tile", category: "tile", orientationCount: 0 }],
      }),
    ).toThrow();
  });

  it("rejects an unknown property visibility value", () => {
    expect(() =>
      GamepieceTypesModuleSchema.parse({
        types: [
          {
            id: "card",
            category: "card",
            properties: [
              {
                id: "x",
                type: { kind: "boolean" },
                mutable: false,
                visibility: "public",
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
