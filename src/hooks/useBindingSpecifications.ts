import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BindingSpecification {
  id: string;
  binding_method: string;
  size_mm: number;
  pitch: string | null;
  min_sheets: number;
  max_sheets_80gsm: number;
  weight_grams: number;
  notes: string | null;
  is_active: boolean;
}

export function useBindingSpecifications(method?: string) {
  return useQuery({
    queryKey: ["binding_specifications", method],
    queryFn: async () => {
      let query = supabase
        .from("binding_specifications")
        .select("*")
        .eq("is_active", true)
        .order("size_mm", { ascending: true });

      if (method) {
        query = query.eq("binding_method", method);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BindingSpecification[];
    },
  });
}

/**
 * Given a sheet count (pages / 2 for duplex, or pages for simplex),
 * find the smallest binding that can hold those sheets.
 */
export function findSuitableBinding(
  specs: BindingSpecification[],
  sheetCount: number
): BindingSpecification | null {
  return (
    specs.find(
      (s) => sheetCount >= s.min_sheets && sheetCount <= s.max_sheets_80gsm
    ) ?? null
  );
}

/**
 * Validate whether a given sheet count fits within a binding spec.
 */
export function validateBindingCapacity(
  spec: BindingSpecification,
  sheetCount: number
): { valid: boolean; message?: string } {
  if (sheetCount < spec.min_sheets) {
    return {
      valid: false,
      message: `Too few sheets (${sheetCount}) for ${spec.size_mm}mm ${spec.binding_method}. Minimum: ${spec.min_sheets} sheets.`,
    };
  }
  if (sheetCount > spec.max_sheets_80gsm) {
    return {
      valid: false,
      message: `Too many sheets (${sheetCount}) for ${spec.size_mm}mm ${spec.binding_method}. Maximum: ${spec.max_sheets_80gsm} sheets on 80gsm.`,
    };
  }
  return { valid: true };
}
