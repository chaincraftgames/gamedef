/**
 * Parse tests for ActionsModuleSchema.
 *
 * "Liar's Dice" — bluffing dice game.
 * Exercises every feature of the actions module:
 *   - ActionInputSchema: integer, float, string, boolean, enum, effect-originator types
 *   - ActionInput.validation (prose constraint)
 *   - ActionSchema: id, label, description, oncePerTurn, requiredRole
 *   - ActionSchema: availableInSubflows, preconditions (JSONLogic)
 *   - ActionSchema: inputs + { param } resolution convention
 *   - ActionSchema: interrupt (subflow array)
 *   - ActionSchema: reactive { trigger, timing: before | after }
 *   - ActionSchema: effects — mixed ref + inline
 *   - ActionsModuleSchema: min 1 action
 */

import { ActionsModuleSchema } from "#gamedef/modules/actions.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  const result = ActionsModuleSchema.safeParse(data);
  if (!result.success) throw new Error(JSON.stringify(result.error.format(), null, 2));
  return result.data;
}

function fail(data: unknown) {
  const result = ActionsModuleSchema.safeParse(data);
  expect(result.success).toBe(false);
}

// ---------------------------------------------------------------------------
// Valid: full Liar's Dice actions module
// ---------------------------------------------------------------------------

