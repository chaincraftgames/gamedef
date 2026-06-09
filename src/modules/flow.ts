/**
 * Flow Module Schema
 *
 * Depends on: effects (EffectCallsSchema), common (JsonLogicSchema).
 * Referenced by: the engine (executes the game loop), actions (interrupt/subflow IDs).
 *
 * The flow module is the game's structural skeleton — it declares HOW the game
 * progresses, not what individual actions do.
 *
 * Nodes compose recursively. The AI picks from a small vocabulary of named
 * pattern nodes rather than implementing a state machine:
 * - `loop` — sequential children that repeat until an exit condition
 * - `turn` — one player (or cycle of players) takes a turn
 * - `simultaneous` — all actors submit independently, revealed together
 *
 * Interrupt windows can be attached to any node. A window is active whenever
 * its containing node is active — root-level windows fire throughout the game;
 * windows on a specific turn or simultaneous node fire only during that node.
 *
 * Key design decisions:
 * - Flow declares STRUCTURE (who acts, when, in what order). Actions and effects
 *   declare CONTENT (what the player does, how state changes).
 * - Turn grammar (sequence/choice/repeat) is the leaf level — what ONE player does
 *   within their turn. If other players can observe/react to individual steps,
 *   it belongs in the flow tree instead.
 * - Node `id` is optional but required when the node is referenced by action
 *   `availableInSubflows` fields. Assign an `id` to any node you want to name.
 * - `hooks` (onEnter/onComplete) let the flow trigger effects at structural
 *   boundaries — e.g., deal cards at round start, reveal roles at phase end.
 *   **The root loop's `onEnter` hooks are the idiomatic location for game setup:**
 *   shuffle the deck, distribute cards, place pieces on the board. All catalog
 *   pieces start in the system inventory `game:unassigned`; onEnter effects move
 *   them into their starting inventories before the first turn begins.
 *   Per-round or per-phase setup (replenish a market row, reset a board section)
 *   goes in the corresponding child loop's onEnter hooks.
 * - Interrupt windows are the correct home for reactive/cancel mechanics.
 *   The action's `interrupt[]` field declares eligibility; the window declares
 *   the trigger, timing, and which players can respond.
 *
 * **Multi-phase games (count: 1 pattern):**
 * When a game has distinct sequential phases (e.g., exploration then escape,
 * setup then main game), use a root loop with `count: 1` containing child loops —
 * one per phase. The root runs its children once in order; each child loops
 * internally until its own exit condition.
 * Example: Betrayal at House on the Hill — haunt triggers mid-exploration, then
 * survivors and traitor play separate escape loops.
 * ```yaml
 * root:
 *   kind: loop
 *   count: 1                          # run phases once in sequence
 *   children:
 *     - kind: loop
 *       id: exploration
 *       endCondition: { var: "game.property.hauntTriggered" }
 *       finalRound: true              # all players finish current turn
 *       children: [...]
 *     - kind: loop
 *       id: escape
 *       endCondition: { var: "game.property.gameOver" }
 *       children: [...]
 * ```
 *
 * **Final-round pattern (finalRound: true):**
 * When an endCondition fires mid-rotation (e.g., a player reaches 50 points),
 * set `finalRound: true` on the loop. The engine completes the current full
 * iteration before exiting, giving all other players one more turn.
 * Without `finalRound`, the loop exits immediately when the condition first fires.
 *
 * @example Liar's Dice — game setup in root onEnter, then looping bidding rounds
 * ```yaml
 * root:
 *   kind: loop
 *   endCondition: { "<=": [{ "var": "game.state.activePlayers" }, 1] }
 *   hooks:
 *     onEnter:                          # game setup — runs once before first turn
 *       - kind: distribute              # give each player 5 dice from game:unassigned
 *         from: { inventory: game:unassigned, select: top, count: 5, ofType: die }
 *         to: { scope: all-players, inventory: player-dice-cup }
 *   interruptWindows:
 *     - id: steal-response
 *       trigger: steal-die
 *       timing: before
 *       eligiblePlayers: opponents
 *       actions: [block-steal]
 *       timeout: 15000
 *   children:
 *     - kind: turn
 *       actor: active-player
 *       turnOrder:
 *         kind: seat
 *         direction: clockwise
 *       grammar:
 *         kind: choice
 *         passable: true
 *         options:
 *           - kind: action
 *             ref: make-bid
 *           - kind: action
 *             ref: challenge
 * ```
 * @example Werewolf — night, discussion, voting
 * ```yaml
 * root:
 *   kind: loop
 *   endCondition: { "var": "game.state.gameOver" }
 *   children:
 *     - kind: simultaneous
 *       id: night
 *       label: Night Phase
 *       actor: { roles: [villager, mafia] }
 *       grammar:
 *         kind: slot
 *         inventory: role-card
 *         slot: night-action
 *         select: all
 *     - kind: simultaneous
 *       id: day-discussion
 *       label: Discussion
 *       actor: all-players
 *       endCondition: all-passed
 *       grammar:
 *         kind: choice
 *         passable: true
 *         options:
 *           - kind: action
 *             ref: accuse-player
 *     - kind: simultaneous
 *       id: day-vote
 *       label: Vote
 *       actor: all-players
 *       grammar:
 *         kind: action
 *         ref: vote-eliminate
 *       hooks:
 *         onComplete:
 *           - ref: reveal-eliminated
 *           - ref: remove-eliminated
 * ```
 */

