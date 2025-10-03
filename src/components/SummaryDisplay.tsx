import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Languages, Copy, Check, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

  const getExpandedContext = (bulletPoint: string, referenceText: string): string => {
    // Extract key terms from the bullet point (remove common words)
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might'];
    const keywords = bulletPoint
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.includes(word))
      .slice(0, 5); // Take top 5 keywords
    
    // Find the reference location
    let referenceIndex = originalContent.indexOf(referenceText);
    if (referenceIndex === -1) {
      const partialRef = referenceText.slice(0, Math.min(80, referenceText.length));
      referenceIndex = originalContent.indexOf(partialRef);
    }
    
    if (referenceIndex === -1) {
      return referenceText;
    }
    
    // Search for additional relevant sections containing keywords
    const relevantSections: Array<{start: number, end: number, score: number}> = [];
    const contentLower = originalContent.toLowerCase();
    
    // Split content into paragraphs (by double newlines or sentence boundaries)
    const paragraphs = originalContent.split(/\n\n+/);
    let currentPos = 0;
    
    for (const paragraph of paragraphs) {
      const paragraphLower = paragraph.toLowerCase();
      let score = 0;
      
      // Score each paragraph based on keyword matches
      for (const keyword of keywords) {
        const matches = (paragraphLower.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      }
      
      if (score > 0) {
        const start = originalContent.indexOf(paragraph, currentPos);
        if (start !== -1) {
          relevantSections.push({
            start,
            end: start + paragraph.length,
            score
          });
        }
      }
      
      currentPos += paragraph.length + 2; // Account for newlines
    }
    
    // Sort by score and take top relevant sections
    relevantSections.sort((a, b) => b.score - a.score);
    
    // Include the reference section and up to 2 additional highly relevant sections
    const sectionsToInclude = relevantSections
      .filter(section => 
        Math.abs(section.start - referenceIndex) > 100 || // Different from reference location
        (section.start <= referenceIndex && section.end >= referenceIndex) // Or contains reference
      )
      .slice(0, 3);
    
    // Combine sections
    let expandedContent = '';
    const sortedSections = sectionsToInclude.sort((a, b) => a.start - b.start);
    
    for (let i = 0; i < sortedSections.length; i++) {
      const section = sortedSections[i];
      let text = originalContent.slice(section.start, section.end).trim();
      
      // Add context around each section (200 chars)
      const contextStart = Math.max(0, section.start - 200);
      const contextEnd = Math.min(originalContent.length, section.end + 200);
      text = originalContent.slice(contextStart, contextEnd).trim();
      
      if (contextStart > 0) text = '...' + text;
      if (contextEnd < originalContent.length) text = text + '...';
      
      expandedContent += text;
      if (i < sortedSections.length - 1) {
        expandedContent += '\n\n---\n\n';
      }
    }
    
    // If no relevant sections found, fall back to basic context
    if (!expandedContent) {
      const start = Math.max(0, referenceIndex - 800);
      const end = Math.min(originalContent.length, referenceIndex + referenceText.length + 800);
      expandedContent = originalContent.slice(start, end);
      
      if (start > 0) expandedContent = '...' + expandedContent;
      if (end < originalContent.length) expandedContent = expandedContent + '...';
    }
    
    return expandedContent;
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
                            <div className="font-semibold text-foreground">Relevant Context:</div>
                            <div className="whitespace-pre-wrap">
                              {getExpandedContext(bp.point, bp.reference)}
                            </div>
                          </div>
                        ) : (
                          <div className="line-clamp-2">
                            "{bp.reference}"
                          </div>
                        )}
                      </blockquote>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};