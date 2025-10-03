import { Mail } from "lucide-react";

export const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="w-full py-6 px-4 mt-12 border-t border-border/50 bg-background/95 backdrop-blur">
      <div className="container mx-auto">
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            © {currentYear} vibedeveloper. All rights reserved.
          </p>
          <a 
            href="mailto:vibedeveloper@proton.me" 
            className="flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <Mail className="w-4 h-4" />
            vibedeveloper@proton.me
          </a>
        </div>
      </div>
    </footer>
  );
};
