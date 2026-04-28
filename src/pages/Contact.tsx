import { useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Phone, MapPin, ArrowRight, Linkedin, Youtube, MessageSquare, Sparkles } from "lucide-react";
import docCentreLogo from "@/assets/doc-centre-logo.svg";

const Logo = ({ height = 56 }: { height?: number }) => (
  <img src={docCentreLogo} alt="Document Centre" style={{ height }} className="w-auto" />
);

export default function Contact() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    subject: "",
    message: "",
  });

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Light client-side validation; the edge function re-validates server-side.
    if (!form.name.trim() || form.name.trim().length < 2) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast({ title: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    if (!form.message.trim() || form.message.trim().length < 10) {
      toast({ title: "Please share a few details about your enquiry", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-contact", {
        body: { ...form, source: "marketing_landing" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSubmitted(true);
      toast({ title: "Thanks — we've got your message", description: "Check your inbox for a confirmation." });
    } catch (err: any) {
      toast({
        title: "Could not send your message",
        description: err?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dc-marketing min-h-screen bg-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <header className="border-b border-[hsl(var(--dc-border))] bg-white/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1240px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" aria-label="Document Centre home">
            <Logo />
          </Link>
          <nav className="hidden md:flex gap-7 text-sm font-medium" style={{ color: "hsl(var(--dc-navy))" }}>
            <Link to="/#features" className="hover:text-[hsl(var(--dc-blue))]">Features</Link>
            <Link to="/pricing" className="hover:text-[hsl(var(--dc-blue))]">Pricing</Link>
            <Link to="/contact" className="text-[hsl(var(--dc-blue))]">Contact</Link>
            <Link to="/auth" className="hover:text-[hsl(var(--dc-blue))]">Sign in</Link>
          </nav>
          <Link
            to="/try"
            className="dc-btn dc-btn-green text-sm"
            style={{ padding: "0.6rem 1.1rem" }}
          >
            Try it now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden py-16 lg:py-20"
        style={{
          background: "linear-gradient(135deg,#0a2358 0%, hsl(var(--dc-navy)) 50%, #051640 100%)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          <div
            className="absolute"
            style={{
              top: "-20%", right: "-15%", width: "70%", height: "180px",
              transform: "rotate(28deg)",
              background: "linear-gradient(90deg, hsl(var(--dc-blue) / 0.55), hsl(var(--dc-sky) / 0.35))",
              borderRadius: 999, filter: "blur(0.5px)",
            }}
          />
          <div
            className="absolute"
            style={{
              bottom: "-25%", left: "-10%", width: "60%", height: "140px",
              transform: "rotate(28deg)",
              background: "linear-gradient(90deg, hsl(var(--dc-green) / 0.45), hsl(var(--dc-green) / 0.2))",
              borderRadius: 999,
            }}
          />
        </div>
        <div className="relative max-w-[1100px] mx-auto px-6 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[12px] font-semibold mb-5">
            <Sparkles className="h-3.5 w-3.5" /> We'd love to hear from you
          </div>
          <h1 className="font-extrabold tracking-tight" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", lineHeight: 1.1 }}>
            Let's talk about your print business
          </h1>
          <p className="mt-4 text-white/80 text-[16px] max-w-[640px] leading-relaxed">
            Have a question, a feature request, or want a guided demo? Drop us a line and a real human will get back to you — usually within one business day.
          </p>
        </div>
      </section>

      {/* Form + Info */}
      <section className="py-14 lg:py-20 bg-white">
        <div className="max-w-[1100px] mx-auto px-6 grid lg:grid-cols-[1.4fr_1fr] gap-10">
          {/* Form */}
          <div className="dc-card p-7 lg:p-9" style={{ borderRadius: 18 }}>
            {submitted ? (
              <div className="text-center py-12">
                <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center mb-5"
                     style={{ background: "hsl(var(--dc-green) / 0.12)", color: "hsl(var(--dc-green))" }}>
                  <MessageSquare className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "hsl(var(--dc-navy))" }}>
                  Message received — thanks {form.name.split(" ")[0]}!
                </h2>
                <p className="text-[15px] dc-muted max-w-md mx-auto">
                  We've sent a confirmation to <strong>{form.email}</strong>. Someone from the team will be in touch shortly.
                </p>
                <button
                  onClick={() => { setSubmitted(false); setForm({ name: "", email: "", company: "", phone: "", subject: "", message: "" }); }}
                  className="mt-7 dc-btn dc-btn-light-outline text-sm"
                  style={{ padding: "0.7rem 1.4rem" }}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold mb-1" style={{ color: "hsl(var(--dc-navy))" }}>
                    Send us a message
                  </h2>
                  <p className="text-[14px] dc-muted">All fields marked * are required.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Your name *" htmlFor="c-name">
                    <input id="c-name" type="text" required value={form.name} onChange={update("name")} className={inputCls} maxLength={120} autoComplete="name" />
                  </Field>
                  <Field label="Email address *" htmlFor="c-email">
                    <input id="c-email" type="email" required value={form.email} onChange={update("email")} className={inputCls} maxLength={200} autoComplete="email" />
                  </Field>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Company" htmlFor="c-company">
                    <input id="c-company" type="text" value={form.company} onChange={update("company")} className={inputCls} maxLength={200} autoComplete="organization" />
                  </Field>
                  <Field label="Phone" htmlFor="c-phone">
                    <input id="c-phone" type="tel" value={form.phone} onChange={update("phone")} className={inputCls} maxLength={60} autoComplete="tel" />
                  </Field>
                </div>

                <Field label="Subject" htmlFor="c-subject">
                  <input id="c-subject" type="text" value={form.subject} onChange={update("subject")} className={inputCls} maxLength={200} placeholder="e.g. Demo request" />
                </Field>

                <Field label="Your message *" htmlFor="c-message">
                  <textarea
                    id="c-message"
                    required
                    rows={6}
                    value={form.message}
                    onChange={update("message")}
                    className={`${inputCls} resize-y min-h-[140px]`}
                    maxLength={4000}
                    placeholder="Tell us a bit about your business and what you're trying to solve…"
                  />
                  <div className="text-right text-[11px] dc-muted mt-1">{form.message.length}/4000</div>
                </Field>

                <button
                  type="submit"
                  disabled={submitting}
                  className="dc-btn dc-btn-blue w-full sm:w-auto"
                  style={{ padding: "0.85rem 1.6rem", fontSize: "0.95rem" }}
                >
                  {submitting ? "Sending…" : <>Send message <ArrowRight className="h-4 w-4" /></>}
                </button>

                <p className="text-[12px] dc-muted">
                  By submitting this form, you agree to our{" "}
                  <Link to="/privacy" className="underline hover:text-[hsl(var(--dc-blue))]">Privacy Policy</Link>
                  {" "}and{" "}
                  <Link to="/terms" className="underline hover:text-[hsl(var(--dc-blue))]">Terms of Service</Link>.
                </p>
              </form>
            )}
          </div>

          {/* Side info */}
          <aside className="space-y-5">
            <InfoCard
              icon={<Mail className="h-5 w-5" />}
              title="Email us"
              body={
                <a href="mailto:hello@document-centre.com" className="text-[hsl(var(--dc-blue))] hover:underline font-medium">
                  hello@document-centre.com
                </a>
              }
            />
            <InfoCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="Sales & demos"
              body={<span className="dc-muted">Looking for a guided walk-through? Use the form — we'll book a 20-minute screen-share at a time that suits you.</span>}
            />
            <InfoCard
              icon={<MapPin className="h-5 w-5" />}
              title="Built for SA & global print"
              body={<span className="dc-muted">Designed in South Africa for copy shops, in-plants and small printers worldwide.</span>}
            />
            <div className="dc-card p-6" style={{ borderRadius: 16, background: "linear-gradient(135deg, hsl(var(--dc-blue) / 0.06), hsl(var(--dc-sky) / 0.08))" }}>
              <div className="text-[13px] font-bold mb-1" style={{ color: "hsl(var(--dc-navy))" }}>Prefer to just try it?</div>
              <p className="text-[13px] dc-muted mb-3">Take Document Centre for a no-signup spin in under 30 seconds.</p>
              <Link to="/try" className="dc-btn dc-btn-green text-[13px]" style={{ padding: "0.55rem 1rem" }}>
                Try it now <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </aside>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[hsl(var(--dc-border))] py-10">
        <div className="max-w-[1240px] mx-auto px-6 flex flex-wrap items-center justify-between gap-6">
          <Logo height={48} />
          <nav className="flex flex-wrap gap-6 text-sm font-medium" style={{ color: "hsl(var(--dc-navy))" }}>
            <Link to="/" className="hover:text-[hsl(var(--dc-blue))]">Home</Link>
            <Link to="/pricing" className="hover:text-[hsl(var(--dc-blue))]">Pricing</Link>
            <Link to="/contact" className="hover:text-[hsl(var(--dc-blue))]">Contact</Link>
            <Link to="/privacy" className="hover:text-[hsl(var(--dc-blue))]">Privacy</Link>
            <Link to="/terms" className="hover:text-[hsl(var(--dc-blue))]">Terms</Link>
          </nav>
          <div className="flex gap-2.5">
            <a href="mailto:hello@document-centre.com" aria-label="Email" className="h-9 w-9 rounded-full flex items-center justify-center border border-[hsl(var(--dc-border))] hover:border-[hsl(var(--dc-blue))]" style={{ color: "hsl(var(--dc-blue))" }}>
              <Mail className="h-4 w-4" />
            </a>
            <a href="#" aria-label="LinkedIn" className="h-9 w-9 rounded-full flex items-center justify-center border border-[hsl(var(--dc-border))] hover:border-[hsl(var(--dc-blue))]" style={{ color: "hsl(var(--dc-blue))" }}>
              <Linkedin className="h-4 w-4" />
            </a>
            <a href="#" aria-label="YouTube" className="h-9 w-9 rounded-full flex items-center justify-center border border-[hsl(var(--dc-border))] hover:border-[hsl(var(--dc-blue))]" style={{ color: "hsl(var(--dc-blue))" }}>
              <Youtube className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div className="max-w-[1240px] mx-auto px-6 mt-6 text-xs dc-muted">
          © {new Date().getFullYear()} Document Centre. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[hsl(var(--dc-border))] bg-white px-3.5 py-2.5 text-[14px] text-[hsl(var(--dc-navy))] placeholder:text-[hsl(var(--dc-muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--dc-blue)/0.25)] focus:border-[hsl(var(--dc-blue))] transition";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="text-[12.5px] font-semibold mb-1.5 block" style={{ color: "hsl(var(--dc-navy))" }}>{label}</span>
      {children}
    </label>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: React.ReactNode }) {
  return (
    <div className="dc-card p-5 flex gap-4 items-start" style={{ borderRadius: 14 }}>
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: "hsl(var(--dc-blue) / 0.1)", color: "hsl(var(--dc-blue))" }}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[14px] font-bold mb-0.5" style={{ color: "hsl(var(--dc-navy))" }}>{title}</div>
        <div className="text-[13.5px] leading-relaxed">{body}</div>
      </div>
    </div>
  );
}
