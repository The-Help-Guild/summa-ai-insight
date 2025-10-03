import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Languages, Copy, Check, ChevronRight, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";

interface BulletPoint {
  point: string;
  reference: string;
}

interface Summary {
  summary: string;
  bulletPoints: BulletPoint[];
}

interface SummaryDisplayProps {
  summary: Summary;
  originalContent: string;
  originalUrl?: string;
  onBack: () => void;
}

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
];

export const SummaryDisplay = ({ summary, originalContent, originalUrl, onBack }: SummaryDisplayProps) => {
  const [translatedSummary, setTranslatedSummary] = useState<Summary | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [expandedRefs, setExpandedRefs] = useState<Set<number>>(new Set());
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [selectedReference, setSelectedReference] = useState<string>("");
  const sourceContentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const displaySummary = translatedSummary || summary;

  const handleTranslate = async (languageCode: string) => {
    if (!languageCode) return;
    
    setIsTranslating(true);
    setSelectedLanguage(languageCode);

    try {
      const languageName = LANGUAGES.find(l => l.code === languageCode)?.name || languageCode;
      
      const { data, error } = await supabase.functions.invoke('translate-content', {
        body: { 
          text: JSON.stringify(summary),
          targetLanguage: languageName
        }
      });

      if (error) throw error;

      const translated = JSON.parse(data.translatedText);
      setTranslatedSummary(translated);
      
      toast({
        title: "Translation complete",
        description: `Content translated to ${languageName}`,
      });
    } catch (error) {
      console.error('Translation error:', error);
      toast({
        title: "Translation failed",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = async () => {
    const text = `${displaySummary.summary}\n\nKey Points:\n${displaySummary.bulletPoints.map((bp, i) => 
      `${i + 1}. ${bp.point}\n   Reference: "${bp.reference}"`
    ).join('\n\n')}`;
    
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    
    toast({
      title: "Copied to clipboard",
      description: "Summary copied successfully",
    });
  };

  const getExpandedContext = (referenceText: string): string => {
    const index = originalContent.indexOf(referenceText);
    if (index === -1) {
      // Try to find partial match
      const partialRef = referenceText.slice(0, Math.min(50, referenceText.length));
      const partialIndex = originalContent.indexOf(partialRef);
      if (partialIndex === -1) {
        return referenceText;
      }
      
      // Get surrounding context (500 chars before and after)
      const start = Math.max(0, partialIndex - 500);
      const end = Math.min(originalContent.length, partialIndex + referenceText.length + 500);
      let context = originalContent.slice(start, end);
      
      // Add ellipsis if truncated
      if (start > 0) context = '...' + context;
      if (end < originalContent.length) context = context + '...';
      
      return context;
    }
    
    // Get surrounding context (500 chars before and after)
    const start = Math.max(0, index - 500);
    const end = Math.min(originalContent.length, index + referenceText.length + 500);
    let context = originalContent.slice(start, end);
    
    // Add ellipsis if truncated
    if (start > 0) context = '...' + context;
    if (end < originalContent.length) context = context + '...';
    
  return context;
  };

  // Build a robust text fragment with prefix and suffix for better matching
  const createTextFragment = (referenceText: string) => {
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    const content = normalize(originalContent);
    const ref = normalize(referenceText);

    let index = content.indexOf(ref);
    if (index === -1) {
      const partial = ref.slice(0, Math.min(80, ref.length));
      index = content.indexOf(partial);
      if (index === -1) {
        return `#:~:text=${encodeURIComponent(ref.slice(0, 200))}`;
      }
    }

    const prefixStart = Math.max(0, index - 50);
    const prefix = content.slice(prefixStart, index);
    const startText = content.slice(index, Math.min(index + Math.min(200, ref.length), content.length));
    const endIndex = index + ref.length;
    const suffixEnd = Math.min(content.length, endIndex + 50);
    const suffix = content.slice(endIndex, suffixEnd);

    return `#:~:text=${encodeURIComponent(prefix)}-,${encodeURIComponent(startText)},-${encodeURIComponent(suffix)}`;
  };

  const toggleReference = (index: number) => {
    const newExpanded = new Set(expandedRefs);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRefs(newExpanded);
  };

  const openInSource = (referenceText: string) => {
    if (originalUrl) {
      // Open in browser with a robust text fragment (prefix + excerpt + suffix)
      const fragment = createTextFragment(referenceText);
      const urlWithFragment = `${originalUrl}${fragment}`;
      
      window.open(urlWithFragment, '_blank');
      
      toast({
        title: "Opening in browser",
        description: "Attempting to highlight and scroll to the relevant paragraph",
      });
    } else {
      // Fallback to modal if no URL
      setSelectedReference(referenceText);
      setShowSourceModal(true);
    }
  };

  // Highlight and scroll to reference in the modal
  useEffect(() => {
    if (showSourceModal && selectedReference && sourceContentRef.current) {
      setTimeout(() => {
        const content = sourceContentRef.current?.textContent || "";
        const referenceStart = content.indexOf(selectedReference);
        
        if (referenceStart !== -1) {
          // Find the element containing the reference
          const highlightElement = sourceContentRef.current?.querySelector(`[data-highlight="true"]`);
          if (highlightElement) {
            highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);
    }
  }, [showSourceModal, selectedReference]);

  const renderContentWithHighlight = () => {
    if (!selectedReference) return originalContent;
    
    const index = originalContent.indexOf(selectedReference);
    if (index === -1) {
      // Try to find a partial match (first 50 chars)
      const partialRef = selectedReference.slice(0, 50);
      const partialIndex = originalContent.indexOf(partialRef);
      
      if (partialIndex === -1) {
        return originalContent;
      }
      
      const before = originalContent.slice(0, partialIndex);
      const highlighted = originalContent.slice(partialIndex, partialIndex + selectedReference.length);
      const after = originalContent.slice(partialIndex + selectedReference.length);
      
      return (
        <>
          {before}
          <mark className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded" data-highlight="true">
            {highlighted}
          </mark>
          {after}
        </>
      );
    }
    
    const before = originalContent.slice(0, index);
    const highlighted = originalContent.slice(index, index + selectedReference.length);
    const after = originalContent.slice(index + selectedReference.length);
    
    return (
      <>
        {before}
        <mark className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded" data-highlight="true">
          {highlighted}
        </mark>
        {after}
      </>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="gap-2"
        >
          Back
        </Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-muted-foreground" />
          <Select value={selectedLanguage} onValueChange={handleTranslate} disabled={isTranslating}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Translate to..." />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="gap-2"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy
            </>
          )}
        </Button>
      </div>

      <Card className="p-8 bg-gradient-to-br from-card to-card/95 border-border/50 shadow-soft">
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Overview
            </h2>
            <p className="text-lg leading-relaxed text-foreground/90">
              {displaySummary.summary}
            </p>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Key Points
            </h2>
            <div className="space-y-4">
              {displaySummary.bulletPoints.map((bp, index) => (
                <div 
                  key={index}
                  className="group relative pl-6 pb-4 last:pb-0 border-l-2 border-primary/30 hover:border-primary transition-colors"
                >
                  <div className="absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full bg-primary/20 group-hover:bg-primary/40 transition-colors flex items-center justify-center">
                    <ChevronRight className="w-3 h-3 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-medium leading-relaxed">
                      {bp.point}
                    </p>
                    <div className="space-y-2">
                      <blockquote className="text-sm text-muted-foreground italic pl-4 border-l-2 border-muted-foreground/20">
                        {expandedRefs.has(index) ? (
                          <div className="space-y-2">
                            <div className="font-semibold text-foreground">Expanded Context:</div>
                            <div className="whitespace-pre-wrap">
                              "{getExpandedContext(bp.reference)}"
                            </div>
                          </div>
                        ) : (
                          <div className="line-clamp-2">
                            "{bp.reference}"
                          </div>
                        )}
                      </blockquote>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleReference(index)}
                          className="h-7 text-xs gap-1"
                        >
                          {expandedRefs.has(index) ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              Read more
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openInSource(bp.reference)}
                          className="h-7 text-xs gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {originalUrl ? 'View in source' : 'Find in content'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={showSourceModal} onOpenChange={setShowSourceModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Original Content</DialogTitle>
          </DialogHeader>
          <div 
            ref={sourceContentRef}
            className="overflow-y-auto flex-1 text-sm leading-relaxed whitespace-pre-wrap p-4 bg-muted/30 rounded-lg"
          >
            {renderContentWithHighlight()}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            {originalUrl && (
              <Button
                variant="outline"
                onClick={() => {
                  const fragment = createTextFragment(selectedReference);
                  const urlWithFragment = `${originalUrl}${fragment}`;
                  window.open(urlWithFragment, '_blank');
                }}
                className="gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open in browser
              </Button>
            )}
            <Button onClick={() => setShowSourceModal(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};