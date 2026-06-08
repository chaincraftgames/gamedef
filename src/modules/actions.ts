/**
 * Actions Module Schema
 *
 * Depends on: effects (EffectCallsSchema).
 * Referenced by: flow (phases list available actions by ID),
 *                gamepiece-types (actionSlots reference action IDs via catalog),
 *                mechanics (mechanic patterns may trigger actions).
 *
 * An action is a named, player-initiatable operation. Actions declare WHAT a player
 * does; effects declare HOW the game state changes. Every action carries an effects
 * list — inline effects, named-effect refs, or both.
 *
 * Key design decisions:
 * - No pattern discriminator. Every action has the same shape: id + optional inputs
 *   + effects. The effects list determines what actually happens.
 * - Prose logic belongs in a prose effect, not a special action kind.
 * - Resource conversions are expressed as move effects (take from source, add to dest).
 *   If the engine needs to validate availability first, that's a prose effect.
 * - Actions may declare 'inputs[]' — typed, player-provided values collected at
 *   action time. Inline effects in the same action can use { param: id } in
 *   PropertyValue to reference those values. Engine resolves by name — no bind map.
 * - 'preconditions' is a JSONLogic expression evaluated against runtime state before
 *   the action is offered or accepted. State paths: 'input.<id>', 'actor.property.<id>',
 *   'actor.inventory.<id>.count', 'game.property.<id>', 'game.inventory.<id>.count'.
 *   Cross-input constraints that are simpler string rules go in 'ActionInput.validation';
 *   state-dependent gate conditions go here.
 * - 'interrupt' names the subflows during which this action may be taken outside turn
 *   order. The flow module declares the interrupt window node; the action signals which
 *   subflows it is eligible for.
 * - 'reactive' declares that this action fires in response to a specific named effect.
 *   'timing: before' = negate opportunity: action fires before the triggering effect
 *   resolves; if taken, the original effect is cancelled (counter spells, blocks).
 *   'timing: after' = reaction: effect resolves normally, then this action fires to
 *   attenuate or counter secondary consequences (heal after taking damage).
 *   Games that use reactive actions should define the triggering effects as named effects
 *   in the effects module so they can be referenced here.
 * - 'effect-originator' input type: engine auto-populates this input with the
 *   player/entity that triggered the reactive effect. Inline effects can target it
 *   via { param: id } in PropertyValue — e.g., to strike back at the attacker.
 *
 * @example Full actions module (Liar's Dice excerpt)
 * ```yaml
 * actions:
 *   - id: make-bid
 *     label: Make Bid
 *     inputs:
 *       - id: quantity
 *         type: { kind: integer, min: 1, max: 30 }
 *         label: Quantity
 *         validation: Must be strictly higher than current bid, unless face-value also increases
 *       - id: face-value
 *         type: { kind: integer, min: 1, max: 6 }
 *         label: Face Value
 *     effects:
 *       - kind: update
 *         pieces: { inventory: current-bid, select: top }
 *         property: quantity
 *         value: { param: quantity }
 *       - kind: update
 *         pieces: { inventory: current-bid, select: top }
 *         property: face-value
 *         value: { param: face-value }
 *
 *   - id: draw-card
 *     label: Draw Card
 *     effects:
 *       - ref: draw-from-deck
 *     oncePerTurn: true
 *
 *   - id: discard-chosen
 *     label: Discard
 *     effects:
 *       - kind: move
 *         from: { inventory: player-hand, select: player-chooses, count: 1 }
 *         to: { inventory: discard-pile, at: top }
 *
 *   - id: resolve-battle
 *     label: Resolve Battle
 *     effects:
 *       - kind: prose
 *         description: >
 *           Compare power totals of all face-up cards in each player's combat zone.
 *           The player with the higher total wins the round and scores 1 point.
 *           On a tie, no points are scored and both players draw one card.
 * ```
 */

import { z } from "zod";
import { EffectCallsSchema } from "./effects.js";
import { JsonLogicSchema } from "./common.js";

// ---------------------------------------------------------------------------
// Action input (player-provided values collected when action is taken)
// ---------------------------------------------------------------------------

/**
 * @example
 * ```yaml
 * inputs:
 *   - id: quantity
 *     type: { kind: integer, min: 1, max: 30 }
 *     label: Quantity
 *     validation: Must be strictly higher than current bid quantity unless face-value also increases
 *   - id: face-value
 *     type: { kind: integer, min: 1, max: 6 }
 *     label: Face Value
 *   - id: target-player
 *     type: { kind: enum, values: [player1, player2, player3, player4] }
 *     label: Target Player
 *   - id: attacker
 *     type: { kind: effect-originator }
 *     label: Attacker
 *     # engine auto-populates; effects reference via { param: attacker }
 * ```
 */