import { z } from "zod";
import { EffectCallsSchema } from "./effects.js";
import { JsonLogicSchema, IntRangeSchema } from "./common.js";

// ---------------------------------------------------------------------------
// Flow hooks (effects triggered at structural boundaries)
// ---------------------------------------------------------------------------

const FlowHooksSchema = z
  .object({
    onEnter: EffectCallsSchema.optional().describe(
      "Effects executed when this flow node is entered. " +
        "Use for setup: deal cards, initialize trackers, reveal roles.",
    ),
    onComplete: EffectCallsSchema.optional().describe(
      "Effects executed when this flow node completes. " +
        "Use for teardown or scoring: reveal cards, move pieces to discard, award points.",
    ),
  })
  .describe("Lifecycle effect hooks for a flow node.");

// ---------------------------------------------------------------------------
// Turn order (for phases with sequential turns)
// ---------------------------------------------------------------------------

/**
 * A structured reference to a per-player state value, used for ranking or ordering players.
 * Two kinds: a named property on the player, or a count of items in a player's inventory.
 *
 * @example
 * ```yaml
 * { playerProperty: gold }
 * { playerInventory: hand }
 * { playerInventory: hand, ofType: gold-coin }
 * ```
 */
const PlayerStateRefSchema = z
  .union([
    z
      .object({
        playerProperty: z
          .string()
          .describe(
            "ID of a property on the player gamepiece. " +
              "Forward reference to a mutable property defined on the player type in gamepiece-types.",
          ),
      })
      .describe("Rank players by a named property value on each player."),
    z
      .object({
        playerInventory: z
          .string()
          .describe(
            "ID of a player-scoped inventory. " +
              "Forward reference to an inventory with scope: player in the inventories module.",
          ),
        ofType: z
          .string()
          .optional()
          .describe(
            "If provided, only count pieces of this gamepiece type ID within the inventory. " +
              "Omit to count all pieces regardless of type.",
          ),
      })
      .describe("Rank players by the number of pieces in a named inventory, optionally filtered by type."),
  ])
  .describe(
    "A structured reference to a per-player state value. " +
      "Evaluated per player at the time turn order is established. " +
      "Use 'playerProperty' for a scalar value, 'playerInventory' for an inventory count.",
  );

/**
 * Who acts first within a seat-order (clockwise/counter-clockwise) turn order.
 * Determines the starting point of the rotation; all other players follow in seat order.
 * If you want the full turn sequence determined by a state property, use 'ranked' instead.
 *
 * @example
 * ```yaml
 * startingPlayer: first           # seat 1 always starts
 * startingPlayer: last-winner     # winner of last round starts
 * startingPlayer: { role: dealer }
 * ```
 */
