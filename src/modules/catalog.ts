/**
 * Catalog Module Schema
 *
 * Depends on: gamepiece-types (forward refs to type IDs).
 * No inventory references — catalog is a pure piece registry.
 *
 * The catalog declares every gamepiece instance that exists in the game.
 * All pieces start in the reserved system inventory `game:unassigned`.
 * Game setup (shuffle, deal, place) is expressed as `onEnter` effects on the
 * root flow loop. During play, acquiring from / returning to an implicit pool
 * is done by moving pieces to/from `game:unassigned`.
 *
 * Key design decisions:
 * - Catalog is intentionally decoupled from inventory assignment so that
 *   content expansion (generating piece types and instances) can work
 *   independently of setup logic.
 * - `quantity` creates N anonymous identical copies. Use for fungible pieces
 *   (dice, tokens, resource cubes). Content expansion can freely enumerate
 *   quantities without knowing anything about how pieces are distributed.
 * - `properties` sets initial scalar values. Omit to use declared defaults.
 * - `id` on a single piece enables targeting by name in setup effects:
 *   `select: { id: white-king }`.
 * - No `inventory`, `placement`, or `forRoles` — all of that is setup logic
 *   expressed in flow `onEnter` hooks, keeping catalog and setup orthogonal.
 *
 * @example Liar's Dice — 5 dice per player (setup deals them in onEnter)
 * ```yaml
 * entries:
 *   - typeId: die
 *     quantity: 30    # max 6 players × 5 dice; setup distributes 5 per player
 * ```
 * @example Chess — named pieces with color property
 * ```yaml
 * entries:
 *   - id: white-king
 *     typeId: king
 *     properties: { color: white }
 *   - id: white-queen
 *     typeId: queen
 *     properties: { color: white }
 *   - typeId: pawn
 *     quantity: 8
 *     properties: { color: white }
 *   - typeId: pawn
 *     quantity: 8
 *     properties: { color: black }
 *   - id: black-king
 *     typeId: king
 *     properties: { color: black }
 *   # Setup (root loop onEnter) places each piece on the board via move effects.
 * ```
 * @example Card game — standard 52-card deck
 * ```yaml
 * # All 52 cards share one typeId; rank and suit are properties.
 * entries:
 *   - typeId: playing-card
 *     properties: { rank: "2", suit: hearts }
 *   - typeId: playing-card
 *     properties: { rank: "3", suit: hearts }
 *   # ... one entry per card (52 total)
 *   - typeId: playing-card
 *     properties: { rank: ace, suit: spades }
 *   # Setup (root loop onEnter): shuffle game:unassigned, distribute 5 to each player hand.
 * ```
 * @example Resource game — token supply
 * ```yaml
 * entries:
 *   - typeId: gold-coin
 *     quantity: 30
 *   - typeId: wood-token
 *     quantity: 20
 *   # Setup moves them to a bank inventory if visual display is needed,
 *   # or leaves them in game:unassigned for implicit pool behaviour.
 * ```
 * @example Werewolf — role-specific items (setup assigns in onEnter per role)
 * ```yaml
 * entries:
 *   - typeId: kill-card
 *     quantity: 1
 *   - typeId: heal-potion
 *     quantity: 2
 *   - typeId: vote-token
 *     quantity: 10
 *   # Setup distributes to role-specific players via distribute effects with roles filter.
 * ```
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Initial property values
// ---------------------------------------------------------------------------

/**
 * A map of property IDs to initial scalar values.
 * Keys are property IDs (forward refs to properties[] on the gamepiece type).
 * Values must match the declared property type:
 *   - integer / float → number
 *   - string / enum   → string
 *   - boolean         → boolean
 */
const InitialPropertiesSchema = z
  .record(z.union([z.string(), z.number(), z.boolean()]))
  .describe(
    "Initial property values for this piece instance. " +
      "Keys are property IDs matching properties[] declared on the gamepiece type. " +
      "Values must match the declared type: number for integer/float, " +
      "string for string/enum, boolean for boolean. " +
      "Omit a property to leave it at its declared default or unset.",
  );

// ---------------------------------------------------------------------------
// Catalog entry
// ---------------------------------------------------------------------------

/**
 * A single catalog entry — declares one or more gamepiece instances.
 * All pieces start in `game:unassigned`; setup effects move them where needed.
 *
 * @example Named unique piece
 * ```yaml
 * id: white-king
 * typeId: king
 * properties: { color: white }
 * ```
 * @example Fungible identical pieces (anonymous)
 * ```yaml
 * typeId: gold-coin
 * quantity: 30
 * ```
 * @example Pieces with distinct property values (one entry per piece)
 * ```yaml
 * typeId: playing-card
 * properties: { rank: ace, suit: spades }
 * ```
 */
export const CatalogEntrySchema = z
  .object({
    id: z
      .string()
      .optional()
      .describe(
        "Optional unique identifier for this specific piece instance. " +
          "Assign when you need to reference this piece by name in setup effects: " +
          "{ select: { id: white-king } }. " +
          "Not meaningful when quantity > 1 (copies are anonymous).",
      ),
    typeId: z
      .string()
      .describe(
        "Gamepiece type ID. Forward reference to a type declared in the gamepiece-types module. " +
          "Determines the piece's properties, action slots, and mechanics.",
      ),
    quantity: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Number of identical anonymous copies to create. Defaults to 1. " +
          "Use for fungible pieces: dice, tokens, resource cubes. " +
          "All copies receive the same 'properties' values. " +
          "Do NOT use when pieces differ in any property — list one entry per piece instead.",
      ),
    properties: InitialPropertiesSchema.optional().describe(
      "Initial property values applied to all created copies. " +
        "Omit to leave all properties at their declared defaults.",
    ),
  })
  .describe(
    "Declares one or more gamepiece instances. All pieces start in game:unassigned. " +
      "Use 'id' for unique named pieces, 'quantity' for fungible anonymous copies.",
  );

// ---------------------------------------------------------------------------
// Catalog module
// ---------------------------------------------------------------------------

export const CatalogModuleSchema = z
  .object({
    entries: z
      .array(CatalogEntrySchema)
      .min(1)
      .describe(
        "All gamepiece instances that exist in the game. " +
          "Every piece starts in the reserved system inventory 'game:unassigned'. " +
          "Setup effects (in the root loop's onEnter hooks) move pieces into their " +
          "starting inventories before play begins.",
      ),
  })
  .describe(
    "The catalog module — a pure piece registry, decoupled from setup logic. " +
      "Declares what pieces exist and their initial property values. " +
      "How pieces are distributed, placed, and shuffled is expressed in flow onEnter hooks.",
  );

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type InitialProperties = z.infer<typeof InitialPropertiesSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type CatalogModule = z.infer<typeof CatalogModuleSchema>;
