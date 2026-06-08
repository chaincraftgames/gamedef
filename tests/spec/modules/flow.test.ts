/**
 * Parse tests for FlowModuleSchema.
 *
 * Exercises:
 *   - FlowNodeSchema: loop, turn, simultaneous
 *   - TurnGrammarNodeSchema: action, slot, sequence, choice (passable), repeat
 *   - TurnOrder variants
 *   - ActorSpec variants
 *   - FlowHooks (onEnter/onComplete)
 *   - endCondition (JSONLogic or "until-pass") and count on loop
 *   - interruptWindows on nodes (scoped)
 *   - Full Liar's Dice flow
 *   - Full Werewolf (night/day) flow
 *   - Rejection cases
 */

import { FlowModuleSchema } from "#gamedef/modules/flow.js";

function ok(data: unknown) {
  const result = FlowModuleSchema.safeParse(data);
  if (!result.success) throw new Error(JSON.stringify(result.error.format(), null, 2));
  return result.data;
}

function fail(data: unknown) {
  const result = FlowModuleSchema.safeParse(data);
  expect(result.success).toBe(false);
}

// Wrap a single child node in a minimal root loop with endCondition
function baseLoop(child: any): any {
  return {
    root: {
      kind: "loop",
      endCondition: { var: "game.state.done" },
      children: [child],
    },
  };
}

// ---------------------------------------------------------------------------
// Liar's Dice
// ---------------------------------------------------------------------------

describe("FlowModuleSchema — Liar's Dice", () => {
  const liarsFlow = {
    root: {
      kind: "loop",
      endCondition: { "<=": [{ var: "game.state.activePlayers" }, 1] },
      hooks: { onEnter: [{ ref: "deal-dice" }] },
      interruptWindows: [
        {
          id: "steal-response",
          trigger: "steal-die",
          timing: "before",
          eligiblePlayers: "opponents",
          actions: ["block-steal"],
          timeout: 15000,
        },
      ],
      children: [
        {
          kind: "turn",
          actor: "active-player",
          turnOrder: { kind: "seat", direction: "clockwise" },
          grammar: {
            kind: "choice",
            passable: true,
            options: [
              { kind: "action", ref: "make-bid" },
              { kind: "action", ref: "challenge" },
            ],
          },
        },
      ],
    },
  };

  it("parses a valid Liar's Dice flow", () => {
    const result = ok(liarsFlow);
    expect(result.root.kind).toBe("loop");
  });

  it("preserves interrupt windows on the loop node", () => {
    const result = ok(liarsFlow);
    const root = result.root as any;
    expect(root.interruptWindows).toHaveLength(1);
    expect(root.interruptWindows[0].id).toBe("steal-response");
  });

  it("preserves children", () => {
    const result = ok(liarsFlow);
    const root = result.root as any;
    expect(root.children).toHaveLength(1);
    expect(root.children[0].kind).toBe("turn");
  });
});

// ---------------------------------------------------------------------------
// Werewolf
// ---------------------------------------------------------------------------

describe("FlowModuleSchema — Werewolf", () => {
  const werewolfFlow = {
    root: {
      kind: "loop",
      endCondition: { var: "game.state.gameOver" },
      children: [
        {
          kind: "simultaneous",
          id: "night",
          label: "Night Phase",
          actor: { roles: ["villager", "mafia"] },
          grammar: {
            kind: "slot",
            inventory: "role-card",
            slot: "night-action",
            select: "all",
          },
        },
        {
          kind: "simultaneous",
          id: "day-discussion",
          label: "Discussion",
          actor: "all-players",
          endCondition: "all-passed",
          grammar: {
            kind: "choice",
            passable: true,
            options: [{ kind: "action", ref: "accuse-player" }],
          },
        },
        {
          kind: "simultaneous",
          id: "day-vote",
          label: "Vote",
          actor: "all-players",
          grammar: { kind: "action", ref: "vote-eliminate" },
          hooks: {
            onComplete: [{ ref: "reveal-eliminated" }, { ref: "remove-eliminated" }],
          },
        },
      ],
    },
  };

  it("parses a valid Werewolf flow", () => {
    const result = ok(werewolfFlow);
    expect(result.root.kind).toBe("loop");
  });

  it("parses simultaneous with actor: { roles }", () => {
    const result = ok(werewolfFlow);
    const night = (result.root as any).children[0];
    expect(night.actor.roles).toContain("villager");
  });

  it("parses endCondition: 'all-passed' on simultaneous", () => {
    const result = ok(werewolfFlow);
    const discussion = (result.root as any).children[1];
    expect(discussion.endCondition).toBe("all-passed");
  });
});

// ---------------------------------------------------------------------------
// Loop exit: count vs endCondition
// ---------------------------------------------------------------------------

