/**
 * Parse tests for ActionsModuleSchema.
 *
 * "Liar's Dice" — bluffing dice game.
 * Exercises every feature of the actions module:
 *   - ActionInputSchema: integer, float, string, boolean, enum, effect-originator types
 *   - ActionInput.validation (prose constraint)
 *   - ActionSchema: id, label, description, oncePerTurn, requiredRole
 *   - ActionSchema: availableInSubflows, preconditions (infix expression)
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
        id: "makeBid",
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
            id: "faceValue",
            type: { kind: "number", min: 1, max: 6 },
            label: "Face Value",
          },
        ],
        effects: [
          {
            kind: "update",
            pieces: { inventory: "currentBid", select: "top" },
            property: "quantity",
            value: { param: "quantity" },
          },
          {
            kind: "update",
            pieces: { inventory: "currentBid", select: "top" },
            property: "faceValue",
            value: { param: "faceValue" },
          },
        ],
      },

      // Challenge action — preconditions (infix expression), named-effect ref
      {
        id: "challenge",
        label: "Challenge",
        description: "Call out the current bid as a lie",
        preconditions: "game.inventory.currentBid.count != 0",
        effects: [{ ref: "resolveChallenge" }],
      },

      // Pass action — simple, no inputs
      {
        id: "pass",
        label: "Pass",
        effects: [{ ref: "advanceTurn" }],
      },

      // Roll dice — once per turn
      {
        id: "rollDice",
        label: "Roll Dice",
        oncePerTurn: true,
        effects: [
          { kind: "roll", pieces: { inventory: "playerTray", select: "all" } },
        ],
      },

      // Role-gated action — requiredRoles
      {
        id: "peekBid",
        label: "Peek at Bid",
        requiredRoles: ["spy"],
        effects: [
          {
            kind: "flip",
            pieces: { inventory: "currentBid", select: "top" },
            to: "face-up",
          },
        ],
      },

      // Subflow-scoped action — availableInSubflows
      {
        id: "exchangeDie",
        label: "Exchange Die",
        availableInSubflows: ["tradePhase"],
        inputs: [
          {
            id: "dieToExchange",
            type: { kind: "gamepiece-select", inventory: "playerTray", count: 1 },
          },
        ],
        effects: [
          {
            kind: "move",
            from: { inventory: "playerTray", select: { id: { param: "dieToExchange" } } },
            to: { inventory: "exchangePool" },
          },
        ],
      },

      // Compound precondition — boolean AND
      {
        id: "buySpecialDie",
        label: "Buy Special Die",
        preconditions: "actor.property.coins >= 3 and game.inventory.specialDice.count != 0",
        effects: [
          { ref: "purchaseSpecialDie" },
        ],
      },

      // Interrupt action — eligible during response-window subflow
      {
        id: "blockSteal",
        label: "Block Steal",
        interrupt: ["responseWindow"],
        effects: [{ kind: "cancel-effect" }],
      },

      // Reactive negate — before timing (cancel the triggering effect)
      {
        id: "deflectAttack",
        label: "Deflect",
        interrupt: ["combatResponse"],
        reactive: {
          trigger: "dealDamage",
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
          trigger: "takeDamage",
          timing: "after",
        },
        effects: [{ ref: "healOneHp" }],
      },

      // Mixed effects list — ref + inline
      {
        id: "powerMove",
        label: "Power Move",
        effects: [
          { ref: "shuffleCup" },
          { kind: "roll", pieces: { inventory: "playerTray", select: "all" } },
          { ref: "resolveChallenge" },
        ],
      },

      // All input types exercised
      {
        id: "configureGame",
        label: "Configure",
        inputs: [
          { id: "rounds", type: { kind: "number", min: 1, max: 10 } },
          { id: "speed", type: { kind: "number", min: 0.5, max: 2.0, integer: false } },
          { id: "name", type: { kind: "string" } },
          { id: "hardcore", type: { kind: "boolean" } },
          { id: "variant", type: { kind: "enum", values: ["classic", "speed", "team"] } },
        ],
        effects: [{ ref: "applyConfig" }],
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
    expect(ids).toContain("makeBid");
    expect(ids).toContain("challenge");
    expect(ids).toContain("deflectAttack");
  });

  it("preserves inputs on make-bid", () => {
    const result = ok(validModule);
    const bid = result.actions.find((a) => a.id === "makeBid")!;
    expect(bid.inputs).toHaveLength(2);
    expect(bid.inputs![0].id).toBe("quantity");
    expect(bid.inputs![0].type.kind).toBe("number");
  });

  it("preserves { param } in inline effects", () => {
    const result = ok(validModule);
    const bid = result.actions.find((a) => a.id === "makeBid")!;
    const firstEffect = bid.effects[0] as { kind: string; value: unknown };
    expect(firstEffect.value).toEqual({ param: "quantity" });
  });

  it("preserves preconditions as infix expression string", () => {
    const result = ok(validModule);
    const challenge = result.actions.find((a) => a.id === "challenge")!;
    expect(challenge.preconditions).toBe("game.inventory.currentBid.count != 0");
  });

  it("preserves reactive fields", () => {
    const result = ok(validModule);
    const deflect = result.actions.find((a) => a.id === "deflectAttack")!;
    expect(deflect.reactive?.trigger).toBe("dealDamage");
    expect(deflect.reactive?.timing).toBe("before");
  });

  it("preserves reactive after timing", () => {
    const result = ok(validModule);
    const resilience = result.actions.find((a) => a.id === "resilience")!;
    expect(resilience.reactive?.timing).toBe("after");
  });

  it("preserves interrupt subflow list", () => {
    const result = ok(validModule);
    const block = result.actions.find((a) => a.id === "blockSteal")!;
    expect(block.interrupt).toEqual(["responseWindow"]);
  });

  it("preserves effect-originator input type", () => {
    const result = ok(validModule);
    const deflect = result.actions.find((a) => a.id === "deflectAttack")!;
    const attackerInput = deflect.inputs!.find((i) => i.id === "attacker")!;
    expect(attackerInput.type.kind).toBe("effect-originator");
  });

  it("preserves oncePerTurn flag", () => {
    const result = ok(validModule);
    const roll = result.actions.find((a) => a.id === "rollDice")!;
    expect(roll.oncePerTurn).toBe(true);
  });

  it("preserves requiredRoles", () => {
    const result = ok(validModule);
    const peek = result.actions.find((a) => a.id === "peekBid")!;
    expect(peek.requiredRoles).toEqual(["spy"]);
  });

  it("accepts action with no inputs", () => {
    const result = ok({ actions: [{ id: "pass", effects: [{ ref: "advanceTurn" }] }] });
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
      actions: [{ id: "noEffects" }],
    });
  });

  it("rejects action with empty effects array", () => {
    fail({
      actions: [{ id: "emptyEffects", effects: [] }],
    });
  });

  it("rejects input with unknown type kind", () => {
    fail({
      actions: [
        {
          id: "badInput",
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
          id: "badEnum",
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
          id: "badInterrupt",
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
          id: "badReactive",
          reactive: { trigger: "someEffect", timing: "during" },
          effects: [{ ref: "something" }],
        },
      ],
    });
  });

  it("rejects reactive missing trigger", () => {
    fail({
      actions: [
        {
          id: "badReactive",
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
              type: { kind: "gamepiece-select", inventory: "playerHand" },
              label: "Choose card",
            },
          ],
          effects: [
            {
              kind: "move",
              from: { inventory: "playerHand", select: { id: { param: "card" } } },
              to: { inventory: "discardPile" },
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
              type: { kind: "gamepiece-select", inventory: "draftHand", ofType: "card", count: 2 },
              label: "Choose 2 cards",
            },
          ],
          effects: [{ ref: "addToHand" }],
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
              type: { kind: "gamepiece-select", inventory: "playerHand", fromPlayer: { param: "target" } },
              label: "Choose card to steal",
            },
          ],
          effects: [
            {
              kind: "move",
              from: { player: { param: "target" }, inventory: "playerHand", select: { id: { param: "card" } } },
              to: { inventory: "playerHand" },
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
          id: "playCard",
          inputs: [
            {
              id: "card",
              type: { kind: "gamepiece-select", inventory: "playerHand", fromPlayer: "self" },
            },
          ],
          effects: [{ ref: "play" }],
        },
      ],
    });
  });

  it("accepts gamepiece-select with expression filter", () => {
    ok({
      actions: [
        {
          id: "selectCreature",
          inputs: [
            {
              id: "creature",
              type: {
                kind: "gamepiece-select",
                inventory: "battlefield",
                filter: "piece.property.hp >= 1",
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
          id: "targetPlayer",
          inputs: [
            {
              id: "opponent",
              type: { kind: "player-select", excludeSelf: true },
              label: "Choose opponent",
            },
          ],
          effects: [{ ref: "attackPlayer" }],
        },
      ],
    });
  });

  it("accepts player-select with expression filter", () => {
    ok({
      actions: [
        {
          id: "healAlly",
          inputs: [
            {
              id: "ally",
              type: {
                kind: "player-select",
                filter: "player.property.hp < player.property.maxHp",
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
              type: { kind: "inventory-position", inventory: "battleGrid" },
              label: "Choose position",
            },
          ],
          effects: [
            {
              kind: "move",
              from: { inventory: "reserves", select: { id: { param: "unit" } } },
              to: { inventory: "battleGrid", at: { param: "cell" } },
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
          effects: [{ ref: "destroyAt" }],
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
          id: "updateChosen",
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
              from: { inventory: "playerHand", select: "top" },
              to: { player: { param: "recipient" }, inventory: "playerHand" },
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
              from: { inventory: "penaltyPool", select: "top" },
              to: { player: { stateRef: "game.property.roundLoser" }, inventory: "playerHand" },
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
          id: "counterAttack",
          reactive: { trigger: "dealDamage", timing: "after" },
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
          reactive: { trigger: "dealDamage", timing: "after" },
          inputs: [
            { id: "attackingCreature", type: { kind: "trigger-input", inputId: "creature" } },
          ],
          effects: [
            {
              kind: "update",
              pieces: { inventory: "battlefield", select: { id: { param: "attackingCreature" } } },
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
          id: "badTrigger",
          reactive: { trigger: "dealDamage", timing: "after" },
          inputs: [
            { id: "x", type: { kind: "trigger-input" } },
          ],
          effects: [{ ref: "someEffect" }],
        },
      ],
    });
  });

  it("accepts adjust effect in reactive action", () => {
    const result = ok({
      actions: [
        {
          id: "brace",
          reactive: { trigger: "dealDamage", timing: "before" },
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
          reactive: { trigger: "dealDamage", timing: "before" },
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
          id: "shieldBlock",
          reactive: { trigger: "dealDamage", timing: "before" },
          effects: [
            { kind: "adjust", adjustment: { mult: 0.5 } },
          ],
        },
      ],
    });
    expect(result.actions[0].effects.length).toBe(1);
  });
});
