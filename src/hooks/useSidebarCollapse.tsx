import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SidebarCollapseCtx {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<SidebarCollapseCtx>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
});

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((v) => !v), []);
  return (
    <Ctx.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSidebarCollapse() {
  return useContext(Ctx);
}