export const ActionInputSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Unique identifier for this input within the action. " +
          "Inline effects in the same action reference it via { param: id } in PropertyValue.",
      ),
    type: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("integer"), min: z.number().int().optional(), max: z.number().int().optional() }),
        z.object({ kind: z.literal("float"), min: z.number().optional(), max: z.number().optional() }),
        z.object({ kind: z.literal("string") }),
        z.object({ kind: z.literal("boolean") }),
        z.object({ kind: z.literal("enum"), values: z.array(z.string()).min(2) }),
        z.object({ kind: z.literal("effect-originator") }),
      ])
      .describe(
        "Type and structural bounds for this input. The engine enforces these before " +
          "the action resolves. Cross-input constraints (e.g., quantity must beat current bid) " +
          "go in the 'validation' field. " +
          "'effect-originator': special type for reactive actions — engine auto-populates this " +
          "input with the player or entity that triggered the reactive effect. No player prompt " +
          "is shown; inline effects reference it via { param: id } to target the originator.",
      ),
    label: z
      .string()
      .optional()
      .describe("Human-readable label shown in the action UI prompt."),
    validation: z
      .string()
      .optional()
      .describe(
        "Prose constraint beyond the type's structural bounds. " +
          "Describe cross-input or cross-state rules (e.g., 'Must be strictly higher than " +
          "current bid quantity'). AI generates the validation code from this description.",
      ),
  })
  .describe(
    "A typed, player-supplied input collected when an action is taken. " +
      "Inline effects in the same action can reference these by id via { param: id } in PropertyValue.",
  );

// ---------------------------------------------------------------------------
// Action schema
// ---------------------------------------------------------------------------

/**
 * @example Draw a card once per turn (named-effect ref)
 * ```yaml
 * id: draw-card
 * label: Draw Card
 * effects:
 *   - ref: draw-from-deck
 * oncePerTurn: true
 * ```
 * @example Discard a chosen card (inline effect)
 * ```yaml
 * id: discard-chosen
 * label: Discard
 * effects:
 *   - kind: move
 *     from: { inventory: player-hand, select: player-chooses, count: 1 }
 *     to: { inventory: discard-pile, at: top }
 * ```
 * @example Liar's Dice bid — player inputs, inline { param } effects
 * ```yaml
 * id: make-bid
 * label: Make Bid
 * inputs:
 *   - id: quantity
 *     type: { kind: integer, min: 1, max: 30 }
 *     validation: Must exceed current bid quantity unless face-value also increases
 *   - id: face-value
 *     type: { kind: integer, min: 1, max: 6 }
 * effects:
 *   - kind: update
 *     pieces: { inventory: current-bid, select: top }
 *     property: quantity
 *     value: { param: quantity }
 *   - kind: update
 *     pieces: { inventory: current-bid, select: top }
 *     property: face-value
 *     value: { param: face-value }
 * ```
 * @example Complex resolution — prose effect as escape hatch
 * ```yaml
 * id: resolve-battle
 * label: Resolve Battle
 * effects:
 *   - kind: prose
 *     description: >
 *       Compare power totals of all face-up cards in each player's combat zone.
 *       Higher total wins and scores 1 point. On a tie no points scored; both draw.
 * ```
 * @example Reactive negate — block incoming damage before it resolves
 * ```yaml
 * id: block-damage
 * label: Block
 * interrupt: [response-window]
 * reactive:
 *   trigger: deal-damage      # named effect ID in effects module
 *   timing: before            # fires before the effect; if taken, effect is cancelled
 * inputs:
 *   - id: attacker
 *     type: { kind: effect-originator }  # engine auto-populates
 *     label: Attacker
 * effects:
 *   - kind: prose
 *     description: Cancel all incoming damage from the attacker this turn.
 * ```
 * @example Reactive reaction — heal after taking damage
 * ```yaml
 * id: resilience
 * label: Resilience
 * reactive:
 *   trigger: take-damage      # named effect ID in effects module
 *   timing: after             # fires after effect resolves
 * effects:
 *   - ref: heal-one-hp
 * ```
 * @example Precondition — can only challenge if a bid has been made
 * ```yaml
 * id: challenge
 * label: Challenge
 * preconditions: { "!=": [{ "var": "game.inventory.current-bid.count" }, 0] }
 * effects:
 *   - ref: resolve-challenge
 * ```
 * @example Precondition — can only buy if actor can afford it
 * ```yaml
 * id: buy-card
 * label: Buy Card
 * preconditions: { ">=": [{ "var": "actor.property.coins" }, 3] }
 * effects:
 *   - ref: purchase-card
 * ```
 */