describe("FlowModuleSchema — Loop exit", () => {
  it("parses loop with count", () => {
    const result = ok({
      root: {
        kind: "loop",
        count: 5,
        children: [{ kind: "turn", actor: "active-player", grammar: { kind: "action", ref: "noop" } }],
      },
    });
    expect((result.root as any).count).toBe(5);
  });

  it("parses loop with count: 1 (single round)", () => {
    const result = ok({
      root: {
        kind: "loop",
        count: 1,
        children: [{ kind: "turn", actor: "active-player", grammar: { kind: "action", ref: "noop" } }],
      },
    });
    expect((result.root as any).count).toBe(1);
  });

  it("parses loop with JSONLogic endCondition", () => {
    const result = ok({
      root: {
        kind: "loop",
        endCondition: { ">=": [{ var: "game.property.round" }, 5] },
        children: [{ kind: "turn", actor: "active-player", grammar: { kind: "action", ref: "noop" } }],
      },
    });
    expect((result.root as any).endCondition).toBeDefined();
  });

  it("parses loop with endCondition: 'until-pass'", () => {
    const result = ok({
      root: {
        kind: "loop",
        endCondition: "all-passed",
        children: [
          {
            kind: "simultaneous",
            actor: "all-players",
            grammar: { kind: "choice", passable: true, options: [{ kind: "action", ref: "noop" }] },
          },
        ],
      },
    });
    expect((result.root as any).endCondition).toBe("all-passed");
  });

  it("parses loop with finalRound: true", () => {
    const result = ok({
      root: {
        kind: "loop",
        endCondition: { ">=": [{ var: "actor.property.score" }, 50] },
        finalRound: true,
        children: [{ kind: "turn", actor: "all-players", turnOrder: { kind: "seat", direction: "clockwise" }, grammar: { kind: "action", ref: "take-turn" } }],
      },
    });
    expect((result.root as any).finalRound).toBe(true);
  });

  it("parses count: 1 root with two child phase loops (multi-phase game)", () => {
    const result = ok({
      root: {
        kind: "loop",
        count: 1,
        children: [
          {
            kind: "loop",
            id: "exploration",
            endCondition: { var: "game.property.hauntTriggered" },
            finalRound: true,
            children: [{ kind: "turn", actor: "all-players", grammar: { kind: "action", ref: "explore" } }],
          },
          {
            kind: "loop",
            id: "escape",
            endCondition: { var: "game.property.gameOver" },
            children: [{ kind: "turn", actor: "all-players", grammar: { kind: "action", ref: "escape" } }],
          },
        ],
      },
    });
    const root = result.root as any;
    expect(root.count).toBe(1);
    expect(root.children[0].id).toBe("exploration");
    expect(root.children[0].finalRound).toBe(true);
    expect(root.children[1].id).toBe("escape");
  });

  it("rejects loop with empty children", () => {
    fail({ root: { kind: "loop", count: 1, children: [] } });
  });
});

// ---------------------------------------------------------------------------
// Interrupt windows on nodes (scoped)
// ---------------------------------------------------------------------------

describe("FlowModuleSchema — Scoped interrupt windows", () => {
  it("parses interruptWindows on root loop", () => {
    const result = ok({
      root: {
        kind: "loop",
        count: 3,
        interruptWindows: [
          {
            id: "global-response",
            trigger: "take-damage",
            timing: "after",
            eligiblePlayers: "all",
            actions: ["respond"],
          },
        ],
        children: [{ kind: "turn", actor: "active-player", grammar: { kind: "action", ref: "noop" } }],
      },
    });
    expect((result.root as any).interruptWindows).toHaveLength(1);
  });

  it("parses interruptWindows on a turn node", () => {
    const result = ok(
      baseLoop({
        kind: "turn",
        id: "attack-turn",
        actor: "active-player",
        grammar: { kind: "action", ref: "attack" },
        interruptWindows: [
          {
            id: "counter-spell",
            trigger: "deal-damage",
            timing: "before",
            eligiblePlayers: "opponents",
            actions: ["counter-spell"],
          },
        ],
      }),
    );
    const turn = (result.root as any).children[0];
    expect(turn.interruptWindows[0].id).toBe("counter-spell");
  });

  it("parses interruptWindows on a simultaneous node", () => {
    const result = ok(
      baseLoop({
        kind: "simultaneous",
        actor: "all-players",
        grammar: { kind: "action", ref: "noop" },
        interruptWindows: [
          {
            id: "sim-window",
            trigger: "some-effect",
            timing: "after",
            eligiblePlayers: { roles: ["healer"] },
            actions: ["heal"],
          },
        ],
      }),
    );
    const sim = (result.root as any).children[0];
    expect(sim.interruptWindows[0].eligiblePlayers.roles).toContain("healer");
  });

  it("parses interruptWindow with eligiblePlayers: 'non-active'", () => {
    const result = ok(
      baseLoop({
        kind: "turn",
        actor: "active-player",
        grammar: { kind: "action", ref: "noop" },
        interruptWindows: [
          {
            id: "non-active-window",
            trigger: "some-effect",
            timing: "before",
            eligiblePlayers: "non-active",
            actions: ["respond"],
          },
        ],
      }),
    );
    const turn = (result.root as any).children[0];
    expect(turn.interruptWindows[0].eligiblePlayers).toBe("non-active");
  });
});

