/**
 * State Module Schema
 *
 * Declares abstract game and player state — values that need to be tracked and
 * communicated across the game lifecycle but have no physical representation as
 * gamepieces. This replaces phantom gamepieces (e.g. bid-markers, score tokens)
 * that exist solely to hold data.
 *
 * Physical state (piece positions, properties, face states) belongs in the
 * gamepieceTypes + inventories modules. Abstract state belongs here.
 *
 * State is mutated by `kind: set-state` effects and read in JSON Logic
 * preconditions and flow endConditions via dot-paths:
 *   game.property.<id>           → game-scoped state
 *   player.property.<id>         → per-player state (resolved per acting player)
 *
 * Key design decisions:
 * - `game` properties are singleton — one value for the whole game.
 * - `player` properties are per-player — the engine maintains one value per player.
 *   In preconditions, `player.property.<id>` resolves to the acting player's value.
 * - All state properties must declare a `default` so the engine can initialise them
 *   before any effects run.
 * - There is no `team` state scope at this time — model team state as game properties
 *   with a naming convention (e.g. `team1Score`, `team2Score`) until that scope is needed.
 *
 * @example Liar's Dice — bid tracking and elimination
 * ```yaml
 * state:
 *   game:
 *     properties:
 *       - id: currentBidQuantity
 *         type: { kind: integer, min: 0, max: 30 }
 *         default: 0
 *       - id: currentBidFace
 *         type: { kind: integer, min: 0, max: 6 }
 *         default: 0
 *       - id: activePlayers
 *         type: { kind: integer, min: 0 }
 *         default: { fromPlayerCount: true }
 *   player:
 *     properties:
 *       - id: isActive
 *         type: { kind: boolean }
 *         default: true
 */

import { z } from "zod";
import { PropertyTypeSchema } from "./gamepiece-types.js";

// ---------------------------------------------------------------------------
// State property default value
// ---------------------------------------------------------------------------

/**
 * The initial value for a state property. Can be a literal or a special sentinel.
 *
 * @example
 * ```yaml
 * default: 0                          # literal integer
 * default: ""                         # literal empty string
 * default: false                      # literal boolean
 * default: { fromPlayerCount: true }  # set to the number of players at game start
 * ```
 */
export const StateDefaultSchema = z
  .union([
    z.string().describe("Literal string default."),
    z.number().describe("Literal numeric default."),
    z.boolean().describe("Literal boolean default."),
    z
      .object({ fromPlayerCount: z.literal(true) })
      .describe(
        "Initialize this integer property to the number of players at game start. " +
          "Useful for tracking how many players remain active.",
      ),
  ])
  .describe("Initial value for this state property before any effects run.");

// ---------------------------------------------------------------------------
// State property definition
// ---------------------------------------------------------------------------

/**
 * @example
 * ```yaml
 * - id: currentBidQuantity
 *   type: { kind: integer, min: 0, max: 30 }
 *   default: 0
 *   description: Quantity declared in the current round's bid.
 * ```
 * @example
 * ```yaml
 * - id: isActive
 *   type: { kind: boolean }
 *   default: true
 *   description: Whether this player is still in the game (has at least one die).
 * ```
 */
export const StatePropertySchema = z
  .object({
    id: z
      .string()
      .describe(
        "Programmatic identifier. Used in dot-path references " +
          "(e.g., game.property.currentBidQuantity). Use camelCase.",
      ),
    type: PropertyTypeSchema.describe("The value type for this property."),
    default: StateDefaultSchema,
    description: z
      .string()
      .optional()
      .describe("Human-readable description of what this property tracks."),
  })
  .describe("A single tracked state variable with its type and initial value.");

// ---------------------------------------------------------------------------
// Game-scoped state
// ---------------------------------------------------------------------------

export const GameStateSchema = z
  .object({
    properties: z
      .array(StatePropertySchema)
      .min(1)
      .describe(
        "Singleton properties shared across the whole game. " +
          "Referenced in effects and conditions as game.property.<id>.",
      ),
  })
  .describe("State variables scoped to the game as a whole.");

// ---------------------------------------------------------------------------
// Player-scoped state
// ---------------------------------------------------------------------------

export const PlayerStateSchema = z
  .object({
    properties: z
      .array(StatePropertySchema)
      .min(1)
      .describe(
        "Per-player properties. The engine maintains one value per player. " +
          "In preconditions and effects, player.property.<id> resolves to the " +
          "acting player's value unless a player selector is specified.",
      ),
  })
  .describe("State variables scoped per-player. One value per player instance.");

// ---------------------------------------------------------------------------
// State module
// ---------------------------------------------------------------------------

export const StateModuleSchema = z
  .object({
    game: GameStateSchema.optional().describe(
      "Game-scoped state properties. Singleton values for the whole game.",
    ),
    player: PlayerStateSchema.optional().describe(
      "Player-scoped state properties. One value per player.",
    ),
  })
  .describe(
    "Abstract state declarations — values tracked by the engine with no physical " +
      "gamepiece representation. Use for bids, round numbers, flags, and counters. " +
      "Mutated by set-state effects. Read via dot-paths in preconditions and endConditions.",
  );

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StateDefault = z.infer<typeof StateDefaultSchema>;
export type StateProperty = z.infer<typeof StatePropertySchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;
export type StateModule = z.infer<typeof StateModuleSchema>;
