import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Branch {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  city: string | null;
  province: string | null;
  address: string | null;
  is_active: boolean;
}

interface BranchContextValue {
  /** All active branches for the current tenant */
  branches: Branch[];
  /** The currently selected branch (null if none selected yet) */
  activeBranch: Branch | null;
  /** Whether this tenant has multiple branches */
  isMultiBranch: boolean;
  /** Whether branches are still loading */
  loading: boolean;
  /** Whether the branch picker should be shown */
  showPicker: boolean;
  /** Select a branch (saves to localStorage) */
  selectBranch: (branch: Branch) => void;
  /** Open the branch picker */
  openPicker: () => void;
  /** Close the picker (only if a branch is already selected) */
  closePicker: () => void;
}

const BranchContext = createContext<BranchContextValue | null>(null);

function storageKey(tenantId: string) {
  return `dc_branch_${tenantId}`;
}

export function BranchProvider({
  tenantId,
  children,
}: {
  tenantId: string | null;
  children: ReactNode;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Load branches for this tenant
  useEffect(() => {
    if (!tenantId) {
      setBranches([]);
      setActiveBranch(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, slug, code, city, province, address, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");

      if (cancelled) return;

      if (error) {
        console.error("Error loading branches:", error);
        setLoading(false);
        return;
      }

      const list = (data || []) as Branch[];
      setBranches(list);

      if (list.length <= 1) {
        // Single branch (or none) — auto-select
        setActiveBranch(list[0] ?? null);
        setLoading(false);
        return;
      }

      // Multi-branch: try to restore from localStorage
      const saved = localStorage.getItem(storageKey(tenantId));
      if (saved) {
        const match = list.find((b) => b.slug === saved);
        if (match) {
          setActiveBranch(match);
          setLoading(false);
          return;
        }
      }

      // No saved branch — picker will show
      setActiveBranch(null);
      setPickerOpen(true);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const isMultiBranch = branches.length > 1;

  const selectBranch = useCallback(
    (branch: Branch) => {
      setActiveBranch(branch);
      setPickerOpen(false);
      if (tenantId) {
        localStorage.setItem(storageKey(tenantId), branch.slug);
      }
    },
    [tenantId]
  );

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => {
    // Only allow closing if a branch is already selected
    if (activeBranch) setPickerOpen(false);
  }, [activeBranch]);

  return (
    <BranchContext.Provider
      value={{
        branches,
        activeBranch,
        isMultiBranch,
        loading,
        showPicker: pickerOpen && isMultiBranch,
        selectBranch,
        openPicker,
        closePicker,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    // Outside a BranchProvider — return safe defaults
    return {
      branches: [] as Branch[],
      activeBranch: null,
      isMultiBranch: false,
      loading: false,
      showPicker: false,
      selectBranch: () => {},
      openPicker: () => {},
      closePicker: () => {},
    };
  }
  return ctx;
}

/** Clear saved branch on sign-out */
export function clearSavedBranch(tenantId: string) {
  localStorage.removeItem(storageKey(tenantId));
}
