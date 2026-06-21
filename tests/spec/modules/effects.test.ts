/**
 * Parse tests for EffectsModuleSchema.
 *
 * "Liar's Dice" — bluffing dice game.
 * Exercises every effect kind and the full call-site machinery:
 *   - move (draw, discard, steal)
 *   - flip (reveal dice)
 *   - update (score, property delta, toggle, param ref)
 *   - shuffle
 *   - distribute (deal dice to players)
 *   - roll
 *   - orient
 *   - prose (escape hatch)
 *   - cancel-effect (reactive negate)
 *   - NamedEffectSchema (id required)
 *   - EffectSchema (anonymous inline, no id)
 *   - EffectCallRefSchema ({ ref })
 *   - EffectCallSchema union (ref or inline)
 *   - EffectCallsSchema (min 1)
 *   - PieceSelectorSchema (all select variants including { id })
 *   - DistributeTargetSchema (roles filter)
 *   - PropertyValueSchema (literal, delta, toggle, param)
 *   - InventoryPlacementSchema (stack-top, stack-bottom, line-index, grid-cell)
 */

import {
  EffectsModuleSchema,
  EffectCallSchema,
  EffectCallsSchema,
  EffectCallRefSchema,
  EffectSchema,
  LlmEffectSchema,
  LlmInputSchema,
} from "#gamedef/modules/effects.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  const result = EffectsModuleSchema.safeParse(data);
  if (!result.success) throw new Error(JSON.stringify(result.error.format(), null, 2));
  return result.data;
}

function fail(data: unknown) {
  const result = EffectsModuleSchema.safeParse(data);
  expect(result.success).toBe(false);
}

// ---------------------------------------------------------------------------
// Valid: full Liar's Dice effects module
// ---------------------------------------------------------------------------