// ---------------------------------------------------------------------------
// Turn grammar
// ---------------------------------------------------------------------------

describe("FlowModuleSchema — Turn Grammar", () => {
  it("parses action grammar", () => {
    const result = ok(baseLoop({ kind: "turn", actor: "active-player", grammar: { kind: "action", ref: "play-card" } }));
    expect((result.root as any).children[0].grammar.ref).toBe("play-card");
  });

  it("parses slot grammar with select: 'all'", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "active-player",
      grammar: { kind: "slot", inventory: "hand", slot: "card-ability", select: "all" },
    }));
    expect((result.root as any).children[0].grammar.select).toBe("all");
  });

  it("parses slot grammar with select: { max: 2 }", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "active-player",
      grammar: { kind: "slot", inventory: "hand", slot: "card-ability", select: { max: 2 } },
    }));
    expect((result.root as any).children[0].grammar.select.max).toBe(2);
  });

  it("parses sequence", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "active-player",
      grammar: { kind: "sequence", steps: [{ kind: "action", ref: "draw" }, { kind: "action", ref: "play" }] },
    }));
    expect((result.root as any).children[0].grammar.steps).toHaveLength(2);
  });

  it("parses choice with passable: true", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "active-player",
      grammar: { kind: "choice", passable: true, options: [{ kind: "action", ref: "play-card" }] },
    }));
    expect((result.root as any).children[0].grammar.passable).toBe(true);
  });

  it("parses repeat with count: { max: 3 }", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "active-player",
      grammar: {
        kind: "repeat",
        count: { max: 3 },
        body: { kind: "choice", passable: true, options: [{ kind: "action", ref: "play-card" }] },
      },
    }));
    expect((result.root as any).children[0].grammar.count.max).toBe(3);
  });

  it("parses repeat with count: 'until-pass'", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "active-player",
      grammar: {
        kind: "repeat",
        count: "until-pass",
        body: { kind: "choice", passable: true, options: [{ kind: "action", ref: "play-card" }] },
      },
    }));
    expect((result.root as any).children[0].grammar.count).toBe("until-pass");
  });
});

// ---------------------------------------------------------------------------
// TurnOrder variants
// ---------------------------------------------------------------------------

describe("FlowModuleSchema — TurnOrder", () => {
  it("parses seat order", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "all-players",
      turnOrder: { kind: "seat", direction: "clockwise" },
      grammar: { kind: "action", ref: "noop" },
    }));
    expect((result.root as any).children[0].turnOrder.kind).toBe("seat");
  });

  it("parses ranked order", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "all-players",
      turnOrder: { kind: "ranked", by: { playerProperty: "gold" }, order: "ascending" },
      grammar: { kind: "action", ref: "noop" },
    }));
    expect((result.root as any).children[0].turnOrder.kind).toBe("ranked");
  });

  it("parses explicit order", () => {
    const result = ok(baseLoop({
      kind: "turn", actor: "all-players",
      turnOrder: { kind: "explicit", players: ["north", "east", "south", "west"] },
      grammar: { kind: "action", ref: "noop" },
    }));
    expect((result.root as any).children[0].turnOrder.players).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Rejection cases
// ---------------------------------------------------------------------------

describe("FlowModuleSchema — Rejection cases", () => {
  it("rejects loop with empty children", () => {
    fail({ root: { kind: "loop", count: 1, children: [] } });
  });

  it("rejects turn with no actor", () => {
    fail(baseLoop({ kind: "turn", grammar: { kind: "action", ref: "noop" } }));
  });

  it("rejects simultaneous with no actor", () => {
    fail(baseLoop({ kind: "simultaneous", grammar: { kind: "action", ref: "noop" } }));
  });

  it("rejects turn with no grammar", () => {
    fail(baseLoop({ kind: "turn", actor: "active-player" }));
  });

  it("rejects choice with no options", () => {
    fail(baseLoop({ kind: "turn", actor: "active-player", grammar: { kind: "choice", options: [] } }));
  });

  it("rejects repeat with count: 0", () => {
    fail(baseLoop({
      kind: "turn", actor: "active-player",
      grammar: { kind: "repeat", count: 0, body: { kind: "action", ref: "noop" } },
    }));
  });

  it("rejects interruptWindow with empty actions", () => {
    fail(baseLoop({
      kind: "turn", actor: "active-player",
      grammar: { kind: "action", ref: "noop" },
      interruptWindows: [{ id: "w", trigger: "e", timing: "before", eligiblePlayers: "all", actions: [] }],
    }));
  });

  it("rejects actor: { roles: [] }", () => {
    fail(baseLoop({ kind: "turn", actor: { roles: [] }, grammar: { kind: "action", ref: "noop" } }));
  });
});
