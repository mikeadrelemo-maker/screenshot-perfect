import { createFileRoute } from "@tanstack/react-router";
import { InvoiceLayoutEditor } from "@/components/invoice/editor/InvoiceLayoutEditor";

export const Route = createFileRoute("/editor")({
  validateSearch: (s: Record<string, unknown>): { type?: "charge" | "cash" } => ({
    type: s["type"] === "cash" ? "cash" : "charge",
  }),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Invoice Print Layout Editor — SOS Invoice Template Converter" },
      {
        name: "description",
        content:
          "Customize print and PDF layouts for Charge and Cash invoices with drag-and-drop field positioning.",
      },
      { property: "og:title", content: "SOS Invoice Print Layout Editor" },
      {
        property: "og:description",
        content: "Customize and save Charge and Cash invoice print layouts in this browser.",
      },
      {
        name: "author",
        content: "Adrian Llano",
      },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  const { type } = Route.useSearch();
  return <InvoiceLayoutEditor initialType={type || "charge"} />;
}
