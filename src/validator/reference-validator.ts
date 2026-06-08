/**
 * Cross-module reference validator.
 *
 * Checks that forward references in one module resolve to declared IDs in another.
 * These are the constraints Zod schema validation alone cannot enforce.
 *
 * Current rule set:
 *   - actions.ts: effect refs must resolve to an ID in effects.ts
 *   - flow.ts: action refs in availableActions must resolve to an ID in actions.ts
 *   - mechanics: charges.action must resolve to an ID in actions.ts
 *   - mechanics: score-track.scoringProperty is a forward ref to players (soft check only)
 *   - mechanics: trump.evaluationInventory must resolve to an ID in inventories.ts
 *   - catalog: entries with typeId must resolve to an ID in gamepiece-types.ts
 */

import type { ModularGameSpec } from "#gamedef/index.js";
import type { ValidationError } from "./index.js";

export function validateReferences(spec: ModularGameSpec): ValidationError[] {
  const errors: ValidationError[] = [];

  // Build ID sets for each module
  const effectIds = new Set(spec.effects?.effects?.map((e) => e.id) ?? []);
  const actionIds = new Set(spec.actions?.actions?.map((a) => a.id) ?? []);
  const inventoryIds = new Set(spec.inventories?.types?.map((i) => i.id) ?? []);
  const gamepieceTypeIds = new Set(
    spec.gamepieceTypes?.types?.map((t) => t.id).filter(Boolean) as string[],
  );

  // --- actions: effect call refs must exist in effects ---
  spec.actions?.actions?.forEach((action, ai) => {
    action.effects?.forEach((call, ci) => {
      if ("ref" in call && call.ref) {
        if (!effectIds.has(call.ref)) {
          errors.push({
            path: `actions.actions[${ai}].effects[${ci}].ref`,
            message: `Effect ref "${call.ref}" not found in effects module`,
          });
        }
      }
    });
  });

  // --- flow: availableActions refs must exist in actions ---
  function checkFlowNode(node: unknown, path: string): void {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (Array.isArray(n["availableActions"])) {
      (n["availableActions"] as string[]).forEach((id, i) => {
        if (!actionIds.has(id)) {
          errors.push({
            path: `${path}.availableActions[${i}]`,
            message: `Action ref "${id}" not found in actions module`,
          });
        }
      });
    }

    // Recurse into known child node fields
    for (const key of ["body", "turns", "nodes", "children"]) {
      const child = n[key];
      if (Array.isArray(child)) {
        child.forEach((c, i) => checkFlowNode(c, `${path}.${key}[${i}]`));
      } else if (child) {
        checkFlowNode(child, `${path}.${key}`);
      }
    }
  }

  if (spec.flow?.root) {
    checkFlowNode(spec.flow.root, "flow.root");
  }

  // --- mechanics: cross-module refs ---
  spec.mechanics?.forEach((mechanic, mi) => {
    if (mechanic.kind === "chaincraft:trump") {
      if (!inventoryIds.has(mechanic.evaluationInventory)) {
        errors.push({
          path: `mechanics[${mi}].evaluationInventory`,
          message: `Inventory "${mechanic.evaluationInventory}" not found in inventories module`,
        });
      }
    }
  });

  // --- gamepiece-types: piece-level mechanic refs ---
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
    });
  });

  // --- catalog: typeId refs must exist in gamepiece-types ---
  spec.catalog?.entries?.forEach((entry, ei) => {
    if (entry.typeId && !gamepieceTypeIds.has(entry.typeId)) {
      errors.push({
        path: `catalog.entries[${ei}].typeId`,
        message: `Gamepiece type "${entry.typeId}" not found in gamepieceTypes module`,
      });
    }
  });

  return errors;
}
