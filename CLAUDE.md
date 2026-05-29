# CLAUDE.md — fivecorners.integratorstoolbox

Chrome/Edge Extension (MV3) — toolbox of integrator tools for Bitrix24. Current tool: syntax highlighting for the Bitrix24 BP Designer.

**No build step** — pure JS/CSS loaded directly via manifest. Load unpacked in Chrome/Edge from the project directory.

## Architecture

- `content.js` — main content script: tokenizer, overlay attachment, DOM scanning
- `styles.css` — only `.bp-syntax-*` CSS classes (no other styling)
- `options.js` — portal domain management, `chrome.scripting` API for self-hosted portals
- `popup.js` — quick site enable/disable

Two rendering paths (both in `content.js`):
1. **`attachHighlightToTextarea()`** — replaces `textarea` with a wrapper containing a contenteditable div (for highlighting) + hidden textarea (for form value)
2. **`attachHighlightToContentEditable()`** — adds a `pre/code` highlight layer beneath the existing contenteditable; text is made transparent

**Token priority order** (left-to-right in `tokenize()`):
`"string"` → `'string'` → `{{` / `}}` / `{=` / `{` / `}` → `()` → `[]` → `,` → `:` → keywords (`Document`, `Template`) → plain text

Grammar and architecture details: `docs/grammar-and-architecture.md`
