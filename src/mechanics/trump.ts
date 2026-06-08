/**
 * Mechanic: chaincraft:trump
 * Scope: game-level
 *
 * Evaluates trump suit in trick-taking games. Determines which card wins a trick
 * by comparing suit and rank, with a designated trump suit beating all others.
 *
 * ## Integration
 *
 * ### Exposes
 *   Effects (by ref):
 *     { ref: "chaincraft:trump:resolve-trick" }
 *     Compares cards in evaluationInventory, applies trump logic, awards the trick.
 *     Call from flow hooks (e.g., trick loop onComplete).
 *   Derived properties (on game state, mechanic-managed):
 *     leading-suit  — set to the suit of the first card played in the current trick.
 *     Readable via JsonLogic: { var: "game.property.leading-suit" }
 *
 * ### References
 *   inventories.ts:     `evaluationInventory`  — shared with flow conditions and move
 *     effects; must be declared in the inventories module. NOT owned by this mechanic.
 *   gamepiece-types.ts: `suitProperty`  — property on card pieces holding the suit value
 *   gamepiece-types.ts: `rankProperty`  — property on card pieces holding the rank value
 *
 * ### Properties defined
 *   On game state (mechanic-managed):
 *     leading-suit  — derived string, set when the first card of a trick is played.
 *
 * ### Configuration
 *   Required: suitProperty, rankProperty, rankOrder, evaluationInventory
 *   Optional: trumpSuit (omit for no-trump — highest card of leading suit wins)
 *
 * ## Engine synthesis
 *   1. A `resolve-trick` effect callable by ref
 *   2. A `leading-suit` derived property on game state
 *
 * Trump suit modes:
 *   Static:   trumpSuit: "spades"
 *   None:     (omit trumpSuit)                                  — no-trump, leading suit wins
 *   Dynamic:  trumpSuit: { var: "game.property.declaredTrump" }  — declared via bid or cut
 *
 * @example Spades (spades always trump)
 * ```yaml
 * kind: chaincraft:trump
 * suitProperty: suit
 * rankProperty: rank
 * rankOrder: [2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A]
 * trumpSuit: spades
 * evaluationInventory: trick-pile
 * ```
 * @example Hearts (no trump — highest card of leading suit wins)
 * ```yaml
 * kind: chaincraft:trump
 * suitProperty: suit
 * rankProperty: rank
 * rankOrder: [2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A]
 * evaluationInventory: trick-pile
 * # no trumpSuit — leads with highest of leading suit
 * ```
 * @example Euchre (trump declared during bidding — stored in game property)
 * ```yaml
 * kind: chaincraft:trump
 * suitProperty: suit
 * rankProperty: rank
 * rankOrder: [9, 10, J, Q, K, A]
 * trumpSuit: { var: "game.property.declaredTrump" }
 * evaluationInventory: trick-pile
 * ```
 */

import { z } from "zod";
import { JsonLogicSchema } from "#gamedef/modules/common.js";

export const TrumpMechanicSchema = z
  .object({
    kind: z.literal("chaincraft:trump"),
    suitProperty: z
      .string()
      .describe(
        "Property ID on card pieces that holds the suit value. " +
          "Forward reference to a property declared on the card's gamepiece type.",
      ),
    rankProperty: z
      .string()
      .describe(
        "Property ID on card pieces that holds the rank/value. " +
          "Forward reference to a property declared on the card's gamepiece type.",
      ),
    rankOrder: z
      .array(z.union([z.string(), z.number()]))
      .min(2)
      .describe(
        "Ordered list of rank values from lowest to highest. " +
          "The engine uses this to compare cards of the same suit. " +
          "Example: [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']",
      ),
    trumpSuit: z
      .union([z.string(), JsonLogicSchema])
      .optional()
      .describe(
        "The trump suit. Cards of this suit beat all other suits regardless of rank. " +
          "Accepts a literal suit string (e.g. 'spades') or a JsonLogic expression " +
          "reading game state (e.g. { var: 'game.property.declaredTrump' }) for games " +
          "where trump is declared dynamically. " +
          "Omit for no-trump mode: highest card of the leading suit wins.",
      ),
    evaluationInventory: z
      .string()
      .describe(
        "Inventory ID containing the cards being evaluated for trick resolution. " +
          "Must be declared in the inventories module — this inventory is referenced " +
          "by flow conditions and move effects as well as this mechanic. " +
          "Typically a game-scoped unordered inventory (e.g., 'trick-pile').",
      ),
  })
  .describe(
    "Game-level mechanic: evaluates trump suit in trick-taking games. " +
      "References (does not own) the evaluation inventory. " +
      "Exposes a 'resolve-trick' effect callable from flow hooks. " +
      "Supports static trump, no-trump, and dynamically declared trump via JsonLogic.",
  );

export type TrumpMechanic = z.infer<typeof TrumpMechanicSchema>;
