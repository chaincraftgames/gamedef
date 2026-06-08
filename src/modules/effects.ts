/**
 * Effects Module Schema
 *
 * No dependencies on other spec modules — inventory type IDs, gamepiece type IDs,
 * and property IDs are all string forward references validated cross-section.
 * Referenced by: actions (action.effects), flow (phase-transition effects),
 *                mechanics (pattern execution effects).
 *
 * Effects are named, concrete state-transition operations. Named effects live in the
 * effects module and are always fully self-contained — no parameters, no binding maps.
 * Call sites (actions, flow transitions, mechanics) reference them by ID.
 *
 * Inline effects may be used at any call site for one-off transitions not worth naming.
 * Inline effects inside actions may use { param: id } in PropertyValue to reference a
 * value from the enclosing action's inputs[] — the engine resolves these by convention
 * without any explicit binding declaration.
 *
 * Key design decisions:
 * - Every effect is discriminated by 'kind' — a discriminated union, not a catch-all map.
 * - Named effects are concrete and reusable. Use them for anything triggered from more
 *   than one place (an action AND a flow transition, or an action AND a mechanic).
 * - Inline effects are anonymous and local. Use them for one-off transitions specific
 *   to a single action or flow step.
 * - { param: id } in PropertyValue is only valid in inline effects inside an action that
 *   declares a matching input id. The engine resolves by name — no bind map needed.
 * - 'prose' kind is the escape hatch for logic that doesn't fit the primitive kinds.
 *   Avoid overusing it — the primitive kinds cover the common cases deterministically.
 * - PieceSelector is shared across move/flip/update/roll/orient.
 * - 'player-chooses' selector: the engine prompts the active player at runtime.
 * - draw-discard behavior is a MECHANIC that references effects — not a special kind.
 *
 * @example Effects module (card game)
 * ```yaml
 * effects:
 *   - id: shuffle-deck
 *     kind: shuffle
 *     inventory: draw-deck
 *
 *   - id: draw-card
 *     kind: move
 *     from: { inventory: draw-deck, select: top }
 *     to: { inventory: player-hand }
 *
 *   - id: advance-score-2
 *     kind: update
 *     pieces: { inventory: score-track, select: all, ofType: score-peg }
 *     property: position
 *     value: { delta: 2 }
 *
 *   - id: resolve-combat
 *     kind: prose
 *     description: >
 *       Compare power totals of face-up cards. Higher total scores 1 point.
 *       On a tie no points scored; both players draw a card.
 * ```
 * @example Action with inline effects using { param } (Liar's Dice make-bid)
 * ```yaml
 * id: make-bid
 * pattern: standard
 * inputs:
 *   - id: quantity
 *     type: { kind: integer, min: 1, max: 30 }
 *   - id: face-value
 *     type: { kind: integer, min: 1, max: 6 }
 * effects:
 *   # { param: quantity } resolves from this action's inputs[] by id — no bind map
 *   - kind: update
 *     pieces: { inventory: current-bid, select: top }
 *     property: quantity
 *     value: { param: quantity }
 *   - kind: update
 *     pieces: { inventory: current-bid, select: top }
 *     property: face-value
 *     value: { param: face-value }
 * ```
 * @example Mixed named refs and inline in a single action
 * ```yaml
 * effects:
 *   - ref: shuffle-deck
 *   - kind: move
 *     from: { inventory: draw-deck, select: top }
 *     to: { inventory: player-hand }
 * ```
 */

import { z } from "zod";
import { InventoryPlacementSchema } from "./inventories.js";

// ---------------------------------------------------------------------------
// Piece selector (shared across move, flip, update, roll, orient)
// ---------------------------------------------------------------------------

/**
 * @example
 * ```yaml
 * { inventory: draw-deck, select: top }
 * { inventory: draw-deck, select: top, count: 3 }
 * { inventory: player-hand, select: player-chooses, count: 1 }
 * { inventory: combat-zone, select: all, ofType: captain }
 * { inventory: dice-tray, select: random, count: 2 }
 * { inventory: game:unassigned, select: { id: white-king } }
 * ```
 */
