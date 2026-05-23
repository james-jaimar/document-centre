/**
 * Structured option value format stored in product_options.values JSONB.
 * Replaces flat string arrays with rich objects supporting groups, pricing, and metadata.
 */
export interface StructuredOptionValue {
  label: string;
  slug: string;
  group: string;
  price_impact: number;
  price_type: "fixed" | "per_document" | "per_page";
  is_default: boolean;
  /** Whether this value is shown to customers. Defaults to true when absent (legacy rows). */
  is_active?: boolean;
  metadata: Record<string, string | number | boolean>;
}

/** Treat missing is_active as active (legacy rows). */
export function isValueActive(v: Pick<StructuredOptionValue, "is_active">): boolean {
  return v.is_active !== false;
}

/** Helper to generate a slug from a label */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Create a structured value with defaults */
export function createOptionValue(
  label: string,
  group: string,
  overrides: Partial<StructuredOptionValue> = {}
): StructuredOptionValue {
  return {
    label,
    slug: slugify(label),
    group,
    price_impact: 0,
    price_type: "per_document",
    is_default: false,
    is_active: true,
    metadata: {},
    ...overrides,
  };
}

/** Check if values array contains structured objects vs flat strings */
export function isStructuredValues(values: unknown): values is StructuredOptionValue[] {
  if (!Array.isArray(values) || values.length === 0) return false;
  return typeof values[0] === "object" && values[0] !== null && "label" in values[0];
}

/** Group structured values by their group field */
export function groupOptionValues(values: StructuredOptionValue[]): Record<string, StructuredOptionValue[]> {
  return values.reduce((acc, v) => {
    if (!acc[v.group]) acc[v.group] = [];
    acc[v.group].push(v);
    return acc;
  }, {} as Record<string, StructuredOptionValue[]>);
}
