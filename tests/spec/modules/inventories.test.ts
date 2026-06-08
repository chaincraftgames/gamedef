/**
 * Parse tests for InventoriesModuleSchema.
 *
 * "Cribbage Plus" — a cribbage variant extended with a score track, a market
 * row, a hex board, and a piece-scoped attachment slot. Designed to exercise
 * every feature of the inventories module:
 *   - scope kinds: game, player (all), player (role-restricted), team, piece
 *   - structure: none, stack, line, grid, graph
 *   - visibility: always, revealed, owner, count-only, never
 *   - displayHint: pile, fan
 *   - gridDimensions
 *   - capacity (min, max, both, neither)
 *   - label and description (optional fields)
 *   - structure default ("none")
 */

import { InventoriesModuleSchema } from "#gamedef/modules/inventories.js";

// ---------------------------------------------------------------------------
// Valid: full Cribbage Plus module
// ---------------------------------------------------------------------------

describe("InventoriesModuleSchema — Cribbage Plus", () => {
  const validModule = {
    types: [
      // ---- scope: game, structure: stack, displayHint: pile ----
      {
        id: "draw-deck",
        label: "Draw Deck",
        scope: { kind: "game" },
        accepts: ["playing-card"],
        visibility: "count-only",
        structure: "stack",
        displayHint: "pile",
        description: "Shared draw deck for the whole game",
      },

      // ---- scope: game, structure: stack, no displayHint ----
      {
        id: "discard-pile",
        label: "Discard",
        scope: { kind: "game" },
        accepts: ["playing-card"],
        visibility: "always",
        structure: "stack",
      },

      // ---- scope: player (all), structure: none (default), displayHint: fan ----
      {
        id: "player-hand",
        label: "Hand",
        scope: { kind: "player" },
        accepts: ["playing-card"],
        visibility: "owner",
        displayHint: "fan",
        capacity: { max: 6 },
      },

      // ---- scope: player (role-restricted), structure: none, visibility: never ----
      {
        id: "crib",
        label: "Crib",
        scope: { kind: "player", role: "dealer" },
        accepts: ["playing-card"],
        visibility: "never",
        capacity: { min: 4, max: 4 },
        description: "The crib — only the dealer has one",
      },

      // ---- scope: team (all), structure: none ----
      {
        id: "team-supply",
        label: "Team Supply",
        scope: { kind: "team" },
        accepts: ["resource-token"],
        visibility: "always",
      },

      // ---- scope: team (role-restricted) ----
      {
        id: "captain-reserve",
        scope: { kind: "team", role: "attacker" },
        accepts: ["captain-piece"],
        visibility: "owner",
      },

      // ---- scope: piece, structure: none ----
      {
        id: "card-attachment",
        scope: { kind: "piece" },
        accepts: ["effect-token"],
        visibility: "always",
        capacity: { max: 3 },
        description: "Tokens attached directly to a card",
      },

      // ---- structure: line (score track backing inventory) ----
      {
        id: "score-track",
        label: "Score Track",
        scope: { kind: "game" },
        accepts: ["peg"],
        visibility: "always",
        structure: "line",
      },

      // ---- structure: grid, gridDimensions ----
      {
        id: "hex-board",
        label: "Hex Board",
        scope: { kind: "game" },
        accepts: ["hex-tile"],
        visibility: "always",
        structure: "grid",
        gridDimensions: { rows: 5, columns: 5 },
        capacity: { max: 25 },
      },

      // ---- structure: graph ----
      {
        id: "region-map",
        label: "Region Map",
        scope: { kind: "game" },
        accepts: ["region-token"],
        visibility: "always",
        structure: "graph",
      },

      // ---- visibility: revealed ----
      {
        id: "face-down-reserve",
        scope: { kind: "game" },
        accepts: ["playing-card"],
        visibility: "revealed",
        structure: "stack",
        displayHint: "pile",
      },

      // ---- capacity: min only ----
      {
        id: "minimum-pool",
        scope: { kind: "game" },
        accepts: ["resource-token"],
        visibility: "always",
        capacity: { min: 1 },
      },
    ],
  };

  it("parses a valid full module without errors", () => {
    expect(() => InventoriesModuleSchema.parse(validModule)).not.toThrow();
  });

  it("defaults structure to 'none' when omitted", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const hand = result.types.find((t) => t.id === "player-hand")!;
    expect(hand.structure).toBe("none");
  });

  it("preserves explicit structure values", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    expect(result.types.find((t) => t.id === "draw-deck")!.structure).toBe("stack");
    expect(result.types.find((t) => t.id === "score-track")!.structure).toBe("line");
    expect(result.types.find((t) => t.id === "hex-board")!.structure).toBe("grid");
    expect(result.types.find((t) => t.id === "region-map")!.structure).toBe("graph");
  });

  it("parses scope: game correctly", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const deck = result.types.find((t) => t.id === "draw-deck")!;
    expect(deck.scope).toEqual({ kind: "game" });
  });

  it("parses scope: player (all) correctly", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const hand = result.types.find((t) => t.id === "player-hand")!;
    expect(hand.scope).toEqual({ kind: "player" });
  });

  it("parses scope: player with role restriction correctly", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const crib = result.types.find((t) => t.id === "crib")!;
    expect(crib.scope).toEqual({ kind: "player", role: "dealer" });
  });

  it("parses scope: team (all) correctly", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const supply = result.types.find((t) => t.id === "team-supply")!;
    expect(supply.scope).toEqual({ kind: "team" });
  });

  it("parses scope: team with role restriction correctly", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const reserve = result.types.find((t) => t.id === "captain-reserve")!;
    expect(reserve.scope).toEqual({ kind: "team", role: "attacker" });
  });

  it("parses scope: piece correctly", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const attachment = result.types.find((t) => t.id === "card-attachment")!;
    expect(attachment.scope).toEqual({ kind: "piece" });
  });

  it("parses gridDimensions correctly", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const board = result.types.find((t) => t.id === "hex-board")!;
    expect(board.gridDimensions).toEqual({ rows: 5, columns: 5 });
  });

  it("parses all visibility values", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const byVis = (v: string) => result.types.find((t) => t.visibility === v);
    expect(byVis("always")).toBeDefined();
    expect(byVis("revealed")).toBeDefined();
    expect(byVis("owner")).toBeDefined();
    expect(byVis("count-only")).toBeDefined();
    expect(byVis("never")).toBeDefined();
  });

  it("parses displayHint values correctly", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    expect(result.types.find((t) => t.id === "draw-deck")!.displayHint).toBe("pile");
    expect(result.types.find((t) => t.id === "player-hand")!.displayHint).toBe("fan");
  });

  it("preserves optional label and description", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    const deck = result.types.find((t) => t.id === "draw-deck")!;
    expect(deck.label).toBe("Draw Deck");
    expect(deck.description).toBe("Shared draw deck for the whole game");
  });

  it("parses capacity with max only", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    expect(result.types.find((t) => t.id === "player-hand")!.capacity).toEqual({ max: 6 });
  });

  it("parses capacity with min and max", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    expect(result.types.find((t) => t.id === "crib")!.capacity).toEqual({ min: 4, max: 4 });
  });

  it("parses capacity with min only", () => {
    const result = InventoriesModuleSchema.parse(validModule);
    expect(result.types.find((t) => t.id === "minimum-pool")!.capacity).toEqual({ min: 1 });
  });
});

