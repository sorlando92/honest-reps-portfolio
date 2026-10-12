// ESLint rule enforcing the copy rules in docs/DESIGN_SYSTEM.md and CLAUDE.md
// rules 7 and 10 on user facing strings:
//   - no em or en dashes (hyphens inside words are fine)
//   - no emojis
//   - no exclamation points
//   - no protected titles: dietitian, nutritionist, L.D., L.D.N.
// Legal documents and locked AI prompts are exempt from the title check
// through the eslint config, not here.

const EM_EN_DASH = /[–—]/
const EMOJI = /\p{Extended_Pictographic}/u
const EXCLAMATION = /!/
const PROTECTED_TITLE = /\b(dietitians?|nutritionists?)\b|\bL\.D\.(N\.?)?/i

// Attributes and calls whose strings are styling or code, not copy.
const NON_COPY_ATTRIBUTES = new Set(["className", "href", "src", "id", "htmlFor", "pattern", "type", "name", "autoComplete", "inputMode", "rel", "target", "role", "key"])
const NON_COPY_CALLEES = new Set(["cn", "cva", "clsx", "twMerge", "require", "import"])

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Enforce Honest Reps copy rules on user facing strings" },
    schema: [
      {
        type: "object",
        properties: { allowProtectedTitles: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      dash: "Copy rule: no em or en dashes in user facing copy.",
      emoji: "Copy rule: no emojis in user facing copy.",
      exclamation: "Copy rule: no exclamation points in user facing copy.",
      title: "Compliance: never use dietitian, nutritionist, L.D., or L.D.N. outside legal documents.",
    },
  },
  create(context) {
    const allowTitles = Boolean(context.options[0]?.allowProtectedTitles)

    function check(node, text) {
      if (!text) return
      if (EM_EN_DASH.test(text)) context.report({ node, messageId: "dash" })
      if (EMOJI.test(text)) context.report({ node, messageId: "emoji" })
      if (EXCLAMATION.test(text)) context.report({ node, messageId: "exclamation" })
      if (!allowTitles && PROTECTED_TITLE.test(text)) context.report({ node, messageId: "title" })
    }

    function isNonCopy(node) {
      for (let p = node.parent; p; p = p.parent) {
        if (p.type === "JSXAttribute") {
          const name = p.name.type === "JSXIdentifier" ? p.name.name : ""
          return NON_COPY_ATTRIBUTES.has(name) || name.startsWith("data-")
        }
        if (p.type === "CallExpression" && p.callee.type === "Identifier" && NON_COPY_CALLEES.has(p.callee.name)) {
          return true
        }
        if (p.type === "ImportDeclaration" || p.type === "ExportNamedDeclaration" || p.type === "ExportAllDeclaration") {
          return p.source != null
        }
        // Keys of objects and comparison operands are code.
        if (p.type === "Property" && p.key === node) return true
        if (p.type === "BinaryExpression") return true
      }
      return false
    }

    return {
      JSXText(node) {
        check(node, node.value)
      },
      Literal(node) {
        if (typeof node.value !== "string" || isNonCopy(node)) return
        check(node, node.value)
      },
      TemplateElement(node) {
        if (isNonCopy(node)) return
        check(node, node.value.cooked ?? node.value.raw)
      },
    }
  },
}

const plugin = {
  meta: { name: "honest-reps-copy" },
  rules: { "copy-rules": rule },
}

export default plugin
