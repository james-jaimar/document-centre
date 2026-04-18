import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Upload,
  Eye,
  Sliders,
  Printer,
  Users,
  Briefcase,
  TrendingUp,
  FileText,
  Presentation,
  BookOpen,
  Files,
  Image as ImageIcon,
  Layers,
  Megaphone,
  Newspaper,
  Layout as LayoutIcon,
  Linkedin,
  Youtube,
  Mail,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Heart,
} from "lucide-react";

/* ---------- shared bits ---------- */

const Ribbons = ({ variant = "hero" }: { variant?: "hero" | "cta" }) => {
  if (variant === "cta") {
    return (
      <>
        <div className="dc-ribbon" style={{ top: -80, left: -120, width: 360, height: 360, background: "hsl(var(--dc-sky) / 0.35)" }} />
        <div className="dc-ribbon" style={{ top: 40, right: -140, width: 320, height: 320, background: "hsl(var(--dc-orange) / 0.35)" }} />
        <div className="dc-ribbon" style={{ bottom: -120, left: "30%", width: 400, height: 400, background: "hsl(var(--dc-green) / 0.28)" }} />
      </>
    );
  }
  return (
    <>
      <div className="dc-ribbon" style={{ top: -120, right: -60, width: 520, height: 520, background: "hsl(var(--dc-blue) / 0.18)" }} />
      <div className="dc-ribbon" style={{ top: 120, right: 220, width: 280, height: 280, background: "hsl(var(--dc-green) / 0.20)" }} />
      <div className="dc-ribbon" style={{ bottom: -100, right: 60, width: 340, height: 340, background: "hsl(var(--dc-orange) / 0.22)" }} />
      <div className="dc-ribbon" style={{ top: 200, left: -80, width: 220, height: 220, background: "hsl(var(--dc-sky) / 0.18)" }} />
    </>
  );
};

