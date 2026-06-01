import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ExternalLink, CreditCard } from "lucide-react";

export function PayFastQuickStartGuide() {
  return (
    <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" /> PayFast setup — quick guide
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          PayFast is South Africa's leading payment gateway. Follow these steps to start accepting card, EFT, SnapScan and Zapper payments through your storefront.
        </p>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="step-1">
            <AccordionTrigger className="text-sm">1. Register a PayFast merchant account</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>If you don't already have a PayFast account, sign up — it's free and you only pay per transaction.</p>
              <a href="https://www.payfast.co.za/registration" target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-primary hover:underline">
                Open PayFast registration <ExternalLink className="h-3 w-3" />
              </a>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step-2">
            <AccordionTrigger className="text-sm">2. Get your Merchant ID, Merchant Key & Passphrase</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>Log in to PayFast and go to <strong>Settings → Integration</strong>. You'll find:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Merchant ID</strong> — public identifier for your account</li>
                <li><strong>Merchant Key</strong> — your API key</li>
                <li><strong>Passphrase</strong> — set one yourself; this signs every request</li>
              </ul>
              <a href="https://developers.payfast.co.za/docs#quickstart" target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-primary hover:underline">
                PayFast Quick Start docs <ExternalLink className="h-3 w-3" />
              </a>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step-3">
            <AccordionTrigger className="text-sm">3. Test in Sandbox first</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>PayFast provides a sandbox where you can simulate payments without spending real money. Add your sandbox credentials below with <strong>Mode = Sandbox</strong> and place a test order through your storefront.</p>
              <a href="https://sandbox.payfast.co.za/" target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-primary hover:underline">
                PayFast Sandbox <ExternalLink className="h-3 w-3" />
              </a>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="step-4">
            <AccordionTrigger className="text-sm">4. Enter your credentials below &amp; go live</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>Use the form in the next card to save your live credentials. Once enabled, your customers will see PayFast at checkout alongside any other methods you've configured.</p>
              <p className="text-xs italic">Until PayFast is set up, your customers will only see manual payment methods (Cash / EFT) at checkout.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