const StartingPlayerSchema = z
  .union([
    z.literal("first").describe("The first seat position always starts."),
    z.literal("last-winner").describe(
      "The player who won (or triggered end condition of) the last round starts. " +
        "Engine tracks the last winner automatically.",
    ),
    z.object({ role: z.string() }).describe("The player holding this role ID starts."),
  ])
  .describe(
    "Determines which player acts first in a seat-ordered turn structure. " +
      "All other players follow in clockwise or counter-clockwise seat order from that player. " +
      "To order ALL turns by a state property (not just the starting point), use 'ranked' instead.",
  );

/**
 * Declares the order in which players take turns within a sequential context.
 *
 * Three kinds:
 * - `seat`    — clockwise or counter-clockwise from a configurable starting player.
 *               Starting player can be fixed, role-based, or state-determined.
 * - `ranked`  — players sorted by a state property ascending or descending.
 *               E.g., player with most gold goes last; ties broken by seat order.
 * - `explicit`— fixed list of player IDs for games with named seats.
 *
 * @example Clockwise from the dealer role
 * ```yaml
 * turnOrder:
 *   kind: seat
 *   direction: clockwise
 *   startingPlayer: { role: dealer }
 * ```
 * @example Richest player goes last (ascending = poorest first)
 * ```yaml
 * turnOrder:
 *   kind: ranked
 *   by: { playerProperty: gold }
 *   order: ascending
 * ```
 * @example Player with most cards in hand goes first (descending)
 * ```yaml
 * turnOrder:
 *   kind: ranked
 *   by: { playerInventory: hand }
 *   order: descending
 * ```
 * @example Player with most gold coins goes first
 * ```yaml
 * turnOrder:
 *   kind: ranked
 *   by: { playerInventory: hand, ofType: gold-coin }
 *   order: descending
 * ```
 * @example Explicit named seats
 * ```yaml
 * turnOrder:
 *   kind: explicit
 *   players: [north, east, south, west]
 * ```
 */
const TurnOrderSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("seat"),
        direction: z
          .enum(["clockwise", "counter-clockwise"])
          .describe("Direction around the table after the starting player acts."),
        startingPlayer: StartingPlayerSchema.optional().describe(
          "Who acts first. Defaults to the current active player if omitted. " +
            "Can rotate each round by referencing a role (e.g., dealer) that is " +
            "reassigned via an onComplete hook.",
        ),
      })
      .describe(
        "Seat-order turns: clockwise or counter-clockwise from a configurable starting player. " +
          "The starting player can be fixed, role-based, or chosen by a player state property. " +
          "After the starting player acts, the engine follows seat order until all players have acted.",
      ),

    z
      .object({
        kind: z.literal("ranked"),
        by: PlayerStateRefSchema.describe(
          "Per-player state reference used to rank players. " +
            "Evaluated once when the phase begins; order is fixed for the duration.",
        ),
        order: z
          .enum(["ascending", "descending"])
          .describe(
            "'ascending': lowest value acts first. " +
              "'descending': highest value acts first. " +
              "Ties broken by current seat order (clockwise from seat 1).",
          ),
      })
      .describe(
        "Players ordered by a per-player state value. " +
          "Use for auction results, bidding order, score-based priority, etc.",
      ),

    z
      .object({
        kind: z.literal("explicit"),
        players: z
          .array(z.string())
          .min(2)
          .describe("Ordered list of player IDs. Use for games with named, fixed seats (e.g., bridge: north/east/south/west)."),
      })
      .describe(
        "Fixed explicit turn order. The same list is used every round. " +
          "Use for games with named seats or a permanently fixed player sequence.",
      ),
  ])
  .describe(
    "Turn order within a sequential phase. " +
      "Three kinds: 'seat' (cw/ccw with configurable start), " +
      "'ranked' (ordered by a player state value), " +
      "'explicit' (fixed list of player IDs).",
  );

// ---------------------------------------------------------------------------
// Actor specification (who acts in a turn or simultaneous node)
// ---------------------------------------------------------------------------

