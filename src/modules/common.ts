/**
 * Common schemas shared across spec modules.
 * No dependencies on other spec modules.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Integer range schema
// ---------------------------------------------------------------------------

/**
 * An inclusive integer range with optional min and/or max bounds.
 * Used wherever a count or quantity may be a fixed value, a bounded range, or open-ended.
 *
 * @example Exactly 3
 * ```json
 * { "min": 3, "max": 3 }
 * ```
 * @example Up to 3 (0–3)
 * ```json
 * { "max": 3 }
 * ```
 * @example At least 2
 * ```json
 * { "min": 2 }
 * ```
 * @example Any non-negative count (unbounded)
 * ```json
 * {}
 * ```
 */
export const IntRangeSchema = z
  .object({
    min: z.number().int().min(0).optional().describe(
      "Inclusive lower bound. Omit for no lower bound (treated as 0).",
    ),
    max: z.number().int().min(1).optional().describe(
      "Inclusive upper bound. Omit for no upper bound.",
    ),
  })
  .describe(
    "An inclusive integer range. Both bounds are optional. " +
      "{ min: 3, max: 3 } = exactly 3. { max: 3 } = up to 3. " +
      "{ min: 2 } = at least 2. {} = any count.",
  );

export type IntRange = z.infer<typeof IntRangeSchema>;

// ---------------------------------------------------------------------------
// State path schema
// ---------------------------------------------------------------------------

/**
 * A validated state path string for referencing runtime game state.
 * Used as bare strings outside JSONLogic (e.g., effect targets, catalog refs).
 * Inside JSONLogic, use as the argument to the `var` operator.
 *
 * **Path segments by context:**
 * - `game.property.<id>`           — game-level scalar property
 * - `game.inventory.<id>.count`    — item count in a game-level inventory
 * - `actor.property.<id>`          — property on the acting/evaluated player
 * - `actor.inventory.<id>.count`   — item count in a player's inventory
 * - `actor.role.<id>`              — 1 if the player holds this role, else 0
 * - `piece.property.<id>`          — property on a gamepiece (piece-context only)
 * - `piece.inventory.<id>.count`   — inventory count on a gamepiece (piece-context only)
 * - `input.<id>`                   — value of a named action input (action-context only)
 *
 * @example
 * ```
 * game.property.round
 * actor.inventory.hand.count
 * piece.property.charges
 * input.bidAmount
 * ```
 */
export const StatePathSchema = z
  .string()
  .regex(
    /^(game\.(property|inventory)\.|actor\.(property|inventory|role)\.|piece\.(property|inventory)\.|input\.)\S+/,
    "Must be a valid state path: game.property.<id>, game.inventory.<id>.count, " +
      "actor.property.<id>, actor.inventory.<id>.count, actor.role.<id>, " +
      "piece.property.<id>, piece.inventory.<id>.count, or input.<id>.",
  )
  .describe(
    "A state path string referencing runtime game state. " +
      "Valid prefixes: 'game.property.', 'game.inventory.', 'actor.property.', " +
      "'actor.inventory.', 'actor.role.', 'piece.property.', 'piece.inventory.', 'input.'.",
  );

export type StatePath = z.infer<typeof StatePathSchema>;

// ---------------------------------------------------------------------------
// Condition expression schema
// ---------------------------------------------------------------------------

/**
 * An infix condition expression string compiled to a TypeScript predicate by the game compiler.
 *
 * ## Syntax
 *
 * Standard infix with comparisons and boolean connectives:
 * ```
 * comparisons:  >  >=  <  <=  ==  !=
 * boolean:      and  or  not
 * grouping:     ( )
 * ```
 * The compiler normalises common variants automatically:
 * `&&` → `and`, `||` → `or`, `=` → `==`, `!==` → `!=`, `<>` → `!=`.
 *
 * ## State path identifiers
 *
 * The available paths depend on the evaluation context:
 *
 * **Action preconditions** (`ActionSchema.preconditions`):
 * - `input.<id>`                  — value of an action input declared in inputs[]
 * - `actor.property.<id>`         — property on the acting player
 * - `actor.inventory.<id>.count`  — item count in the actor's named inventory
 * - `game.property.<id>`          — game-level property
 * - `game.inventory.<id>.count`   — item count in a game-level inventory
 *
 * **Piece-slot context** (`ActionSlotSchema.preconditions`):
 * - `piece.property.<id>`         — property on the gamepiece instance holding this slot
 * - `piece.inventory.<id>.count`  — item count in a piece's own inventory
 * - `actor.property.<id>`         — property on the acting player
 * - `actor.inventory.<id>.count`  — item count in the actor's named inventory
 *
 * **Flow end conditions** (`LoopFlowNode.endCondition`, `SimultaneousFlowNode.endCondition`):
 * - `game.property.<id>`          — game-level property
 * - `game.inventory.<id>.count`   — item count in a game-level inventory
 * - `actor.property.<id>`         — property on the acting player
 *
 * **Player matching** (`PlayerTarget.matching.condition`, `player-select.filter`):
 * - `player.property.<id>`        — the candidate player's property
 * - `player.inventory.<id>.count` — item count in the candidate player's inventory
 *
 * **Gamepiece filter** (`gamepiece-select.filter`):
 * - `piece.property.<id>`         — the candidate piece's property
 * - `piece.typeId`                — the candidate piece's type ID
 *
 * ## Built-in functions
 *
 * - `count(inventory)`
 *   Number of pieces in an inventory path, e.g. `count(game.inventory.deck)`.
 *   Equivalent to the `.count` suffix but usable in any expression position.
 *
 * - `all(players, <expr>)`
 *   Universal quantifier — true when `<expr>` holds for every player in the game.
 *   Inside `<expr>`, use `player.property.<id>` and `player.inventory.<id>.count`
 *   to reference each candidate player.
 *   Example: `all(players, player.property.ready == true)`
 *
 * - `any(players, <expr>)`
 *   Existential quantifier — true when `<expr>` holds for at least one player.
 *   Example: `any(players, player.property.roundsWon >= 5)`
 *
 * ## Computed identifiers
 *
 * None currently defined. Computed state helpers that were needed with the old
 * JsonLogic interpreter (e.g., `allPlayersCompletedActions`) are no longer
 * necessary — the simultaneous node's fork-join handles that structurally.
 *
 * @example Loop exits when a winner is set
 * ```yaml
 * endCondition: "game.property.gameWinner != ''"
 * ```
 * @example Loop exits when deck is empty
 * ```yaml
 * endCondition: "game.inventory.deck.count == 0"
 * ```
 * @example Action requires coins and prior turns
 * ```yaml
 * preconditions: "actor.property.coins >= 3 and actor.property.turnsTaken > 0"
 * ```
 * @example Action available only when a bid has been placed
 * ```yaml
 * preconditions: "game.inventory.current-bid.count != 0"
 * ```
 * @example Loop exits when any player reaches 50 points
 * ```yaml
 * endCondition: "any(players, player.property.score >= 50)"
 * ```
 * @example Player target matching — apply bonus to players who bid correctly
 * ```yaml
 * target:
 *   kind: matching
 *   condition: "player.property.bidCorrect == true"
 * ```
 */
