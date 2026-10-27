import { useState } from "react";
import { Eye, EyeOff, Plus, Search, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FieldCategory, LayoutField } from "@/lib/invoice/layout-types";
import { cn } from "@/lib/utils";

interface FieldsListProps {
  fields: LayoutField[];
  selectedFieldId: string | null;
  onSelectField: (id: string) => void;
  onToggleVisibility: (id: string, e: React.MouseEvent) => void;
  onAddCustomField: () => void;
}

const CATEGORIES: { key: FieldCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "header", label: "Header" },
  { key: "customer", label: "Customer" },
  { key: "items", label: "Items Table" },
  { key: "totals", label: "Totals" },
  { key: "custom", label: "Custom" },
];

export function FieldsList({
  fields,
  selectedFieldId,
  onSelectField,
  onToggleVisibility,
  onAddCustomField,
}: FieldsListProps) {
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState<FieldCategory | "all">("all");

  const filteredFields = fields.filter((f) => {
    const matchesCategory = category === "all" || f.category === category;
    const matchesSearch =
      f.name.toLowerCase().includes(filter.toLowerCase()) ||
      f.type.toLowerCase().includes(filter.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex h-full flex-col divide-y overflow-hidden">
      {/* Top action and search */}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Invoice Fields ({fields.length})
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onAddCustomField}
          >
            <Plus className="h-3 w-3" /> Add Text
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search fields..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                category === cat.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {filteredFields.map((field) => {
            const isSelected = field.id === selectedFieldId;
            return (
              <div
                key={field.id}
                onClick={() => onSelectField(field.id)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-accent text-foreground",
                  !field.visible && "opacity-50",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Tag
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isSelected ? "text-primary-foreground" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate leading-none">{field.name}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-[10px]",
                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {field.x.toFixed(1)} × {field.y.toFixed(1)} mm
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  title={field.visible ? "Hide field" : "Show field"}
                  onClick={(e) => onToggleVisibility(field.id, e)}
                  className={cn(
                    "rounded p-1 transition-colors",
                    isSelected
                      ? "hover:bg-primary-foreground/20"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                >
                  {field.visible ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            );
          })}

          {filteredFields.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No matching fields found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
