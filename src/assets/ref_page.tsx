"use client";

import {
  Bell,
  BookOpen,
  FileText,
  FolderOpen,
  Grid3X3,
  HelpCircle,
  Home,
  Library,
  MapPin,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  UploadCloud,
  User,
  FileImage,
  ClipboardList,
} from "lucide-react";

const sidebarItems = [
  { label: "Home", icon: Home, active: true },
  { label: "Create", icon: Plus },
  { label: "Library", icon: Library },
  { label: "Addresses", icon: MapPin },
  { label: "Orders", icon: ClipboardList },
  { label: "Account Settings", icon: Settings },
];

const products = [
  { label: "Documents", icon: FileText },
  { label: "Presentations", icon: BookOpen },
  { label: "Ring Binders", icon: FolderOpen },
  { label: "Booklets", icon: Library },
  { label: "Posters", icon: FileImage },
  { label: "Flyers", icon: Package },
  { label: "Blueprints", icon: FileText },
];

const recentUploads = [
  { name: "Product Catalog Copy", date: "15 Mar 2026" },
  { name: "Binder1 (1)", date: "15 Mar 2026" },
  { name: "cover", date: "15 Mar 2026" },
  { name: "Binder1", date: "15 Mar 2026" },
];

const recentModified = [
  { name: "SS Book 1", modified: "15 Mar 2026" },
  { name: "Coil Bound 1", modified: "15 Mar 2026" },
  { name: "Binder1", modified: "15 Mar 2026" },
];

const frequentOrdered = [
  { name: "Product Catalog Copy" },
  { name: "Binder1 (1)" },
  { name: "cover" },
  { name: "Binder1" },
];

export default function PrintflowDashboardPage() {
  return (
    <div className="print-shell">
      <div className="print-layout">
        <aside className="print-sidebar px-5 py-6">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 to-emerald-500 shadow-md">
              <Package className="h-5 w-5 text-slate-900" />
            </div>
            <div className="text-3xl font-semibold tracking-tight">printflow</div>
          </div>

          <nav className="flex flex-1 flex-col gap-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`sidebar-nav-item ${item.active ? "active" : ""}`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="hidden xl:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-8 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-300 text-slate-900 font-semibold">
                jh
              </div>
              <div className="hidden xl:block">
                <div className="text-sm font-medium">James Hall</div>
                <div className="text-xs text-white/60">Admin</div>
              </div>
            </div>
            <HelpCircle className="h-5 w-5 text-white/60" />
          </div>
        </aside>

        <main className="min-w-0">
          <header className="print-topbar">
            <button className="rounded-xl p-2 hover:bg-slate-100">
              <Menu className="h-5 w-5 text-slate-600" />
            </button>

            <div className="search-shell max-w-3xl">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                className="search-input"
                placeholder="Search files, products, branches or orders"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button className="rounded-xl p-2 hover:bg-slate-100">
                <Grid3X3 className="h-5 w-5 text-slate-600" />
              </button>
              <button className="relative rounded-xl p-2 hover:bg-slate-100">
                <Bell className="h-5 w-5 text-slate-600" />
                <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-lime-500" />
              </button>
              <button className="relative rounded-xl p-2 hover:bg-slate-100">
                <ShoppingCart className="h-5 w-5 text-slate-600" />
                <span className="absolute right-0 top-0 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">
                  1
                </span>
              </button>
              <button className="rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-sky-400 text-white">
                  <User className="h-4 w-4" />
                </div>
              </button>
            </div>
          </header>

          <div className="p-6 xl:p-8">
            <div className="glass-card overflow-hidden">
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-100/90 to-slate-50 px-6 py-5">
                <h2 className="text-center text-xl font-semibold tracking-tight text-slate-700">
                  Get started by choosing a product
                </h2>
              </div>

              <div className="overflow-x-auto px-5 py-6">
                <div className="flex gap-4">
                  {products.map((product) => {
                    const Icon = product.icon;
                    return (
                      <button key={product.label} className="product-tile">
                        <div className="product-thumb">
                          <Icon className="h-9 w-9 text-slate-500" />
                        </div>
                        <span className="text-center text-base font-medium text-slate-700">
                          {product.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.7fr_0.9fr]">
              <section className="space-y-6">
                <div>
                  <h1 className="mb-4 text-4xl font-semibold tracking-tight text-slate-800">
                    Get started by uploading PDFs
                  </h1>

                  <div className="upload-dropzone section-card">
                    <UploadCloud className="mb-4 h-14 w-14 text-slate-300" />
                    <p className="text-3xl font-medium tracking-tight text-slate-500">
                      Drag and drop files here, or{" "}
                      <span className="text-sky-600">browse</span>
                    </p>
                    <p className="mt-3 text-sm text-slate-400">
                      PDF, Word, PowerPoint and image files supported
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="section-card overflow-hidden">
                    <div className="section-header">Recently Modified</div>
                    <table className="metric-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Modified</th>
                          <th>Options</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentModified.map((item) => (
                          <tr key={item.name}>
                            <td>{item.name}</td>
                            <td>{item.modified}</td>
                            <td>
                              <button className="soft-button soft-button-primary">
                                Add to Cart
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="section-card overflow-hidden">
                    <div className="section-header">Frequently Ordered</div>
                    <table className="metric-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Options</th>
                        </tr>
                      </thead>
                      <tbody>
                        {frequentOrdered.map((item) => (
                          <tr key={item.name}>
                            <td>{item.name}</td>
                            <td>
                              <button className="soft-button soft-button-gold">
                                Create
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="section-card overflow-hidden">
                  <div className="section-header">Recently Uploaded Files</div>
                  <table className="metric-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Upload Date</th>
                        <th>Options</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentUploads.map((item) => (
                        <tr key={item.name}>
                          <td className="max-w-[220px] truncate">{item.name}</td>
                          <td>{item.date}</td>
                          <td>
                            <button className="soft-button soft-button-gold">
                              Create
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="section-card overflow-hidden">
                  <div className="section-header">Order Tracking</div>
                  <div className="status-empty">No items to display</div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}