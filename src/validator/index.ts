/**
 * ChainCraft GameDef Validator
 *
 * Runs a suite of validation passes over a complete ModularGameSpec:
 *
 *   1. Schema validation — each module parsed through its Zod schema
 *   2. Reference validation — cross-module forward references exist
 *
 * Usage:
 *   import { validate } from "@chaincraft/gamedef/validator";
 *   const result = validate(rawSpec);
 *   if (!result.valid) console.error(result.errors);
 */

import { ModularGameSpecSchema } from "#gamedef/index.js";
import type { ModularGameSpec } from "#gamedef/index.js";
import { validateReferences } from "./reference-validator.js";

export interface ValidationError {
  /** Dot-path to the field that failed, e.g. "actions.actions[0].effects[1]" */
  path: string;
  /** Human-readable description of the failure */
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** The parsed + coerced spec if schema validation passed, undefined otherwise */
  spec?: ModularGameSpec;
}

/**
 * Validate a raw (unknown) game spec object against the full modular spec schema
 * and all cross-module reference rules.
 *
 * @param raw - The raw object to validate (parsed from JSON/YAML, AI output, etc.)
 */
export function validate(raw: unknown): ValidationResult {
  // --- Pass 1: Schema validation ---
  const parsed = ModularGameSpecSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: ValidationError[] = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return { valid: false, errors };
  }

  // --- Pass 2: Cross-module reference validation ---
  const refErrors = validateReferences(parsed.data);
  if (refErrors.length > 0) {
    return { valid: false, errors: refErrors };
  }

  return { valid: true, errors: [], spec: parsed.data };
}