const Logo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-2.5 ${className}`}>
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect x="3" y="6" width="22" height="26" rx="3" fill="hsl(var(--dc-blue))" />
      <rect x="9" y="3" width="22" height="26" rx="3" fill="hsl(var(--dc-green))" opacity="0.85" />
      <rect x="14" y="9" width="18" height="22" rx="2.5" fill="hsl(var(--dc-orange))" opacity="0.9" />
    </svg>
    <span className="font-bold text-[1.15rem] leading-none">
      <span style={{ color: "hsl(var(--dc-navy))" }}>Document </span>
      <span style={{ color: "hsl(var(--dc-green))" }}>Centre</span>
    </span>
  </div>
);

/* ---------- mocked product UI for hero (clean, our look, not fake) ---------- */
const HeroAppMock = () => (
  <div className="relative">
    {/* laptop */}
    <div className="relative mx-auto" style={{ maxWidth: 720 }}>
      <div className="rounded-[20px] bg-[#1c2332] p-3 shadow-2xl">
        <div className="rounded-xl overflow-hidden bg-white">
          {/* top bar */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-[#f5f8fc] border-b border-[#e6ecf3]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-[10px] text-slate-500 font-medium">document-centre.com / order</span>
          </div>
          <div className="flex" style={{ minHeight: 320 }}>
            {/* sidebar */}
            <div className="w-[140px] bg-[#0f1623] text-white p-3 space-y-1">
              <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-2">Document Centre</div>
              {["Dashboard", "Products", "Orders", "Files", "Customers", "Reports", "Settings"].map((l, i) => (
                <div
                  key={l}
                  className={`text-[11px] px-2.5 py-1.5 rounded-md ${i === 1 ? "bg-[hsl(var(--dc-blue))] text-white" : "text-slate-300"}`}
                >
                  {l}
                </div>
              ))}
            </div>
            {/* content */}
            <div className="flex-1 p-4 bg-white">
              <div className="text-[12px] font-bold text-[hsl(var(--dc-navy))] mb-3">Choose a product</div>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { c: "hsl(var(--dc-blue))", l: "Bound Docs" },
                  { c: "hsl(var(--dc-green))", l: "Flyers" },
                  { c: "hsl(var(--dc-orange))", l: "Booklets" },
                  { c: "hsl(var(--dc-sky))", l: "Posters" },
                  { c: "hsl(var(--dc-blue))", l: "Brochures" },
                  { c: "hsl(var(--dc-green))", l: "Stapled" },
                ].map((p) => (
                  <div key={p.l} className="rounded-lg border border-[#e6ecf3] p-2 bg-white">
                    <div className="h-[42px] rounded-md mb-1.5" style={{ background: `${p.c.replace("hsl(", "hsl(")} / 0.15)`, backgroundColor: `color-mix(in srgb, ${p.c} 14%, white)` }} />
                    <div className="text-[9.5px] font-semibold text-[hsl(var(--dc-navy))]">{p.l}</div>
                    <div className="text-[8px] text-slate-500">From £4.50</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto h-3 w-[55%] rounded-b-xl bg-[#1c2332]" />
    </div>

    {/* phone overlay */}
    <div className="absolute -right-2 -bottom-6 hidden md:block">
      <div className="rounded-[28px] bg-[#1c2332] p-2 shadow-2xl" style={{ width: 150 }}>
        <div className="rounded-[20px] bg-white overflow-hidden">
          <div className="bg-[#0f1623] text-white px-3 py-2.5 text-[9px] font-semibold">Document Centre</div>
          <div className="p-2.5 space-y-1.5">
            {[
              { l: "Booklet · 24pp", s: "In progress", c: "hsl(var(--dc-orange))" },
              { l: "A2 Posters x12", s: "Proofing", c: "hsl(var(--dc-blue))" },
              { l: "Bound Manual", s: "Ready", c: "hsl(var(--dc-green))" },
              { l: "Flyer Run", s: "New", c: "hsl(var(--dc-sky))" },
            ].map((j) => (
              <div key={j.l} className="rounded-md border border-[#e6ecf3] p-1.5">
                <div className="text-[8.5px] font-semibold text-[hsl(var(--dc-navy))]">{j.l}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: j.c }} />
                  <span className="text-[7.5px] text-slate-500">{j.s}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ---------- workflow dark-band mock ---------- */
const DarkWorkflowMock = () => (
  <div className="rounded-2xl bg-[#0d1422] p-4 shadow-2xl border border-white/10">
    <div className="rounded-xl overflow-hidden bg-white">
      <div className="flex items-center px-3 py-2 bg-[#f5f8fc] border-b border-[#e6ecf3] text-[10px] text-slate-500">
        Production Workflow
      </div>
      <div className="flex" style={{ minHeight: 280 }}>
        <div className="w-[120px] bg-[#0f1623] text-white p-3 space-y-1">
          {["Dashboard", "Orders", "Production", "Files", "Customers", "Reports"].map((l, i) => (
            <div key={l} className={`text-[10px] px-2 py-1.5 rounded ${i === 2 ? "bg-[hsl(var(--dc-blue))]" : "text-slate-400"}`}>
              {l}
            </div>
          ))}
        </div>
        <div className="flex-1 p-3">
          <div className="text-[11px] font-bold text-[hsl(var(--dc-navy))] mb-2">Jobs</div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { t: "New", n: 8, c: "hsl(var(--dc-sky))" },
              { t: "In Progress", n: 12, c: "hsl(var(--dc-blue))" },
              { t: "Proofing", n: 5, c: "hsl(var(--dc-orange))" },
              { t: "Ready", n: 7, c: "hsl(var(--dc-green))" },
            ].map((col) => (
              <div key={col.t} className="space-y-1.5">
                <div className="flex items-center justify-between text-[9px] font-semibold text-slate-600">
                  <span>{col.t}</span>
                  <span className="px-1 rounded text-white" style={{ background: col.c }}>{col.n}</span>
                </div>
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-md border border-[#e6ecf3] p-1.5 bg-white">
                    <div className="text-[8.5px] font-semibold text-[hsl(var(--dc-navy))]">Job #{1200 + i + col.n}</div>
                    <div className="text-[7.5px] text-slate-500">A4 · 100pp</div>
                    <div className="text-[8px] font-bold mt-0.5" style={{ color: col.c }}>£{(43 + i * 5).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ---------- preview spread mock ---------- */
const PreviewSpreadMock = () => (
  <div className="relative rounded-3xl bg-gradient-to-br from-[hsl(var(--dc-bg-soft))] to-white p-8 border border-[hsl(var(--dc-border))] shadow-xl">
    <div className="flex justify-center items-center gap-1.5">
      {/* book spread */}
      <div className="bg-white rounded-l-md shadow-2xl border-r border-slate-200" style={{ width: 220, height: 290, padding: 18 }}>
        <div className="h-3 w-2/3 bg-[hsl(var(--dc-navy))] rounded mb-2" />
        <div className="h-1.5 w-1/2 bg-slate-300 rounded mb-4" />
        <div className="space-y-1">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="h-1 bg-slate-200 rounded" style={{ width: `${80 + (i % 3) * 6}%` }} />
          ))}
        </div>
        <div className="mt-3 h-16 rounded bg-gradient-to-br from-[hsl(var(--dc-sky))/0.3] to-[hsl(var(--dc-blue))/0.2]" />
        <div className="space-y-1 mt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-1 bg-slate-200 rounded" style={{ width: `${75 + (i % 2) * 10}%` }} />
          ))}
        </div>
      </div>
      <div className="bg-white rounded-r-md shadow-2xl" style={{ width: 220, height: 290, padding: 18 }}>
        <div className="space-y-1 mb-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-1 bg-slate-200 rounded" style={{ width: `${70 + (i % 4) * 7}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="h-20 rounded bg-gradient-to-br from-[hsl(var(--dc-orange))/0.3] to-[hsl(var(--dc-orange))/0.1]" />
          <div className="h-20 rounded bg-gradient-to-br from-[hsl(var(--dc-green))/0.3] to-[hsl(var(--dc-green))/0.1]" />
        </div>
        <div className="space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-1 bg-slate-200 rounded" style={{ width: `${65 + (i % 3) * 9}%` }} />
          ))}
        </div>
      </div>
    </div>
    <div className="flex justify-center items-center gap-3 mt-5">
      <button className="px-3 py-1.5 rounded-full bg-white border border-[hsl(var(--dc-border))] text-xs font-medium text-[hsl(var(--dc-navy))]">‹ Prev</button>
      <span className="text-xs dc-muted font-medium">Spread 4 / 12</span>
      <button className="px-3 py-1.5 rounded-full bg-[hsl(var(--dc-blue))] text-white text-xs font-medium">Next ›</button>
    </div>
  </div>
);

