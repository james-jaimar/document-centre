import { Link } from "react-router-dom";
import { Check, ArrowRight, Linkedin, Youtube, Mail } from "lucide-react";
import docCentreLogo from "@/assets/doc-centre-logo.svg";

const Logo = ({ height = 88 }: { height?: number }) => (
  <img src={docCentreLogo} alt="Document Centre" style={{ height }} className="w-auto" />
);

/* ───────── Plan data ───────── */
const plans = [
  {
    name: "Starter",
    price: 149,
    desc: "For smaller copy shops and single-location teams getting started online.",
    features: [
      "1 store / location",
      "Customer file upload",
      "Automatic PDF conversion",
      "Size and resolution checks",
      "Bleed and crop checks",
      "Colour / black & white detection",
      "Online flipbook preview",
      "Print-ready PDF output",
      "Standard support",
    ],
    cta: "Start Free Trial",
    ctaLink: "/try",
    note: "Best for shops that want a simple online ordering flow without extra admin features.",
    featured: false,
  },
  {
    name: "Core",
    price: 199,
    desc: "For busy print shops that want the best balance of simplicity, control, and automation.",
    features: [
      "Everything in Starter",
      "Higher monthly job volume",
      "Optional imposed output",
      "More flexible product setup",
      "Branded customer experience",
      "Shop-friendly workflow controls",
      "Faster processing priority",
      "Priority support",
    ],
    cta: "Start Free Trial",
    ctaLink: "/try",
    note: "The easiest way to take print orders online without creating more work for your team.",
    featured: true,
  },
  {
    name: "Multi-Branch",
    price: 349,
    desc: "For print businesses with multiple branches or central production.",
    features: [
      "Everything in Core",
      "Up to 3 branches included",
      "Central admin across locations",
      "Branch-based routing",
      "Shared product setup",
      "Shared account management",
      "Consolidated reporting",
      "Priority onboarding support",
    ],
    cta: "Book a Demo",
    ctaLink: "/auth?mode=register",
    note: "Need more branches? We'll scale with you.",
    featured: false,
  },
];

const comparisonRows = [
  ["Customer file upload", true, true, true],
  ["Automatic PDF conversion", true, true, true],
  ["Size / resolution checks", true, true, true],
  ["Bleed / crop checks", true, true, true],
  ["Colour / B&W detection", true, true, true],
  ["Flipbook preview", true, true, true],
  ["Print-ready PDF output", true, true, true],
  ["Optional imposed output", false, true, true],
  ["Branded customer experience", false, true, true],
  ["Priority support", false, true, true],
  ["Multi-branch admin", false, false, true],
  ["Branch routing", false, false, true],
] as const;

const faqs = [
  { q: "Is there a setup fee?", a: "No. You pay the monthly subscription and get started." },
  { q: "Can I use my own branding?", a: "Yes, on Core and above." },
  { q: "Do you generate print-ready PDFs?", a: "Yes. The system prepares a print-ready PDF for production, with imposed output available on supported plans." },
  { q: "Is this suitable for small copy shops?", a: "Yes. Starter and Core are designed specifically for smaller print businesses that need something simple and practical." },
  { q: "What if I have more than one branch?", a: "The Multi-Branch plan is built for that. If you have a larger setup, we can tailor it with you." },
  { q: "Do you offer a trial?", a: "Yes. Start a free trial and see how it fits your workflow before committing." },
];

const valueCards = [
  { title: "Fewer file problems", desc: "Catch common artwork issues before they become production delays." },
  { title: "Less manual checking", desc: "Spend less time fixing files and more time producing jobs." },
  { title: "Better customer confidence", desc: "Customers see a clear preview before the order reaches production." },
  { title: "Print-ready output", desc: "Receive a production-ready PDF, straight or imposed to suit your workflow." },
];