describe("EffectsModuleSchema — Liar's Dice", () => {
  const validModule = {
    effects: [
      // move: draw dice from cup to player tray
      {
        id: "draw-die",
        kind: "move",
        from: { inventory: "dice-cup", select: "top" },
        to: { inventory: "player-tray" },
      },

      // move: discard a die (deterministic selection; player choice handled via action input)
      {
        id: "discard-die",
        kind: "move",
        from: { inventory: "player-tray", select: "random", count: 1 },
        to: { inventory: "discard-pile", at: { kind: "stack-top" } },
      },

      // move: steal a die from another player (random selection)
      {
        id: "steal-die",
        kind: "move",
        from: { inventory: "opponent-tray", select: "random", count: 1 },
        to: { inventory: "player-tray" },
      },

      // move: move all dice to specific indexed position
      {
        id: "stack-dice",
        kind: "move",
        from: { inventory: "player-tray", select: "all" },
        to: { inventory: "display-rack", at: { kind: "line-index", index: 0 } },
      },

      // move: place die at a row+col position (grid inventory)
      {
        id: "place-on-grid",
        kind: "move",
        from: { inventory: "player-tray", select: "top" },
        to: { inventory: "grid-board", at: { kind: "grid-cell", row: 1, col: 2 } },
      },

      // flip: reveal all dice in player tray
      {
        id: "reveal-dice",
        kind: "flip",
        pieces: { inventory: "player-tray", select: "all" },
        to: "face-up",
      },

      // flip: hide a single die
      {
        id: "hide-die",
        kind: "flip",
        pieces: { inventory: "player-tray", select: "top" },
        to: "face-down",
      },

      // update: increment score by 1 (delta)
      {
        id: "score-point",
        kind: "update",
        pieces: { inventory: "score-tracker", select: "top" },
        property: "points",
        value: { delta: 1 },
      },

      // update: set score to literal 0
      {
        id: "reset-score",
        kind: "update",
        pieces: { inventory: "score-tracker", select: "top" },
        property: "points",
        value: 0,
      },

      // update: toggle a boolean flag
      {
        id: "toggle-active",
        kind: "update",
        pieces: { inventory: "player-markers", select: "top" },
        property: "isActive",
        value: { toggle: true },
      },

      // update: set string property
      {
        id: "mark-challenger",
        kind: "update",
        pieces: { inventory: "player-markers", select: "top" },
        property: "status",
        value: "challenger",
      },

      // update: set boolean property to literal true
      {
        id: "mark-eliminated",
        kind: "update",
        pieces: { inventory: "player-markers", select: "top" },
        property: "eliminated",
        value: true,
      },

      // shuffle: randomise the dice cup
      {
        id: "shuffle-cup",
        kind: "shuffle",
        inventory: "dice-cup",
      },

      // distribute: deal 5 dice to each player
      {
        id: "deal-dice",
        kind: "distribute",
        from: { inventory: "dice-cup", select: "top" },
        to: { scope: "all-players", inventory: "player-tray" },
        count: 5,
      },

      // distribute: deal to active player only
      {
        id: "deal-extra-die",
        kind: "distribute",
        from: { inventory: "dice-cup", select: "top" },
        to: { scope: "active-player", inventory: "player-tray" },
        count: 1,
      },

      // roll: roll all dice in a player's tray
      {
        id: "roll-all-dice",
        kind: "roll",
        pieces: { inventory: "player-tray", select: "all" },
      },

      // roll: roll a specific count
      {
        id: "roll-two-dice",
        kind: "roll",
        pieces: { inventory: "player-tray", select: "random", count: 2 },
      },

      // orient: rotate a tile clockwise
      {
        id: "rotate-tile",
        kind: "orient",
        pieces: { inventory: "board-tiles", select: "top" },
        to: "rotate-cw",
      },

      // custom: complex resolution logic
      {
        id: "resolve-challenge",
        kind: "custom",
        description:
          "Count all dice showing the bid face value across all players. " +
          "If the total meets or exceeds the bid quantity, the challenger loses one die. " +
          "If the total is less, the bidder loses one die. " +
          "Any player with zero dice remaining is eliminated.",
      },

      // cancel-effect: reactive negate
      {
        id: "block-steal",
        kind: "cancel-effect",
      },

      // move: ofType filter
      {
        id: "remove-wildcards",
        kind: "move",
        from: { inventory: "player-tray", select: "all", ofType: "wildcard-die" },
        to: { inventory: "discard-pile" },
      },
    ],
  };

  it("parses a valid full module without errors", () => {
    const result = ok(validModule);
    expect(result.effects).toHaveLength(21);
  });

  it("preserves effect ids", () => {
    const result = ok(validModule);
    const ids = result.effects.map((e) => e.id);
    expect(ids).toContain("resolve-challenge");
    expect(ids).toContain("deal-dice");
    expect(ids).toContain("block-steal");
  });

  it("parses move effect with bottom select", () => {
    const result = ok({
      effects: [
        {
          id: "bury-card",
          kind: "move",
          from: { inventory: "player-hand", select: "top" },
          to: { inventory: "draw-deck", at: { kind: "stack-bottom" } },
        },
      ],
    });
    expect(result.effects[0].kind).toBe("move");
  });

  it("parses flip effect with toggle", () => {
    const result = ok({
      effects: [
        {
          id: "toggle-card",
          kind: "flip",
          pieces: { inventory: "play-area", select: "top" },
          to: "toggle",
        },
      ],
    });
    expect(result.effects[0].kind).toBe("flip");
  });

  it("parses orient effect with specific index", () => {
    const result = ok({
      effects: [
        {
          id: "set-orientation",
          kind: "orient",
          pieces: { inventory: "board-tiles", select: "top" },
          to: 2,
        },
      ],
    });
    expect(result.effects[0].kind).toBe("orient");
  });

  it("parses update effect with { param } value", () => {
    // { param } is valid in EffectSchema (anonymous), not in NamedEffectSchema
    // because named effects are self-contained — params are for inline call-site effects
    const result = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "current-bid", select: "top" },
      property: "quantity",
      value: { param: "quantity" },
    });
    expect(result.success).toBe(true);
  });

  it("parses cancel-effect as named effect", () => {
    const result = ok({
      effects: [{ id: "negate-attack", kind: "cancel-effect" }],
    });
    expect(result.effects[0].kind).toBe("cancel-effect");
  });

  it("parses distribute to all-teams scope", () => {
    const result = ok({
      effects: [
        {
          id: "deal-team-cards",
          kind: "distribute",
          from: { inventory: "draw-deck", select: "top" },
          to: { scope: "all-teams", inventory: "team-hand" },
          count: 3,
        },
      ],
    });
    expect(result.effects[0].kind).toBe("distribute");
  });

  it("parses distribute with roles filter (setup: deal kill-card to mafia only)", () => {
    const result = ok({
      effects: [
        {
          id: "deal-kill-card",
          kind: "distribute",
          from: { inventory: "game:unassigned", select: "top", ofType: "kill-card" },
          to: { scope: "all-players", inventory: "player-hand", roles: ["mafia"] },
          count: 1,
        },
      ],
    });
    expect(result.effects[0].kind).toBe("distribute");
    expect((result.effects[0] as any).to.roles).toEqual(["mafia"]);
  });
});