export const PieceSelectorSchema = z
  .object({
    inventory: z
      .string()
      .describe(
        "Inventory type ID to select pieces from. Forward reference to the inventories module. " +
          "Use 'game:unassigned' to select from the system pool of unplaced catalog pieces.",
      ),
    select: z
      .union([
        z.enum(["top", "bottom", "random", "all", "player-chooses"]).describe(
          "How to select pieces from the inventory. " +
            "'top': take from the top of a stack or front of a line. " +
            "'bottom': take from the bottom of a stack or back of a line. " +
            "'random': engine picks randomly — use 'count' to specify how many. " +
            "'all': every piece currently in the inventory (ignores 'count'). " +
            "'player-chooses': engine prompts the active player — 'count' is required.",
        ),
        z
          .object({ id: z.string() })
          .describe(
            "Select a specific named piece by its catalog 'id'. " +
              "Used in setup effects to place individually named pieces: " +
              "{ inventory: game:unassigned, select: { id: white-king } }.",
          ),
      ])
      .describe("How to select pieces from the inventory."),
    count: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "How many pieces to select. Required when select is 'player-chooses'. " +
          "Omit when select is 'all'. For top/bottom/random defaults to 1.",
      ),
    ofType: z
      .string()
      .optional()
      .describe(
        "Restrict selection to pieces of this gamepiece type ID. Forward reference to " +
          "the gamepiece-types module. Omit to select any piece regardless of type.",
      ),
  })
  .describe(
    "Identifies which pieces an effect operates on — which inventory and how to pick from it.",
  );

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Inventory target (destination for move effects)
// ---------------------------------------------------------------------------

/**
 * @example
 * ```yaml
 * { inventory: player-hand }                                        # unordered — no position needed
 * { inventory: discard-pile, at: { kind: stack-top } }             # top of the discard stack
 * { inventory: market-row, at: { kind: line-index, index: 2 } }   # slot 2 in a line inventory
 * { inventory: battle-grid, at: { kind: grid-cell, row: 1, col: "e" } } # grid cell
 * { inventory: board, at: { kind: graph-node, nodeId: "C3" } }    # graph node
 * ```
 */
export const InventoryTargetSchema = z
  .object({
    inventory: z
      .string()
      .describe(
        "Destination inventory type ID. Forward reference to the inventories module. " +
          "For player-scoped inventories, the engine resolves to the acting player's " +
          "instance within the context of a player action.",
      ),
    at: InventoryPlacementSchema.optional().describe(
      "Placement position within the inventory. " +
        "Omit for unordered (none) inventories or when position doesn't matter. " +
        "When from and to reference the same inventory, the engine performs a " +
        "within-inventory reposition rather than a cross-inventory move.",
    ),
  })
  .describe("Destination inventory and optional placement position for a move effect.");

// ---------------------------------------------------------------------------
// Distribute target (explicit multi-instance targeting for distribute effects)
// ---------------------------------------------------------------------------

/**
 * @example
 * ```yaml
 * { scope: all-players, inventory: player-hand }              # every player's hand
 * { scope: all-teams, inventory: team-supply }                # every team's supply
 * { scope: active-player, inventory: player-hand }            # just the acting player's hand
 * { scope: all-players, inventory: player-hand, roles: [mafia] } # only players with mafia role
 * ```
 */
export const DistributeTargetSchema = z
  .object({
    scope: z
      .enum(["all-players", "all-teams", "active-player"])
      .describe(
        "Which instances of the target inventory to deal into. " +
          "'all-players': one deal unit per player. " +
          "'all-teams': one deal unit per team. " +
          "'active-player': only the currently acting player's instance.",
      ),
    inventory: z
      .string()
      .describe(
        "Target inventory type ID (player- or team-scoped). " +
          "Forward reference to the inventories module.",
      ),
    roles: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        "If provided, restrict distribution to players (or teams) holding at least one of these role IDs. " +
          "Forward references to role IDs defined in the players module. " +
          "Use in setup to deal role-specific items: e.g., deal a kill card only to the mafia player.",
      ),
  })
  .describe("Multi-instance target for distribute effects.");

// ---------------------------------------------------------------------------
// Property value expression (for update effects)
// ---------------------------------------------------------------------------