/* ───────── Page ───────── */
export default function Pricing() {
  return (
    <div className="dc-marketing">
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[hsl(var(--dc-border))]">
        <div className="max-w-[1240px] mx-auto px-6 h-[112px] flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <nav className="hidden lg:flex items-center gap-9 text-[15px] font-medium" style={{ color: "hsl(var(--dc-navy))" }}>
            <Link to="/#features" className="hover:text-[hsl(var(--dc-blue))]">Features</Link>
            <Link to="/#how-it-works" className="hover:text-[hsl(var(--dc-blue))]">How It Works</Link>
            <Link to="/pricing" className="text-[hsl(var(--dc-blue))]">Pricing</Link>
            <Link to="/#resources" className="hover:text-[hsl(var(--dc-blue))]">Resources</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="hidden sm:inline-flex items-center justify-center rounded-full border-[1.5px] border-[hsl(var(--dc-border))] px-5 py-2 text-sm font-semibold hover:border-[hsl(var(--dc-blue))]"
              style={{ color: "hsl(var(--dc-navy))" }}
            >
              Login
            </Link>
            <Link to="/try" className="dc-btn dc-btn-primary" style={{ padding: "0.6rem 1.4rem" }}>
              Try it now
            </Link>
          </div>
        </div>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="bg-[hsl(var(--dc-bg-soft))] py-20 lg:py-28">
        <div className="max-w-[800px] mx-auto px-6 text-center">
          <span className="dc-eyebrow">Simple pricing for print shops</span>
          <h1
            className="mt-4 font-extrabold tracking-tight leading-[1.12]"
            style={{ fontSize: "clamp(2rem, 4vw, 3rem)", color: "hsl(var(--dc-navy))" }}
          >
            Online ordering for print shops, without the usual file headaches
          </h1>
          <p className="mt-5 text-lg dc-muted max-w-2xl mx-auto leading-relaxed">
            Give your customers a simple way to upload files, preview their job,
            and approve with confidence. You get cleaner files, fewer delays,
            and print-ready PDFs your team can use straight away.
          </p>
          <p className="mt-3 text-sm dc-muted">
            Start from <strong style={{ color: "hsl(var(--dc-navy))" }}>£149/month</strong> · Most shops choose Core at <strong style={{ color: "hsl(var(--dc-navy))" }}>£199/month</strong>
          </p>
          <p className="mt-4 text-xs dc-muted">No setup headache. No clunky storefront. No prepress ping-pong.</p>
        </div>
      </section>

      {/* ───────── Pricing cards ───────── */}
      <section className="bg-white py-20 lg:py-24">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-7 items-start">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`dc-card relative flex flex-col p-8 ${
                  plan.featured
                    ? "border-2 border-[hsl(var(--dc-blue))] shadow-xl md:-translate-y-3"
                    : ""
                }`}
              >
                {plan.featured && (
                  <span
                    className="absolute -top-3.5 left-7 text-[13px] font-bold text-white px-4 py-1.5 rounded-full"
                    style={{
                      background: "linear-gradient(90deg, hsl(var(--dc-blue)), hsl(var(--dc-sky)))",
                      boxShadow: "0 8px 20px hsl(var(--dc-blue) / 0.25)",
                    }}
                  >
                    Most Popular
                  </span>
                )}

                <h3 className="text-2xl font-bold" style={{ color: "hsl(var(--dc-navy))" }}>{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-lg font-bold" style={{ color: "hsl(var(--dc-navy))" }}>£</span>
                  <span className="text-5xl font-extrabold" style={{ color: "hsl(var(--dc-navy))" }}>{plan.price}</span>
                  <span className="text-base font-semibold dc-muted">/month</span>
                </div>
                <p className="mt-3 text-sm dc-muted leading-relaxed">{plan.desc}</p>

                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: "hsl(var(--dc-navy))" }}>
                      <span
                        className="mt-0.5 h-[18px] w-[18px] rounded-full flex items-center justify-center shrink-0"
                        style={{ background: "hsl(var(--dc-green))" }}
                      >
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                      </span>
                      <span className="font-medium">{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to={plan.ctaLink}
                  className={`dc-btn mt-7 w-full justify-center text-center ${
                    plan.featured ? "dc-btn-primary" : "dc-btn-outline"
                  }`}
                  style={{ padding: "0.75rem 1.5rem" }}
                >
                  {plan.cta}
                </Link>
                <p className="mt-3 text-xs dc-muted text-center">{plan.note}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm dc-muted">
            <strong style={{ color: "hsl(var(--dc-navy))" }}>Need more branches?</strong> Multi-branch plans scale with your business.
          </p>
        </div>
      </section>

      {/* ───────── Value section ───────── */}
      <section className="bg-[hsl(var(--dc-bg-soft))] py-20 lg:py-24">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <span className="dc-eyebrow">Why shops choose Document Centre</span>
              <h2
                className="mt-4 font-extrabold tracking-tight leading-[1.15]"
                style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", color: "hsl(var(--dc-navy))" }}
              >
                Built for real-world print shops
              </h2>
              <p className="mt-4 dc-muted leading-relaxed">
                This isn't generic ecommerce software dressed up for print.
                It's built for the way print shops actually work: customers upload whatever
                they have, the system checks it automatically, they preview before approval,
                and your team gets a usable production file.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {valueCards.map((v) => (
                <div key={v.title} className="dc-card p-6">
                  <h4 className="font-bold text-lg" style={{ color: "hsl(var(--dc-navy))" }}>{v.title}</h4>
                  <p className="mt-2 text-sm dc-muted leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Comparison table ───────── */}
      <section className="bg-white py-20 lg:py-24">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="text-center mb-12">
            <span className="dc-eyebrow">Compare plans</span>
            <h2
              className="mt-4 font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "hsl(var(--dc-navy))" }}
            >
              Choose the plan that fits your print business
            </h2>
          </div>

          <div className="dc-card overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="bg-[hsl(var(--dc-bg-soft))]">
                  <th className="text-left px-5 py-4 text-sm font-bold" style={{ color: "hsl(var(--dc-navy))" }}>Feature</th>
                  <th className="px-5 py-4 text-sm font-bold text-center" style={{ color: "hsl(var(--dc-navy))" }}>Starter</th>
                  <th className="px-5 py-4 text-sm font-bold text-center" style={{ color: "hsl(var(--dc-blue))" }}>Core</th>
                  <th className="px-5 py-4 text-sm font-bold text-center" style={{ color: "hsl(var(--dc-navy))" }}>Multi-Branch</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([feature, s, c, m], i) => (
                  <tr key={feature} className={i % 2 === 0 ? "" : "bg-[hsl(var(--dc-bg-soft)/0.5)]"}>
                    <td className="text-left px-5 py-3.5 text-sm font-medium" style={{ color: "hsl(var(--dc-navy))" }}>{feature}</td>
                    {[s, c, m].map((v, j) => (
                      <td key={j} className="px-5 py-3.5 text-center">
                        {v ? (
                          <Check className="h-4.5 w-4.5 mx-auto" style={{ color: "hsl(var(--dc-green))" }} strokeWidth={3} />
                        ) : (
                          <span className="dc-muted">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="bg-[hsl(var(--dc-bg-soft))] py-20 lg:py-24">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="text-center mb-12">
            <span className="dc-eyebrow">Questions</span>
            <h2
              className="mt-4 font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "hsl(var(--dc-navy))" }}
            >
              Frequently asked questions
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5 max-w-[900px] mx-auto">
            {faqs.map((f) => (
              <div key={f.q} className="dc-card p-6">
                <h4 className="font-bold" style={{ color: "hsl(var(--dc-navy))" }}>{f.q}</h4>
                <p className="mt-2 text-sm dc-muted leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Bottom CTA ───────── */}
      <section className="bg-white py-20 lg:py-24">
        <div className="max-w-[800px] mx-auto px-6">
          <div
            className="dc-card text-center p-10 lg:p-14"
            style={{
              background: "linear-gradient(135deg, #ffffff, hsl(var(--dc-bg-soft)))",
              border: "1px solid hsl(var(--dc-border))",
            }}
          >
            <h2
              className="font-extrabold tracking-tight"
              style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", color: "hsl(var(--dc-navy))" }}
            >
              Sell print online without making it complicated
            </h2>
            <p className="mt-3 dc-muted">
              Simple for your customers. Practical for your team. Built for print.
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <Link to="/try" className="dc-btn dc-btn-green" style={{ padding: "0.8rem 1.8rem" }}>
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/auth?mode=register" className="dc-btn dc-btn-outline" style={{ padding: "0.8rem 1.8rem" }}>
                Book a Demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="bg-white border-t border-[hsl(var(--dc-border))] py-10">
        <div className="max-w-[1240px] mx-auto px-6 flex flex-wrap items-center justify-between gap-6">
          <Link to="/"><Logo /></Link>
          <nav className="flex flex-wrap gap-7 text-sm font-medium" style={{ color: "hsl(var(--dc-navy))" }}>
            <Link to="/#features" className="hover:text-[hsl(var(--dc-blue))]">Features</Link>
            <Link to="/#how-it-works" className="hover:text-[hsl(var(--dc-blue))]">How It Works</Link>
            <Link to="/pricing" className="hover:text-[hsl(var(--dc-blue))]">Pricing</Link>
            {["Resources", "Support", "Contact"].map((l) => (
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
