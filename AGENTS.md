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

- Invoice PDFs are built with pdf-lib: the scanned form JPEG (public/templates) is the page background and data is drawn as text at measured coordinates in src/lib/invoice/render.ts — why: preserves the original form exactly; the preview iframe shows that same PDF.
- Invoice money math goes through src/lib/invoice/calc.ts (decimal.js, VAT unit price rounded to centavos before × qty) — why: matches the user's mandatory test values; covered by calc.test.ts.
- Invoice history is in localStorage until Lovable Cloud is enabled — why: spec requires the app to work without a backend and say so.