// ---------------------------------------------------------------------------
// Invalid: schema rejection cases
// ---------------------------------------------------------------------------

describe("InventoriesModuleSchema — rejections", () => {
  it("rejects an empty types array", () => {
    expect(() => InventoriesModuleSchema.parse({ types: [] })).toThrow();
  });

  it("rejects a type missing required 'id'", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [{ scope: { kind: "game" }, accepts: ["card"], visibility: "always" }],
      }),
    ).toThrow();
  });

  it("rejects a type with empty accepts array", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [{ id: "x", scope: { kind: "game" }, accepts: [], visibility: "always" }],
      }),
    ).toThrow();
  });

  it("rejects a type missing required 'accepts'", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [{ id: "x", scope: { kind: "game" }, visibility: "always" }],
      }),
    ).toThrow();
  });

  it("rejects an unknown scope kind", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [
          {
            id: "x",
            scope: { kind: "global" },
            accepts: ["card"],
            visibility: "always",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects an unknown structure value", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [
          {
            id: "x",
            scope: { kind: "game" },
            accepts: ["card"],
            visibility: "always",
            structure: "track",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects an unknown visibility value", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [
          {
            id: "x",
            scope: { kind: "game" },
            accepts: ["card"],
            visibility: "public",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects gridDimensions with rows < 1", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [
          {
            id: "x",
            scope: { kind: "game" },
            accepts: ["tile"],
            visibility: "always",
            structure: "grid",
            gridDimensions: { rows: 0, columns: 5 },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects gridDimensions with columns < 1", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [
          {
            id: "x",
            scope: { kind: "game" },
            accepts: ["tile"],
            visibility: "always",
            structure: "grid",
            gridDimensions: { rows: 3, columns: 0 },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects capacity.max < 1", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [
          {
            id: "x",
            scope: { kind: "game" },
            accepts: ["card"],
            visibility: "always",
            capacity: { max: 0 },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects capacity.min < 0", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [
          {
            id: "x",
            scope: { kind: "game" },
            accepts: ["card"],
            visibility: "always",
            capacity: { min: -1 },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects an unknown displayHint value", () => {
    expect(() =>
      InventoriesModuleSchema.parse({
        types: [
          {
            id: "x",
            scope: { kind: "game" },
            accepts: ["card"],
            visibility: "always",
            displayHint: "spread",
          },
        ],
      }),
    ).toThrow();
  });
});
