import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { STOREFRONT_TENANT_EVENT } from "@/lib/storefrontTenantHeader";


export interface Branch {
  id: string;
  name: string;
  slug: string;
  url_slug: string | null;
  code: string | null;
  city: string | null;
  province: string | null;
  address: string | null;
  is_active: boolean;
  is_live: boolean;
}

/** Return the URL-facing slug for a branch (custom url_slug if set, else canonical slug). */
export function branchUrlSlug(branch: Pick<Branch, "slug" | "url_slug">): string {
  return branch.url_slug || branch.slug;
}

interface BranchContextValue {
  /** Live branches available in the picker for the current tenant */
  branches: Branch[];
  /** All branches (incl. non-live) — used when resolving a URL slug */
  allBranches: Branch[];
  /** The currently selected branch (null if none selected yet) */
  activeBranch: Branch | null;
  /** Whether this tenant has multiple live branches */
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
  /** Set/clear the URL branch slug — called by the route wrapper */
  setUrlBranchSlug: (slug: string | null) => void;
  /** Find a branch by URL slug (matches url_slug or slug) — checks all branches */
  findBranchBySlug: (slug: string) => Branch | undefined;
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
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [urlBranchSlug, setUrlBranchSlugState] = useState<string | null>(null);

  // Load branches for this tenant. The branches table is RLS-protected
  // via either tenant membership OR the `x-storefront-tenant` header.
  // For anonymous storefront visitors that header is set by TenantProvider
  // — if it hasn't been published yet when this effect first runs we'd
  // get an empty result. So we (a) wait for the header to match the
  // requested tenant before firing, and (b) listen for the header event
  // and auth changes to retry.
  useEffect(() => {
    if (!tenantId) {
      setAllBranches([]);
      setActiveBranch(null);
      // Keep loading=true while tenantId is still resolving so route guards
      // (e.g. BranchSlugRoute) don't briefly render StoreNotAvailable.
      setLoading(true);
      return;
    }

    let cancelled = false;

    const headerReady = () =>
      typeof window === "undefined" ||
      window.__storefrontTenantId === tenantId;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, slug, url_slug, code, city, province, address, is_active, is_live")
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
      setAllBranches(list);
      setLoading(false);
    };

    const tryLoad = () => {
      if (cancelled) return;
      if (!headerReady()) return; // wait for storefront header
      void load();
    };

    tryLoad();

    // Retry when the storefront header is published / changes
    const onHeader = () => tryLoad();
    window.addEventListener(STOREFRONT_TENANT_EVENT, onHeader);

    // Retry when auth state flips (anonymous → signed in unlocks the
    // membership RLS policy and may return more rows)
    const { data: sub } = supabase.auth.onAuthStateChange(() => tryLoad());

    return () => {
      cancelled = true;
      window.removeEventListener(STOREFRONT_TENANT_EVENT, onHeader);
      sub.subscription.unsubscribe();
    };
  }, [tenantId]);


  // Live branches only — used by picker
  const branches = allBranches.filter((b) => b.is_live);
  const isMultiBranch = branches.length > 1;

  // Resolve active branch based on URL > localStorage > auto-select single > picker
  useEffect(() => {
    if (loading || !tenantId) return;

    // 1. URL slug takes priority
    if (urlBranchSlug) {
      const match = allBranches.find(
        (b) => (b.url_slug || b.slug) === urlBranchSlug,
      );
      if (match) {
        if (activeBranch?.id !== match.id) {
          setActiveBranch(match);
          localStorage.setItem(storageKey(tenantId), branchUrlSlug(match));
        }
        setPickerOpen(false);
      } else {
        // Invalid URL slug — clear active so the StoreNotAvailable page can render
        setActiveBranch(null);
        setPickerOpen(false);
      }
      return;
    }

    // 2. Single live branch — auto-select
    if (branches.length <= 1) {
      const next = branches[0] ?? null;
      if (activeBranch?.id !== next?.id) setActiveBranch(next);
      setPickerOpen(false);
      return;
    }

    // 3. Try localStorage
    const saved = localStorage.getItem(storageKey(tenantId));
    if (saved) {
      const match = branches.find((b) => (b.url_slug || b.slug) === saved);
      if (match) {
        if (activeBranch?.id !== match.id) setActiveBranch(match);
        setPickerOpen(false);
        return;
      }
      // Stale slug (branch removed / taken offline) — clear and fall through
      // to the picker instead of silently leaving activeBranch=null.
      localStorage.removeItem(storageKey(tenantId));
    }


    // 4. Multi-branch, no choice — show picker
    if (!activeBranch) setPickerOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, tenantId, urlBranchSlug, allBranches.length, branches.length]);

  const selectBranch = useCallback(
    (branch: Branch) => {
      setActiveBranch(branch);
      setPickerOpen(false);
      if (tenantId) {
        localStorage.setItem(storageKey(tenantId), branchUrlSlug(branch));
      }
    },
    [tenantId],
  );

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => {
    if (activeBranch) setPickerOpen(false);
  }, [activeBranch]);

  const setUrlBranchSlug = useCallback((slug: string | null) => {
    setUrlBranchSlugState(slug);
  }, []);

  const findBranchBySlug = useCallback(
    (slug: string) =>
      allBranches.find((b) => (b.url_slug || b.slug) === slug),
    [allBranches],
  );

  return (
    <BranchContext.Provider
      value={{
        branches,
        allBranches,
        activeBranch,
        isMultiBranch,
        loading,
        showPicker: pickerOpen && isMultiBranch,
        selectBranch,
        openPicker,
        closePicker,
        setUrlBranchSlug,
        findBranchBySlug,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    return {
      branches: [] as Branch[],
      allBranches: [] as Branch[],
      activeBranch: null,
      isMultiBranch: false,
      loading: false,
      showPicker: false,
      selectBranch: () => {},
      openPicker: () => {},
      closePicker: () => {},
      setUrlBranchSlug: () => {},
      findBranchBySlug: () => undefined,
    } satisfies BranchContextValue;
  }
  return ctx;
}

/** Clear saved branch on sign-out */
export function clearSavedBranch(tenantId: string) {
  localStorage.removeItem(storageKey(tenantId));
}