const ActorSpecSchema = z
  .union([
    z.literal("active-player").describe("The currently active player (tracked by the engine)."),
    z.literal("all-players").describe("Every player acts (regardless of role)."),
    z
      .object({
        roles: z
          .array(z.string())
          .min(1)
          .describe(
            "Only players holding at least one of these role IDs participate. " +
              "Forward references to role IDs defined in the players module. " +
              "Use when a phase is restricted to a subset of players by role — " +
              "e.g., { roles: [principal-investigator, investigator] } excludes the moderator.",
          ),
      })
      .describe("Only players holding at least one of the listed roles act in this node."),
  ])
  .describe("Specifies which player(s) are the actors in a flow node.");

// ---------------------------------------------------------------------------
// Turn grammar (recursive — what one player does within their turn)
// ---------------------------------------------------------------------------

/**
 * A single node in the turn grammar — the composable primitives describing what
 * one player does on their turn. Recursive via z.lazy().
 *
 * Heuristic for grammar vs. flow: if other players can observe or react to
 * individual iterations of a loop, it belongs in the flow tree. If entirely
 * local to one player's turn, it belongs here.
 *
 * @example Bid OR challenge (choice)
 * ```yaml
 * kind: choice
 * options:
 *   - kind: action
 *     ref: make-bid
 *   - kind: action
 *     ref: challenge
 * ```
 * @example Draw then play up to 3 cards (sequence + repeat with range)
 * ```yaml
 * kind: sequence
 * steps:
 *   - kind: action
 *     ref: draw-card
 *   - kind: repeat
 *     count:
 *       max: 3
 *     body:
 *       kind: choice
 *       passable: true
 *       options:
 *         - kind: action
 *           ref: play-card
 * ```
 * @example Activate any matching slot on pieces in hand
 * ```yaml
 * kind: slot
 * inventory: player-hand
 * slot: card-ability
 * select: any
 * ```
 */
