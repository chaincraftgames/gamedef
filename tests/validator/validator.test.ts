/**
 * Validator integration tests — duplicate IDs, flow termination, reference checks
 */

import { describe, expect, it } from "@jest/globals";
import { validate } from "../../src/validator/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid metadata */
const META = { name: "Test Game", playerCount: { min: 2, max: 2 } };

/** A Zod-valid named effect (move, no description required) */
function makeEffect(id: string) {
  return {
    id,
    kind: "move",
    from: { inventory: "src", select: "top" },
    to: { inventory: "dst" },
  };
}

/** A Zod-valid action */
function makeAction(id: string, effectRef?: string) {
  return {
    id,
    label: id,
    description: `${id} action`,
    effects: [{ ref: effectRef ?? id }],
  };
}

/** A minimal valid turn node (no availableActions) */
const DUMMY_TURN = {
  kind: "turn",
  actor: "active-player",
  grammar: { kind: "action", ref: "dummy" },
};

/** A Zod-valid root game node wrapping a single loop with count=1 */
function makeGameRoot(overrides: Record<string, unknown> = {}) {
  return { kind: "game", children: [{ kind: "loop", count: 1, children: [DUMMY_TURN] }], ...overrides };
}

/** A Zod-valid loop node with count=1 */
function makeLoop(overrides: Record<string, unknown> = {}) {
  return { kind: "loop", count: 1, children: [DUMMY_TURN], ...overrides };
}

/** Minimal valid inventory type */
function makeInventory(id: string) {
  return {
    id,
    scope: { kind: "game" },
    accepts: ["any-piece"],
    visibility: "always",
  };
}

/** Minimal valid gamepiece type */
function makePiecetype(id: string) {
  return { id, category: "token" };
}

function minimalSpec(overrides: Record<string, unknown> = {}) {
  return { metadata: META, ...overrides };
}

// ---------------------------------------------------------------------------
// Pass 1 — Reference resolution
// ---------------------------------------------------------------------------