/**
 * @example
 * ```yaml
 * value: 5                   # set to literal integer
 * value: "exhausted"         # set to literal string
 * value: true                # set to literal boolean
 * value: { delta: -1 }       # decrement by 1
 * value: { delta: 3 }        # increment by 3
 * value: { toggle: true }    # flip a boolean property
 * value: { param: delta }    # resolve from named param at call site
 * ```
 */
export const PropertyValueSchema = z
  .union([
    z.string().describe("Set property to a literal string value."),
    z.number().describe("Set property to a literal numeric value."),
    z.boolean().describe("Set property to a literal boolean value."),
    z
      .object({ delta: z.number() })
      .describe(
        "Increment or decrement a numeric property. Positive delta increments, negative decrements. " +
          "The engine clamps to the property's min/max if defined.",
      ),
    z
      .object({ toggle: z.literal(true) })
      .describe("Flip a boolean property to its opposite value."),
    z
      .object({ param: z.string() })
      .describe(
        "Resolve this value from the enclosing action's inputs[] by matching id. " +
          "Engine convention — no explicit binding needed. " +
          "Only valid in inline effects inside an action that declares a matching input id.",
      ),
  ])
  .describe(
    "The new value to assign, or a relative change to apply to a property.",
  );

// ---------------------------------------------------------------------------
// Individual effect kinds
// ---------------------------------------------------------------------------

/**
 * Move one or more pieces between inventories, or reposition within the same inventory.
 * When from.inventory and to.inventory are the same ID, the engine performs an
 * in-place reposition — no piece is added or removed, only its position changes.
 *
 * @example Draw a card (cross-inventory)
 * ```yaml
 * kind: move
 * from: { inventory: draw-deck, select: top }
 * to: { inventory: player-hand }
 * ```
 * @example Player discards a chosen card to the top of the discard pile
 * ```yaml
 * kind: move
 * from: { inventory: player-hand, select: player-chooses, count: 1 }
 * to: { inventory: discard-pile, at: { kind: stack-top } }
 * ```
 * @example Move a piece to a specific grid cell (within-inventory reposition)
 * ```yaml
 * kind: move
 * from: { inventory: battle-grid, select: player-chooses, count: 1 }
 * to: { inventory: battle-grid, at: { kind: grid-cell, row: 2, col: 3 } }
 * ```
 * @example Advance a token to slot 5 on a line inventory
 * ```yaml
 * kind: move
 * from: { inventory: score-track, select: all, ofType: score-peg }
 * to: { inventory: score-track, at: { kind: line-index, index: 5 } }
 * ```
 */
export const MoveEffectSchema = z
  .object({
    kind: z.literal("move"),
    from: PieceSelectorSchema.describe("Which pieces to move and where to take them from."),
    to: InventoryTargetSchema.describe(
      "Destination inventory and position. When from.inventory === to.inventory, " +
        "the engine repositions the piece within the same inventory.",
    ),
  })
  .describe(
    "Moves pieces between inventories or repositions them within the same inventory. " +
      "The engine preserves piece identity and all property state.",
  );

/**
 * Change the face state of one or more pieces.
 * Only meaningful for gamepiece types where hasFaceState is true.
 *
 * @example Reveal all cards in the combat zone
 * ```yaml
 * kind: flip
 * pieces: { inventory: combat-zone, select: all }
 * to: face-up
 * ```
 * @example Toggle the top card of the reserve
 * ```yaml
 * kind: flip
 * pieces: { inventory: reserve, select: top }
 * to: toggle
 * ```
 */
export const FlipEffectSchema = z
  .object({
    kind: z.literal("flip"),
    pieces: PieceSelectorSchema.describe("Which pieces to flip."),
    to: z
      .enum(["face-up", "face-down", "toggle"])
      .describe(
        "Target face state. 'face-up': reveal. 'face-down': conceal. " +
          "'toggle': reverse the current state.",
      ),
  })
  .describe(
    "Changes the face state of pieces. Affects visibility of 'revealed' properties.",
  );