// ---------------------------------------------------------------------------
// select: { id } — named piece targeting
// ---------------------------------------------------------------------------

describe("EffectsModuleSchema — select by id", () => {
  it("parses move with select: { id } for named catalog piece", () => {
    const result = ok({
      effects: [
        {
          id: "place-white-king",
          kind: "move",
          from: { inventory: "game:unassigned", select: { id: "white-king" } },
          to: { inventory: "board", at: { kind: "grid-cell", row: 1, col: "e" } },
        },
      ],
    });
    expect(result.effects[0].kind).toBe("move");
    expect((result.effects[0] as any).from.select).toEqual({ id: "white-king" });
  });

  it("parses flip with select: { id }", () => {
    const result = ok({
      effects: [
        {
          id: "reveal-king",
          kind: "flip",
          pieces: { inventory: "game:unassigned", select: { id: "white-king" } },
          to: "face-up",
        },
      ],
    });
    expect((result.effects[0] as any).pieces.select).toEqual({ id: "white-king" });
  });
});

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

describe("EffectsModuleSchema — rejections", () => {
  it("rejects an empty effects array", () => {
    fail({ effects: [] });
  });

  it("rejects a named effect missing id", () => {
    fail({
      effects: [
        {
          kind: "shuffle",
          inventory: "draw-deck",
          // missing id
        },
      ],
    });
  });

  it("rejects an unknown effect kind", () => {
    fail({
      effects: [{ id: "x", kind: "teleport", inventory: "deck" }],
    });
  });

  it("rejects move effect missing 'from'", () => {
    fail({
      effects: [
        {
          id: "bad-move",
          kind: "move",
          to: { inventory: "player-hand" },
        },
      ],
    });
  });

  it("rejects update effect missing 'property'", () => {
    fail({
      effects: [
        {
          id: "bad-update",
          kind: "update",
          pieces: { inventory: "score-tracker", select: "top" },
          value: 1,
        },
      ],
    });
  });

  it("rejects distribute with unknown scope", () => {
    fail({
      effects: [
        {
          id: "bad-distribute",
          kind: "distribute",
          from: { inventory: "deck", select: "top", count: 3 },
          to: { scope: "everyone", inventory: "hand" },
        },
      ],
    });
  });

  it("rejects piece selector with unknown select value", () => {
    fail({
      effects: [
        {
          id: "bad-select",
          kind: "roll",
          pieces: { inventory: "dice-tray", select: "nearest" },
        },
      ],
    });
  });

  it("rejects orient effect with non-integer orientation", () => {
    fail({
      effects: [
        {
          id: "bad-orient",
          kind: "orient",
          pieces: { inventory: "tiles", select: "top" },
          orientation: 1.5,
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// EffectCallSchema and EffectCallsSchema (call-site machinery)
// ---------------------------------------------------------------------------

describe("EffectCallSchema", () => {
  it("accepts a ref call", () => {
    const r = EffectCallSchema.safeParse({ ref: "shuffle-deck" });
    expect(r.success).toBe(true);
  });

  it("accepts an inline effect body", () => {
    const r = EffectCallSchema.safeParse({
      kind: "shuffle",
      inventory: "draw-deck",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an inline update with { param } value", () => {
    const r = EffectCallSchema.safeParse({
      kind: "update",
      pieces: { inventory: "current-bid", select: "top" },
      property: "quantity",
      value: { param: "quantity" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an object with neither ref nor kind", () => {
    const r = EffectCallSchema.safeParse({ id: "something" });
    expect(r.success).toBe(false);
  });
});

describe("EffectCallsSchema", () => {
  it("accepts a mixed list of refs and inline effects", () => {
    const r = EffectCallsSchema.safeParse([
      { ref: "shuffle-deck" },
      { kind: "roll", pieces: { inventory: "dice-tray", select: "all" } },
      { ref: "deal-dice" },
    ]);
    expect(r.success).toBe(true);
  });

  it("rejects an empty list", () => {
    const r = EffectCallsSchema.safeParse([]);
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EffectCallRefSchema
// ---------------------------------------------------------------------------

describe("EffectCallRefSchema", () => {
  it("accepts a valid ref", () => {
    const r = EffectCallRefSchema.safeParse({ ref: "draw-card" });
    expect(r.success).toBe(true);
  });

  it("rejects missing ref field", () => {
    const r = EffectCallRefSchema.safeParse({ name: "draw-card" });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LlmInputSchema / LlmEffectSchema inputs
// ---------------------------------------------------------------------------

describe("LlmInputSchema", () => {
  it("accepts a state source", () => {
    const r = LlmInputSchema.safeParse({
      name: "roundWinner",
      state: "game.property.roundWinner",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a pieces source with a properties whitelist", () => {
    const r = LlmInputSchema.safeParse({
      name: "arenaWeapons",
      pieces: { inventory: "arena", select: "all" },
      properties: ["description"],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a param source", () => {
    const r = LlmInputSchema.safeParse({ name: "wager", param: "wagerAmount" });
    expect(r.success).toBe(true);
  });

  it("rejects more than one source", () => {
    const r = LlmInputSchema.safeParse({
      name: "x",
      state: "game.property.x",
      param: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects no source", () => {
    const r = LlmInputSchema.safeParse({ name: "x" });
    expect(r.success).toBe(false);
  });
});

describe("LlmEffectSchema", () => {
  const base = {
    kind: "llm-effect",
    prompt: { computation: "Narrate the clash." },
    outputs: [{ field: "roundNarrative", message: { to: "all" } }],
  };

  it("accepts an effect with declared inputs", () => {
    const r = LlmEffectSchema.safeParse({
      ...base,
      inputs: [
        { name: "roundWinner", state: "game.property.roundWinner" },
        {
          name: "arenaWeapons",
          pieces: { inventory: "arena", select: "all" },
          properties: ["description"],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an effect with no inputs (pure ceremony)", () => {
    const r = LlmEffectSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("rejects an input with no source", () => {
    const r = LlmEffectSchema.safeParse({
      ...base,
      inputs: [{ name: "bad" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("PropertyValueSchema — var references", () => {
  it("accepts a game property var reference", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "hp",
      value: { var: "game.property.baseDamage" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a player property var reference", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "bonusValue",
      value: { var: "player.property.relicCount" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a game inventory count var reference", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "cardsLeft",
      value: { var: "game.inventory.drawPile.count" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a player inventory count var reference", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "handSize",
      value: { var: "player.inventory.hand.count" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts delta with a literal number", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "score",
      value: { delta: 5 },
    });
    expect(r.success).toBe(true);
  });

  it("accepts delta with a var reference", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "totalDamage",
      value: { delta: { var: "game.property.spellPower" } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects delta with invalid var reference structure", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "score",
      value: { delta: { var: 123 } },
    });
    expect(r.success).toBe(false);
  });

  it("rejects var with non-string path", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "value",
      value: { var: 123 },
    });
    expect(r.success).toBe(false);
  });

  it("accepts delta with var reference and negate: true", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "defense",
      value: { delta: { var: "player.property.damageDealt", negate: true } },
    });
    expect(r.success).toBe(true);
  });

  it("accepts delta with var reference and negate: false", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "score",
      value: { delta: { var: "game.property.bonus", negate: false } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects negate flag on non-var delta", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "score",
      value: { delta: { value: 5, negate: true } },
    });
    expect(r.success).toBe(false);
  });

  it("accepts mult with a literal number", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "damage",
      value: { mult: 0.5 },
    });
    expect(r.success).toBe(true);
  });

  it("accepts mult with a var reference", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "production",
      value: { mult: { var: "player.property.workerCount" } },
    });
    expect(r.success).toBe(true);
  });

  it("accepts mult with var and negate", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "velocity",
      value: { mult: { var: "game.property.friction", negate: true } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects mult with non-number literal", () => {
    const r = EffectSchema.safeParse({
      kind: "update",
      pieces: { inventory: "test", select: "top" },
      property: "score",
      value: { mult: "two" },
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Attenuate effect
// ---------------------------------------------------------------------------

describe("EffectsModuleSchema — attenuate effect", () => {
  it("parses attenuate with delta adjustment as named effect", () => {
    const result = ok({
      effects: [{ id: "reduce-damage", kind: "attenuate", adjustment: { delta: 2 } }],
    });
    expect(result.effects[0].kind).toBe("attenuate");
  });

  it("parses attenuate with mult adjustment as named effect", () => {
    const result = ok({
      effects: [{ id: "halve-damage", kind: "attenuate", adjustment: { mult: 0.5 } }],
    });
    expect(result.effects[0].kind).toBe("attenuate");
  });

  it("parses attenuate as inline effect (EffectSchema)", () => {
    const r = EffectSchema.safeParse({
      kind: "attenuate",
      adjustment: { delta: -1 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects attenuate missing adjustment", () => {
    const r = EffectSchema.safeParse({
      kind: "attenuate",
    });
    expect(r.success).toBe(false);
  });

  it("rejects attenuate with non-numeric delta", () => {
    const r = EffectSchema.safeParse({
      kind: "attenuate",
      adjustment: { delta: "two" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects attenuate with non-numeric mult", () => {
    const r = EffectSchema.safeParse({
      kind: "attenuate",
      adjustment: { mult: "half" },
    });
    expect(r.success).toBe(false);
  });

  it("accepts attenuate delta with var reference", () => {
    const r = EffectSchema.safeParse({
      kind: "attenuate",
      adjustment: { delta: { var: "player.property.armorRating" } },
    });
    expect(r.success).toBe(true);
  });

  it("accepts attenuate delta with var and negate", () => {
    const r = EffectSchema.safeParse({
      kind: "attenuate",
      adjustment: { delta: { var: "player.property.curseStacks", negate: true } },
    });
    expect(r.success).toBe(true);
  });

  it("accepts attenuate mult with var reference", () => {
    const r = EffectSchema.safeParse({
      kind: "attenuate",
      adjustment: { mult: { var: "player.property.damageMultiplier" } },
    });
    expect(r.success).toBe(true);
  });

  it("accepts attenuate mult with var and negate", () => {
    const r = EffectSchema.safeParse({
      kind: "attenuate",
      adjustment: { mult: { var: "game.property.debuffFactor", negate: true } },
    });
    expect(r.success).toBe(true);
  });
});
