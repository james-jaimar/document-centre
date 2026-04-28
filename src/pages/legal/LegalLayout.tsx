import { Link, NavLink } from "react-router-dom";
import { ReactNode } from "react";
import { Linkedin, Youtube, Mail } from "lucide-react";
import docCentreLogo from "@/assets/doc-centre-logo.svg";

interface LegalLayoutProps {
  title: string;
  updated: string;
  children: ReactNode;
}

const Logo = ({ height = 56 }: { height?: number }) => (
  <img src={docCentreLogo} alt="Document Centre" style={{ height }} className="w-auto" />
);

export default function LegalLayout({ title, updated, children }: LegalLayoutProps) {
  return (
    <div className="dc-marketing min-h-screen bg-white text-[hsl(var(--dc-navy))]">
      {/* Header */}
      <header className="border-b border-[hsl(var(--dc-border))] bg-white">
        <div className="max-w-[1240px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <Logo />
          </Link>
          <nav className="hidden md:flex gap-7 text-sm font-medium">
            <Link to="/#features" className="hover:text-[hsl(var(--dc-blue))]">Features</Link>
            <Link to="/pricing" className="hover:text-[hsl(var(--dc-blue))]">Pricing</Link>
            <Link to="/auth" className="hover:text-[hsl(var(--dc-blue))]">Sign in</Link>
          </nav>
        </div>
      </header>

      {/* Hero strip */}
      <section className="bg-[hsl(var(--dc-navy))] text-white py-12">
        <div className="max-w-[860px] mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.2em] text-white/70 mb-3">Legal</p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm text-white/70">Last updated: {updated}</p>
        </div>
      </section>

      {/* Sub-nav */}
      <div className="border-b border-[hsl(var(--dc-border))] bg-white sticky top-0 z-10">
        <div className="max-w-[860px] mx-auto px-6 flex gap-6 text-sm h-12 items-center">
          <NavLink
            to="/privacy"
            className={({ isActive }) =>
              `py-3 border-b-2 ${isActive ? "border-[hsl(var(--dc-blue))] text-[hsl(var(--dc-blue))] font-medium" : "border-transparent text-[hsl(var(--dc-navy))]/70 hover:text-[hsl(var(--dc-navy))]"}`
            }
          >
            Privacy Policy
          </NavLink>
          <NavLink
            to="/terms"
            className={({ isActive }) =>
              `py-3 border-b-2 ${isActive ? "border-[hsl(var(--dc-blue))] text-[hsl(var(--dc-blue))] font-medium" : "border-transparent text-[hsl(var(--dc-navy))]/70 hover:text-[hsl(var(--dc-navy))]"}`
            }
          >
            Terms of Service
          </NavLink>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-[860px] mx-auto px-6 py-12">
        <article className="prose prose-slate max-w-none prose-headings:text-[hsl(var(--dc-navy))] prose-headings:font-semibold prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-6 prose-p:text-[15px] prose-p:leading-relaxed prose-li:text-[15px] prose-a:text-[hsl(var(--dc-blue))] prose-a:no-underline hover:prose-a:underline">
          {children}
        </article>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[hsl(var(--dc-border))] py-10">
        <div className="max-w-[1240px] mx-auto px-6 flex flex-wrap items-center justify-between gap-6">
          <Logo height={48} />
          <nav className="flex flex-wrap gap-7 text-sm font-medium">
            <Link to="/" className="hover:text-[hsl(var(--dc-blue))]">Home</Link>
            <Link to="/pricing" className="hover:text-[hsl(var(--dc-blue))]">Pricing</Link>
            <Link to="/privacy" className="hover:text-[hsl(var(--dc-blue))]">Privacy</Link>
            <Link to="/terms" className="hover:text-[hsl(var(--dc-blue))]">Terms</Link>
          </nav>
          <div className="flex gap-2.5">
            {[Linkedin, Youtube, Mail].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="h-9 w-9 rounded-full flex items-center justify-center border border-[hsl(var(--dc-border))] hover:border-[hsl(var(--dc-blue))] text-[hsl(var(--dc-blue))]"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
        <div className="max-w-[1240px] mx-auto px-6 mt-8 pt-5 border-t border-[hsl(var(--dc-border))] text-xs text-[hsl(var(--dc-navy))]/60">
          © {new Date().getFullYear()} Document Centre. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
