import { Link } from "react-router-dom";
import { ArrowRight, Check, Linkedin, Youtube, Mail, Star, Play } from "lucide-react";
import heroImage from "@/assets/hero-image.png";
import sarahPhoto from "@/assets/testimonial-sarah.jpg";
import printSamples from "@/assets/print-samples.png";
import docCentreLogo from "@/assets/doc-centre-logo.svg";
import webToPrintHeadline from "@/assets/web-to-print-made-easy.svg";

/* ───────────────────────── Logo ───────────────────────── */
const Logo = ({ className = "", height = 88 }: { className?: string; height?: number }) => (
  <img
    src={docCentreLogo}
    alt="Document Centre"
    style={{ height }}
    className={`w-auto ${className}`}
  />
);

/* ───────────────────────── Diagonal Ribbon Layer ─────────────────────────
   Big angled colored bands that sweep across the hero (and CTA) — exactly
   like the reference image. Implemented as wide, rotated, gradient strips
   absolutely positioned and clipped by the parent.
*/
const HeroRibbons = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
    {/* top-right blue */}
    <div
      className="absolute"
      style={{
        top: "-18%",
        right: "-25%",
        width: "85%",
        height: "180px",
        transform: "rotate(28deg)",
        background: "linear-gradient(90deg, hsl(var(--dc-blue) / 0.85), hsl(var(--dc-sky) / 0.6))",
        borderRadius: "999px",
        filter: "blur(0.3px)",
      }}
    />
    {/* mid green */}
    <div
      className="absolute"
      style={{
        top: "12%",
        right: "-20%",
        width: "75%",
        height: "120px",
        transform: "rotate(28deg)",
        background: "linear-gradient(90deg, hsl(var(--dc-green) / 0.85), hsl(var(--dc-green) / 0.55))",
        borderRadius: "999px",
      }}
    />
    {/* mid orange */}
    <div
      className="absolute"
      style={{
        top: "30%",
        right: "-15%",
        width: "70%",
        height: "100px",
        transform: "rotate(28deg)",
        background: "linear-gradient(90deg, hsl(var(--dc-orange) / 0.9), hsl(var(--dc-orange) / 0.55))",
        borderRadius: "999px",
      }}
    />
    {/* bottom orange large */}
    <div
      className="absolute"
      style={{
        bottom: "-15%",
        left: "20%",
        width: "75%",
        height: "150px",
        transform: "rotate(-22deg)",
        background: "linear-gradient(90deg, hsl(var(--dc-orange) / 0.85), hsl(var(--dc-orange) / 0.5))",
        borderRadius: "999px",
      }}
    />
    {/* bottom green */}
    <div
      className="absolute"
      style={{
        bottom: "-5%",
        left: "10%",
        width: "70%",
        height: "100px",
        transform: "rotate(-22deg)",
        background: "linear-gradient(90deg, hsl(var(--dc-green) / 0.85), hsl(var(--dc-green) / 0.5))",
        borderRadius: "999px",
      }}
    />
    {/* top-left small blue accent */}
    <div
      className="absolute"
      style={{
        top: "0%",
        left: "-8%",
        width: "30%",
        height: "60px",
        transform: "rotate(-22deg)",
        background: "hsl(var(--dc-blue) / 0.5)",
        borderRadius: "999px",
      }}
    />
  </div>
);

const CtaRibbons = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
    {/* top-right blue */}
    <div
      className="absolute"
      style={{
        top: "-30%",
        right: "-15%",
        width: "55%",
        height: "120px",
        transform: "rotate(28deg)",
        background: "linear-gradient(90deg, hsl(var(--dc-sky) / 0.45), hsl(var(--dc-blue) / 0.55))",
        borderRadius: "999px",
      }}
    />
    {/* bottom-left orange */}
    <div
      className="absolute"
      style={{
        bottom: "-30%",
        left: "-10%",
        width: "60%",
        height: "130px",
        transform: "rotate(28deg)",
        background: "linear-gradient(90deg, hsl(var(--dc-orange) / 0.55), hsl(var(--dc-orange) / 0.4))",
        borderRadius: "999px",
      }}
    />
    {/* bottom-left green */}
    <div
      className="absolute"
      style={{
        bottom: "-15%",
        left: "-8%",
        width: "55%",
        height: "90px",
        transform: "rotate(28deg)",
        background: "hsl(var(--dc-green) / 0.45)",
        borderRadius: "999px",
      }}
    />
  </div>
);