export const TurnGrammarNodeSchema: z.ZodType<TurnGrammarNode> = z.lazy(() =>
  z
    .discriminatedUnion("kind", [
      // --- action: take a specific named action ---
      z
        .object({
          kind: z.literal("action"),
          ref: z
            .string()
            .describe("ID of the action to take. Forward reference to the actions module."),
        })
        .describe("Take a specific named action."),

      // --- slot: activate gamepiece action slots ---
      z
        .object({
          kind: z.literal("slot"),
          inventory: z
            .string()
            .describe(
              "Inventory containing the pieces whose slots are offered. " +
                "Forward reference to an inventory ID.",
            ),
          slot: z
            .string()
            .describe(
              "Slot ID to activate on matching pieces. " +
                "Forward reference to an actionSlots[] or mechanic-generated slot ID on the piece type. " +
                "Namespaced if mechanic-generated (e.g., 'mygame:energy-ability').",
            ),
          ofType: z
            .string()
            .optional()
            .describe(
              "If provided, only pieces of this gamepiece type ID are considered. " +
                "Narrows the selection within the inventory.",
            ),
          select: z
            .union([
              z.literal("all").describe("Player MUST activate every matching piece's slot."),
              z.literal("any").describe(
                "Player MAY activate any subset of matching pieces' slots, including none. " +
                  "Covers 'play cards from hand' patterns.",
              ),
              IntRangeSchema.describe(
                "Player must activate a number of pieces' slots within this inclusive range. " +
                  "{ min: 2, max: 2 } = exactly 2. { max: 3 } = up to 3. { min: 1 } = at least 1.",
              ),
            ])
            .describe("How many pieces' slots the player must or may activate."),
        })
        .describe(
          "Offer the player activation of a named slot on gamepieces in an inventory. " +
            "Used for card-play, ability activation, and gamepiece-bound actions.",
        ),

      // --- sequence: ordered steps, all taken ---
      z
        .object({
          kind: z.literal("sequence"),
          steps: z
            .array(TurnGrammarNodeSchema)
            .min(2)
            .describe("Ordered steps. Each step must be completed before the next begins."),
        })
        .describe(
          "Ordered list of grammar steps, all of which must be taken in order. " +
            "Use for mandatory multi-part turns (draw then play, move then attack).",
        ),

      // --- choice: pick one (or pick N) from options ---
      z
        .object({
          kind: z.literal("choice"),
          options: z
            .array(TurnGrammarNodeSchema)
            .min(1)
            .describe("Available options the player may choose from."),
          pick: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe(
              "Number of options the player must pick. Defaults to 1. " +
                "Set to 2+ for 'choose two actions' patterns.",
            ),
          passable: z
            .boolean()
            .optional()
            .describe(
              "If true, the engine adds an implicit 'pass' option to the choice. " +
                "Use for optional turns (play a card or skip). Required when this choice is " +
                "the body of a repeat with count: 'until-pass', or inside a negotiation. " +
                "When all players consecutively choose pass, the enclosing phase or negotiation ends.",
            ),
        })
        .describe(
          "Player picks one (or 'pick') from the available options. " +
            "Set passable: true to offer an implicit pass/skip option.",
        ),

      // --- repeat: N times or until-pass ---
      z
        .object({
          kind: z.literal("repeat"),
          body: TurnGrammarNodeSchema.describe("The grammar node to repeat."),
          count: z
            .union([
              z.number().int().min(1).describe("Repeat exactly this many times."),
              IntRangeSchema.describe(
                "Repeat a variable number of times within this inclusive range. " +
                  "{ max: 3 } = up to 3 times. { min: 1, max: 3 } = between 1 and 3 times. " +
                  "The body should include a pass option when max > min.",
              ),
              z.literal("until-pass").describe(
                "Repeat until the player passes. " +
                  "The body must be a passable choice (passable: true). " +
                  "Also acts as a subflow exit signal: if all players consecutively pass, " +
                  "the enclosing phase or negotiation ends.",
              ),
            ])
            .describe("How many times to repeat: exact count, inclusive range, or 'until-pass'."),
        })
        .describe(
          "Repeat a grammar node a fixed number of times or until the player passes. " +
            "For unlimited-actions-until-pass turns, use count: 'until-pass' with a passable choice body.",
        ),
    ])
    .describe(
      "A composable turn grammar node. Describes what one player does within their turn. " +
        "Nodes compose recursively: a choice can contain sequences, sequences can contain repeats, etc.",
    ),
);

// TypeScript type (needed for recursive z.ZodType annotation above)
export type TurnGrammarNode =
  | { kind: "action"; ref: string }
  | { kind: "slot"; inventory: string; slot: string; ofType?: string; select: "all" | "any" | { min?: number; max?: number } }
  | { kind: "sequence"; steps: TurnGrammarNode[] }
  | { kind: "choice"; options: TurnGrammarNode[]; pick?: number; passable?: boolean }
  | { kind: "repeat"; body: TurnGrammarNode; count: number | { min?: number; max?: number } | "until-pass" };

// "until-pass": end when all eligible players have consecutively passed
const FlowEndConditionSchema = z.union([
  JsonLogicSchema,
  z.literal("until-pass").describe(
    "End when all eligible players have consecutively passed. " +
      "Each turn grammar should include passable choices so players can signal pass.",
  ),
]);

// ---------------------------------------------------------------------------
// Flow tree nodes (recursive)
// ---------------------------------------------------------------------------

/**
 * A flow tree node — the structural units of the game loop. Recursive via z.lazy().
 *
 * Three kinds:
 * - `loop`         — sequential children, repeating until count or endCondition. The root
 *                    must be a loop. Nest loops for sub-rounds, phases, etc.
 * - `turn`         — one player's turn (or a cycle through multiple players via turnOrder).
 * - `simultaneous` — all actors submit independently; outcomes revealed together.
 *
 * All kinds accept `id?`, `label?`, `interruptWindows?`, and `hooks?`.
 * `interruptWindows` on a node are active only while that node is executing.
 * Windows on an outer loop are active throughout all its children.
 */
