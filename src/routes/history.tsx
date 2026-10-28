import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { calcTotals, peso } from "@/lib/invoice/calc";
import { deleteInvoice, loadHistory } from "@/lib/invoice/history";
import type { InvoiceData } from "@/lib/invoice/types";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Invoice History — SOS Invoice Template Converter" },
      {
        name: "description",
        content: "Search, reopen and reprint saved Charge and Cash invoices.",
      },
      { property: "og:title", content: "Invoice History — SOS Invoice Template Converter" },
      {
        property: "og:description",
        content: "Search, reopen and reprint saved Charge and Cash invoices.",
      },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const [list, setList] = useState<InvoiceData[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => setList(loadHistory()), []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((i) => {
      const k = i.invoiceNumber.trim().toLowerCase();
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    });
    return m;
  }, [list]);

  const rows = list.filter((i) =>
    [i.invoiceNumber, i.customer, i.date, i.type, i.salesRep]
      .join(" ")
      .toLowerCase()
      .includes(q.toLowerCase()),
  );

  return (
    <main className="mx-auto max-w-[1500px] px-5 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Invoice history</h1>
          <p className="text-sm text-muted-foreground">
            Saved in this browser only — cloud storage is not configured.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number, customer, date…"
            className="pl-8"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-secondary-foreground">
            <tr>
              <th className="px-4 py-2.5">Invoice No.</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Customer</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5 text-right">Total sales</th>
              <th className="px-4 py-2.5 text-right">Amount due</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  {list.length ? "No invoices match your search." : "No saved invoices yet."}
                </td>
              </tr>
            )}
            {rows.map((i) => {
              const t = calcTotals(i.items, i.whtRate, i.whtRate2, i.whtEnabled, i.whtEnabled2);
              const isDup = (counts.get(i.invoiceNumber.trim().toLowerCase()) ?? 0) > 1;
              return (
                <tr key={i.id} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-2.5 font-medium">
                    {i.invoiceNumber || "—"}
                    {isDup && (
                      <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                        Duplicate
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{i.date}</td>
                  <td className="px-4 py-2.5">{i.customer}</td>
                  <td className="px-4 py-2.5">{i.type === "charge" ? "Charge" : "Cash"}</td>
                  <td className="num px-4 py-2.5 text-right">{peso(t.totalSales)}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">{peso(t.due)}</td>
                  <td className="px-4 py-2.5 capitalize">{i.status}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/" search={{ id: i.id }}>
                          Open / Print
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (!confirm(`Delete invoice ${i.invoiceNumber}?`)) return;
                          deleteInvoice(i.id);
                          setList(loadHistory());
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
