import { Info, Shield } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export const PrivacyNotice = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Alert className="border-primary/20 bg-primary/5">
      <Shield className="h-4 w-4 text-primary" />
      <div className="ml-2 space-y-2">
        <AlertTitle className="text-sm font-semibold text-foreground mb-2">
          Privacy & Data Security Compliance
        </AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Zero Data Retention:</strong> Your content is processed in real-time using secure, encrypted connections and is never stored on our servers. All data exists only in your browser during your active session and is automatically purged when you close or refresh the page.
          </p>
          
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
              <span className="font-medium">View Full Privacy & Security Details</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            
            <CollapsibleContent className="mt-3 space-y-3 text-xs">
              <div>
                <strong className="text-foreground block mb-1">GDPR Compliance (EU):</strong>
                ✓ No personal data collection or processing<br/>
                ✓ No cookies or tracking technologies<br/>
                ✓ Right to erasure automatically enforced (session-only data)<br/>
                ✓ Data minimization principle fully implemented<br/>
                ✓ No cross-border data transfers
              </div>

              <div>
                <strong className="text-foreground block mb-1">US Privacy Laws Compliance:</strong>
                ✓ CCPA/CPRA (California): No sale or sharing of personal information<br/>
                ✓ VCDPA (Virginia), CPA (Colorado), CTDPA (Connecticut), UCPA (Utah)<br/>
                ✓ Full transparency - no hidden data collection<br/>
                ✓ Consumer rights automatically respected (no data = no rights needed)<br/>
                ✓ No targeted advertising or profiling
              </div>

              <div>
                <strong className="text-foreground block mb-1">Data Security Protocols:</strong>
                ✓ TLS/SSL encryption for all data in transit<br/>
                ✓ Client-side processing where possible<br/>
                ✓ Secure API endpoints with CORS protection<br/>
                ✓ No server-side data persistence or logging of content<br/>
                ✓ Automatic memory cleanup on session end<br/>
                ✓ Zero-knowledge architecture - we cannot access your content
              </div>

              <div>
                <strong className="text-foreground block mb-1">Your Rights:</strong>
                ✓ Complete control - your data never leaves your browser except during processing<br/>
                ✓ No account required - anonymous usage by default<br/>
                ✓ Opt-out not needed - we don't collect data to opt out of<br/>
                ✓ Instant deletion - close tab to delete everything
              </div>

              <div className="pt-2 border-t border-primary/10">
                <p className="text-muted-foreground italic">
                  This service is designed with privacy-by-default principles. We cannot access, store, or share your data because we fundamentally do not retain it.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </AlertDescription>
      </div>
    </Alert>
  );
};