describe("Reference resolution", () => {
  it("passes when effect ref exists", () => {
    const result = validate(
      minimalSpec({
        effects: { effects: [makeEffect("my-effect")] },
        actions: {
          actions: [makeAction("my-action", "my-effect")],
        },
      }),
    );
    expect(result.errors.filter((e) => e.path.includes("ref"))).toHaveLength(0);
  });

  it("errors when effect ref is missing", () => {
    const result = validate(
      minimalSpec({
        effects: { effects: [makeEffect("my-effect")] },
        actions: {
          actions: [makeAction("my-action", "nonexistent-effect")],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent-effect"))).toBe(true);
  });

  it("errors when catalog typeId not in gamepieceTypes", () => {
    const result = validate(
      minimalSpec({
        catalog: {
          entries: [{ typeId: "ghost-type", quantity: 1 }],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("ghost-type"))).toBe(true);
  });

  it("errors when trump evaluationInventory not in inventories", () => {
    const result = validate(
      minimalSpec({
        mechanics: [
          {
            kind: "chaincraft:trump",
            evaluationInventory: "nonexistent-pile",
            winnerToState: "game.property.roundWinner",
            rules: [
              {
                kind: "matrix",
                property: "rps",
                beats: { rock: ["scissors"], paper: ["rock"], scissors: ["paper"] },
              },
            ],
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent-pile"))).toBe(true);
  });

  it("passes when trump evaluationInventory exists", () => {
    const result = validate(
      minimalSpec({
        inventories: { types: [makeInventory("trick-pile")] },
        mechanics: [
          {
            kind: "chaincraft:trump",
            suitProperty: "suit",
            rankProperty: "rank",
            rankOrder: ["2", "3", "A"],
            evaluationInventory: "trick-pile",
          },
        ],
      }),
    );
    const trumpErrors = result.errors.filter((e) => e.path.includes("evaluationInventory"));
    expect(trumpErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pass 2 — Duplicate ID detection
// ---------------------------------------------------------------------------

describe("Duplicate ID detection", () => {
  it("errors on duplicate action IDs", () => {
    const result = validate(
      minimalSpec({
        effects: { effects: [makeEffect("e1"), makeEffect("e2")] },
        actions: {
          actions: [makeAction("bid", "e1"), makeAction("bid", "e2")],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"bid"'))).toBe(true);
  });

  it("errors on duplicate effect IDs", () => {
    const result = validate(
      minimalSpec({
        effects: {
          effects: [makeEffect("score"), makeEffect("score")],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"score"'))).toBe(true);
  });

  it("errors on duplicate inventory type IDs", () => {
    const result = validate(
      minimalSpec({
        inventories: { types: [makeInventory("hand"), makeInventory("hand")] },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"hand"'))).toBe(true);
  });

  it("errors on duplicate flow node IDs", () => {
    const result = validate(
      minimalSpec({
        flow: {
          root: {
            kind: "game",
            children: [
              { kind: "loop", id: "phase-a", count: 3, children: [DUMMY_TURN] },
              { kind: "loop", id: "phase-a", count: 3, children: [DUMMY_TURN] },
            ],
          },
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"phase-a"'))).toBe(true);
  });

  it("passes when all IDs are unique", () => {
    const result = validate(
      minimalSpec({
        effects: { effects: [makeEffect("e1"), makeEffect("e2")] },
        actions: {
          actions: [makeAction("bid", "e1"), makeAction("challenge", "e2")],
        },
      }),
    );
    const dupErrors = result.errors.filter((e) => e.message.includes("Duplicate"));
    expect(dupErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pass 3 — Flow structural integrity
// ---------------------------------------------------------------------------

describe("Flow structural integrity", () => {
  it("errors when root is not kind: game", () => {
    const result = validate(
      minimalSpec({
        flow: { root: { kind: "loop", count: 1, children: [DUMMY_TURN] } },
      }),
    );
    expect(result.valid).toBe(false);
  });

  it("errors when child loop has no exit condition", () => {
    const result = validate(
      minimalSpec({
        flow: { root: { kind: "game", children: [{ kind: "loop", children: [DUMMY_TURN] }] } },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no exit condition"))).toBe(true);
  });

  it("passes when child loop has endCondition", () => {
    const result = validate(
      minimalSpec({
        flow: {
          root: {
            kind: "game",
            children: [
              { kind: "loop", endCondition: { var: "game.property.gameOver" }, children: [DUMMY_TURN] },
            ],
          },
        },
      }),
    );
    const flowErrors = result.errors.filter((e) => e.message.includes("no exit condition"));
    expect(flowErrors).toHaveLength(0);
  });

  it("passes when child loop has count", () => {
    const result = validate(
      minimalSpec({
        flow: { root: makeGameRoot() },
      }),
    );
    const flowErrors = result.errors.filter((e) => e.message.includes("no exit condition"));
    expect(flowErrors).toHaveLength(0);
  });

  it("passes when score-track mechanic with winAt auto-wires end condition", () => {
    const result = validate(
      minimalSpec({
        mechanics: [
          {
            kind: "chaincraft:score-track",
            trackLength: 10,
            scoringProperty: "score",
            scope: "player",
            winAt: 10,
          },
        ],
        flow: { root: { kind: "game", children: [{ kind: "loop", children: [DUMMY_TURN] }] } },
      }),
    );
    const flowErrors = result.errors.filter((e) => e.message.includes("no exit condition"));
    expect(flowErrors).toHaveLength(0);
  });

  it("errors on nested loop with no exit condition", () => {
    const result = validate(
      minimalSpec({
        flow: {
          root: {
            kind: "game",
            children: [
              {
                kind: "loop",
                count: 1,
                children: [
                  {
                    kind: "loop",
                    id: "inner",
                    // no endCondition, no count
                    children: [DUMMY_TURN],
                  },
                ],
              },
            ],
          },
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("no exit condition"))).toBe(true);
  });

  it("errors when flow has no root node", () => {
    const result = validate(
      minimalSpec({
        flow: { root: undefined },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "flow.root")).toBe(true);
  });

  it("errors when availableInSubflows references non-existent node ID", () => {
    const result = validate(
      minimalSpec({
        flow: { root: makeGameRoot() },
        effects: { effects: [makeEffect("use-e")] },
        actions: {
          actions: [makeAction("use-ability", "use-e")],
        },
        gamepieceTypes: {
          types: [
            {
              ...makePiecetype("card"),
              mechanics: [
                {
                  kind: "chaincraft:charges",
                  slotId: "mygame:ability",
                  chargeType: "energy",
                  maxCharges: 3,
                  count: 1,
                  action: "use-ability",
                  availableInSubflows: ["nonexistent-phase"],
                },
              ],
            },
          ],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent-phase"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Catalog binding validation
// ---------------------------------------------------------------------------

describe("Catalog binding validation", () => {
  it("errors when actionBindings references non-existent action", () => {
    const result = validate(
      minimalSpec({
        gamepieceTypes: {
          types: [{ ...makePiecetype("card"), actionSlots: [{ id: "play-effect" }] }],
        },
        catalog: {
          entries: [{ typeId: "card", actionBindings: { "play-effect": "nonexistent-action" } }],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent-action"))).toBe(true);
  });

  it("errors when actionBindings key does not match an actionSlot", () => {
    const result = validate(
      minimalSpec({
        effects: { effects: [makeEffect("e1")] },
        actions: { actions: [makeAction("play-strike", "e1")] },
        gamepieceTypes: {
          types: [{ ...makePiecetype("card"), actionSlots: [{ id: "play-effect" }] }],
        },
        catalog: {
          entries: [{ typeId: "card", actionBindings: { "bad-slot": "play-strike" } }],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("bad-slot"))).toBe(true);
  });

  it("passes when actionBindings key and value are valid", () => {
    const result = validate(
      minimalSpec({
        effects: { effects: [makeEffect("e1")] },
        actions: { actions: [makeAction("play-strike", "e1")] },
        gamepieceTypes: {
          types: [{ ...makePiecetype("card"), actionSlots: [{ id: "play-effect" }] }],
        },
        catalog: {
          entries: [{ typeId: "card", actionBindings: { "play-effect": "play-strike" } }],
        },
      }),
    );
    const bindingErrors = result.errors.filter((e) => e.path.includes("actionBindings"));
    expect(bindingErrors).toHaveLength(0);
  });

  it("errors when passiveBindings references non-existent passive", () => {
    const result = validate(
      minimalSpec({
        effects: { effects: [makeEffect("e1")] },
        gamepieceTypes: {
          types: [{ ...makePiecetype("equipment"), passiveSlots: [{ id: "worn-passive" }] }],
        },
        catalog: {
          entries: [{ typeId: "equipment", passiveBindings: { "worn-passive": "nonexistent-passive" } }],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent-passive"))).toBe(true);
  });

  it("errors when passiveBindings key does not match a passiveSlot", () => {
    const result = validate(
      minimalSpec({
        effects: {
          effects: [makeEffect("e1")],
          passives: [{
            id: "armor-absorb",
            trigger: ["deal-damage"],
            scope: "owner-targeted",
            effects: [{ kind: "cancel-effect" }],
          }],
        },
        gamepieceTypes: {
          types: [{ ...makePiecetype("equipment"), passiveSlots: [{ id: "worn-passive" }] }],
        },
        catalog: {
          entries: [{ typeId: "equipment", passiveBindings: { "bad-slot": "armor-absorb" } }],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("bad-slot"))).toBe(true);
  });

  it("passes when passiveBindings key and value are valid", () => {
    const result = validate(
      minimalSpec({
        effects: {
          effects: [makeEffect("e1")],
          passives: [{
            id: "armor-absorb",
            trigger: ["deal-damage"],
            scope: "owner-targeted",
            effects: [{ kind: "cancel-effect" }],
          }],
        },
        gamepieceTypes: {
          types: [{ ...makePiecetype("equipment"), passiveSlots: [{ id: "worn-passive" }] }],
        },
        catalog: {
          entries: [{ typeId: "equipment", passiveBindings: { "worn-passive": "armor-absorb" } }],
        },
      }),
    );
    const bindingErrors = result.errors.filter((e) => e.path.includes("passiveBindings"));
    expect(bindingErrors).toHaveLength(0);
  });

  it("allows inline action binding (skips action ID ref check)", () => {
    const result = validate(
      minimalSpec({
        effects: { effects: [makeEffect("e1")] },
        gamepieceTypes: {
          types: [{ ...makePiecetype("card"), actionSlots: [{ id: "play-effect" }] }],
        },
        catalog: {
          entries: [{
            typeId: "card",
            actionBindings: {
              "play-effect": { label: "Inline Play", effects: [{ ref: "e1" }] },
            },
          }],
        },
      }),
    );
    const bindingErrors = result.errors.filter((e) => e.path.includes("actionBindings"));
    expect(bindingErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Duplicate passive IDs
// ---------------------------------------------------------------------------

describe("Duplicate passive ID detection", () => {
  it("errors on duplicate passive IDs", () => {
    const result = validate(
      minimalSpec({
        effects: {
          effects: [makeEffect("e1")],
          passives: [
            { id: "armor", trigger: ["deal-damage"], scope: "owner-targeted", effects: [{ kind: "cancel-effect" }] },
            { id: "armor", trigger: ["deal-damage"], scope: "owner-originated", effects: [{ kind: "cancel-effect" }] },
          ],
        },
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('"armor"'))).toBe(true);
  });
});