/* ───────────────────────── Hero device mock — laptop ─────────────────────────
   Detailed product UI catalogue grid (matches reference: dark sidebar, product
   cards with thumbnails and "Order Now" buttons).
*/
const LaptopMock = () => {
  const cat = [
    { name: "Business Cards", btn: "Order Now", c: "hsl(var(--dc-blue))" },
    { name: "Flyers & Leaflets", btn: "Order Now", c: "hsl(var(--dc-green))" },
    { name: "Booklets", btn: "Order Now", c: "hsl(var(--dc-blue))" },
    { name: "Banners", btn: "Order Now", c: "hsl(var(--dc-orange))" },
    { name: "Posters", btn: "Order Now", c: "hsl(var(--dc-blue))" },
    { name: "Forms", btn: "Order Now", c: "hsl(var(--dc-green))" },
    { name: "NCR Pads", btn: "Order Now", c: "hsl(var(--dc-blue))" },
    { name: "Stickers", btn: "Order Now", c: "hsl(var(--dc-orange))" },
  ];
  return (
    <div className="relative">
      {/* laptop body */}
      <div className="rounded-t-[14px] bg-gradient-to-b from-[#2b3445] to-[#1c2332] p-[10px] shadow-2xl">
        <div className="rounded-[6px] overflow-hidden bg-white">
          {/* topbar */}
          <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-[#eef2f7]">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[10px]" style={{ color: "hsl(var(--dc-navy))" }}>
                ▮ Document Centre
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] px-2 py-0.5 rounded bg-[hsl(var(--dc-blue)/0.1)] font-semibold" style={{ color: "hsl(var(--dc-blue))" }}>
                ↑ Upload Files
              </span>
              <span className="h-4 w-4 rounded-full bg-[hsl(var(--dc-bg-soft))]" />
              <span className="h-4 w-4 rounded-full bg-[hsl(var(--dc-bg-soft))]" />
            </div>
          </div>
          <div className="flex" style={{ minHeight: 280 }}>
            {/* sidebar */}
            <div className="bg-[#0f2348] text-white py-3" style={{ width: 86 }}>
              <div className="px-2.5 space-y-0.5">
                {[
                  { l: "Dashboard", a: false },
                  { l: "Products", a: true },
                  { l: "Templates", a: false },
                  { l: "Customers", a: false },
                  { l: "Quotes", a: false },
                  { l: "Orders", a: false },
                  { l: "Reports", a: false },
                  { l: "Settings", a: false },
                ].map((i) => (
                  <div
                    key={i.l}
                    className={`text-[7.5px] px-1.5 py-1 rounded ${i.a ? "bg-white/15 font-semibold" : "text-white/70"}`}
                  >
                    ● {i.l}
                  </div>
                ))}
              </div>
            </div>
            {/* product grid */}
            <div className="flex-1 px-3 py-2.5 bg-[#fafbfd]">
              <div className="flex items-center gap-2 mb-2 text-[8px]">
                <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--dc-blue))] text-white font-semibold">Products</span>
                <span className="dc-muted">Templates</span>
                <span className="dc-muted">Favourites</span>
                <span className="dc-muted">Recent</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {cat.map((p) => (
                  <div key={p.name} className="rounded-md border border-[#e6ecf3] p-1.5 bg-white">
                    <div className="h-[34px] rounded mb-1 flex items-center justify-center" style={{ background: `color-mix(in srgb, ${p.c} 18%, white)` }}>
                      <div className="h-4 w-5 rounded-sm bg-white shadow-sm" />
                    </div>
                    <div className="text-[6.5px] font-bold leading-tight mb-0.5" style={{ color: "hsl(var(--dc-navy))" }}>
                      {p.name}
                    </div>
                    <div className="text-[6px] px-1 py-0.5 rounded text-white text-center font-semibold" style={{ background: p.c }}>
                      {p.btn}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* laptop base lip */}
      <div className="mx-auto h-[10px] rounded-b-2xl bg-gradient-to-b from-[#1c2332] to-[#0f1623]" style={{ width: "108%", marginLeft: "-4%" }} />
    </div>
  );
};