/**
 * Change a property value on one or more pieces.
 *
 * @example Set a piece as exhausted
 * ```yaml
 * kind: update
 * pieces: { inventory: play-area, select: player-chooses, count: 1 }
 * property: isExhausted
 * value: true
 * ```
 * @example Advance score peg by 2
 * ```yaml
 * kind: update
 * pieces: { inventory: score-track, select: all, ofType: score-peg }
 * property: position
 * value: { delta: 2 }
 * ```
 */
export const UpdateEffectSchema = z
  .object({
    kind: z.literal("update"),
    pieces: PieceSelectorSchema.describe("Which pieces to update."),
    property: z
      .string()
      .describe(
        "ID of the property to change. Forward reference to a mutable property on the " +
          "selected gamepiece type.",
      ),
    value: PropertyValueSchema,
  })
  .describe(
    "Changes a mutable property on one or more pieces. Only valid for mutable properties.",
  );

/**
 * Randomize the order of pieces within an inventory.
 * Typically used to shuffle a draw deck after resetting from discard.
 *
 * @example Shuffle the draw deck
 * ```yaml
 * kind: shuffle
 * inventory: draw-deck
 * ```
 */
export const ShuffleEffectSchema = z
  .object({
    kind: z.literal("shuffle"),
    inventory: z
      .string()
      .describe(
        "Inventory type ID to shuffle. Forward reference to the inventories module. " +
          "Randomizes the internal order of all pieces in the inventory.",
      ),
  })
  .describe("Randomizes the order of all pieces in an inventory.");

/**
 * Deal a fixed number of pieces from a source to multiple inventory instances.
 * Typical use: deal opening hands, distribute starting resources.
 *
 * @example Deal 6 cards to each player round-robin
 * ```yaml
 * kind: distribute
 * from: { inventory: draw-deck, select: top }
 * to: { scope: all-players, inventory: player-hand }
 * count: 6
 * style: round-robin
 * ```
 * @example Give each team 3 resources at once
 * ```yaml
 * kind: distribute
 * from: { inventory: resource-supply, select: random }
 * to: { scope: all-teams, inventory: team-supply }
 * count: 3
 * style: batch
 * ```
 */
export const DistributeEffectSchema = z
  .object({
    kind: z.literal("distribute"),
    from: PieceSelectorSchema.describe(
      "Source inventory and selection method. 'count' on the selector is ignored — " +
        "use the top-level 'count' field.",
    ),
    to: DistributeTargetSchema,
    count: z
      .number()
      .int()
      .min(1)
      .describe("Number of pieces to deal to each target instance."),
    style: z
      .enum(["round-robin", "batch"])
      .default("round-robin")
      .describe(
        "Dealing order. 'round-robin': one piece at a time to each target in turn, repeat. " +
          "'batch': deal all 'count' pieces to the first target, then all to the next, etc.",
      ),
  })
  .describe(
    "Deals pieces from a source inventory to multiple target inventory instances. " +
      "Use for setup (deal opening hands) or mid-game distributions.",
  );

/**
 * Randomize the face value of one or more die pieces.
 * The engine uses faceCount from the gamepiece type to determine the range.
 *
 * @example Roll all dice in the dice tray
 * ```yaml
 * kind: roll
 * pieces: { inventory: dice-tray, select: all }
 * ```
 * @example Roll a single chosen die
 * ```yaml
 * kind: roll
 * pieces: { inventory: dice-tray, select: player-chooses, count: 1 }
 * ```
 */
export const RollEffectSchema = z
  .object({
    kind: z.literal("roll"),
    pieces: PieceSelectorSchema.describe(
      "Which die pieces to roll. Should select pieces with faceCount defined on their type.",
    ),
  })
  .describe(
    "Randomizes the face value of die pieces. Engine picks a random face in [1, faceCount].",
  );

/**
 * Set or rotate the orientation of one or more pieces.
 * The engine uses orientationCount from the gamepiece type to determine valid orientations.
 *
 * @example Rotate a tile clockwise
 * ```yaml
 * kind: orient
 * pieces: { inventory: board, select: player-chooses, count: 1 }
 * to: rotate-cw
 * ```
 * @example Set a piece to a specific orientation
 * ```yaml
 * kind: orient
 * pieces: { inventory: play-area, select: all, ofType: compass-token }
 * to: 0
 * ```
 */