export const FlowNodeSchema: z.ZodType<FlowNode> = z.lazy(() =>
  z
    .discriminatedUnion("kind", [
      // --- loop ---
      z
        .object({
          kind: z.literal("loop"),
          id: z
            .string()
            .optional()
            .describe(
              "Optional unique identifier. Set when referenced by action 'availableInSubflows'.",
            ),
          label: z.string().optional().describe("Human-readable name shown in the UI."),
          count: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe(
              "Repeat exactly this many times then exit. " +
                "Use for fixed-round games: count: 5 = play 5 rounds. " +
                "Provide either 'count' or 'endCondition', not both.",
            ),
          endCondition: FlowEndConditionSchema.optional().describe(
            "Evaluated after each full iteration of children. Exit when true. " +
              "JSONLogic over game state, or 'until-pass' (exit when all players consecutively pass). " +
              "State paths: 'game.property.<id>', 'actor.property.<id>', etc. " +
              "Provide either 'count' or 'endCondition', not both.",
          ),
          finalRound: z
            .boolean()
            .optional()
            .describe(
              "If true, when endCondition first becomes true mid-iteration, the engine " +
                "completes the current full iteration before exiting. " +
                "Use for 'everyone gets one more turn' patterns (e.g., first player to reach " +
                "50 points triggers a final round for all other players). " +
                "Only meaningful with endCondition; ignored when using count. Defaults to false.",
            ),
          children: z
            .array(FlowNodeSchema)
            .min(1)
            .describe(
              "Ordered list of flow nodes executed each iteration. " +
                "Can be any mix of loop, turn, and simultaneous nodes.",
            ),
          interruptWindows: z
            .array(InterruptWindowSchema)
            .optional()
            .describe(
              "Interrupt/reaction windows active during this loop and all its children. " +
                "Inherited by child nodes — outer windows fire throughout; inner windows fire only " +
                "while their containing node is active.",
            ),
          hooks: FlowHooksSchema.optional(),
        })
        .describe(
          "A repeating structural container. Executes children in order, then loops. " +
            "Use for rounds, phases, or any repeating structure. " +
            "Must provide exactly one of 'count' (fixed iterations) or 'endCondition' (state-based exit). " +
            "For a game with multiple distinct phases, use count: 1 with child loops — " +
            "one loop per phase, each with its own endCondition.",
        ),

      // --- turn ---
      z
        .object({
          kind: z.literal("turn"),
          id: z.string().optional().describe("Optional identifier. Set when referenced by 'availableInSubflows'."),
          label: z.string().optional().describe("Human-readable name shown in the UI."),
          actor: ActorSpecSchema,
          turnOrder: TurnOrderSchema.optional().describe(
            "How to cycle through actors when more than one participates. " +
              "Only meaningful if actor is not 'active-player'. Defaults to clockwise seat order.",
          ),
          grammar: TurnGrammarNodeSchema.describe(
            "What the acting player does on their turn. Compose sequence/choice/repeat as needed.",
          ),
          timeLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("Time limit in milliseconds per turn. Engine enforces auto-pass on timeout."),
          interruptWindows: z
            .array(InterruptWindowSchema)
            .optional()
            .describe(
              "Interrupt/reaction windows active only during this turn node. " +
                "Use for windows that should only be available during a specific named turn.",
            ),
          hooks: FlowHooksSchema.optional(),
        })
        .describe(
          "One player's turn (or sequential turns for multiple players via turnOrder). " +
            "The actor takes actions according to the grammar.",
        ),

      // --- simultaneous ---
      z
        .object({
          kind: z.literal("simultaneous"),
          id: z.string().optional().describe("Optional identifier. Set when referenced by 'availableInSubflows'."),
          label: z.string().optional().describe("Human-readable name shown in the UI."),
          actor: ActorSpecSchema.describe("Which player(s) participate."),
          grammar: TurnGrammarNodeSchema.describe(
            "What each actor does. All actors act independently and without seeing each other's choices. " +
              "Outcomes are hidden until all actors submit, then revealed together.",
          ),
          endCondition: FlowEndConditionSchema.optional().describe(
            "Exit condition. JSONLogic over game state, or 'until-pass' (exit when all actors pass). " +
              "Useful for open-ended simultaneous phases like a ready-check or open-market.",
          ),
          timeLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("Per-actor time limit in milliseconds. Engine auto-submits pass on timeout."),
          interruptWindows: z
            .array(InterruptWindowSchema)
            .optional()
            .describe(
              "Interrupt/reaction windows active only during this simultaneous node.",
            ),
          hooks: FlowHooksSchema.optional(),
        })
        .describe(
          "All actors submit simultaneously and independently, then outcomes are revealed together. " +
            "Use for blind bidding, rock-paper-scissors, simultaneous night actions, or ready-checks.",
        ),
    ])
    .describe("A flow tree node. Three kinds: loop, turn, simultaneous."),
);