/* phone overlay — small order-summary list */
const PhoneMock = () => (
  <div className="rounded-[26px] bg-[#1c2332] p-[5px] shadow-2xl" style={{ width: 142 }}>
    <div className="rounded-[22px] bg-white overflow-hidden">
      <div className="bg-[#0f2348] text-white px-3 py-2 flex items-center justify-between">
        <span className="text-[8px] font-bold">▮ Document Centre</span>
        <span className="h-1 w-1 rounded-full bg-white/60" />
      </div>
      <div className="px-2.5 py-2 space-y-1.5">
        <div className="text-[7.5px] font-bold" style={{ color: "hsl(var(--dc-navy))" }}>Your Orders</div>
        {[
          { n: "A4 Booklet · 24pp", s: "In Progress", v: "£128", c: "hsl(var(--dc-blue))" },
          { n: "Bus. Cards x500", s: "Proofing", v: "£42", c: "hsl(var(--dc-orange))" },
          { n: "Posters A2 x10", s: "Ready", v: "£96", c: "hsl(var(--dc-green))" },
          { n: "Bound Manual", s: "New", v: "£148", c: "hsl(var(--dc-sky))" },
        ].map((o) => (
          <div key={o.n} className="rounded-md border border-[#eef2f7] p-1.5">
            <div className="text-[7px] font-bold" style={{ color: "hsl(var(--dc-navy))" }}>{o.n}</div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full" style={{ background: o.c }} />
                <span className="text-[6.5px] dc-muted font-medium">{o.s}</span>
              </span>
              <span className="text-[7px] font-bold" style={{ color: "hsl(var(--dc-navy))" }}>{o.v}</span>
            </div>
          </div>
        ))}
        <div className="text-[6.5px] text-center px-1 py-1 rounded-full text-white font-semibold mt-1.5" style={{ background: "hsl(var(--dc-blue))" }}>
          Start New Order
        </div>
      </div>
    </div>
  </div>
);

