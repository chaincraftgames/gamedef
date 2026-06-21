/**
 * ResolveRefsValidator — Pass 1: Cross-module reference resolution.
 *
 * Checks that every forward reference in one module resolves to a declared ID
 * in the module it points at. All checks are symmetric with the dependency
 * ordering in index.ts: consumers reference producers, never the other way.
 *
 * Rules:
 *   - actions[*].effects[*].ref        → must exist in effects.effects[*].id
 *   - mechanics[*] (trump).evaluationInventory → must exist in inventories.types[*].id
 *   - gamepieceTypes[*].mechanics[*] (charges).action → must exist in actions.actions[*].id
 *   - gamepieceTypes[*].mechanics[*].availableInSubflows[*] → must exist as a flow node ID
 *   - catalog.entries[*].typeId        → must exist in gamepieceTypes.types[*].id
 */

import type { ModularGameSpec } from "#gamedef/index.js";
import type { SpecValidator, ValidationError } from "../types.js";

/** Recursively collect all `id` strings from a flow node tree. */
function collectFlowNodeIds(node: unknown, ids: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  if (typeof n["id"] === "string") ids.add(n["id"]);
  for (const key of ["body", "turns", "nodes", "children"]) {
    const child = n[key];
    if (Array.isArray(child)) child.forEach((c) => collectFlowNodeIds(c, ids));
    else if (child && typeof child === "object") collectFlowNodeIds(child, ids);
  }
}

export class ResolveRefsValidator implements SpecValidator {
  readonly name = "ResolveRefs";

  validate(spec: ModularGameSpec): ValidationError[] {
    const errors: ValidationError[] = [];

    const effectIds = new Set(spec.effects?.effects?.map((e) => e.id) ?? []);
    const actionIds = new Set(spec.actions?.actions?.map((a) => a.id) ?? []);
    const inventoryIds = new Set(spec.inventories?.types?.map((i) => i.id) ?? []);
    const gamepieceTypeIds = new Set(
      (spec.gamepieceTypes?.types?.map((t) => t.id).filter(Boolean) as string[]) ?? [],
    );

    const flowNodeIds = new Set<string>();
    if (spec.flow?.root) collectFlowNodeIds(spec.flow.root, flowNodeIds);

    // actions: effect call refs must exist in effects
    spec.actions?.actions?.forEach((action, ai) => {
      action.effects?.forEach((call, ci) => {
        if (typeof call === "object" && call !== null && "ref" in call && call.ref) {
          if (!effectIds.has(call.ref as string)) {
            errors.push({
              path: `actions.actions[${ai}].effects[${ci}].ref`,
              message: `Effect ref "${call.ref}" not found in effects module`,
            });
          }
        }
      });
    });

    // mechanics: trump.evaluationInventory must exist in inventories
    spec.mechanics?.forEach((mechanic, mi) => {
      if (mechanic.kind === "chaincraft:trump") {
        if (!inventoryIds.has(mechanic.evaluationInventory)) {
          errors.push({
            path: `mechanics[${mi}].evaluationInventory`,
            message: `Inventory "${mechanic.evaluationInventory}" not found in inventories module`,
          });
        }
        if (!mechanic.winnerToState && !mechanic.winningPieceToState) {
          errors.push({
            path: `mechanics[${mi}]`,
            message:
              "chaincraft:trump requires at least one of 'winnerToState' or 'winningPieceToState'",
          });
        }
      }
    });

    // gamepieceTypes: piece-level mechanic action refs and availableInSubflows refs
    spec.gamepieceTypes?.types?.forEach((type, ti) => {
      (type.mechanics as unknown[] | undefined)?.forEach((mechanic, mi) => {
        if (!mechanic || typeof mechanic !== "object") return;
        const m = mechanic as Record<string, unknown>;

        if (m["kind"] === "chaincraft:charges") {
          const actionId = m["action"] as string | undefined;
          if (actionId && !actionIds.has(actionId)) {
            errors.push({
              path: `gamepieceTypes.types[${ti}].mechanics[${mi}].action`,
              message: `Action ref "${actionId}" not found in actions module`,
            });
          }
        }

        const subflows = m["availableInSubflows"] as string[] | undefined;
        subflows?.forEach((nodeId, si) => {
          if (!flowNodeIds.has(nodeId)) {
            errors.push({
              path: `gamepieceTypes.types[${ti}].mechanics[${mi}].availableInSubflows[${si}]`,
              message: `Flow node ID "${nodeId}" not found in flow tree`,
            });
          }
        });
      });
    });

    // catalog: typeId refs must exist in gamepieceTypes
    // catalog: actionBindings keys must match actionSlots on the type, string values must exist in actions
    // catalog: passiveBindings keys must match passiveSlots on the type, string values must exist in effects.passives
    const passiveIds = new Set(spec.effects?.passives?.map((p) => p.id) ?? []);
    const typeMap = new Map(
      spec.gamepieceTypes?.types?.map((t) => [t.id, t]) ?? [],
    );

    spec.catalog?.entries?.forEach((entry, ei) => {
      if (entry.typeId && !gamepieceTypeIds.has(entry.typeId)) {
        errors.push({
          path: `catalog.entries[${ei}].typeId`,
          message: `Gamepiece type "${entry.typeId}" not found in gamepieceTypes module`,
        });
      }

      const pieceType = entry.typeId ? typeMap.get(entry.typeId) : undefined;
      const actionSlotIds = new Set(
        (pieceType as Record<string, unknown> | undefined)?.actionSlots
          ? ((pieceType as Record<string, unknown>).actionSlots as Array<{ id: string }>).map((s) => s.id)
          : [],
      );
      const passiveSlotIds = new Set(
        (pieceType as Record<string, unknown> | undefined)?.passiveSlots
          ? ((pieceType as Record<string, unknown>).passiveSlots as Array<{ id: string }>).map((s) => s.id)
          : [],
      );

      if (entry.actionBindings) {
        for (const [slotId, value] of Object.entries(entry.actionBindings)) {
          if (actionSlotIds.size > 0 && !actionSlotIds.has(slotId)) {
            errors.push({
              path: `catalog.entries[${ei}].actionBindings.${slotId}`,
              message: `Action slot "${slotId}" not found on gamepiece type "${entry.typeId}"`,
            });
          }
          if (typeof value === "string" && !actionIds.has(value)) {
            errors.push({
              path: `catalog.entries[${ei}].actionBindings.${slotId}`,
              message: `Action "${value}" not found in actions module`,
            });
          }
        }
      }

      if (entry.passiveBindings) {
        for (const [slotId, value] of Object.entries(entry.passiveBindings)) {
          if (passiveSlotIds.size > 0 && !passiveSlotIds.has(slotId)) {
            errors.push({
              path: `catalog.entries[${ei}].passiveBindings.${slotId}`,
              message: `Passive slot "${slotId}" not found on gamepiece type "${entry.typeId}"`,
            });
          }
          if (typeof value === "string" && !passiveIds.has(value)) {
            errors.push({
              path: `catalog.entries[${ei}].passiveBindings.${slotId}`,
              message: `Passive "${value}" not found in effects.passives`,
            });
          }
        }
      }
    });

    return errors;
  }
}