// TypeScript type (needed for recursive z.ZodType annotation above)
export type FlowNode =
  | { kind: "loop"; id?: string; label?: string; count?: number; endCondition?: unknown; finalRound?: boolean; children: FlowNode[]; interruptWindows?: unknown[]; hooks?: _FlowHooks }
  | { kind: "turn"; id?: string; label?: string; actor: ActorSpec; turnOrder?: TurnOrder; grammar: TurnGrammarNode; timeLimit?: number; interruptWindows?: unknown[]; hooks?: _FlowHooks }
  | { kind: "simultaneous"; id?: string; label?: string; actor: ActorSpec; grammar: TurnGrammarNode; endCondition?: unknown; timeLimit?: number; interruptWindows?: unknown[]; hooks?: _FlowHooks };

// ---------------------------------------------------------------------------
// Interrupt window (orthogonal event layer)
// ---------------------------------------------------------------------------

/**
 * An interrupt window opens when a named effect fires and gives eligible players
 * a chance to act before or after normal flow resumes. Attached directly to flow nodes
 * (loop, turn, simultaneous) — active only while that node is executing.
 * Outer node windows are inherited by all children.
 *
 * @example Counter-spell on a specific turn (scoped to the attack turn only)
 * ```yaml
 * kind: turn
 * id: attack-turn
 * actor: active-player
 * grammar: { kind: action, ref: attack }
 * interruptWindows:
 *   - id: counter-spell
 *     trigger: deal-damage
 *     timing: before
 *     eligiblePlayers: opponents
 *     actions: [counter-spell]
 *     timeout: 10000
 * ```
 * @example Reaction window active throughout the whole game (on root loop)
 * ```yaml
 * kind: loop
 * endCondition: { var: game.state.gameOver }
 * interruptWindows:
 *   - id: heal-response
 *     trigger: take-damage
 *     timing: after
 *     eligiblePlayers: { roles: [healer] }
 *     actions: [resilience]
 * children: ...
 * ```
 */
export const InterruptWindowSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Unique identifier for this interrupt window. " +
          "Referenced by action 'interrupt[]' fields to declare eligibility.",
      ),
    trigger: z
      .string()
      .describe(
        "Named effect ID that opens this window. Forward reference to the effects module. " +
          "The referenced effect should be a named effect (defined in effects[]) so it has " +
          "a stable ID. When the engine executes this effect, the window opens.",
      ),
    timing: z
      .enum(["before", "after"])
      .describe(
        "'before': window opens before the triggering effect resolves. " +
          "If a player takes a cancel-effect action, the trigger is voided. " +
          "'after': window opens after the effect resolves. " +
          "Players react to an effect that has already happened.",
      ),
    eligiblePlayers: z
      .union([
        z.literal("all").describe("All players may respond."),
        z.literal("opponents").describe("All players except the one whose action triggered the effect."),
        z.literal("non-active").describe("All players who are not the current active player."),
        z
          .object({
            roles: z
              .array(z.string())
              .min(1)
              .describe(
                "Only players holding at least one of these role IDs may respond. " +
                  "Any-of semantics. Forward references to role IDs in the players module.",
              ),
          })
          .describe("Only players holding at least one of the listed roles may respond."),
      ])
      .describe("Which players are offered the interrupt window."),
    actions: z
      .array(z.string())
      .min(1)
      .describe(
        "Action IDs offered during this window. Forward references to the actions module. " +
          "Only actions with matching 'interrupt[]' entries should be listed here.",
      ),
    timeout: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Time limit in milliseconds for players to respond. " +
          "If no player acts before timeout, the window closes and normal flow resumes. " +
          "Omit for untimed windows (async or test games).",
      ),
  })
  .describe(
    "An interrupt window in the orthogonal event layer. Opens when a named effect fires, " +
      "pauses normal flow, and offers eligible players a chance to respond. " +
      "After all eligible players have acted or passed (or timeout expires), flow resumes.",
  );