/* ---------- main ---------- */
export default function MarketingLanding() {
  const products = [
    { t: "Bound Documents", d: "Reports, manuals & everyday bound jobs", icon: BookOpen, c: "hsl(var(--dc-blue))" },
    { t: "Presentations", d: "Business decks & meeting packs", icon: Presentation, c: "hsl(var(--dc-orange))" },
    { t: "Ring Binders", d: "Professional binder-ready packs", icon: Files, c: "hsl(var(--dc-green))" },
    { t: "Stapled Documents", d: "Fast multi-page document printing", icon: FileText, c: "hsl(var(--dc-sky))" },
    { t: "Posters", d: "Short-run posters & display prints", icon: ImageIcon, c: "hsl(var(--dc-orange))" },
    { t: "Booklets", d: "Saddle-stitched & booklet-style jobs", icon: Newspaper, c: "hsl(var(--dc-blue))" },
    { t: "Flyers", d: "Simple marketing & promo print", icon: Megaphone, c: "hsl(var(--dc-green))" },
    { t: "Brochures", d: "Folded leaflets for everyday sales", icon: Layers, c: "hsl(var(--dc-sky))" },
  ];

  const benefits = [
    { icon: Users, t: "Easy for customers", d: "Simple ordering flow, clear upload steps and visual previews." },
    { icon: Briefcase, t: "Easy for staff", d: "Less back-and-forth, fewer unclear jobs and cleaner setup." },
    { icon: Printer, t: "Made for everyday print work", d: "Bound docs, posters, flyers, brochures and counter-service jobs." },
    { icon: TrendingUp, t: "Ready to grow with you", d: "Add more products, options and workflows as you expand." },
  ];

  const audiences = [
    "Copy Shops",
    "Business Copy Centres",
    "Franchise Print Stores",
    "Campus Print Rooms",
    "Local Commercial Printers",
    "Poster & Document Specialists",
  ];

  return (
    <div className="dc-marketing">
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-[hsl(var(--dc-border))]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium dc-muted">
            <a href="#products" className="hover:text-[hsl(var(--dc-navy))]">Features</a>
            <a href="#how-it-works" className="hover:text-[hsl(var(--dc-navy))]">How It Works</a>
            <a href="#solutions" className="hover:text-[hsl(var(--dc-navy))]">Solutions</a>
            <a href="#pricing" className="hover:text-[hsl(var(--dc-navy))]">Pricing</a>
            <a href="#resources" className="hover:text-[hsl(var(--dc-navy))]">Resources</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="hidden md:inline text-sm font-medium dc-muted hover:text-[hsl(var(--dc-navy))]">Login</Link>
            <a href="#cta" className="dc-btn dc-btn-outline hidden sm:inline-flex" style={{ padding: "0.55rem 1.1rem" }}>Book a demo</a>
            <a href="#cta" className="dc-btn dc-btn-primary" style={{ padding: "0.6rem 1.2rem" }}>Start Free Trial</a>
          </div>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden">
        <Ribbons />
        <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div>
            <span className="dc-eyebrow">Web-to-Print Software for Copy Shops &amp; Print Centres</span>
            <h1 className="mt-5 font-extrabold tracking-tight" style={{ fontSize: "clamp(2.5rem, 5vw, 4.25rem)", lineHeight: 1.05 }}>
              <span style={{ color: "hsl(var(--dc-navy))" }}>Web-to-Print</span>
              <br />
              <span style={{ color: "hsl(var(--dc-green))" }}>Made </span>
              <span style={{ color: "hsl(var(--dc-orange))" }}>Easy</span>
            </h1>
            <p className="mt-6 text-lg dc-muted max-w-xl">
              Document Centre helps copy shops, business print rooms and local print centres take orders online,
              collect files, show live previews and get jobs into production faster.
            </p>
            <ul className="mt-7 grid sm:grid-cols-2 gap-y-2.5 gap-x-6 text-[15px]" style={{ color: "hsl(var(--dc-navy))" }}>
              {[
                "Online ordering & file upload",
                "Live document preview & proofing",
                "Binding, finishing & print options",
                "Built for copy shops & small print centres",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center" style={{ background: "hsl(var(--dc-green) / 0.15)" }}>
                    <Check className="h-3 w-3" style={{ color: "hsl(var(--dc-green))" }} strokeWidth={3} />
                  </span>
                  <span className="font-medium">{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#cta" className="dc-btn dc-btn-primary text-base" style={{ padding: "1rem 1.8rem" }}>
                Start Your Free Trial <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#cta" className="dc-btn dc-btn-outline text-base" style={{ padding: "1rem 1.8rem" }}>
                Book a Demo
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm dc-muted">
              {["No credit card required", "Set up in minutes", "Great for everyday print products"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4" style={{ color: "hsl(var(--dc-green))" }} strokeWidth={3} /> {t}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <HeroAppMock />
          </div>
        </div>
      </section>

      {/* ───────── Products ───────── */}
      <section id="products" className="py-24" style={{ background: "hsl(var(--dc-bg-soft))" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Everything you need to sell <span style={{ color: "hsl(var(--dc-blue))" }}>everyday print</span> online
            </h2>
            <p className="mt-4 text-lg dc-muted">
              Launch the products your customers already ask for — from bound documents and presentations to posters,
              brochures and booklets.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {products.map(({ t, d, icon: Icon, c }) => (
              <div key={t} className="dc-card p-6">
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: `color-mix(in srgb, ${c} 12%, white)` }}
                >
                  <Icon className="h-7 w-7" style={{ color: c }} strokeWidth={2} />
                </div>
                <h3 className="font-bold text-[1.05rem] mb-1">{t}</h3>
                <p className="text-sm dc-muted leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              From upload to order in <span style={{ color: "hsl(var(--dc-orange))" }}>three simple steps</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "01", icon: LayoutIcon, t: "Choose a product", d: "Start with a product customers understand straight away — booklets, posters, bound documents, flyers and more.", c: "hsl(var(--dc-blue))" },
              { n: "02", icon: Upload, t: "Upload & organise files", d: "Drag in PDFs and images, then assign sections like front cover, body pages and back cover.", c: "hsl(var(--dc-green))" },
              { n: "03", icon: Sliders, t: "Configure & preview", d: "Set size, binding, paper stock and finishing, then review the live preview before adding to basket.", c: "hsl(var(--dc-orange))" },
            ].map(({ n, icon: Icon, t, d, c }) => (
              <div key={n} className="dc-card p-8 relative">
                <span className="absolute top-5 right-6 text-5xl font-black opacity-10" style={{ color: c }}>{n}</span>
                <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: `color-mix(in srgb, ${c} 14%, white)` }}>
                  <Icon className="h-7 w-7" style={{ color: c }} />
                </div>
                <h3 className="font-bold text-xl mb-2">{t}</h3>
                <p className="dc-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Dark workflow band ───────── */}
      <section className="relative overflow-hidden py-24" style={{ background: "linear-gradient(135deg, hsl(var(--dc-navy)) 0%, #061a44 100%)" }}>
        <div className="dc-ribbon" style={{ top: -100, left: -100, width: 360, height: 360, background: "hsl(var(--dc-sky) / 0.18)" }} />
        <div className="dc-ribbon" style={{ bottom: -120, right: -80, width: 380, height: 380, background: "hsl(var(--dc-orange) / 0.18)" }} />
        <div className="relative max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-14 items-center">
          <div className="text-white">
            <span className="dc-eyebrow" style={{ background: "rgba(255,255,255,0.12)", color: "hsl(var(--dc-sky))" }}>One workflow</span>
            <h2 className="mt-5 text-4xl md:text-5xl font-extrabold tracking-tight text-white">
              From upload to print-ready, all in one workflow
            </h2>
            <p className="mt-5 text-lg text-white/75 max-w-xl">
              Document Centre brings online ordering, file collection, product setup, proofing and production-ready
              job preparation into one simple flow for busy print counters.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                "Collect customer files without email chaos",
                "Let staff and customers review jobs visually",
                "Reduce setup mistakes before production",
                "Offer more products with less admin",
                "Keep online and in-store ordering aligned",
              ].map((b) => (
                <li key={b} className="flex items-start gap-3 text-white/90">
                  <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "hsl(var(--dc-green))" }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <a href="#how-it-works" className="dc-btn dc-btn-light-outline mt-8">
              See how it works <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <DarkWorkflowMock />
        </div>
      </section>

      {/* ───────── Live preview feature ───────── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="dc-eyebrow" style={{ color: "hsl(var(--dc-orange))", background: "hsl(var(--dc-orange) / 0.1)" }}>Live preview</span>
            <h2 className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight">
              Live previews your customers can <span style={{ color: "hsl(var(--dc-blue))" }}>actually understand</span>
            </h2>
            <p className="mt-4 text-lg dc-muted">
              Show document spreads, binding choices and finishing options before the job goes to print. Fewer
              mistakes, fewer back-and-forth calls and more confident orders.
            </p>
          </div>
          <div className="max-w-5xl mx-auto">
            <PreviewSpreadMock />
          </div>
          <ul className="mt-12 grid md:grid-cols-5 gap-4 max-w-5xl mx-auto">
            {[
              { i: Eye, t: "Flipbook page preview" },
              { i: BookOpen, t: "Spread view for bound" },
              { i: Layers, t: "Binding & finishing context" },
              { i: ShieldCheck, t: "Better proofing" },
              { i: Users, t: "Clearer for staff & customers" },
            ].map(({ i: Icon, t }) => (
              <li key={t} className="text-center">
                <div className="mx-auto h-10 w-10 rounded-xl flex items-center justify-center mb-2" style={{ background: "hsl(var(--dc-blue) / 0.1)" }}>
                  <Icon className="h-5 w-5" style={{ color: "hsl(var(--dc-blue))" }} />
                </div>
                <div className="text-sm font-semibold">{t}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── Benefits ───────── */}
      <section className="py-24" style={{ background: "hsl(var(--dc-bg-soft))" }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Built for print counters. Designed for <span style={{ color: "hsl(var(--dc-green))" }}>real-world jobs.</span>
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map(({ icon: Icon, t, d }, i) => {
              const colours = ["hsl(var(--dc-blue))", "hsl(var(--dc-green))", "hsl(var(--dc-orange))", "hsl(var(--dc-sky))"];
              const c = colours[i];
              return (
                <div key={t} className="dc-card p-7">
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `color-mix(in srgb, ${c} 14%, white)` }}>
                    <Icon className="h-6 w-6" style={{ color: c }} />
                  </div>
                  <h3 className="font-bold text-lg mb-1.5">{t}</h3>
                  <p className="text-sm dc-muted">{d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── Solutions / audiences ───────── */}
      <section id="solutions" className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            Ideal for modern <span style={{ color: "hsl(var(--dc-blue))" }}>print businesses</span>
          </h2>
          <p className="mt-4 text-lg dc-muted max-w-2xl mx-auto">
            Document Centre is ideal for businesses selling fast-turnaround, over-the-counter print products that need
            a cleaner online experience.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {audiences.map((a, i) => {
              const c = ["hsl(var(--dc-blue))", "hsl(var(--dc-green))", "hsl(var(--dc-orange))", "hsl(var(--dc-sky))"][i % 4];
              return (
                <span
                  key={a}
                  className="px-5 py-2.5 rounded-full font-semibold text-sm border-2"
                  style={{ borderColor: `color-mix(in srgb, ${c} 35%, white)`, color: "hsl(var(--dc-navy))", background: `color-mix(in srgb, ${c} 6%, white)` }}
                >
                  {a}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── Testimonial ───────── */}
      <section className="py-24" style={{ background: "hsl(var(--dc-bg-soft))" }}>
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Made for busy print teams</h2>
          </div>
          <div className="dc-card p-10 relative">
            <div className="absolute -top-5 left-10 text-7xl font-serif leading-none" style={{ color: "hsl(var(--dc-blue))" }}>“</div>
            <p className="text-xl md:text-2xl font-medium leading-relaxed" style={{ color: "hsl(var(--dc-navy))" }}>
              Document Centre has transformed how we take print orders. Customers upload more cleanly, staff spend
              less time chasing files, and the previewing gives everyone more confidence.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold" style={{ background: "linear-gradient(135deg, hsl(var(--dc-blue)), hsl(var(--dc-sky)))" }}>
                ST
              </div>
              <div>
                <div className="font-bold">Sarah T.</div>
                <div className="text-sm dc-muted">Print Manager · UK</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section id="cta" className="relative overflow-hidden py-24" style={{ background: "linear-gradient(135deg, hsl(var(--dc-navy)) 0%, #0a2358 60%, #051640 100%)" }}>
        <Ribbons variant="cta" />
        <div className="relative max-w-5xl mx-auto px-6 text-center text-white">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            Ready to <span style={{ color: "hsl(var(--dc-orange))" }}>modernise</span> your<br />print business?
          </h2>
          <p className="mt-5 text-lg text-white/80 max-w-2xl mx-auto">
            Launch online ordering, live previewing and smoother job setup with Document Centre.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <a href="/auth" className="dc-btn dc-btn-green text-base" style={{ padding: "1.05rem 2rem" }}>
              Start Your Free Trial <ArrowRight className="h-4 w-4" />
            </a>
            <a href="mailto:hello@document-centre.com" className="dc-btn dc-btn-light-outline text-base" style={{ padding: "1.05rem 2rem" }}>
              Book a Demo
            </a>
          </div>
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { i: Heart, t: "14-day free trial" },
              { i: ShieldCheck, t: "Full feature access" },
              { i: Zap, t: "No setup fees" },
              { i: Check, t: "Cancel anytime" },
            ].map(({ i: Icon, t }) => (
              <div key={t} className="flex items-center justify-center gap-2 text-white/85">
                <Icon className="h-5 w-5" style={{ color: "hsl(var(--dc-sky))" }} />
                <span className="text-sm font-medium">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="bg-white border-t border-[hsl(var(--dc-border))] py-14">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-10">
          <div>
            <Logo />
            <p className="mt-4 text-sm dc-muted max-w-xs">
              Web-to-print software for copy shops and print centres.
            </p>
            <div className="mt-5 flex gap-3">
              {[Linkedin, Youtube, Mail].map((Icon, i) => (
                <a key={i} href="#" className="h-9 w-9 rounded-full flex items-center justify-center border border-[hsl(var(--dc-border))] hover:border-[hsl(var(--dc-blue))] hover:text-[hsl(var(--dc-blue))] dc-muted">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
          {[
            { t: "Product", l: ["Features", "How It Works", "Pricing", "Integrations"] },
            { t: "Solutions", l: ["Copy Shops", "Business Centres", "Print Stores", "Small Printers"] },
            { t: "Resources", l: ["Help Centre", "Guides", "Blog", "Contact"] },
            { t: "Company", l: ["About", "Privacy", "Terms"] },
          ].map((col) => (
            <div key={col.t}>
              <div className="font-bold text-sm mb-4" style={{ color: "hsl(var(--dc-navy))" }}>{col.t}</div>
              <ul className="space-y-2.5 text-sm dc-muted">
                {col.l.map((l) => (
                  <li key={l}><a href="#" className="hover:text-[hsl(var(--dc-blue))]">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-12 pt-6 border-t border-[hsl(var(--dc-border))] flex flex-col md:flex-row gap-3 justify-between text-xs dc-muted">
          <span>© {new Date().getFullYear()} Document Centre. All rights reserved.</span>
          <span>Web-to-print software for copy shops &amp; small printers</span>
        </div>
      </footer>
    </div>
  );
}
