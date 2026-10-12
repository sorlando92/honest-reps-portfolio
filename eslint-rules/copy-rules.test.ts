import { RuleTester } from "eslint"
import { describe, it } from "vitest"
import tseslint from "typescript-eslint"
import plugin from "./copy-rules.mjs"

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

const rule = plugin.rules["copy-rules"]

tester.run("copy-rules", rule, {
  valid: [
    { code: `const a = <p>Check-in is open. Takes under a minute.</p>` },
    { code: `const a = <p>+120 over</p>` },
    { code: `const a = <p className="mt-2! text-text">Logged.</p>` },
    { code: `const a = cn("px-4!", "py-2")` },
    { code: `if (a !== "x") {}` },
    { code: `const a = <p>Use nutrition coach or coach.</p>` },
    {
      code: `const a = <p>Sean is not a dietitian licensed by the state.</p>`,
      options: [{ allowProtectedTitles: true }],
    },
  ],
  invalid: [
    { code: `const a = <p>Great job!</p>`, errors: [{ messageId: "exclamation" }] },
    { code: `const a = "Logged — nice"`, errors: [{ messageId: "dash" }] },
    { code: `const a = "Week 1 – 2"`, errors: [{ messageId: "dash" }] },
    { code: `const a = <p>Nice \u{1F525}</p>`, errors: [{ messageId: "emoji" }] },
    { code: `const a = <input placeholder="Hi!" />`, errors: [{ messageId: "exclamation" }] },
    { code: `const a = <p>Your dietitian says</p>`, errors: [{ messageId: "title" }] },
    { code: "const a = `Ask a Nutritionist`", errors: [{ messageId: "title" }] },
    { code: `const a = "Jane Doe, L.D.N."`, errors: [{ messageId: "title" }] },
  ],
})