// ---------------------------------------------------------------------------
// Game root node (top-level container — not a loop)
// ---------------------------------------------------------------------------

/**
 * The root of every game's flow tree. Exactly one per spec.
 *
 * `kind: game` is a once-through container — it is NOT a loop. It runs its
 * children in order and terminates when its last child completes. Use its
 * `onEnter` hook for one-time game setup (deal cards, assign roles, etc.).
 * End conditions and repetition belong in child loop nodes.
 *
 * This separation prevents the "same endCondition on both root and round loop"
 * anti-pattern that arises when root is forced to be a loop.
 *
 * @example Liar's Dice — game setup once, round loop owns the end condition
 * ```yaml
 * root:
 *   kind: game
 *   hooks:
 *     onEnter:
 *       - ref: deal-dice        # runs once at game start
 *   children:
 *     - kind: loop
 *       endCondition: { "<=": [{ var: game.property.activePlayers }, 1] }
 *       hooks:
 *         onEnter:
 *           - ref: roll-all-dice
 *       children:
 *         - kind: turn
 *           actor: active-player
 * ```
 */
export const GameRootSchema = z
  .object({
    kind: z.literal("game"),
    label: z.string().optional().describe("Human-readable name for the game root. Optional."),
    hooks: FlowHooksSchema.optional().describe(
      "Lifecycle hooks. 'onEnter' is the canonical location for one-time game setup " +
        "(deal opening hands, assign roles, initialize state). " +
        "'onComplete' fires when the last child finishes — use for end-of-game cleanup.",
    ),
    children: z
      .array(FlowNodeSchema)
      .min(1)
      .describe(
        "Ordered list of flow nodes that constitute the game. " +
          "Executed once in order — the game ends when the last child completes. " +
          "Typically contains one or more loop nodes that own their own end conditions.",
      ),
    interruptWindows: z
      .array(InterruptWindowSchema)
      .optional()
      .describe(
        "Interrupt windows active throughout the entire game. " +
          "Inherited by all descendant nodes.",
      ),
  })
  .describe(
    "The top-level game container. Runs once — not a loop. " +
      "Use onEnter for game setup. End conditions belong on child loop nodes.",
  );

// ---------------------------------------------------------------------------
// Flow module
// ---------------------------------------------------------------------------

export const FlowModuleSchema = z
  .object({
    root: GameRootSchema.describe(
      "The root of the game's flow tree. Always 'kind: game'. " +
        "Runs once: onEnter for setup, children for the game structure. " +
        "Interrupt windows on root are active throughout the entire game.",
    ),
  })
  .describe(
    "The flow module — the game's structural skeleton. " +
      "Declares how the game progresses (who acts, when, in what order). " +
      "Does not declare what actions do (that is the actions + effects modules). " +
      "Interrupt windows live on nodes, scoped to when their containing node is active.",
  );

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

type _FlowHooks = { onEnter?: unknown; onComplete?: unknown };
type TurnOrder = z.infer<typeof TurnOrderSchema>;
type ActorSpec = z.infer<typeof ActorSpecSchema>;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type { TurnOrder, ActorSpec };
export type FlowHooks = z.infer<typeof FlowHooksSchema>;
export type InterruptWindow = z.infer<typeof InterruptWindowSchema>;
export type GameRoot = z.infer<typeof GameRootSchema>;
export type FlowModule = z.infer<typeof FlowModuleSchema>;
