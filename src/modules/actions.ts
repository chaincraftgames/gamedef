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
 *   'timing: before' = fires before the triggering effect resolves. Use 'cancel-effect'
   *   to void it entirely, 'adjust' to modify its numeric value, or neither to let it
 *   proceed after the reaction completes.
 *   'timing: after' = reaction: effect resolves normally, then this action fires to
 *   counter-attack, heal, or apply secondary consequences.
 *   Games that use reactive actions should define the triggering effects as named effects
 *   in the effects module so they can be referenced here.
 * - 'effect-originator' input type: engine auto-populates this input with the player ID
 *   of the player who executed the triggering action. Inline effects can target it
 *   via { param: id } in PropertyValue — e.g., to strike back at the attacker.
 * - 'trigger-input' input type: engine auto-populates this input with the resolved value
 *   of a specific input from the triggering action. Use to access the gamepiece or player
 *   that the triggering player selected — e.g., damage the creature that attacked you.
 *
 * @example Full actions module (Liar's Dice excerpt)
 * ```yaml
 * actions:
 *   - id: make-bid
 *     label: Make Bid
 *     inputs:
 *       - id: quantity
 *         type: { kind: number, min: 1, max: 30 }
 *         label: Quantity
 *         validation: Must be strictly higher than current bid, unless face-value also increases
 *       - id: face-value
 *         type: { kind: number, min: 1, max: 6 }
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
 *     inputs:
 *       - id: card
 *         type: { kind: gamepiece-select, inventory: player-hand }
 *         label: Choose card to discard
 *     effects:
 *       - kind: move
 *         from: { inventory: player-hand, select: { id: { param: card } } }
 *         to: { inventory: discard-pile, at: { kind: stack-top } }
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
 *     type: { kind: number, min: 1, max: 30 }
 *     label: Quantity
 *     validation: Must be strictly higher than current bid, unless face-value also increases
 *   - id: face-value
 *     type: { kind: number, min: 1, max: 6 }
 *     label: Face Value
 *   - id: target-player
 *     type: { kind: enum, values: [player1, player2, player3, player4] }
 *     label: Target Player
 *   - id: attacker
 *     type: { kind: effect-originator }
 *     label: Attacker
 *     # engine auto-populates; effects reference via { param: attacker }
 *   - id: chosen-card
 *     type: { kind: gamepiece-select, inventory: player-hand }
 *     label: Choose Card to Play
 *   - id: target-creature
 *     type: { kind: gamepiece-select, inventory: battlefield, ofType: creature, fromPlayer: { param: target-player } }
 *     label: Choose Creature to Attack
 *   - id: opponent
 *     type: { kind: player-select, excludeSelf: true }
 *     label: Choose Opponent
 *   - id: target-cell
 *     type: { kind: inventory-position, inventory: battle-grid }
 *     label: Choose Placement
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
        z.object({ kind: z.literal("number"), min: z.number().optional(), max: z.number().optional(), integer: z.boolean().optional().describe("If true, only whole numbers are accepted. Defaults to true.") }),
        z.object({ kind: z.literal("string") }),
        z.object({ kind: z.literal("boolean") }),
        z.object({ kind: z.literal("enum"), values: z.array(z.string()).min(2) }),
        z.object({ kind: z.literal("effect-originator") }).describe(
          "Engine auto-populates with the player ID of the player who executed the action " +
            "that triggered this reactive window. Only valid in reactive actions.",
        ),
        z.object({
          kind: z.literal("trigger-input"),
          inputId: z.string().describe(
            "Input ID from the triggering action whose resolved value to inject. " +
              "Forward reference to an input declared on the action that caused the trigger effect.",
          ),
        }).describe(
          "Engine auto-populates with the resolved value of a specific input from the " +
            "triggering action. Use to access the gamepiece, player, or other value that " +
            "the triggering player selected. Only valid in reactive actions.",
        ),
        z.object({
          kind: z.literal("gamepiece-select"),
          inventory: z.string().describe(
            "Inventory type ID to select from. Forward reference to inventories module.",
          ),
          ofType: z.string().optional().describe(
            "Restrict selection to pieces of this gamepiece type ID.",
          ),
          count: z.number().int().min(1).optional().describe(
            "How many pieces the player must select. Defaults to 1.",
          ),
          fromPlayer: z
            .union([
              z.literal("self").describe("Acting player's own inventory instance (default)."),
              z.object({ param: z.string() }).describe(
                "Player identified by a prior player-select input. " +
                  "References the input id of a player-select input declared earlier in the inputs array.",
              ),
            ])
            .optional()
            .describe(
              "Whose inventory instance to select from. Only relevant for player-scoped inventories. " +
                "Defaults to 'self'. Use { param: inputId } to select from another player's inventory " +
                "based on a prior player-select input.",
            ),
          filter: JsonLogicSchema.optional().describe(
            "Additional JsonLogic filter on eligible pieces. " +
              "Evaluated per-piece with vars: 'piece.property.<id>', 'piece.typeId'. " +
              "Runtime computes valid options and sends them to UX.",
          ),
        }).describe(
          "Player selects one or more gamepieces from an inventory. " +
            "Runtime computes valid piece IDs based on constraints and sends them to UX. " +
            "Resolves to piece ID (or array of IDs if count > 1).",
        ),
        z.object({
          kind: z.literal("player-select"),
          excludeSelf: z.boolean().optional().describe(
            "If true, the acting player cannot select themselves. Defaults to false.",
          ),
          filter: JsonLogicSchema.optional().describe(
            "Additional JsonLogic filter on eligible players. " +
              "Evaluated per-player with vars: 'player.property.<id>', 'player.inventory.<id>.count'. " +
              "Runtime computes valid options and sends them to UX.",
          ),
        }).describe(
          "Player selects another player. Runtime computes valid player IDs " +
            "based on constraints and sends them to UX. Resolves to player ID.",
        ),
        z.object({
          kind: z.literal("inventory-position"),
          inventory: z.string().describe(
            "Inventory type ID to select a position within. " +
              "Forward reference to inventories module.",
          ),
          fromPlayer: z
            .union([
              z.literal("self").describe("Acting player's own inventory instance (default)."),
              z.object({ param: z.string() }).describe(
                "Player identified by a prior player-select input.",
              ),
            ])
            .optional()
            .describe(
              "Whose inventory instance to select a position from. " +
                "Only relevant for player-scoped inventories. Defaults to 'self'.",
            ),
        }).describe(
          "Player selects a position within an inventory (grid cell, line index, graph node). " +
            "Runtime computes valid positions and sends them to UX. " +
            "Resolves to an InventoryPlacement descriptor.",
        ),
      ])
      .describe(
        "Type and structural bounds for this input. The engine enforces these before " +
          "the action resolves. Inputs are collected sequentially — later inputs can " +
          "depend on earlier ones via { param: inputId } references. " +
          "Runtime computes valid options for selection inputs and sends them to UX. " +
          "'effect-originator': engine auto-populates with the triggering player ID (reactive only). " +
          "'trigger-input': engine auto-populates with a resolved input from the triggering action (reactive only).",
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
 * @example Discard a chosen card (gamepiece-select input)
 * ```yaml
 * id: discard-chosen
 * label: Discard
 * inputs:
 *   - id: card
 *     type: { kind: gamepiece-select, inventory: player-hand }
 *     label: Choose card to discard
 * effects:
 *   - kind: move
 *     from: { inventory: player-hand, select: { id: { param: card } } }
 *     to: { inventory: discard-pile, at: { kind: stack-top } }
 * ```
 * @example Place a piece on a grid (two inputs: piece + position)
 * ```yaml
 * id: deploy-unit
 * label: Deploy Unit
 * inputs:
 *   - id: unit
 *     type: { kind: gamepiece-select, inventory: reserves, ofType: soldier }
 *     label: Choose unit to deploy
 *   - id: cell
 *     type: { kind: inventory-position, inventory: battle-grid }
 *     label: Choose deployment position
 * effects:
 *   - kind: move
 *     from: { inventory: reserves, select: { id: { param: unit } } }
 *     to: { inventory: battle-grid, at: { param: cell } }
 * ```
 * @example Steal from opponent (two inputs: player + piece)
 * ```yaml
 * id: steal-card
 * label: Steal Card
 * inputs:
 *   - id: target
 *     type: { kind: player-select, excludeSelf: true }
 *     label: Choose opponent
 *   - id: card
 *     type: { kind: gamepiece-select, inventory: player-hand, fromPlayer: { param: target } }
 *     label: Choose card to steal
 * effects:
 *   - kind: move
 *     from: { player: { param: target }, inventory: player-hand, select: { id: { param: card } } }
 *     to: { inventory: player-hand }
 * ```
 * @example Liar's Dice bid — player inputs, inline { param } effects
 * ```yaml
 * id: make-bid
 * label: Make Bid
 * inputs:
 *   - id: quantity
 *     type: { kind: number, min: 1, max: 30 }
 *     validation: Must exceed current bid quantity unless face-value also increases
 *   - id: face-value
 *     type: { kind: number, min: 1, max: 6 }
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
 * @example Reactive negate — cancel incoming damage before it resolves
 * ```yaml
 * id: block-damage
 * label: Block
 * interrupt: [response-window]
 * reactive:
 *   trigger: deal-damage      # named effect ID in effects module
 *   timing: before            # fires before the effect resolves
 * inputs:
 *   - id: attacker
 *     type: { kind: effect-originator }  # engine auto-populates with triggering player
 *     label: Attacker
 * effects:
 *   - kind: cancel-effect     # void the triggering effect entirely
 * ```
 * @example Reactive adjust — reduce incoming damage by armor rating (var delta)
 * ```yaml
 * id: armor-absorb
 * label: Armor Absorb
 * reactive:
 *   trigger: deal-damage
 *   timing: before
 * effects:
 *   - kind: adjust
 *     adjustment: { delta: { var: "player.property.armorRating" } }
 * ```
 * @example Reactive adjust — halve incoming damage (literal mult)
 * ```yaml
 * id: shield-block
 * label: Shield Block
 * reactive:
 *   trigger: deal-damage
 *   timing: before
 * effects:
 *   - kind: adjust
 *     adjustment: { mult: 0.5 }
 * ```
 * @example Reactive counter-attack — damage the creature that attacked you
 * ```yaml
 * id: thorns
 * label: Thorns
 * reactive:
 *   trigger: deal-damage
 *   timing: after
 * inputs:
 *   - id: attacker
 *     type: { kind: effect-originator }
 *   - id: attacking-creature
 *     type: { kind: trigger-input, inputId: creature }  # piece from triggering action's "creature" input
 * effects:
 *   - kind: update
 *     pieces: { inventory: battlefield, select: { id: { param: attacking-creature } } }
 *     property: hp
 *     value: { delta: -2 }
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
            "'before': this action fires before the triggering effect resolves. " +
              "The reactive action's effects execute first — use 'cancel-effect' to void " +
              "the trigger entirely, 'adjust' to modify its numeric value, or neither " +
              "to let it proceed unchanged after the reaction completes. " +
              "'after': reaction — the triggering effect resolves normally, then this action " +
              "fires. Use for counter-attacks, healing, or secondary responses.",
          ),
      })
      .optional()
      .describe(
        "Declares this action as a reactive response to a specific named effect. " +
          "The engine opens a response window when the trigger effect is about to fire " +
          "(timing: before) or has just fired (timing: after). " +
          "The player CHOOSES whether to take this action — for automatic responses " +
          "that require no player choice, use passives on gamepiece types or roles instead. " +
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
