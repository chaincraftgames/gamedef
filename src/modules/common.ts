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
// JSONLogic precondition schema
// ---------------------------------------------------------------------------

/**
 * A JSONLogic expression used to declare preconditions on actions and action slots.
 * The engine evaluates this against runtime state before offering or accepting the action.
 *
 * JSONLogic reference: https://jsonlogic.com/operations.html
 *
 * **State path conventions** (used with the `var` operator):
 *
 * Available in `ActionSchema.preconditions`:
 * - `input.<id>`                  — value of an action input declared in inputs[]
 * - `actor.property.<id>`         — property on the acting player
 * - `actor.inventory.<id>.count`  — item count in the actor's named inventory
 * - `game.property.<id>`          — game-level property (forward ref to a state tracker)
 * - `game.inventory.<id>.count`   — item count in a game-level inventory
 *
 * Available in `ActionSlotSchema.preconditions` (piece-instance context):
 * - `piece.property.<id>`         — property on the gamepiece instance holding this slot
 * - `piece.inventory.<id>.count`  — item count in a piece's own inventory slot
 * - `actor.property.<id>`         — property on the acting player
 * - `actor.inventory.<id>.count`  — item count in the actor's named inventory
 *
 * @example Can only bid if game has a current bid set
 * ```json
 * { "!=": [{ "var": "game.inventory.current-bid.count" }, 0] }
 * ```
 * @example Can only use card action if piece has at least 1 charge
 * ```json
 * { ">=": [{ "var": "piece.property.charges" }, 1] }
 * ```
 * @example Compound: actor has enough coins AND it's not their first turn
 * ```json
 * { "and": [
 *   { ">=": [{ "var": "actor.property.coins" }, 3] },
 *   { ">":  [{ "var": "actor.property.turnsTaken" }, 0] }
 * ]}
 * ```
 */
export type JsonLogicValue =
  | string
  | number
  | boolean
  | null
  | JsonLogicValue[]
  | { [op: string]: JsonLogicValue };

export const JsonLogicSchema: z.ZodType<JsonLogicValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonLogicSchema),
    z.record(JsonLogicSchema),
  ]),
).describe(
  "A JSONLogic expression evaluated against runtime state. " +
    "Use the 'var' operator with state paths to reference game state. " +
    "State paths: 'input.<id>' (action inputs), 'actor.property.<id>', " +
    "'actor.inventory.<id>.count', 'piece.property.<id>' (slot context only), " +
    "'piece.inventory.<id>.count' (slot context only), 'game.property.<id>', " +
    "'game.inventory.<id>.count'. " +
    "Standard JSONLogic operators: '>', '>=', '<', '<=', '==', '!=', 'and', 'or', 'not', '!'.",
);

// ---------------------------------------------------------------------------
// Property value types
// ---------------------------------------------------------------------------

/**
 * The set of value types available for properties (gamepiece, game state, player state).
 *
 * @example
 * ```yaml
 * { kind: integer, min: 0, max: 10 }   # bounded integer
 * { kind: float }                       # unbounded float
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
    kind: z.literal("integer"),
    min: z.number().int().optional().describe("Inclusive minimum value, if constrained"),
    max: z.number().int().optional().describe("Inclusive maximum value, if constrained"),
  }),
  z.object({
    kind: z.literal("float"),
    min: z.number().optional().describe("Inclusive minimum value, if constrained"),
    max: z.number().optional().describe("Inclusive maximum value, if constrained"),
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