describe("ActionsModuleSchema — Liar's Dice", () => {
  const validModule = {
    actions: [
      // Core bid action — exercises inputs, { param } convention, inline effects
      {
        id: "make-bid",
        label: "Make Bid",
        description: "Declare a quantity and face value for the current bid",
        inputs: [
          {
            id: "quantity",
            type: { kind: "number", min: 1, max: 30 },
            label: "Quantity",
            validation: "Must be strictly higher than the current bid quantity unless face-value also increases",
          },
          {
            id: "face-value",
            type: { kind: "number", min: 1, max: 6 },
            label: "Face Value",
          },
        ],
        effects: [
          {
            kind: "update",
            pieces: { inventory: "current-bid", select: "top" },
            property: "quantity",
            value: { param: "quantity" },
          },
          {
            kind: "update",
            pieces: { inventory: "current-bid", select: "top" },
            property: "face-value",
            value: { param: "face-value" },
          },
        ],
      },

      // Challenge action — preconditions (JSONLogic), named-effect ref
      {
        id: "challenge",
        label: "Challenge",
        description: "Call out the current bid as a lie",
        preconditions: { "!=": [{ var: "game.inventory.current-bid.count" }, 0] },
        effects: [{ ref: "resolve-challenge" }],
      },

      // Pass action — simple, no inputs
      {
        id: "pass",
        label: "Pass",
        effects: [{ ref: "advance-turn" }],
      },

      // Roll dice — once per turn
      {
        id: "roll-dice",
        label: "Roll Dice",
        oncePerTurn: true,
        effects: [
          { kind: "roll", pieces: { inventory: "player-tray", select: "all" } },
        ],
      },

      // Role-gated action — requiredRoles
      {
        id: "peek-bid",
        label: "Peek at Bid",
        requiredRoles: ["spy"],
        effects: [
          {
            kind: "flip",
            pieces: { inventory: "current-bid", select: "top" },
            to: "face-up",
          },
        ],
      },

      // Subflow-scoped action — availableInSubflows
      {
        id: "exchange-die",
        label: "Exchange Die",
        availableInSubflows: ["trade-phase"],
        inputs: [
          {
            id: "die-to-exchange",
            type: { kind: "gamepiece-select", inventory: "player-tray", count: 1 },
          },
        ],
        effects: [
          {
            kind: "move",
            from: { inventory: "player-tray", select: { id: { param: "die-to-exchange" } } },
            to: { inventory: "exchange-pool" },
          },
        ],
      },

      // Compound precondition — boolean AND
      {
        id: "buy-special-die",
        label: "Buy Special Die",
        preconditions: {
          and: [
            { ">=": [{ var: "actor.property.coins" }, 3] },
            { "!=": [{ var: "game.inventory.special-dice.count" }, 0] },
          ],
        },
        effects: [
          { ref: "purchase-special-die" },
        ],
      },

      // Interrupt action — eligible during response-window subflow
      {
        id: "block-steal",
        label: "Block Steal",
        interrupt: ["response-window"],
        effects: [{ kind: "cancel-effect" }],
      },

      // Reactive negate — before timing (cancel the triggering effect)
      {
        id: "deflect-attack",
        label: "Deflect",
        interrupt: ["combat-response"],
        reactive: {
          trigger: "deal-damage",
          timing: "before",
        },
        inputs: [
          {
            id: "attacker",
            type: { kind: "effect-originator" },
            label: "Attacker",
          },
        ],
        effects: [{ kind: "cancel-effect" }],
      },

      // Reactive reaction — after timing (adjust the effect)
      {
        id: "resilience",
        label: "Resilience",
        reactive: {
          trigger: "take-damage",
          timing: "after",
        },
        effects: [{ ref: "heal-one-hp" }],
      },

      // Mixed effects list — ref + inline
      {
        id: "power-move",
        label: "Power Move",
        effects: [
          { ref: "shuffle-cup" },
          { kind: "roll", pieces: { inventory: "player-tray", select: "all" } },
          { ref: "resolve-challenge" },
        ],
      },

      // All input types exercised
      {
        id: "configure-game",
        label: "Configure",
        inputs: [
          { id: "rounds", type: { kind: "number", min: 1, max: 10 } },
          { id: "speed", type: { kind: "number", min: 0.5, max: 2.0, integer: false } },
          { id: "name", type: { kind: "string" } },
          { id: "hardcore", type: { kind: "boolean" } },
          { id: "variant", type: { kind: "enum", values: ["classic", "speed", "team"] } },
        ],
        effects: [{ ref: "apply-config" }],
      },
    ],
  };

  it("parses a valid full module without errors", () => {
    const result = ok(validModule);
    expect(result.actions).toHaveLength(12);
  });

  it("preserves action ids", () => {
    const result = ok(validModule);
    const ids = result.actions.map((a) => a.id);
    expect(ids).toContain("make-bid");
    expect(ids).toContain("challenge");
    expect(ids).toContain("deflect-attack");
  });

  it("preserves inputs on make-bid", () => {
    const result = ok(validModule);
    const bid = result.actions.find((a) => a.id === "make-bid")!;
    expect(bid.inputs).toHaveLength(2);
    expect(bid.inputs![0].id).toBe("quantity");
    expect(bid.inputs![0].type.kind).toBe("number");
  });

  it("preserves { param } in inline effects", () => {
    const result = ok(validModule);
    const bid = result.actions.find((a) => a.id === "make-bid")!;
    const firstEffect = bid.effects[0] as { kind: string; value: unknown };
    expect(firstEffect.value).toEqual({ param: "quantity" });
  });

  it("preserves preconditions as JSONLogic object", () => {
    const result = ok(validModule);
    const challenge = result.actions.find((a) => a.id === "challenge")!;
    expect(challenge.preconditions).toBeDefined();
  });

  it("preserves reactive fields", () => {
    const result = ok(validModule);
    const deflect = result.actions.find((a) => a.id === "deflect-attack")!;
    expect(deflect.reactive?.trigger).toBe("deal-damage");
    expect(deflect.reactive?.timing).toBe("before");
  });

  it("preserves reactive after timing", () => {
    const result = ok(validModule);
    const resilience = result.actions.find((a) => a.id === "resilience")!;
    expect(resilience.reactive?.timing).toBe("after");
  });

  it("preserves interrupt subflow list", () => {
    const result = ok(validModule);
    const block = result.actions.find((a) => a.id === "block-steal")!;
    expect(block.interrupt).toEqual(["response-window"]);
  });

  it("preserves effect-originator input type", () => {
    const result = ok(validModule);
    const deflect = result.actions.find((a) => a.id === "deflect-attack")!;
    const attackerInput = deflect.inputs!.find((i) => i.id === "attacker")!;
    expect(attackerInput.type.kind).toBe("effect-originator");
  });

  it("preserves oncePerTurn flag", () => {
    const result = ok(validModule);
    const roll = result.actions.find((a) => a.id === "roll-dice")!;
    expect(roll.oncePerTurn).toBe(true);
  });

  it("preserves requiredRoles", () => {
    const result = ok(validModule);
    const peek = result.actions.find((a) => a.id === "peek-bid")!;
    expect(peek.requiredRoles).toEqual(["spy"]);
  });

  it("accepts action with no inputs", () => {
    const result = ok({ actions: [{ id: "pass", effects: [{ ref: "advance-turn" }] }] });
    expect(result.actions[0].inputs).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

describe("ActionsModuleSchema — rejections", () => {
  it("rejects an empty actions array", () => {
    fail({ actions: [] });
  });

  it("rejects action missing required id", () => {
    fail({
      actions: [{ label: "Unnamed", effects: [{ ref: "something" }] }],
    });
  });

  it("rejects action missing required effects", () => {
    fail({
      actions: [{ id: "no-effects" }],
    });
  });

  it("rejects action with empty effects array", () => {
    fail({
      actions: [{ id: "empty-effects", effects: [] }],
    });
  });

  it("rejects input with unknown type kind", () => {
    fail({
      actions: [
        {
          id: "bad-input",
          inputs: [{ id: "x", type: { kind: "date" } }],
          effects: [{ ref: "something" }],
        },
      ],
    });
  });

  it("rejects enum input with fewer than 2 values", () => {
    fail({
      actions: [
        {
          id: "bad-enum",
          inputs: [{ id: "choice", type: { kind: "enum", values: ["only-one"] } }],
          effects: [{ ref: "something" }],
        },
      ],
    });
  });

  it("rejects interrupt with empty array", () => {
    fail({
      actions: [
        {
          id: "bad-interrupt",
          interrupt: [],
          effects: [{ ref: "something" }],
        },
      ],
    });
  });

  it("rejects reactive with invalid timing", () => {
    fail({
      actions: [
        {
          id: "bad-reactive",
          reactive: { trigger: "some-effect", timing: "during" },
          effects: [{ ref: "something" }],
        },
      ],
    });
  });

  it("rejects reactive missing trigger", () => {
    fail({
      actions: [
        {
          id: "bad-reactive",
          reactive: { timing: "before" },
          effects: [{ ref: "something" }],
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Action input kinds: gamepiece-select, player-select, inventory-position
// ---------------------------------------------------------------------------

describe("ActionsModuleSchema — selection inputs", () => {
  it("accepts gamepiece-select input", () => {
    ok({
      actions: [
        {
          id: "discard",
          inputs: [
            {
              id: "card",
              type: { kind: "gamepiece-select", inventory: "player-hand" },
              label: "Choose card",
            },
          ],
          effects: [
            {
              kind: "move",
              from: { inventory: "player-hand", select: { id: { param: "card" } } },
              to: { inventory: "discard-pile" },
            },
          ],
        },
      ],
    });
  });

  it("accepts gamepiece-select with ofType and count", () => {
    ok({
      actions: [
        {
          id: "draft",
          inputs: [
            {
              id: "picks",
              type: { kind: "gamepiece-select", inventory: "draft-hand", ofType: "card", count: 2 },
              label: "Choose 2 cards",
            },
          ],
          effects: [{ ref: "add-to-hand" }],
        },
      ],
    });
  });

  it("accepts gamepiece-select with fromPlayer referencing prior input", () => {
    ok({
      actions: [
        {
          id: "steal",
          inputs: [
            {
              id: "target",
              type: { kind: "player-select", excludeSelf: true },
              label: "Choose opponent",
            },
            {
              id: "card",
              type: { kind: "gamepiece-select", inventory: "player-hand", fromPlayer: { param: "target" } },
              label: "Choose card to steal",
            },
          ],
          effects: [
            {
              kind: "move",
              from: { player: { param: "target" }, inventory: "player-hand", select: { id: { param: "card" } } },
              to: { inventory: "player-hand" },
            },
          ],
        },
      ],
    });
  });

  it("accepts gamepiece-select with fromPlayer 'self'", () => {
    ok({
      actions: [
        {
          id: "play-card",
          inputs: [
            {
              id: "card",
              type: { kind: "gamepiece-select", inventory: "player-hand", fromPlayer: "self" },
            },
          ],
          effects: [{ ref: "play" }],
        },
      ],
    });
  });

  it("accepts gamepiece-select with JsonLogic filter", () => {
    ok({
      actions: [
        {
          id: "select-creature",
          inputs: [
            {
              id: "creature",
              type: {
                kind: "gamepiece-select",
                inventory: "battlefield",
                filter: { ">=": [{ var: "piece.property.hp" }, 1] },
              },
            },
          ],
          effects: [{ ref: "attack" }],
        },
      ],
    });
  });

  it("accepts player-select input", () => {
    ok({
      actions: [
        {
          id: "target-player",
          inputs: [
            {
              id: "opponent",
              type: { kind: "player-select", excludeSelf: true },
              label: "Choose opponent",
            },
          ],
          effects: [{ ref: "attack-player" }],
        },
      ],
    });
  });

  it("accepts player-select with JsonLogic filter", () => {
    ok({
      actions: [
        {
          id: "heal-ally",
          inputs: [
            {
              id: "ally",
              type: {
                kind: "player-select",
                filter: { "<": [{ var: "player.property.hp" }, { var: "player.property.maxHp" }] },
              },
            },
          ],
          effects: [{ ref: "heal" }],
        },
      ],
    });
  });

  it("accepts inventory-position input", () => {
    ok({
      actions: [
        {
          id: "deploy",
          inputs: [
            {
              id: "unit",
              type: { kind: "gamepiece-select", inventory: "reserves" },
            },
            {
              id: "cell",
              type: { kind: "inventory-position", inventory: "battle-grid" },
              label: "Choose position",
            },
          ],
          effects: [
            {
              kind: "move",
              from: { inventory: "reserves", select: { id: { param: "unit" } } },
              to: { inventory: "battle-grid", at: { param: "cell" } },
            },
          ],
        },
      ],
    });
  });

  it("accepts inventory-position with fromPlayer", () => {
    ok({
      actions: [
        {
          id: "sabotage",
          inputs: [
            {
              id: "target",
              type: { kind: "player-select", excludeSelf: true },
            },
            {
              id: "slot",
              type: { kind: "inventory-position", inventory: "board", fromPlayer: { param: "target" } },
            },
          ],
          effects: [{ ref: "destroy-at" }],
        },
      ],
    });
  });

  it("rejects gamepiece-select missing inventory", () => {
    fail({
      actions: [
        {
          id: "bad",
          inputs: [
            { id: "card", type: { kind: "gamepiece-select" } },
          ],
          effects: [{ ref: "x" }],
        },
      ],
    });
  });

  it("rejects inventory-position missing inventory", () => {
    fail({
      actions: [
        {
          id: "bad",
          inputs: [
            { id: "cell", type: { kind: "inventory-position" } },
          ],
          effects: [{ ref: "x" }],
        },
      ],
    });
  });

  it("accepts param-ref in GamepieceSelector.select", () => {
    ok({
      actions: [
        {
          id: "update-chosen",
          inputs: [
            { id: "piece", type: { kind: "gamepiece-select", inventory: "board" } },
          ],
          effects: [
            {
              kind: "update",
              pieces: { inventory: "board", select: { id: { param: "piece" } } },
              property: "activated",
              value: true,
            },
          ],
        },
      ],
    });
  });

  it("accepts param-ref in InventoryTarget.player", () => {
    ok({
      actions: [
        {
          id: "gift",
          inputs: [
            { id: "recipient", type: { kind: "player-select", excludeSelf: true } },
          ],
          effects: [
            {
              kind: "move",
              from: { inventory: "player-hand", select: "top" },
              to: { player: { param: "recipient" }, inventory: "player-hand" },
            },
          ],
        },
      ],
    });
  });

  it("accepts stateRef in InventoryTarget.player", () => {
    ok({
      actions: [
        {
          id: "punish",
          effects: [
            {
              kind: "move",
              from: { inventory: "penalty-pool", select: "top" },
              to: { player: { stateRef: "game.property.roundLoser" }, inventory: "player-hand" },
            },
          ],
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Reactive action inputs (effect-originator and trigger-input)
// ---------------------------------------------------------------------------

describe("ActionsModuleSchema — reactive input types", () => {
  it("accepts effect-originator input type", () => {
    const result = ok({
      actions: [
        {
          id: "counter-attack",
          reactive: { trigger: "deal-damage", timing: "after" },
          inputs: [
            { id: "attacker", type: { kind: "effect-originator" } },
          ],
          effects: [
            {
              kind: "set-state",
              path: "player.property.hp",
              value: { delta: -2 },
              target: { kind: "param", inputId: "attacker" },
            },
          ],
        },
      ],
    });
    expect(result.actions[0].inputs![0].type.kind).toBe("effect-originator");
  });

  it("accepts trigger-input input type", () => {
    const result = ok({
      actions: [
        {
          id: "thorns",
          reactive: { trigger: "deal-damage", timing: "after" },
          inputs: [
            { id: "attacking-creature", type: { kind: "trigger-input", inputId: "creature" } },
          ],
          effects: [
            {
              kind: "update",
              pieces: { inventory: "battlefield", select: { id: { param: "attacking-creature" } } },
              property: "hp",
              value: { delta: -2 },
            },
          ],
        },
      ],
    });
    expect(result.actions[0].inputs![0].type.kind).toBe("trigger-input");
    expect((result.actions[0].inputs![0].type as any).inputId).toBe("creature");
  });

  it("rejects trigger-input missing inputId", () => {
    fail({
      actions: [
        {
          id: "bad-trigger",
          reactive: { trigger: "deal-damage", timing: "after" },
          inputs: [
            { id: "x", type: { kind: "trigger-input" } },
          ],
          effects: [{ ref: "some-effect" }],
        },
      ],
    });
  });

  it("accepts adjust effect in reactive action", () => {
    const result = ok({
      actions: [
        {
          id: "brace",
          reactive: { trigger: "deal-damage", timing: "before" },
          effects: [
            { kind: "adjust", adjustment: { delta: 2 } },
          ],
        },
      ],
    });
    expect(result.actions[0].effects.length).toBe(1);
  });

  it("accepts cancel-effect in reactive action", () => {
    const result = ok({
      actions: [
        {
          id: "block",
          reactive: { trigger: "deal-damage", timing: "before" },
          effects: [
            { kind: "cancel-effect" },
          ],
        },
      ],
    });
    expect(result.actions[0].effects.length).toBe(1);
  });

  it("accepts adjust with mult in reactive action", () => {
    const result = ok({
      actions: [
        {
          id: "shield-block",
          reactive: { trigger: "deal-damage", timing: "before" },
          effects: [
            { kind: "adjust", adjustment: { mult: 0.5 } },
          ],
        },
      ],
    });
    expect(result.actions[0].effects.length).toBe(1);
  });
});