/* ───────────────────────── Feature outline icons ─────────────────────────
   Multi-stroke colorful line icons matching the reference's style (cloud arrow,
   magnifier, colored grid, receipt, gear, bar chart with arrow).
*/
const IconUpload = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <path d="M16 40 C8 40 8 28 18 28 C18 18 32 16 36 26 C44 24 50 30 48 38 C54 38 56 46 50 48 L18 48 C12 48 10 44 12 40 Z"
      stroke="hsl(var(--dc-blue))" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
    <path d="M32 44 L32 32 M26 38 L32 32 L38 38" stroke="hsl(var(--dc-green))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconPreview = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <circle cx="28" cy="28" r="14" stroke="hsl(var(--dc-blue))" strokeWidth="2.5" fill="none"/>
    <path d="M39 39 L50 50" stroke="hsl(var(--dc-green))" strokeWidth="3" strokeLinecap="round"/>
    <circle cx="28" cy="28" r="6" stroke="hsl(var(--dc-orange))" strokeWidth="2" fill="none"/>
  </svg>
);
const IconCatalogue = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <rect x="12" y="12" width="16" height="16" rx="2.5" stroke="hsl(var(--dc-blue))" strokeWidth="2.5" fill="none"/>
    <rect x="36" y="12" width="16" height="16" rx="2.5" stroke="hsl(var(--dc-green))" strokeWidth="2.5" fill="none"/>
    <rect x="12" y="36" width="16" height="16" rx="2.5" stroke="hsl(var(--dc-orange))" strokeWidth="2.5" fill="none"/>
    <rect x="36" y="36" width="16" height="16" rx="2.5" stroke="hsl(var(--dc-sky))" strokeWidth="2.5" fill="none"/>
    <path d="M40 18 L43 21 L48 16" stroke="hsl(var(--dc-green))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconQuotes = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <path d="M18 8 L42 8 L48 14 L48 56 L18 56 Z" stroke="hsl(var(--dc-blue))" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
    <path d="M42 8 L42 14 L48 14" stroke="hsl(var(--dc-blue))" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
    <text x="33" y="42" textAnchor="middle" fontSize="16" fontWeight="800" fill="hsl(var(--dc-orange))">£</text>
    <line x1="24" y1="22" x2="38" y2="22" stroke="hsl(var(--dc-green))" strokeWidth="2" strokeLinecap="round"/>
    <line x1="24" y1="28" x2="34" y2="28" stroke="hsl(var(--dc-green))" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconWorkflow = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="10" stroke="hsl(var(--dc-blue))" strokeWidth="2.5" fill="none"/>
    <circle cx="32" cy="32" r="3" fill="hsl(var(--dc-orange))"/>
    {[0, 60, 120, 180, 240, 300].map((d) => {
      const r = (d * Math.PI) / 180;
      const x1 = 32 + Math.cos(r) * 14, y1 = 32 + Math.sin(r) * 14;
      const x2 = 32 + Math.cos(r) * 22, y2 = 32 + Math.sin(r) * 22;
      return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--dc-green))" strokeWidth="3" strokeLinecap="round"/>;
    })}
  </svg>
);
const IconReports = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
    <line x1="10" y1="52" x2="54" y2="52" stroke="hsl(var(--dc-navy))" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="10" y1="52" x2="10" y2="14" stroke="hsl(var(--dc-navy))" strokeWidth="2.5" strokeLinecap="round"/>
    <rect x="16" y="36" width="6" height="14" fill="hsl(var(--dc-blue))" rx="1"/>
    <rect x="26" y="28" width="6" height="22" fill="hsl(var(--dc-green))" rx="1"/>
    <rect x="36" y="22" width="6" height="28" fill="hsl(var(--dc-orange))" rx="1"/>
    <path d="M14 30 L22 24 L32 18 L42 12" stroke="hsl(var(--dc-sky))" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M44 14 L48 10 L50 16" stroke="hsl(var(--dc-sky))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

/* timeline icons (filled circles with white pictogram) */
const TimelineIcon = ({ color, kind }: { color: string; kind: "bolt" | "check" | "growth" | "heart" }) => (
  <div className="h-14 w-14 rounded-full flex items-center justify-center shadow-md shrink-0" style={{ background: color }}>
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {kind === "bolt" && <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="white" />}
      {kind === "check" && <polyline points="5 12 10 17 19 7" />}
      {kind === "growth" && <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></>}
      {kind === "heart" && <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="white"/>}
    </svg>
  </div>
);

/* CTA trust icons (line-style with brand colors) */
const TrustIcon = ({ kind }: { kind: "trial" | "feature" | "fees" | "cancel" }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
    {kind === "trial" && (
      <>
        <circle cx="18" cy="18" r="12" stroke="hsl(var(--dc-orange))" strokeWidth="2" fill="none"/>
        <path d="M18 11 L18 18 L23 21" stroke="hsl(var(--dc-sky))" strokeWidth="2" strokeLinecap="round"/>
      </>
    )}
    {kind === "feature" && (
      <>
        <rect x="7" y="7" width="22" height="22" rx="3" stroke="hsl(var(--dc-sky))" strokeWidth="2" fill="none"/>
        <path d="M12 18 L16 22 L24 13" stroke="hsl(var(--dc-orange))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </>
    )}
    {kind === "fees" && (
      <>
        <path d="M18 4 L30 11 L30 22 C30 27 24 31 18 32 C12 31 6 27 6 22 L6 11 Z" stroke="hsl(var(--dc-sky))" strokeWidth="2" fill="none"/>
        <path d="M13 18 L17 22 L24 14" stroke="hsl(var(--dc-orange))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </>
    )}
    {kind === "cancel" && (
      <>
        <rect x="6" y="8" width="24" height="22" rx="3" stroke="hsl(var(--dc-sky))" strokeWidth="2" fill="none"/>
        <line x1="6" y1="14" x2="30" y2="14" stroke="hsl(var(--dc-sky))" strokeWidth="2"/>
        <path d="M14 21 L22 21 M18 17 L18 25" stroke="hsl(var(--dc-orange))" strokeWidth="2.5" strokeLinecap="round" transform="rotate(45 18 21)"/>
      </>
    )}
  </svg>
);

