import { validate } from "#gamedef/validator/index.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test("liars-dice.json validates", () => {
  const raw = JSON.parse(
    readFileSync(join(__dirname, "../../examples/liars-dice.json"), "utf-8")
  );
  const result = validate(raw);
  if (!result.valid) {
    console.error("Validation errors:", JSON.stringify(result.errors, null, 2));
  }
  expect(result.valid).toBe(true);
});