export const ActionSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Unique identifier for this action. Referenced by flow phases and action slots.",
      ),
    label: z
      .string()
      .optional()
      .describe("Human-readable display name shown to the player. Omit if id is sufficient."),
    description: z
      .string()
      .optional()
      .describe("Human-readable description of what this action does. Shown in game UI."),
    oncePerTurn: z
      .boolean()
      .optional()
      .describe(
        "If true, a player may only take this action once per turn. " +
          "Engine tracks usage and prevents repeats within the same turn.",
      ),
    requiredRoles: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        "Role IDs that the acting player must hold at least one of to take this action. " +
          "Forward references to role IDs in the players module. " +
          "Any-of semantics: player qualifies if they hold at least one listed role. " +
          "Omit if any player may act regardless of role.",
      ),
    availableInSubflows: z
      .array(z.string())
      .optional()
      .describe(
        "Subflow IDs during which this action is available. Forward references to flow subflow IDs. " +
          "Prefer declaring availability in the flow module. Use this only when the action " +
          "spans many subflows and listing them all in flow would be excessively verbose. " +
          "Omit when availability is fully determined by slot definitions or flow declarations.",
      ),
    preconditions: JsonLogicSchema.optional().describe(
      "JSONLogic expression evaluated against runtime state before the action is offered or " +
        "accepted. If false, the action is unavailable regardless of flow context. " +
        "State paths: 'actor.property.<id>', 'actor.inventory.<id>.count', " +
        "'game.property.<id>', 'game.inventory.<id>.count'. " +
        "Cross-input validation rules (e.g., bid must exceed current bid) belong in " +
        "ActionInput.validation instead. Use preconditions for state-dependent gate conditions.",
    ),
    interrupt: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        "Subflow IDs during which this action may be taken outside turn order. " +
          "Forward references to flow subflow IDs. The flow module declares the interrupt " +
          "window node (timing, eligible players, timeout); this field signals which " +
          "subflows the action is eligible for. Omit if the action is never interrupt-eligible.",
      ),
    reactive: z
      .object({
        trigger: z
          .string()
          .describe(
            "Named effect ID that triggers this action. Forward reference to the effects module. " +
              "The referenced effect should be defined as a named effect so it can be cited here. " +
              "When the engine executes that named effect anywhere in the game, it opens a " +
              "reactive response window for eligible players.",
          ),
        timing: z
          .enum(["before", "after"])
          .describe(
            "'before': negate opportunity — this action fires before the triggering effect " +
              "resolves. If the player takes it, the original effect is cancelled entirely. " +
              "Use for counters, blocks, and interrupt-cancels. " +
              "'after': reaction — the triggering effect resolves normally, then this action " +
              "fires. Use for attenuation, healing, or secondary responses.",
          ),
      })
      .optional()
      .describe(
        "Declares this action as a reactive response to a specific named effect. " +
          "The engine opens a response window when the trigger effect is about to fire " +
          "(timing: before) or has just fired (timing: after). " +
          "Games using reactive actions should define triggering effects as named effects " +
          "in the effects module so they can be referenced here.",
      ),
    inputs: z
      .array(ActionInputSchema)
      .optional()
      .describe(
        "Typed values the player supplies when taking this action. " +
          "Inline effects in this action can reference them via { param: id } in PropertyValue. " +
          "Omit for actions that require no player input beyond choosing to act.",
      ),
    effects: EffectCallsSchema.describe(
      "Ordered list of effect calls to execute when this action resolves. " +
        "Each entry is a named-effect reference ({ ref }) or an inline effect ({ kind, ... }).",
    ),
  })
  .describe(
    "A named, player-initiatable game operation. The action declares what the player does; " +
      "the effects list declares how the game state changes. " +
      "Referenced by flow phases (which actions are available) and gamepiece action slots.",
  );

export const ActionsModuleSchema = z
  .object({
    actions: z
      .array(ActionSchema)
      .min(1)
      .describe(
        "All named actions in this game. Each action is a reusable, named player operation. " +
          "Flow phases reference actions by their id to declare what players may do.",
      ),
  })
  .describe(
    "The actions module — a named library of all player-initiatable operations. " +
      "Depends on effects (effect IDs) and gamepiece-types (conversion type IDs). " +
      "Referenced by flow (phase availability) and the catalog (action slot assignments).",
  );

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionInput = z.infer<typeof ActionInputSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ActionsModule = z.infer<typeof ActionsModuleSchema>;
