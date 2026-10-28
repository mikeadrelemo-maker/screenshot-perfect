import { Plus, Trash2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { calcLine, calcTotals, peso, toDec } from "@/lib/invoice/calc";
import { newId, type InvoiceData, type LineItem } from "@/lib/invoice/types";

type Props = { value: InvoiceData; onChange: (v: InvoiceData) => void };

function Field({
  label,
  value,
  onChange,
  flag,
  placeholder,
  className,
  optional,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  flag?: string | undefined;
  placeholder?: string;
  className?: string;
  optional?: boolean;
  hint?: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 flex items-center justify-between gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {label}
          {optional && <span className="text-[10px] text-muted-foreground/70">(Optional)</span>}
          {flag && (
            <span className="inline-flex items-center gap-0.5 rounded bg-warning-soft px-1 text-[10px] font-semibold text-warning-foreground">
              <AlertTriangle className="h-2.5 w-2.5" /> {flag}
            </span>
          )}
        </span>
        {hint}
      </span>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9", flag && "border-warning bg-warning-soft/60")}
      />
    </label>
  );
}

const cellInput =
  "h-8 w-full rounded border border-transparent bg-transparent px-1.5 text-sm outline-none focus:border-ring focus:bg-card";

export function InvoiceEditor({ value: inv, onChange }: Props) {
  const set = <K extends keyof InvoiceData>(k: K, v: InvoiceData[K]) =>
    onChange({ ...inv, [k]: v });

  const setItem = (id: string, patch: Partial<LineItem>) =>
    set(
      "items",
      inv.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  const totals = calcTotals(inv.items, inv.whtRate, inv.whtRate2, inv.whtEnabled, inv.whtEnabled2);
  const req = (v: string) => (v.trim() ? undefined : "Missing");
  const opt = (v: string) => (v.trim() ? undefined : "Not in source");
  const src = toDec(inv.sourceTotal);
  const srcDiff = src ? totals.totalSales.sub(src).abs() : null;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Invoice details</h2>
          <span className="text-xs text-muted-foreground">
            Print font: <strong className="text-foreground">Times New Roman</strong>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field
            label="Invoice No. (Printable)"
            value={inv.invoiceNumber}
            onChange={(v) => set("invoiceNumber", v)}
            placeholder="Optional"
          />
          <Field
            label="Date"
            value={inv.date}
            onChange={(v) => set("date", v)}
            flag={req(inv.date)}
            placeholder="MM/DD/YYYY"
          />
          <Field
            label="Sales Rep"
            value={inv.salesRep}
            onChange={(v) => set("salesRep", v)}
            flag={opt(inv.salesRep)}
          />
          <Field
            label="Reference / PO No."
            value={inv.poNumber}
            onChange={(v) => set("poNumber", v)}
            placeholder="Optional"
          />
          <Field
            label="Registered name (Customer)"
            value={inv.customer}
            onChange={(v) => set("customer", v)}
            flag={req(inv.customer)}
            className="col-span-2"
          />
          <Field
            label="TIN"
            value={inv.tin}
            onChange={(v) => set("tin", v)}
            optional
            placeholder="123-456-789-000"
          />
          <Field
            label="Terms"
            value={inv.terms}
            onChange={(v) => set("terms", v)}
            optional
            placeholder="e.g. 30 Days"
          />
          <Field
            label="Business address"
            value={inv.address}
            onChange={(v) => set("address", v)}
            placeholder="Optional"
            className="col-span-2 md:col-span-3"
            placeholder="Customer business address (Optional)"
          />
          <Field
            label="Due date"
            value={inv.dueDate}
            onChange={(v) => set("dueDate", v)}
            optional
            placeholder="MM/DD/YYYY"
          />
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            Items <span className="font-normal text-muted-foreground">({inv.items.length})</span>
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set("items", [
                ...inv.items,
                { id: newId(), item: "", description: "", qty: "", unitPrice: "" },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Add row
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-secondary-foreground">
              <tr>
                <th className="w-36 px-3 py-2">Items</th>
                <th className="px-3 py-2">Description</th>
                <th className="w-20 px-3 py-2 text-right">Qty</th>
                <th className="w-32 px-3 py-2 text-right">Orig. unit price</th>
                <th className="w-32 px-3 py-2 text-right">Unit price (VAT inc.)</th>
                <th className="w-32 px-3 py-2 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {inv.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    No items yet. Upload an SOS PDF or add a row.
                  </td>
                </tr>
              )}
              {inv.items.map((it) => {
                const c = calcLine(it);
                const qtyBad = toDec(it.qty) === null;
                const priceBad = toDec(it.unitPrice) === null;
                return (
                  <tr key={it.id} className="border-t">
                    <td className="px-1.5 py-1">
                      <input
                        aria-label="Item code"
                        className={cn(cellInput, !it.item && "bg-warning-soft")}
                        value={it.item}
                        onChange={(e) => setItem(it.id, { item: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        aria-label="Description"
                        className={cn(cellInput, !it.description && "bg-warning-soft")}
                        value={it.description}
                        onChange={(e) => setItem(it.id, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        aria-label="Quantity"
                        inputMode="decimal"
                        className={cn(cellInput, "num text-right", qtyBad && "bg-warning-soft")}
                        value={it.qty}
                        onChange={(e) => setItem(it.id, { qty: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        aria-label="Original unit price"
                        inputMode="decimal"
                        className={cn(cellInput, "num text-right", priceBad && "bg-warning-soft")}
                        value={it.unitPrice}
                        onChange={(e) => setItem(it.id, { unitPrice: e.target.value })}
                      />
                    </td>
                    <td className="num px-3 py-1 text-right">{c.valid ? peso(c.vatUnit) : "—"}</td>
                    <td className="num px-3 py-1 text-right font-medium">
                      {c.valid ? peso(c.amount) : "—"}
                    </td>
                    <td className="px-1 py-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label="Remove row"
                        onClick={() =>
                          set(
                            "items",
                            inv.items.filter((i) => i.id !== it.id),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_390px]">
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            Unit price (VAT inc.) = original unit price × 1.12, rounded to centavos. Amount =
            VAT-inclusive unit price × quantity.
          </p>
          <p>
            Withholding taxes are calculated independently using Total Sales (VAT Inclusive) as base:
            WHT 1 = Total Sales × Rate 1, WHT 2 = Total Sales × Rate 2.
          </p>
          {srcDiff && srcDiff.gt(0.009) && (
            <p className="flex items-start gap-1.5 rounded-md bg-warning-soft p-2 text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              SOS PDF total was {peso(src)}; the recalculated total differs by {peso(srcDiff)}{" "}
              because unit prices are rounded to centavos before multiplying.
            </p>
          )}
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm space-y-1.5">
          <Row label="Total Sales (VAT Inclusive)" v={peso(totals.totalSales)} />
          <Row label="Less: VAT" v={peso(totals.vat)} />
          <Row label="Amount: Net of VAT" v={peso(totals.net)} />
          {([1, 2] as const).map((tax) => {
            const rateKey = tax === 1 ? "whtRate" : "whtRate2";
            const enabledKey = tax === 1 ? "whtEnabled" : "whtEnabled2";
            const rate = inv[rateKey] ?? (tax === 1 ? "1" : "5");
            const enabled = inv[enabledKey] ?? true;
            const invalid = toDec(rate) === null || (toDec(rate)?.isNegative() ?? false);
            return (
              <div key={tax} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <div className="flex items-center gap-2">
                  <Switch
                    aria-label={`Enable Withholding Tax ${tax}`}
                    checked={enabled}
                    onCheckedChange={(checked) => set(enabledKey, checked)}
                  />
                  <span className="text-xs">Withholding Tax {tax}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      aria-label={`Withholding Tax ${tax} rate`}
                      inputMode="decimal"
                      value={rate}
                      onChange={(e) => set(rateKey, e.target.value)}
                      className={cn(
                        "num h-7 w-14 px-1 text-right text-xs",
                        invalid && "border-warning bg-warning-soft",
                      )}
                    />
                    <span className="text-xs">%</span>
                  </div>
                </div>
                <span className="num text-destructive">
                  ({peso(tax === 1 ? totals.wht1 : totals.wht2)})
                </span>
              </div>
            );
          })}
          <div className="mt-2 flex items-center justify-between border-t pt-3">
            <span className="font-semibold">TOTAL AMOUNT DUE</span>
            <span className="num text-lg font-semibold text-primary">{peso(totals.due)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex justify-between py-1">
      <span>{label}</span>
      <span className="num">{v}</span>
    </div>
  );
}
