import { useNavigate } from "react-router-dom";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { Button } from "@/components/ui/button";
import { ArrowRight, Printer, Shield, Clock, Truck } from "lucide-react";

export default function StorefrontLanding() {
  const { tenant, slug, loading: tenantLoading, error: tenantError } = useTenantFromSlug();
  const { data: branding, isLoading: brandingLoading } = useTenantBranding(tenant?.id ?? null);
  const navigate = useNavigate();

  if (tenantLoading || brandingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Storefront Not Found</h1>
          <p className="text-muted-foreground">{tenantError ?? "This storefront does not exist."}</p>
        </div>
      </div>
    );
  }

  const b = branding ?? {
    primary_color: "#1a1a2e",
    secondary_color: "#16213e",
    accent_color: "#0f3460",
    portal_name: tenant.name,
    logo_url: tenant.logo_url ?? "",
    hero_image_url: "",
    tagline: "Professional printing, delivered.",
    cta_text: "Start Printing",
    landing_layout: "hero_centered",
  };

  const portalName = b.portal_name || tenant.name;
  const handleCTA = () => navigate(`/t/${slug}/auth`);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        "--storefront-primary": b.primary_color,
        "--storefront-secondary": b.secondary_color,
        "--storefront-accent": b.accent_color,
      } as React.CSSProperties}
    >
      {/* Nav — controlled branded header */}
      <nav className="sticky top-0 z-50 border-b backdrop-blur-md bg-white/80 dark:bg-gray-900/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {b.logo_url && (
              <img src={b.logo_url} alt={portalName} className="h-8 w-auto object-contain" />
            )}
            <span className="text-lg font-bold" style={{ color: b.primary_color }}>
              {portalName}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(`/t/${slug}/auth`)}>
              Sign In
            </Button>
            <Button onClick={handleCTA} style={{ backgroundColor: b.primary_color, color: "#fff" }}>
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {b.hero_image_url && (
          <div className="absolute inset-0">
            <img
              src={b.hero_image_url}
              alt="Hero"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50" />
          </div>
        )}
        {!b.hero_image_url && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${b.primary_color} 0%, ${b.secondary_color} 50%, ${b.accent_color} 100%)`,
            }}
          />
        )}
        <div className="relative max-w-7xl mx-auto px-6 py-32 md:py-44 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6 leading-tight">
            {b.tagline || "Professional printing, delivered."}
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10">
            Order high-quality prints online with fast turnaround and delivery right to your door.
          </p>
          <Button
            size="lg"
            className="text-lg px-8 py-6 rounded-xl shadow-2xl"
            style={{ backgroundColor: b.accent_color, color: "#fff" }}
            onClick={handleCTA}
          >
            {b.cta_text || "Start Printing"} <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-foreground mb-12">
            Why choose {portalName}?
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Printer, title: "Quality Printing", desc: "Premium materials and finishes for every project" },
              { icon: Clock, title: "Fast Turnaround", desc: "Same-day and next-day options available" },
              { icon: Shield, title: "Secure Upload", desc: "Your files are encrypted and protected" },
              { icon: Truck, title: "Reliable Delivery", desc: "Track your order from production to door" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center space-y-3 p-6 rounded-xl bg-background shadow-sm border">
                <div
                  className="mx-auto w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${b.primary_color}15` }}
                >
                  <Icon className="h-6 w-6" style={{ color: b.primary_color }} />
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-3xl font-bold text-foreground">Ready to get started?</h2>
          <p className="text-muted-foreground text-lg">
            Create an account and place your first order in minutes.
          </p>
          <Button
            size="lg"
            className="text-lg px-8 py-6 rounded-xl"
            style={{ backgroundColor: b.primary_color, color: "#fff" }}
            onClick={handleCTA}
          >
            {b.cta_text || "Start Printing"} <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer — controlled */}
      <footer className="border-t py-8 bg-muted/20 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            {b.logo_url && <img src={b.logo_url} alt="" className="h-5 w-auto" />}
            <span>© {new Date().getFullYear()} {portalName}</span>
          </div>
          <div className="flex gap-6">
            <button onClick={() => navigate(`/t/${slug}/auth`)} className="hover:text-foreground transition-colors">
              Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