export const OrientEffectSchema = z
  .object({
    kind: z.literal("orient"),
    pieces: PieceSelectorSchema.describe("Which pieces to reorient."),
    to: z
      .union([
        z
          .number()
          .int()
          .min(0)
          .describe(
            "Set to a specific orientation index (0-based, must be < orientationCount).",
          ),
        z
          .literal("rotate-cw")
          .describe("Rotate clockwise: increment orientation index, wrap at orientationCount."),
        z
          .literal("rotate-ccw")
          .describe(
            "Rotate counter-clockwise: decrement orientation index, wrap at 0.",
          ),
      ])
      .describe("Target orientation or rotation direction."),
  })
  .describe(
    "Changes the orientation of pieces. Meaningful for gamepiece types with orientationCount > 1.",
  );

// ---------------------------------------------------------------------------
// Prose effect (AI-generated engine code — escape hatch for complex logic)
// ---------------------------------------------------------------------------

/**
 * Use prose when the required logic doesn't fit neatly into the primitive kinds:
 * conditional branching, multi-step resolution, comparisons across multiple pieces.
 *
 * @example Complex combat resolution
 * ```yaml
 * id: resolve-combat
 * kind: prose
 * description: >
 *   Compare the sum of power values of all face-up combat cards in each player's
 *   combat zone. The player with the higher total wins and scores 1 point. On a
 *   tie, no points are scored and both players draw one card from the draw deck.
 * ```
 */
export const ProseEffectSchema = z
  .object({
    kind: z.literal("prose"),
    description: z
      .string()
      .describe(
        "Plain-English description of what this effect should do. The AI generates " +
          "engine code from this description. Be precise: name the inventories, " +
          "properties, and conditions involved. Avoid vague language.",
      ),
  })
  .describe(
    "An effect whose logic is too complex for the primitive kinds. " +
      "Described in prose; the AI generates the corresponding engine code. " +
      "Use sparingly — prefer primitive kinds for deterministic, testable effects.",
  );

// ---------------------------------------------------------------------------
// Cancel effect
// ---------------------------------------------------------------------------

/**
 * @example Used inside a reactive "before" action to negate the trigger
 * ```yaml
 * id: block-damage
 * label: Block
 * reactive:
 *   trigger: deal-damage
 *   timing: before
 * effects:
 *   - kind: cancel-effect
 * ```
 */
export const CancelEffectSchema = z
  .object({
    kind: z.literal("cancel-effect"),
  })
  .describe(
    "Cancels the named effect that triggered the current reactive action window. " +
      "Only valid inside a reactive action (one with a 'reactive' declaration). " +
      "Has no additional fields — the engine knows which effect to cancel from the " +
      "reactive context. When this effect executes, the triggering effect is voided " +
      "and any state changes it would have made are prevented. " +
      "Typically the sole or first effect in a timing: 'before' reactive action.",
  );

// ---------------------------------------------------------------------------
// Named effect (id + kind body — the unit stored in the effects module)
// ---------------------------------------------------------------------------

const effectId = z
  .string()
  .describe(
    "Unique identifier for this effect. Referenced by actions, flow transitions, " +
      "and mechanics. Use a descriptive verb-noun slug (e.g., 'draw-card', 'resolve-combat').",
  );

const namedEffectBase = { id: effectId };

export const NamedEffectSchema = z.discriminatedUnion("kind", [
  MoveEffectSchema.extend(namedEffectBase),
  FlipEffectSchema.extend(namedEffectBase),
  UpdateEffectSchema.extend(namedEffectBase),
  ShuffleEffectSchema.extend(namedEffectBase),
  DistributeEffectSchema.extend(namedEffectBase),
  RollEffectSchema.extend(namedEffectBase),
  OrientEffectSchema.extend(namedEffectBase),
  ProseEffectSchema.extend(namedEffectBase),
  CancelEffectSchema.extend(namedEffectBase),
]).describe(
  "A named, concrete, reusable effect stored in the effects module. " +
    "Always fully self-contained — all values are literal. " +
    "Referenced by id from actions, flow transitions, and mechanics.",
);

