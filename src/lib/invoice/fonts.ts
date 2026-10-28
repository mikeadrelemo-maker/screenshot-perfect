import serif from "@/assets/LiberationSerif-Regular.ttf.asset.json";
import serifBold from "@/assets/LiberationSerif-Bold.ttf.asset.json";
import sans from "@/assets/DejaVuSans.ttf.asset.json";
import sansBold from "@/assets/DejaVuSans-Bold.ttf.asset.json";

export type InvoiceFontFamily = "Liberation Serif" | "DejaVu Sans";
const assets = { "Liberation Serif": [serif, serifBold], "DejaVu Sans": [sans, sansBold] };
const cache = new Map<string, Promise<ArrayBuffer>>();

export function loadInvoiceFont(family: InvoiceFontFamily, bold = false): Promise<ArrayBuffer> {
  const asset = assets[family][bold ? 1 : 0];
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
    (Object.keys(assets) as InvoiceFontFamily[]).flatMap((family) =>
      [false, true].map(async (bold) => {
        const face = new FontFace(family, await loadInvoiceFont(family, bold), {
          weight: bold ? "700" : "400",
        });
        document.fonts.add(await face.load());
      }),
    ),
  );
}
