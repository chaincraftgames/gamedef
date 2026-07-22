/**
 * Parse tests for CatalogModuleSchema.
 *
 * Exercises:
 *   - Catalog as pure piece registry (no inventory, no placement, no forRoles)
 *   - Named unique pieces (id + properties)
 *   - Fungible anonymous pieces (quantity)
 *   - Property value types (string, number, boolean, mixed)
 *   - Full game examples (Liar's Dice, chess, card game, resource game)
 *   - Rejection cases
 */

import { CatalogModuleSchema } from "#gamedef/modules/catalog.js";

function ok(data: unknown) {
  const result = CatalogModuleSchema.safeParse(data);
  if (!result.success) throw new Error(JSON.stringify(result.error.format(), null, 2));
  return result.data;
}

function fail(data: unknown) {
  const result = CatalogModuleSchema.safeParse(data);
  expect(result.success).toBe(false);
}

// ---------------------------------------------------------------------------
// Liar's Dice
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — Liar's Dice", () => {
  const liarsCatalog = {
    entries: [
      { typeId: "die", quantity: 30 },
    ],
  };

  it("parses a valid Liar's Dice catalog", () => {
    const result = ok(liarsCatalog);
    expect(result.entries).toHaveLength(1);
  });

  it("preserves typeId", () => {
    const result = ok(liarsCatalog);
    expect(result.entries[0].typeId).toBe("die");
  });

  it("preserves quantity", () => {
    const result = ok(liarsCatalog);
    expect(result.entries[0].quantity).toBe(30);
  });

  it("id is optional", () => {
    const result = ok(liarsCatalog);
    expect(result.entries[0].id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Chess (named pieces with properties, no inventory)
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — Chess subset", () => {
  const chessCatalog = {
    entries: [
      { id: "white-king", typeId: "king", properties: { color: "white" } },
      { id: "white-queen", typeId: "queen", properties: { color: "white" } },
      { typeId: "pawn", quantity: 8, properties: { color: "white" } },
      { typeId: "pawn", quantity: 8, properties: { color: "black" } },
      { id: "black-king", typeId: "king", properties: { color: "black" } },
    ],
  };

  it("parses chess subset catalog", () => {
    const result = ok(chessCatalog);
    expect(result.entries).toHaveLength(5);
  });

  it("preserves named piece id", () => {
    const result = ok(chessCatalog);
    expect(result.entries[0].id).toBe("white-king");
    expect(result.entries[4].id).toBe("black-king");
  });

  it("preserves string property value", () => {
    const result = ok(chessCatalog);
    expect((result.entries[0].properties as any).color).toBe("white");
  });

  it("preserves quantity on bulk entries", () => {
    const result = ok(chessCatalog);
    expect(result.entries[2].quantity).toBe(8);
    expect(result.entries[3].quantity).toBe(8);
  });

  it("no inventory field exists on entries", () => {
    const result = ok(chessCatalog);
    expect((result.entries[0] as any).inventory).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Card game (52 cards, each with rank + suit properties)
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — Card game", () => {
  const cardCatalog = {
    entries: [
      { typeId: "playing-card", properties: { rank: "2", suit: "hearts" } },
      { typeId: "playing-card", properties: { rank: "ace", suit: "spades" } },
    ],
  };

  it("parses card catalog", () => {
    const result = ok(cardCatalog);
    expect(result.entries).toHaveLength(2);
  });

  it("preserves rank and suit properties", () => {
    const result = ok(cardCatalog);
    expect((result.entries[0].properties as any).rank).toBe("2");
    expect((result.entries[0].properties as any).suit).toBe("hearts");
    expect((result.entries[1].properties as any).rank).toBe("ace");
  });
});

// ---------------------------------------------------------------------------
// Resource game (fungible tokens, no inventory)
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — Resource game", () => {
  const resourceCatalog = {
    entries: [
      { typeId: "gold-coin", quantity: 30 },
      { typeId: "wood-token", quantity: 20 },
      { typeId: "food-token", quantity: 25 },
      { typeId: "settlement", quantity: 20 },
    ],
  };

  it("parses resource game catalog", () => {
    const result = ok(resourceCatalog);
    expect(result.entries).toHaveLength(4);
  });

  it("preserves quantities", () => {
    const result = ok(resourceCatalog);
    expect(result.entries[0].quantity).toBe(30);
    expect(result.entries[1].quantity).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Werewolf (role-specific items — no forRoles, just quantity)
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — Werewolf", () => {
  it("parses werewolf catalog with role-specific item counts", () => {
    const result = ok({
      entries: [
        { typeId: "kill-card", quantity: 1 },
        { typeId: "heal-potion", quantity: 2 },
        { typeId: "vote-token", quantity: 10 },
      ],
    });
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].typeId).toBe("kill-card");
    expect(result.entries[2].quantity).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Property value types
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — property value types", () => {
  it("parses number property (integer)", () => {
    const result = ok({
      entries: [{ typeId: "hero", properties: { health: 10, attackPower: 3 } }],
    });
    expect((result.entries[0].properties as any).health).toBe(10);
    expect((result.entries[0].properties as any).attackPower).toBe(3);
  });

  it("parses boolean property", () => {
    const result = ok({
      entries: [{ typeId: "card", properties: { faceUp: false, playable: true } }],
    });
    expect((result.entries[0].properties as any).faceUp).toBe(false);
  });

  it("parses string (enum) property", () => {
    const result = ok({
      entries: [{ typeId: "playing-card", properties: { suit: "hearts", rank: "ace" } }],
    });
    expect((result.entries[0].properties as any).suit).toBe("hearts");
  });

  it("parses mixed property types", () => {
    const result = ok({
      entries: [{
        typeId: "character",
        properties: { name: "Ranger", health: 8, alive: true, faction: "village" },
      }],
    });
    const props = result.entries[0].properties as any;
    expect(props.name).toBe("Ranger");
    expect(props.health).toBe(8);
    expect(props.alive).toBe(true);
  });

  it("omitting properties is valid", () => {
    const result = ok({ entries: [{ typeId: "token" }] });
    expect(result.entries[0].properties).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rejection cases
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — rejections", () => {
  it("rejects empty entries array", () => {
    fail({ entries: [] });
  });

  it("rejects entry missing typeId", () => {
    fail({ entries: [{ id: "x", properties: { color: "red" } }] });
  });

  it("rejects quantity < 1", () => {
    fail({ entries: [{ typeId: "die", quantity: 0 }] });
  });

  it("rejects quantity as non-integer", () => {
    fail({ entries: [{ typeId: "die", quantity: 1.5 }] });
  });
});

// ---------------------------------------------------------------------------
// Action bindings
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — actionBindings", () => {
  it("accepts a string reference binding", () => {
    const result = ok({
      entries: [{
        typeId: "card",
        actionBindings: { "play-effect": "play-strike" },
      }],
    });
    expect(result.entries[0].actionBindings!["play-effect"]).toBe("play-strike");
  });

  it("accepts an inline action binding", () => {
    const result = ok({
      entries: [{
        typeId: "card",
        properties: { name: "Fireball" },
        actionBindings: {
          "play-effect": {
            label: "Play Fireball",
            effects: [
              { kind: "set-state", path: "game.property.enemyHp", value: { delta: -8 } },
            ],
          },
        },
      }],
    });
    const binding = result.entries[0].actionBindings!["play-effect"] as any;
    expect(binding.label).toBe("Play Fireball");
  });

  it("accepts multiple action bindings on one entry", () => {
    const result = ok({
      entries: [{
        typeId: "creature",
        actionBindings: {
          "attack": "melee-attack",
          "special": "fireball",
        },
      }],
    });
    expect(Object.keys(result.entries[0].actionBindings!)).toHaveLength(2);
  });

  it("omitting actionBindings is valid", () => {
    const result = ok({ entries: [{ typeId: "token" }] });
    expect(result.entries[0].actionBindings).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Passive bindings
// ---------------------------------------------------------------------------

describe("CatalogModuleSchema — passiveBindings", () => {
  it("accepts a string reference binding", () => {
    const result = ok({
      entries: [{
        typeId: "equipment",
        properties: { name: "Iron Armor" },
        passiveBindings: { "worn-passive": "armor-absorb" },
      }],
    });
    expect(result.entries[0].passiveBindings!["worn-passive"]).toBe("armor-absorb");
  });

  it("accepts an inline passive binding (attenuate)", () => {
    const result = ok({
      entries: [{
        typeId: "equipment",
        properties: { name: "Vampiric Blade" },
        passiveBindings: {
          "worn-passive": {
            trigger: { kind: "state-write", scope: "actor", path: "player.property.hp", direction: "decrease" },
            effects: [
              { kind: "set-state", path: "player.property.hp", value: { delta: 1 } },
            ],
          },
        },
      }],
    });
    const binding = result.entries[0].passiveBindings!["worn-passive"] as any;
    expect(binding.trigger.scope).toBe("actor");
  });

  it("accepts an inline passive binding (cancel-effect)", () => {
    const result = ok({
      entries: [{
        typeId: "equipment",
        passiveBindings: {
          "worn-passive": {
            trigger: { kind: "state-write", scope: "target", path: "player.property.hp", direction: "decrease" },
            effects: [{ kind: "cancel-effect" }],
          },
        },
      }],
    });
    const binding = result.entries[0].passiveBindings!["worn-passive"] as any;
    expect(binding.effects[0].kind).toBe("cancel-effect");
  });

  it("omitting passiveBindings is valid (piece has no passive)", () => {
    const result = ok({ entries: [{ typeId: "equipment", properties: { name: "Plain Shield" } }] });
    expect(result.entries[0].passiveBindings).toBeUndefined();
  });

  it("rejects inline passive binding with empty effects", () => {
    fail({
      entries: [{
        typeId: "equipment",
        passiveBindings: {
          "worn-passive": {
            trigger: ["deal-damage"],
            scope: "owner-targeted",
            effects: [],
          },
        },
      }],
    });
  });
});