// ---------------------------------------------------------------------------
// Effects module
// ---------------------------------------------------------------------------

export const EffectsModuleSchema = z
  .object({
    effects: z
      .array(NamedEffectSchema)
      .min(1)
      .describe(
        "All named effects in this game. Each effect is a reusable, named state transition. " +
          "Actions, flow transitions, and mechanics reference effects by their id.",
      ),
  })
  .describe(
    "The effects module — a named library of all atomic game-state operations. " +
      "No dependencies on other spec modules (all IDs are forward references). " +
      "Referenced by actions, flow, and mechanics.",
  );

// ---------------------------------------------------------------------------
// Effect call (used by actions, flow, mechanics)
// ---------------------------------------------------------------------------

/**
 * The anonymous inline effect body — any effect kind, without id or params.
 * Used at call sites for one-off effects that don't need to be named.
 */
export const EffectSchema = z.discriminatedUnion("kind", [
  MoveEffectSchema,
  FlipEffectSchema,
  UpdateEffectSchema,
  ShuffleEffectSchema,
  DistributeEffectSchema,
  RollEffectSchema,
  OrientEffectSchema,
  ProseEffectSchema,
  CancelEffectSchema,
]);

/**
 * A reference to a named effect by ID.
 *
 * @example
 * ```yaml
 * ref: shuffle-deck
 * ```
 * @example
 * ```yaml
 * ref: draw-card
 * ```
 */
export const EffectCallRefSchema = z
  .object({
    ref: z
      .string()
      .describe(
        "ID of the named effect to invoke. Forward reference to the effects module.",
      ),
  })
  .describe("A call-site reference to a named effect.");

/**
 * A single entry in an effect call list — either an inline effect body
 * or a reference to a named effect.
 *
 * @example Mixed inline and ref
 * ```yaml
 * effects:
 *   - ref: shuffle-deck                          # named, no params
 *   - ref: advance-score                         # named, bound param
 *     bind: { delta: { from: literal, value: 1 } }
 *   - kind: move                                 # inline
 *     from: { inventory: draw-deck, select: top }
 *     to: { inventory: player-hand }
 * ```
 */
export const EffectCallSchema = z
  .union([EffectCallRefSchema, EffectSchema])
  .describe(
    "One entry in an effect call list. Either a named-effect reference (with 'ref') " +
      "or an inline anonymous effect (with 'kind').",
  );

/**
 * Ordered list of effect calls — used everywhere effects are triggered.
 */
export const EffectCallsSchema = z
  .array(EffectCallSchema)
  .min(1)
  .describe(
    "Ordered list of effect calls to execute sequentially. " +
      "Each entry is either a named-effect reference ({ ref, bind? }) " +
      "or an inline effect body ({ kind, ... }).",
  );

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PieceSelector = z.infer<typeof PieceSelectorSchema>;
export type InventoryPosition = z.infer<typeof InventoryPlacementSchema>;
export type InventoryTarget = z.infer<typeof InventoryTargetSchema>;
export type DistributeTarget = z.infer<typeof DistributeTargetSchema>;
export type PropertyValue = z.infer<typeof PropertyValueSchema>;
export type MoveEffect = z.infer<typeof MoveEffectSchema>;
export type FlipEffect = z.infer<typeof FlipEffectSchema>;
export type UpdateEffect = z.infer<typeof UpdateEffectSchema>;
export type ShuffleEffect = z.infer<typeof ShuffleEffectSchema>;
export type DistributeEffect = z.infer<typeof DistributeEffectSchema>;
export type RollEffect = z.infer<typeof RollEffectSchema>;
export type OrientEffect = z.infer<typeof OrientEffectSchema>;
export type ProseEffect = z.infer<typeof ProseEffectSchema>;
export type CancelEffect = z.infer<typeof CancelEffectSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type NamedEffect = z.infer<typeof NamedEffectSchema>;
export type EffectsModule = z.infer<typeof EffectsModuleSchema>;
export type EffectCallRef = z.infer<typeof EffectCallRefSchema>;
export type EffectCall = z.infer<typeof EffectCallSchema>;
export type EffectCalls = z.infer<typeof EffectCallsSchema>;
