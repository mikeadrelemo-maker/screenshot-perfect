import serif from "@/assets/LiberationSerif-Regular.ttf.asset.json";
import serifBold from "@/assets/LiberationSerif-Bold.ttf.asset.json";
import sans from "@/assets/DejaVuSans.ttf.asset.json";
import sansBold from "@/assets/DejaVuSans-Bold.ttf.asset.json";

export type InvoiceFontFamily =
  | "Arial"
  | "Helvetica"
  | "Times New Roman"
  | "Georgia"
  | "Verdana"
  | "Tahoma"
  | "Courier New"
  | "Liberation Serif"
  | "DejaVu Sans";

export interface FontFamilyOption {
  id: InvoiceFontFamily;
  label: string;
  category: "sans-serif" | "serif" | "monospace";
  css: string;
}

export const FONT_FAMILY_OPTIONS: FontFamilyOption[] = [
  { id: "Arial", label: "Arial", category: "sans-serif", css: "Arial, Helvetica, sans-serif" },
  { id: "Helvetica", label: "Helvetica", category: "sans-serif", css: "Helvetica, Arial, sans-serif" },
  {
    id: "Times New Roman",
    label: "Times New Roman",
    category: "serif",
    css: '"Times New Roman", Times, "Liberation Serif", serif',
  },
  { id: "Georgia", label: "Georgia", category: "serif", css: 'Georgia, "Times New Roman", serif' },
  { id: "Verdana", label: "Verdana", category: "sans-serif", css: "Verdana, Geneva, sans-serif" },
  { id: "Tahoma", label: "Tahoma", category: "sans-serif", css: "Tahoma, Verdana, sans-serif" },
  { id: "Courier New", label: "Courier New", category: "monospace", css: '"Courier New", Courier, monospace' },
  {
    id: "Liberation Serif",
    label: "Liberation Serif",
    category: "serif",
    css: '"Liberation Serif", "Times New Roman", serif',
  },
  { id: "DejaVu Sans", label: "DejaVu Sans", category: "sans-serif", css: '"DejaVu Sans", Arial, sans-serif' },
];

export function getCssFontFamily(family?: string): string {
  const match = FONT_FAMILY_OPTIONS.find((f) => f.id === family);
  return match ? match.css : '"Liberation Serif", "Times New Roman", serif';
}

const assets: Record<string, [typeof serif, typeof serifBold]> = {
  "Liberation Serif": [serif, serifBold],
  "DejaVu Sans": [sans, sansBold],
};

const cache = new Map<string, Promise<ArrayBuffer>>();

export function loadInvoiceFont(family: InvoiceFontFamily, bold = false): Promise<ArrayBuffer> {
  const assetPair = assets[family] || assets["Liberation Serif"];
  const asset = assetPair[bold ? 1 : 0];
  if (!asset) throw new Error(`Unknown invoice font: ${family}`);
  const localUrl = `${import.meta.env.BASE_URL}fonts/${asset.original_filename}`;
  const cached = cache.get(localUrl);
  if (cached) return cached;
  const pending = (async () => {
    for (const url of [localUrl, asset.url]) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const bytes = await response.arrayBuffer();
        const signature = new DataView(bytes).getUint32(0);
        if (signature === 0x00010000 || signature === 0x4f54544f) return bytes;
      } catch {
        /* Try the deployment-independent asset copy. */
      }
    }
    throw new Error(
      `Could not load ${family}${bold ? " Bold" : ""}. Check the font assets and retry.`,
    );
  })();
  cache.set(localUrl, pending);
  void pending.catch(() => cache.delete(localUrl));
  return pending;
}

export async function registerCanvasFonts(): Promise<void> {
  await Promise.all(
    (Object.keys(assets) as (keyof typeof assets)[]).flatMap((family) =>
      [false, true].map(async (bold) => {
        try {
          const face = new FontFace(family, await loadInvoiceFont(family as InvoiceFontFamily, bold), {
            weight: bold ? "700" : "400",
          });
          document.fonts.add(await face.load());
        } catch {
          // ignore font loading fallback in environments without DOM FontFace
        }
      }),
    ),
  );
}