/* ───────────────────────── Main ───────────────────────── */
export default function MarketingLanding() {
  return (
    <div className="dc-marketing">
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[hsl(var(--dc-border))]">
        <div className="max-w-[1240px] mx-auto px-6 h-[112px] flex items-center justify-between">
          <Logo />
          <nav className="hidden lg:flex items-center gap-9 text-[15px] font-medium" style={{ color: "hsl(var(--dc-navy))" }}>
            <a href="#features" className="hover:text-[hsl(var(--dc-blue))]">Features</a>
            <a href="#how-it-works" className="hover:text-[hsl(var(--dc-blue))]">How It Works</a>
            <a href="#pricing" className="hover:text-[hsl(var(--dc-blue))]">Pricing</a>
            <a href="#resources" className="hover:text-[hsl(var(--dc-blue))]">Resources ▾</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="hidden sm:inline-flex items-center justify-center rounded-full border-[1.5px] border-[hsl(var(--dc-border))] px-5 py-2 text-sm font-semibold hover:border-[hsl(var(--dc-blue))]"
              style={{ color: "hsl(var(--dc-navy))" }}
            >
              Login
            </Link>
            <a href="#cta" className="dc-btn dc-btn-primary" style={{ padding: "0.6rem 1.4rem" }}>
              Get Started
            </a>
          </div>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(180deg, hsl(var(--dc-bg-soft)) 0%, #ffffff 100%)`,
        }}
      >
        {/* full-width hero image (already pre-blended to white on the left).
            Sized to width so the whole image fits across the viewport. */}
        <div className="absolute inset-x-0 top-0 hidden md:block pointer-events-none" aria-hidden>
          <img
            src={heroImage}
            alt=""
            className="w-full h-auto block"
          />
          {/* soft fade to white at the bottom so the image blends into page */}
          <div
            className="absolute inset-x-0 bottom-0 h-24"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0) 0%, #ffffff 100%)" }}
          />
        </div>

        <div className="relative max-w-[1240px] mx-auto px-6 pt-16 pb-28 grid lg:grid-cols-[1fr_1.1fr] gap-10 items-center">
          {/* left: copy */}
          <div className="relative z-10">
            <img
              src={webToPrintHeadline}
              alt="Web-to-Print Made Easy"
              className="w-full max-w-[520px] h-auto"
            />
            <p className="mt-5 text-[1.05rem] dc-muted max-w-md leading-relaxed">
              Power your print business with a fast, flexible, and beautiful ordering system your customers will love.
            </p>
            <ul className="mt-7 grid sm:grid-cols-2 gap-y-2.5 gap-x-8 text-[14.5px]" style={{ color: "hsl(var(--dc-navy))" }}>
              {[
                "Online ordering & file upload",
                "Artwork templates & variable data",
                "Instant previews & proofing",
                "Integrated production workflow",
                "Quotes, pricing & approvals",
                "Built for copy shops & small printers",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "hsl(var(--dc-green))" }}
                  >
                    <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
                  </span>
                  <span className="font-medium">{b}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#cta" className="dc-btn dc-btn-primary" style={{ padding: "0.95rem 1.7rem", fontSize: "0.98rem" }}>
                Start Your Free Trial <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#cta" className="dc-btn dc-btn-outline" style={{ padding: "0.95rem 1.7rem", fontSize: "0.98rem" }}>
                <Play className="h-4 w-4" style={{ color: "hsl(var(--dc-blue))" }} fill="hsl(var(--dc-blue))" />
                See It in Action
              </a>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px] dc-muted">
              {["No credit card required", "Set up in minutes", "UK-based & GBP"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4" style={{ color: "hsl(var(--dc-green))" }} strokeWidth={3} /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* right column intentionally empty — the hero image fills the right side as a background */}
          <div aria-hidden />
        </div>
      </section>

      {/* ───────── Features (6 outlined icons) ───────── */}
      <section id="features" className="bg-white py-24">
        <div className="max-w-[1240px] mx-auto px-6">
          <h2 className="text-center font-extrabold tracking-tight" style={{ fontSize: "clamp(1.8rem, 3.2vw, 2.6rem)", color: "hsl(var(--dc-navy))" }}>
            Everything you need to run your print shop online
          </h2>
          <div className="mt-14 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            {[
              { Icon: IconUpload, t1: "Upload &", t2: "File Management", d: "Secure uploads, format checks & auto-preflight" },
              { Icon: IconPreview, t1: "Live Preview", t2: "& Proofing", d: "Accurate previews with zoom, pages & annotations" },
              { Icon: IconCatalogue, t1: "Product", t2: "Catalogue", d: "Customisable templates, finishes & pricing" },
              { Icon: IconQuotes, t1: "Quotes &", t2: "Payments", d: "Instant quotes, approvals & online payments" },
              { Icon: IconWorkflow, t1: "Production", t2: "Workflow", d: "Job tracking, statuses & automated routing" },
              { Icon: IconReports, t1: "Reports &", t2: "Analytics", d: "Track sales, customers & production insights" },
            ].map(({ Icon, t1, t2, d }) => (
              <div key={t1} className="dc-card p-5 text-center flex flex-col items-center">
                <div className="mb-3"><Icon /></div>
                <h3 className="font-bold text-[0.95rem] leading-tight" style={{ color: "hsl(var(--dc-navy))" }}>
                  {t1}<br />{t2}
                </h3>
                <p className="mt-2 text-[12.5px] dc-muted leading-snug">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Why printers choose (timeline + screenshot + samples) ───────── */}
      <section id="how-it-works" className="bg-white pb-28">
        <div className="max-w-[1240px] mx-auto px-6 grid lg:grid-cols-[0.85fr_1.15fr] gap-14 items-center">
          {/* timeline */}
          <div className="relative">
            <h2 className="font-extrabold tracking-tight mb-10" style={{ fontSize: "clamp(1.7rem, 2.6vw, 2.2rem)", color: "hsl(var(--dc-navy))" }}>
              Why printers choose Document Centre
            </h2>
            {/* vertical dotted connector */}
            <div
              className="absolute left-[28px] top-[120px] bottom-10 hidden sm:block"
              style={{
                width: 2,
                backgroundImage: "linear-gradient(to bottom, hsl(var(--dc-border)) 50%, transparent 0)",
                backgroundSize: "2px 8px",
                backgroundRepeat: "repeat-y",
              }}
              aria-hidden
            />
            <div className="space-y-7 relative">
              {[
                { c: "hsl(var(--dc-blue))", k: "bolt" as const, t: "Save time & reduce admin", d: "Automate quoting, ordering & proofing — from upload to print-ready." },
                { c: "hsl(var(--dc-green))", k: "check" as const, t: "Reduce errors & reprints", d: "Built-in preflight checks catch issues before they reach production." },
                { c: "hsl(var(--dc-orange))", k: "growth" as const, t: "Grow your business", d: "Offer 24/7 online ordering and reach more customers without extra staff." },
                { c: "hsl(var(--dc-navy))", k: "heart" as const, t: "Delight your customers", d: "A smooth, branded experience that builds repeat business." },
              ].map((row) => (
                <div key={row.t} className="flex items-start gap-5 relative">
                  <TimelineIcon color={row.c} kind={row.k} />
                  <div className="pt-1">
                    <h3 className="font-bold text-[1.1rem]" style={{ color: "hsl(var(--dc-navy))" }}>{row.t}</h3>
                    <p className="mt-1 text-[14px] dc-muted max-w-md leading-relaxed">{row.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* kanban screenshot + scattered samples */}
          <div className="relative">
            {/* laptop frame containing kanban */}
            <div className="rounded-t-[14px] bg-gradient-to-b from-[#2b3445] to-[#1c2332] p-[10px] shadow-2xl">
              <div className="rounded-[6px] overflow-hidden bg-white">
                <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-[#eef2f7]">
                  <span className="font-bold text-[10px]" style={{ color: "hsl(var(--dc-navy))" }}>▮ Document Centre</span>
                  <div className="flex items-center gap-2 text-[8px] dc-muted">
                    <span>Filter</span><span>Export</span><span>Search</span>
                    <span className="px-2 py-0.5 rounded text-white font-semibold" style={{ background: "hsl(var(--dc-blue))" }}>+ New Job</span>
                  </div>
                </div>
                <div className="flex" style={{ minHeight: 320 }}>
                  <div className="bg-[#0f2348] text-white py-3" style={{ width: 84 }}>
                    <div className="px-2.5 space-y-0.5">
                      {["Dashboard", "Orders", "Products", "Templates", "Customers", "Reports", "Settings"].map((l, i) => (
                        <div key={l} className={`text-[7.5px] px-1.5 py-1 rounded ${i === 1 ? "bg-white/15 font-semibold" : "text-white/70"}`}>● {l}</div>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 px-3 py-3 bg-[#fafbfd]">
                    <div className="font-bold text-[10px] mb-2" style={{ color: "hsl(var(--dc-navy))" }}>Jobs</div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { col: "New (8)", c: "hsl(var(--dc-sky))", items: [{ n: "Business Cards", d: "500 × Standard", p: "£42.50" }, { n: "Brochure A4-trifold", d: "100 × Satin", p: "£108.00" }] },
                        { col: "In Progress (12)", c: "hsl(var(--dc-blue))", items: [{ n: "A4 Flyers", d: "250 × Gloss", p: "£43.00" }, { n: "Poster A2", d: "50 × 13oz Vinyl", p: "£86.00" }] },
                        { col: "Proofing (5)", c: "hsl(var(--dc-orange))", items: [{ n: "Brochure - 8pp", d: "100 × Saddle Stitch", p: "£128.00" }, { n: "NCR Pads", d: "5 × 50 sets", p: "£72.00" }] },
                        { col: "Ready (7)", c: "hsl(var(--dc-green))", items: [{ n: "Poster A2", d: "50 × Matt", p: "£96.00" }, { n: "Stickers", d: "1,000 × Vinyl", p: "£72.00" }] },
                      ].map((c) => (
                        <div key={c.col} className="space-y-1.5">
                          <div className="flex items-center justify-between text-[8px] font-bold" style={{ color: "hsl(var(--dc-navy))" }}>
                            <span style={{ color: c.c }}>{c.col}</span>
                          </div>
                          {c.items.map((it, i) => (
                            <div key={i} className="rounded-md border border-[#e6ecf3] p-1.5 bg-white">
                              <div className="text-[7px] font-bold" style={{ color: "hsl(var(--dc-navy))" }}>{it.n}</div>
                              <div className="text-[6.5px] dc-muted">{it.d}</div>
                              <div className="text-[7px] font-bold mt-0.5" style={{ color: c.c }}>{it.p}</div>
                              <div className="mt-1 h-3 w-3 rounded-full bg-[hsl(var(--dc-bg-soft))] border border-[#e6ecf3]" />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mx-auto h-[10px] rounded-b-2xl bg-gradient-to-b from-[#1c2332] to-[#0f1623]" style={{ width: "108%", marginLeft: "-4%" }} />
            {/* scattered print samples */}
            <img
              src={printSamples}
              alt="Printed brochure samples"
              loading="lazy"
              className="absolute -bottom-12 -left-6 w-[280px] drop-shadow-2xl pointer-events-none"
              style={{ transform: "rotate(-8deg)" }}
            />
          </div>
        </div>
      </section>

      {/* ───────── Testimonial ───────── */}
      <section className="bg-white pb-20">
        <div className="max-w-[1240px] mx-auto px-6">
          <div
            className="dc-card p-7 max-w-[640px] flex items-center gap-6"
            style={{ borderRadius: 20 }}
          >
            <div className="flex-1">
              <div className="text-4xl leading-none mb-1 font-serif" style={{ color: "hsl(var(--dc-blue))" }}>“</div>
              <p className="text-[15px] leading-relaxed font-medium" style={{ color: "hsl(var(--dc-navy))" }}>
                Document Centre has transformed how we take orders. Our customers love the simple interface, and our
                workflow is so much smoother.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4" fill="hsl(var(--dc-orange))" stroke="hsl(var(--dc-orange))" />
                  ))}
                </div>
                <span className="text-[13px] dc-muted font-medium">— Sarah T., Print Manager, UK</span>
              </div>
            </div>
            <img
              src={sarahPhoto}
              alt="Sarah T."
              loading="lazy"
              width={88}
              height={88}
              className="h-[88px] w-[88px] rounded-full object-cover shrink-0 border-4 border-white shadow-md"
            />
          </div>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section
        id="cta"
        className="relative overflow-hidden py-16"
        style={{ background: "linear-gradient(135deg, #0a2358 0%, hsl(var(--dc-navy)) 50%, #051640 100%)" }}
      >
        <CtaRibbons />
        <div className="relative max-w-[1240px] mx-auto px-6 grid lg:grid-cols-[1.4fr_1fr] gap-10 items-center text-white">
          {/* left: heading + CTAs */}
          <div>
            <h2 className="font-extrabold tracking-tight text-white" style={{ fontSize: "clamp(1.8rem, 3vw, 2.5rem)", lineHeight: 1.15, color: "#ffffff" }}>
              Ready to modernise your print business?
            </h2>
            <p className="mt-3 text-white/80 text-[15px]">
              Join hundreds of copy shops &amp; printers using Document Centre to grow.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/auth" className="dc-btn dc-btn-green" style={{ padding: "1rem 2rem", fontSize: "0.98rem" }}>
                Start Your Free Trial <ArrowRight className="h-4 w-4" />
              </a>
              <a href="mailto:hello@document-centre.com" className="dc-btn dc-btn-light-outline" style={{ padding: "1rem 2rem", fontSize: "0.98rem" }}>
                Book a Demo
              </a>
            </div>
          </div>

          {/* right: 4 trust icons in a 2x2 grid */}
          <div className="grid grid-cols-2 gap-y-6 gap-x-8">
            {[
              { k: "trial" as const, t: "14-day free trial" },
              { k: "feature" as const, t: "Full feature access" },
              { k: "fees" as const, t: "No setup fees" },
              { k: "cancel" as const, t: "Cancel anytime" },
            ].map((i) => (
              <div key={i.t} className="flex flex-col items-center text-center gap-2">
                <TrustIcon kind={i.k} />
                <span className="text-[13.5px] font-semibold text-white">{i.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="bg-white border-t border-[hsl(var(--dc-border))] py-10">
        <div className="max-w-[1240px] mx-auto px-6 flex flex-wrap items-center justify-between gap-6">
          <Logo />
          <nav className="flex flex-wrap gap-7 text-sm font-medium" style={{ color: "hsl(var(--dc-navy))" }}>
            {["Features", "How It Works", "Pricing", "Resources", "Support", "Contact"].map((l) => (
              <a key={l} href="#" className="hover:text-[hsl(var(--dc-blue))]">{l}</a>
            ))}
          </nav>
          <div className="flex gap-2.5">
            {[Linkedin, Youtube, Mail].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="h-9 w-9 rounded-full flex items-center justify-center border border-[hsl(var(--dc-border))] hover:border-[hsl(var(--dc-blue))]"
                style={{ color: "hsl(var(--dc-blue))" }}
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
        <div className="max-w-[1240px] mx-auto px-6 mt-8 pt-5 border-t border-[hsl(var(--dc-border))] flex flex-wrap gap-3 justify-between text-xs dc-muted">
          <span>© {new Date().getFullYear()} Document Centre. All rights reserved.</span>
          <span>Web-to-Print software for copy shops &amp; small printers · <a href="#" className="hover:text-[hsl(var(--dc-blue))]">Privacy</a> · <a href="#" className="hover:text-[hsl(var(--dc-blue))]">Terms</a></span>
        </div>
      </footer>
    </div>
  );
}