export const ConditionExpressionSchema = z.string().describe(
  "An infix condition expression compiled to a TypeScript predicate by the game compiler. " +
    "Operators: >, >=, <, <=, ==, != (comparisons); and, or, not (boolean). " +
    "Variants &&/||/= are normalised automatically. " +
    "Paths: game.property.<id>, game.inventory.<id>.count, " +
    "actor.property.<id>, actor.inventory.<id>.count, " +
    "player.property.<id> (player-filter context), player.inventory.<id>.count, " +
    "piece.property.<id> (gamepiece-filter context), piece.typeId. " +
    "Functions: count(inventory), all(players, expr), any(players, expr).",
);

export type ConditionExpression = z.infer<typeof ConditionExpressionSchema>;

/** @deprecated Renamed to ConditionExpressionSchema. */
export const JsonLogicSchema = ConditionExpressionSchema;

// ---------------------------------------------------------------------------
// Identifier
// ---------------------------------------------------------------------------

/**
 * All user-defined IDs (effects, actions, inventories, gamepiece types, state
 * properties, flow nodes, roles, catalog piece IDs) must be camelCase to ensure
 * they parse unambiguously in condition expressions (hyphens are subtraction operators).
 *
 * @example
 * Valid: `currentBid`, `dealDice`, `playerCup`, `roundWinner`
 * Invalid: `current-bid`, `deal-dice`, `player-cup`, `round-winner`
 */
export const IdentifierSchema = z
  .string()
  .regex(
    /^[a-zA-Z][a-zA-Z0-9]*$/,
    "must be camelCase — letters and digits only, starting with a letter (no hyphens, underscores, or spaces)",
  );
export type Identifier = z.infer<typeof IdentifierSchema>;

// ---------------------------------------------------------------------------
// Property value types
// ---------------------------------------------------------------------------

/**
 * The set of value types available for properties (gamepiece, game state, player state).
 *
 * @example
 * ```yaml
 * { kind: number, min: 0, max: 10 }       # bounded number
 * { kind: number, integer: false }         # unbounded float (rare)
 * { kind: enum, values: [red, green] }  # enumeration
 * { kind: boolean }                     # true/false flag
 * { kind: string }                      # free text
 * { kind: player-id }                  # ref: a player in the game
 * { kind: player-role-id }             # ref: a role defined in the players module
 * { kind: gamepiece-id }               # ref: a gamepiece instance
 * ```
 * player-id / player-role-id / gamepiece-id are entity references — stored as string IDs
 * at runtime and validated by the engine on every set-state write.
 */
export const PropertyTypeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("number"),
    min: z.number().optional().describe("Inclusive minimum value, if constrained"),
    max: z.number().optional().describe("Inclusive maximum value, if constrained"),
    integer: z.boolean().optional().describe("If true, only whole numbers are accepted. Defaults to true."),
  }),
  z.object({
    kind: z.literal("string"),
  }),
  z.object({
    kind: z.literal("boolean"),
  }),
  z.object({
    kind: z.literal("enum"),
    values: z
      .array(z.string())
      .min(2)
      .describe("The exhaustive set of allowed string values"),
  }),
  z.object({
    kind: z.literal("player-id"),
  }).describe(
    "A reference to a player. Stored as a string player ID. " +
      "The engine validates that the written value is a known player at runtime.",
  ),
  z.object({
    kind: z.literal("player-role-id"),
  }).describe(
    "A reference to a player role defined in the players module. " +
      "The engine validates that the written value is a known role when roles are configured.",
  ),
  z.object({
    kind: z.literal("gamepiece-id"),
  }).describe(
    "A reference to a gamepiece instance. Stored as a string piece ID. " +
      "The engine validates that the written value is a known gamepiece at runtime.",
  ),
]).describe(
  "The type of a property. Determines what values are valid and what operations the " +
    "effect vocabulary can apply.",
);

export type PropertyType = z.infer<typeof PropertyTypeSchema>;
