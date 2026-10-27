import { createFileRoute } from "@tanstack/react-router";
import { InvoiceLayoutEditor } from "@/components/invoice/editor/InvoiceLayoutEditor";

export const Route = createFileRoute("/editor")({
  validateSearch: (s: Record<string, unknown>): { type?: "charge" | "cash" } => ({
    type: s["type"] === "cash" ? "cash" : "charge",
  }),
  head: () => ({
    meta: [
      { title: "Invoice Print Layout Editor — SOS Invoice Template Converter" },
      {
        name: "description",
        content:
          "Customize print and PDF layouts for Charge and Cash invoices with drag-and-drop field positioning.",
      },
      { property: "og:title", content: "Invoice Print Layout Editor" },
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
