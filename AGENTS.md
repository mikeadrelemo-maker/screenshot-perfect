<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Invoice PDFs use pdf-lib with embedded fonts and text-only Letter pages; the scanned template is an editor-only guide, and the preview shows the exact downloadable PDF — why: printed artwork and editor controls must never appear in output.
- Invoice money math goes through src/lib/invoice/calc.ts (decimal.js, VAT unit price rounded to centavos before × qty) — why: matches the user's mandatory test values; covered by calc.test.ts.
- Invoice history is in localStorage until Lovable Cloud is enabled — why: spec requires the app to work without a backend and say so.

- Invoice fonts load from BASE_URL-aware local public files first, with asset-pointer fallback and font signature validation — why: GitHub Pages subpaths and Lovable root deployments must both work.
- Layout changes use validated per-template browser storage and edit-triggered debounced saving after hydration — why: initialization must not overwrite saved layouts.
