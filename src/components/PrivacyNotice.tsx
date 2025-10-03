import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const PrivacyNotice = () => {
  return (
    <Alert className="border-primary/20 bg-primary/5">
      <Info className="h-4 w-4 text-primary" />
      <AlertDescription className="text-sm text-muted-foreground ml-2">
        <strong className="text-foreground">Privacy & Data Protection:</strong> Your content is processed in real-time and never stored. All data exists only during your session and is automatically deleted when you close or refresh the page. No personal information is collected or retained. Fully GDPR compliant.
      </AlertDescription>
    </Alert>
  );
};
