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
 * { player: { stateRef: game.property.roundLoser }, inventory: player-cup, select: top }
 * ```
 */
export const PieceSelectorSchema = z
  .object({
    player: z
      .object({
        stateRef: z
          .string()
          .describe(
            "Dot-path to a string state property whose value is the target player ID at runtime. " +
              "Format: 'game.property.<id>'. The engine resolves the player instance dynamically. " +
              "Use when the target player is determined by game state rather than fixed context " +
              "(e.g., game.property.roundLoser, game.property.currentBidder).",
          ),
      })
      .optional()
      .describe(
        "Dynamic player targeting. When present, overrides the default active-player context " +
          "and selects pieces from the named player's instance of the inventory. " +
          "Omit to use the default context (active player for player-scoped inventories, " +
          "game context for game-scoped inventories).",
      ),
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
    "Identifies which pieces an effect operates on — which inventory and how to pick from it. " +
      "Use 'player' with 'stateRef' to dynamically target a player identified by game state.",
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
    z
      .object({ actor: z.literal(true) })
      .describe(
        "Set this property to the ID of the player who triggered the current action. " +
          "Useful for recording who made a bid, who attacked, or who initiated any action. " +
          "Engine resolves at execution time from the current action context.",
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
 * Only meaningful for gamepiece types where hasFaceState is true (e.g. cards).
 * For temporary visibility overrides without changing face state, use 'reveal'/'hide'.
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
    "Changes the physical face state of pieces (requires hasFaceState: true on the type). " +
      "Affects visibility of 'revealed' properties. " +
      "For temporary per-audience visibility without a physical flip, use 'reveal'/'hide'.",
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
// Message effect
// ---------------------------------------------------------------------------

/**
 * Who receives a message. The literal `actor` means the player whose turn/action
 * triggered this effect; `all` broadcasts to all players; `opponents` sends to
 * every player except the actor; `role:<id>` targets all players with the named
 * role; any other string is treated as a specific player ID.
 *
 * @example
 * ```yaml
 * to: actor           # confirmation to the player who just acted
 * to: all             # broadcast to everyone
 * to: opponents       # notify opponents without telling the acting player
 * to: "role:mafia"    # send only to players with the mafia role
 * to: "player1"       # direct to a specific player by ID
 * ```
 */
export const MessageRecipientSchema = z
  .string()
  .describe(
    "Who receives the message. " +
      "'actor': the player whose action triggered this effect. " +
      "'all': every active player. " +
      "'opponents': all players except the actor. " +
      "'role:<id>': all players assigned the named role (e.g., 'role:dealer'). " +
      "Any other string: a specific player ID. " +
      "For private messages use visibility: private. For broadcast use visibility: public (default).",
  );

/**
 * Temporarily override the visibility of pieces for specific players.
 * Does NOT move pieces or change face state — the override persists until an explicit
 * 'hide' effect or the end of the enclosing action.
 *
 * Use for: peek actions (view top card), challenge reveals (show all dice to everyone),
 * opponent hand inspections, and any case where pieces need to be visible temporarily.
 *
 * @example Reveal all dice to all players for challenge resolution (Liar's Dice)
 * ```yaml
 * kind: reveal
 * pieces: { inventory: player-cup, select: all }
 * to: all
 * ```
 * @example Active player peeks at the top card of the draw deck
 * ```yaml
 * kind: reveal
 * pieces: { inventory: draw-deck, select: top }
 * to: actor
 * ```
 * @example Reveal one opponent's card to the acting player
 * ```yaml
 * kind: reveal
 * pieces: { inventory: opponent-hand, select: player-chooses, count: 1 }
 * to: actor
 * ```
 */
export const RevealEffectSchema = z
  .object({
    kind: z.literal("reveal"),
    pieces: PieceSelectorSchema.describe("Which pieces to temporarily reveal."),
    to: MessageRecipientSchema.describe(
      "Who can see the revealed pieces. " +
        "'actor': only the player whose turn it is. " +
        "'all': every active player. " +
        "'opponents': all players except the actor. " +
        "'role:<id>': only players with the named role. " +
        "Any other string: a specific player ID.",
    ),
  })
  .describe(
    "Temporarily overrides piece visibility for specific players without moving pieces. " +
      "The reveal persists until an explicit 'hide' effect or the enclosing action completes. " +
      "Use for peek actions, challenge reveals, and hand inspections.",
  );

/**
 * Revert piece visibility to the inventory's default, cancelling any active 'reveal' override.
 *
 * @example Re-hide all dice after challenge resolution (Liar's Dice)
 * ```yaml
 * kind: hide
 * pieces: { inventory: player-cup, select: all }
 * ```
 * @example Re-hide the peeked top card after a peek action
 * ```yaml
 * kind: hide
 * pieces: { inventory: draw-deck, select: top }
 * ```
 */
export const HideEffectSchema = z
  .object({
    kind: z.literal("hide"),
    pieces: PieceSelectorSchema.describe(
      "Which pieces to revert to their inventory's default visibility.",
    ),
  })
  .describe(
    "Reverts pieces to their inventory's default visibility, cancelling any active 'reveal' overrides. " +
      "Typically paired with a preceding 'reveal' effect after the inspection or resolution window closes.",
  );

/**
 * @example Confirmation after player creates a weapon
 * ```yaml
 * id: confirm-weapon
 * kind: message
 * to: actor
 * template: "Your weapon '{{input.weaponDescription}}' has been registered."
 * visibility: private
 * ```
 * @example Phase announcement to all
 * ```yaml
 * id: announce-battle
 * kind: message
 * to: all
 * template: "Round {{state.game.property.currentRound}} begins — select your weapon!"
 * ```
 */
export const MessageEffectSchema = z
  .object({
    kind: z.literal("message"),
    to: MessageRecipientSchema,
    template: z
      .string()
      .describe(
        "Handlebars template string for the message body. " +
          "Available references: {{input.<id>}} for action inputs, " +
          "{{state.game.property.<id>}} and {{state.players.<playerId>.property.<id>}} " +
          "for game state. The engine resolves templates at execution time.",
      ),
    visibility: z
      .enum(["public", "private"])
      .default("public")
      .describe(
        "Whether this message is visible to all players or only the recipient(s). " +
          "'public': message is visible in the game log for all players. " +
          "'private': message is delivered only to the 'to' target(s). " +
          "Defaults to 'public'.",
      ),
  })
  .describe(
    "Delivers a deterministic text message to one or more players. " +
      "No state mutation — output only. " +
      "For non-text/visual games, engines that don't support messaging skip this effect. " +
      "Use for action confirmations, phase announcements, and static flavor text. " +
      "For AI-generated text use kind: llm-effect.",
  );

// ---------------------------------------------------------------------------
// LLM effect
// ---------------------------------------------------------------------------

/**
 * One named output produced by an llm-effect call. The `field` name enters an
 * ephemeral per-invocation context (accessible as `{{llm.<field>}}` in subsequent
 * template strings). Optionally delivered as a player message and/or written to
 * a state path.
 *
 * At least one of `message` or `stateWrite` must be present — an output that
 * does neither is meaningless.
 *
 * @example Round narrative delivered as public message
 * ```yaml
 * field: roundNarrative
 * message:
 *   to: all
 *   visibility: public
 * ```
 * @example Winner written to state for follow-on effects to read
 * ```yaml
 * field: roundWinner
 * stateWrite: game.property.roundWinner
 * ```
 * @example Per-player private reveal
 * ```yaml
 * field: player1Reveal
 * message:
 *   to: player1
 *   visibility: private
 * ```
 */
export const LlmOutputSchema = z
  .object({
    field: z
      .string()
      .describe(
        "Name of this output in the LLM's structured response. " +
          "Enters ephemeral invocation context as {{llm.<field>}} for use in templates.",
      ),
    message: z
      .object({
        to: MessageRecipientSchema,
        visibility: z
          .enum(["public", "private"])
          .default("public")
          .describe(
            "'public': visible in game log for all players. " +
              "'private': delivered only to the 'to' target(s). Defaults to 'public'.",
          ),
      })
      .optional()
      .describe(
        "If present, deliver this field as a player message. " +
          "The engine uses the LLM's raw text for this field as the message body.",
      ),
    stateWrite: z
      .string()
      .optional()
      .describe(
        "Dot-path into game state where this output should be written " +
          "(e.g., 'game.property.roundWinner'). " +
          "The LLM must return a value parseable for the target state field's type. " +
          "Engine applies the write after the LLM call completes.",
      ),
  })
  .describe(
    "One named output field from an llm-effect call. " +
      "At least one of 'message' or 'stateWrite' must be present.",
  );

/**
 * @example Opening announcement broadcast to all (Absurd Armaments initialize_game)
 * ```yaml
 * id: generate-opening
 * kind: llm-effect
 * prompt:
 *   rules:
 *     - "Use enthusiastic game-show announcer style with obnoxious energy"
 *     - "Welcome both players by name"
 *   computation: >
 *     Create a boisterous opening announcement welcoming both players and
 *     building excitement for the weapon battle.
 * outputs:
 *   - field: openingAnnouncement
 *     message:
 *       to: all
 *       visibility: public
 * ```
 * @example Round resolution — compute winner AND narrate (Absurd Armaments match_continues)
 * ```yaml
 * id: resolve-round
 * kind: llm-effect
 * prompt:
 *   rules:
 *     - "Rock beats scissors, scissors beats paper, paper beats rock"
 *     - "Generate 2-4 sentence narrative with boisterous announcer style"
 *     - "Reference both weapons by name"
 *   computation: >
 *     Compare selected weapons using their RPS mappings. Determine the winner.
 *     Generate round narrative. If includeReversal is true, build dramatic tension
 *     before revealing the outcome.
 * outputs:
 *   - field: roundWinner
 *     stateWrite: game.property.roundWinner
 *   - field: roundNarrative
 *     message:
 *       to: all
 *       visibility: public
 * ```
 * @example Per-player private reveal (Absurd Armaments reveal_complete)
 * ```yaml
 * id: generate-reveals
 * kind: llm-effect
 * prompt:
 *   computation: >
 *     Create a unique reveal for each player showcasing their opponent's weapons.
 * outputs:
 *   - field: player1Reveal
 *     message:
 *       to: player1
 *       visibility: private
 *   - field: player2Reveal
 *     message:
 *       to: player2
 *       visibility: private
 * ```
 */
export const LlmEffectSchema = z
  .object({
    kind: z.literal("llm-effect"),
    prompt: z
      .object({
        rules: z
          .array(z.string())
          .optional()
          .describe(
            "Ordered list of style, tone, and constraint rules for the LLM. " +
              "Applied before the computation directive. Use for: narrative style, " +
              "game rule reminders, output format requirements.",
          ),
        computation: z
          .string()
          .describe(
            "What the LLM should compute, decide, or generate. " +
              "Be specific about what each output field should contain. " +
              "References to game state are resolved by the engine before the call.",
          ),
      })
      .describe("Prompt directives for the LLM invocation."),
    outputs: z
      .array(LlmOutputSchema)
      .min(1)
      .describe(
        "Named output fields the LLM must return in its structured response. " +
          "Each field is either delivered as a player message, written to game state, or both. " +
          "The engine marshals the LLM's JSON response into these fields automatically.",
      ),
  })
  .describe(
    "Calls an LLM and distributes its structured outputs as player messages and/or state writes. " +
      "Use for AI-generated narrative, adjudication of ambiguous outcomes, or NPC decisions. " +
      "For non-text games: outputs with only 'message' are skipped; outputs with 'stateWrite' " +
      "are always applied (the LLM is called if any stateWrite output exists). " +
      "Separation of concerns: prefer computing deterministic outcomes in primitive effects and " +
      "using llm-effect only for narration — this keeps game logic testable without LLM mocks.",
  );

// ---------------------------------------------------------------------------
// Set-state effect
// ---------------------------------------------------------------------------

/**
 * Write a value to an abstract state property declared in the state module.
 * Does not operate on gamepieces — use 'update' for piece properties.
 *
 * Path format:
 *   game.property.<id>    → game-scoped property
 *   player.property.<id>  → acting player's per-player property
 *
 * @example Reset the bid quantity to 0 after a challenge
 * ```yaml
 * kind: set-state
 * path: game.property.currentBidQuantity
 * value: 0
 * ```
 * @example Set bid quantity from an action input
 * ```yaml
 * kind: set-state
 * path: game.property.currentBidQuantity
 * value: { param: quantity }
 * ```
 * @example Eliminate a player
 * ```yaml
 * kind: set-state
 * path: player.property.isActive
 * value: false
 * ```
 * @example Decrement active player count
 * ```yaml
 * kind: set-state
 * path: game.property.activePlayers
 * value: { delta: -1 }
 * ```
 */
export const SetStateEffectSchema = z
  .object({
    kind: z.literal("set-state"),
    path: z
      .string()
      .describe(
        "Dot-path to the state property to write. " +
          "Format: 'game.property.<id>' for game-scoped state, " +
          "'player.property.<id>' for the acting player's per-player state. " +
          "Forward reference to a property declared in the state module.",
      ),
    value: PropertyValueSchema.describe(
      "New value to write, relative delta, or param reference. " +
        "Same vocabulary as update effects — literal, delta, toggle, or param.",
    ),
  })
  .describe(
    "Writes to abstract game or player state declared in the state module. " +
      "For piece property mutations use 'update'. " +
      "Readable in preconditions and flow endConditions via the same dot-path.",
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
  RevealEffectSchema.extend(namedEffectBase),
  HideEffectSchema.extend(namedEffectBase),
  UpdateEffectSchema.extend(namedEffectBase),
  SetStateEffectSchema.extend(namedEffectBase),
  ShuffleEffectSchema.extend(namedEffectBase),
  DistributeEffectSchema.extend(namedEffectBase),
  RollEffectSchema.extend(namedEffectBase),
  OrientEffectSchema.extend(namedEffectBase),
  ProseEffectSchema.extend(namedEffectBase),
  CancelEffectSchema.extend(namedEffectBase),
  MessageEffectSchema.extend(namedEffectBase),
  LlmEffectSchema.extend(namedEffectBase),
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
  RevealEffectSchema,
  HideEffectSchema,
  UpdateEffectSchema,
  SetStateEffectSchema,
  ShuffleEffectSchema,
  DistributeEffectSchema,
  RollEffectSchema,
  OrientEffectSchema,
  ProseEffectSchema,
  CancelEffectSchema,
  MessageEffectSchema,
  LlmEffectSchema,
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
export type RevealEffect = z.infer<typeof RevealEffectSchema>;
export type HideEffect = z.infer<typeof HideEffectSchema>;
export type UpdateEffect = z.infer<typeof UpdateEffectSchema>;
export type SetStateEffect = z.infer<typeof SetStateEffectSchema>;
export type ShuffleEffect = z.infer<typeof ShuffleEffectSchema>;
export type DistributeEffect = z.infer<typeof DistributeEffectSchema>;
export type RollEffect = z.infer<typeof RollEffectSchema>;
export type OrientEffect = z.infer<typeof OrientEffectSchema>;
export type ProseEffect = z.infer<typeof ProseEffectSchema>;
export type CancelEffect = z.infer<typeof CancelEffectSchema>;
export type MessageRecipient = z.infer<typeof MessageRecipientSchema>;
export type MessageEffect = z.infer<typeof MessageEffectSchema>;
export type LlmOutput = z.infer<typeof LlmOutputSchema>;
export type LlmEffect = z.infer<typeof LlmEffectSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type NamedEffect = z.infer<typeof NamedEffectSchema>;
export type EffectsModule = z.infer<typeof EffectsModuleSchema>;
export type EffectCallRef = z.infer<typeof EffectCallRefSchema>;
export type EffectCall = z.infer<typeof EffectCallSchema>;
export type EffectCalls = z.infer<typeof EffectCallsSchema>;
