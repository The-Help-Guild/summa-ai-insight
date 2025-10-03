import { useState, useEffect, useRef } from "react";
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
  searchHighlight?: { section: 'summary' | 'bullets' | 'content'; bulletIndex?: number; query?: string } | null;
  onSearchComplete?: () => void;
  translatedSummary: Summary | null;
  onTranslatedSummaryChange: (summary: Summary | null) => void;
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

export const SummaryDisplay = ({ 
  summary, 
  originalContent, 
  originalUrl, 
  onBack, 
  searchHighlight, 
  onSearchComplete,
  translatedSummary: externalTranslatedSummary,
  onTranslatedSummaryChange
}: SummaryDisplayProps) => {
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [expandedRefs, setExpandedRefs] = useState<Set<number>>(new Set());
  const [originalSummaryBeforeTranslation, setOriginalSummaryBeforeTranslation] = useState<Summary>(summary);
  const [translatedExpandedTexts, setTranslatedExpandedTexts] = useState<Map<number, string>>(new Map());
  const [translatingRefs, setTranslatingRefs] = useState<Set<number>>(new Set());
  const [highlightQuery, setHighlightQuery] = useState<string>("");
  const [translatedQuery, setTranslatedQuery] = useState<string>("");
  const bulletRefs = useRef<(HTMLDivElement | null)[]>([]);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  const displaySummary = externalTranslatedSummary || summary;
  const activeQuery = externalTranslatedSummary && translatedQuery ? translatedQuery : highlightQuery;

  // Handle search highlight scrolling
  useEffect(() => {
    if (searchHighlight) {
      setHighlightQuery(searchHighlight.query || "");
      
      if (searchHighlight.section === 'bullets' && searchHighlight.bulletIndex !== undefined) {
        const bulletRef = bulletRefs.current[searchHighlight.bulletIndex];
        if (bulletRef) {
          setTimeout(() => {
            bulletRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
            bulletRef.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
            setTimeout(() => {
              bulletRef.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
              if (onSearchComplete) onSearchComplete();
            }, 2000);
          }, 100);
        }
      } else if (searchHighlight.section === 'summary' && summaryRef.current) {
        setTimeout(() => {
          summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (onSearchComplete) onSearchComplete();
        }, 100);
      }
    }
  }, [searchHighlight, onSearchComplete]);

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return text.replace(regex, '<mark class="bg-primary/20 text-primary rounded px-0.5">$1</mark>');
  };

  // Reset translated query when switching back to original
  useEffect(() => {
    if (!externalTranslatedSummary) {
      setTranslatedQuery("");
    }
  }, [externalTranslatedSummary]);

  const handleTranslate = async (languageCode: string) => {
    if (!languageCode) return;
    
    setIsTranslating(true);
    setSelectedLanguage(languageCode);
    
    // Store original summary before translation
    if (!externalTranslatedSummary) {
      setOriginalSummaryBeforeTranslation(summary);
    }

    try {
      const languageName = LANGUAGES.find(l => l.code === languageCode)?.name || languageCode;
      
      // Translate the summary
      const { data, error } = await supabase.functions.invoke('translate-content', {
        body: { 
          text: JSON.stringify(summary),
          targetLanguage: languageName
        }
      });

      if (error) throw error;

      const translated = JSON.parse(data.translatedText);
      onTranslatedSummaryChange(translated);
      
      // Translate all currently expanded context sections at once
      if (expandedRefs.size > 0) {
        const expandedIndices = Array.from(expandedRefs);
        const translationPromises = expandedIndices.map(async (index) => {
          const originalBp = summary.bulletPoints[index];
          const { text } = getExpandedContext(originalBp.point, originalBp.reference);
          
          const { data: contextData, error: contextError } = await supabase.functions.invoke('translate-content', {
            body: { 
              text: text,
              targetLanguage: languageName
            }
          });
          
          if (contextError) throw contextError;
          return { index, translatedText: contextData.translatedText };
        });
        
        const translatedContexts = await Promise.all(translationPromises);
        const newTranslatedTexts = new Map(translatedExpandedTexts);
        translatedContexts.forEach(({ index, translatedText }) => {
          newTranslatedTexts.set(index, translatedText);
        });
        setTranslatedExpandedTexts(newTranslatedTexts);
      }
      
      // If there's an active search query, translate it too
      if (highlightQuery) {
        try {
          const { data: queryData, error: queryError } = await supabase.functions.invoke('translate-content', {
            body: { 
              text: highlightQuery,
              targetLanguage: languageName
            }
          });
          
          if (!queryError && queryData?.translatedText) {
            setTranslatedQuery(queryData.translatedText);
          }
        } catch (err) {
          console.log('Failed to translate search query:', err);
          // Continue without translated query
        }
      }
      
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

  const getExpandedContext = (bulletPoint: string, referenceText: string): { text: string; propositions: string[] } => {
    // Extract meaningful propositions (phrases) from the bullet point
    const propositions = bulletPoint
      .split(/[;:,]/)
      .map(phrase => phrase.trim())
      .filter(phrase => phrase.length > 15)
      .map(phrase => {
        return phrase.replace(/^(the|a|an|and|or|but|however|therefore|this|these|that|those)\s+/i, '').trim();
      })
      .filter(phrase => phrase.length > 10);
    
    // If no good propositions found, extract key noun phrases
    if (propositions.length === 0) {
      const words = bulletPoint.split(/\s+/);
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = words.slice(i, Math.min(i + 5, words.length)).join(' ');
        if (phrase.length > 15) {
          propositions.push(phrase);
        }
      }
    }
    
    // Find the reference location - try multiple strategies
    let referenceIndex = originalContent.indexOf(referenceText);
    if (referenceIndex === -1) {
      // Try with first 80 chars
      const partialRef = referenceText.slice(0, Math.min(80, referenceText.length));
      referenceIndex = originalContent.indexOf(partialRef);
    }
    if (referenceIndex === -1) {
      // Try searching for key words from reference
      const refWords = referenceText.split(/\s+/).filter(w => w.length > 4);
      for (const word of refWords.slice(0, 5)) {
        const idx = originalContent.toLowerCase().indexOf(word.toLowerCase());
        if (idx !== -1) {
          referenceIndex = idx;
          break;
        }
      }
    }
    
    // If still not found, return the reference with a warning
    if (referenceIndex === -1) {
      return { 
        text: `Reference text: "${referenceText}"\n\n(Note: Could not locate exact reference in original content)`, 
        propositions 
      };
    }
    
    // Start with a larger context window around the reference
    const minWords = 200; // Minimum words to display
    let contextWindow = 2000; // Start with larger window
    let expandedContent = '';
    
    // Try to get context with increasing window sizes until we have enough words
    while (expandedContent.split(/\s+/).length < minWords && contextWindow <= 8000) {
      const start = Math.max(0, referenceIndex - contextWindow);
      const end = Math.min(originalContent.length, referenceIndex + referenceText.length + contextWindow);
      expandedContent = originalContent.slice(start, end).trim();
      
      if (expandedContent.split(/\s+/).length < minWords) {
        contextWindow += 1000; // Increase window
      } else {
        break;
      }
      
      // Add ellipsis if truncated
      if (start > 0) expandedContent = '...' + expandedContent;
      if (end < originalContent.length) expandedContent = expandedContent + '...';
    }
    
    // If we still don't have enough content, search for additional relevant paragraphs
    if (expandedContent.split(/\s+/).length < minWords) {
      const paragraphs = originalContent.split(/\n\n+/);
      const relevantParagraphs: Array<{text: string, score: number}> = [];
      
      for (const paragraph of paragraphs) {
        if (paragraph.length < 50) continue; // Skip very short paragraphs
        
        let score = 0;
        const paragraphLower = paragraph.toLowerCase();
        
        // Score based on proposition matches
        for (const proposition of propositions) {
          const propWords = proposition.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          let matchCount = 0;
          for (const word of propWords) {
            if (paragraphLower.includes(word)) matchCount++;
          }
          if (matchCount > propWords.length * 0.4) {
            score += matchCount;
          }
        }
        
        // Also score based on reference text words
        const refWords = referenceText.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        for (const word of refWords) {
          if (paragraphLower.includes(word)) score += 1;
        }
        
        if (score > 0) {
          relevantParagraphs.push({ text: paragraph, score });
        }
      }
      
      // Sort by score and add top paragraphs
      relevantParagraphs.sort((a, b) => b.score - a.score);
      const topParagraphs = relevantParagraphs.slice(0, 5).map(p => p.text);
      
      if (topParagraphs.length > 0) {
        expandedContent += '\n\n---\n\nAdditional relevant context:\n\n' + topParagraphs.join('\n\n---\n\n');
      }
    }
    
    // Limit to 500 words maximum
    const words = expandedContent.split(/\s+/);
    if (words.length > 500) {
      expandedContent = words.slice(0, 500).join(' ') + '...';
    }
    
    return { text: expandedContent, propositions };
  };

  const highlightPropositions = (text: string, propositions: string[]) => {
    if (!propositions.length) return text;
    
    // Find all matches of propositions (or partial matches with significant overlap)
    const matches: Array<{start: number, end: number, proposition: string}> = [];
    const textLower = text.toLowerCase();
    
    for (const prop of propositions) {
      const propWords = prop.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (propWords.length === 0) continue;
      
      // Look for sequences where most words of the proposition appear close together
      const windowSize = Math.max(prop.length, 50);
      for (let i = 0; i < text.length - windowSize; i++) {
        const window = text.slice(i, i + windowSize);
        const windowLower = window.toLowerCase();
        let matchingWords = 0;
        
        for (const word of propWords) {
          if (windowLower.includes(word)) matchingWords++;
        }
        
        // If more than 60% of proposition words are in this window, mark it
        if (matchingWords > propWords.length * 0.6) {
          // Find the actual extent of the matching text
          let start = i;
          let end = i + windowSize;
          
          // Adjust to word boundaries
          while (start > 0 && /\w/.test(text[start - 1])) start--;
          while (end < text.length && /\w/.test(text[end])) end++;
          
          matches.push({ start, end, proposition: prop });
          i += windowSize; // Skip ahead to avoid overlapping matches
          break;
        }
      }
    }
    
    // Sort matches by position and merge overlapping ones
    matches.sort((a, b) => a.start - b.start);
    const mergedMatches: typeof matches = [];
    for (const match of matches) {
      if (mergedMatches.length === 0) {
        mergedMatches.push(match);
      } else {
        const last = mergedMatches[mergedMatches.length - 1];
        if (match.start <= last.end) {
          // Merge overlapping matches
          last.end = Math.max(last.end, match.end);
        } else {
          mergedMatches.push(match);
        }
      }
    }
    
    // Build the highlighted result
    if (mergedMatches.length === 0) return text;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    
    for (let i = 0; i < mergedMatches.length; i++) {
      const match = mergedMatches[i];
      
      // Add text before the match
      if (match.start > lastIndex) {
        parts.push(text.slice(lastIndex, match.start));
      }
      
      // Add highlighted match
      parts.push(
        <mark key={i} className="bg-primary/20 dark:bg-primary/30 px-1 rounded font-semibold">
          {text.slice(match.start, match.end)}
        </mark>
      );
      
      lastIndex = match.end;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    
    return parts;
  };

  const toggleReference = async (index: number) => {
    const newExpanded = new Set(expandedRefs);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
      
      // If we're in translated mode and don't have a translation for this expanded text yet
      if (externalTranslatedSummary && selectedLanguage && !translatedExpandedTexts.has(index)) {
        setTranslatingRefs(prev => new Set(prev).add(index));
        
        try {
          // Get the original expanded context
          const originalBp = originalSummaryBeforeTranslation.bulletPoints[index];
          const { text } = getExpandedContext(originalBp.point, originalBp.reference);
          
          // Translate it
          const languageName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || selectedLanguage;
          const { data, error } = await supabase.functions.invoke('translate-content', {
            body: { 
              text: text,
              targetLanguage: languageName
            }
          });

          if (error) throw error;

          // Store the translated text
          setTranslatedExpandedTexts(prev => new Map(prev).set(index, data.translatedText));
        } catch (error) {
          console.error('Error translating expanded text:', error);
        } finally {
          setTranslatingRefs(prev => {
            const newSet = new Set(prev);
            newSet.delete(index);
            return newSet;
          });
        }
      }
    }
    setExpandedRefs(newExpanded);
  };

  // Auto-translate expanded sections when language changes or after translation
  useEffect(() => {
    // If not in translated mode, reset caches
    if (!externalTranslatedSummary || !selectedLanguage) {
      if (translatedExpandedTexts.size) setTranslatedExpandedTexts(new Map());
      if (translatingRefs.size) setTranslatingRefs(new Set());
      return;
    }

    const indicesToTranslate = Array.from(expandedRefs).filter((i) => !translatedExpandedTexts.has(i));
    if (indicesToTranslate.length === 0) return;

    const languageName = LANGUAGES.find((l) => l.code === selectedLanguage)?.name || selectedLanguage;

    (async () => {
      // Mark as translating
      setTranslatingRefs((prev) => {
        const s = new Set(prev);
        indicesToTranslate.forEach((i) => s.add(i));
        return s;
      });

      try {
        const results = await Promise.all(
          indicesToTranslate.map(async (i) => {
            const originalBp = originalSummaryBeforeTranslation.bulletPoints[i];
            const fallbackBp = displaySummary.bulletPoints[i];
            const { text } = getExpandedContext(
              originalBp?.point || fallbackBp?.point,
              originalBp?.reference || fallbackBp?.reference
            );
            const { data, error } = await supabase.functions.invoke('translate-content', {
              body: { text, targetLanguage: languageName },
            });
            if (error) throw error;
            return { i, t: data.translatedText as string };
          })
        );

        setTranslatedExpandedTexts((prev) => {
          const m = new Map(prev);
          results.forEach(({ i, t }) => m.set(i, t));
          return m;
        });
      } catch (e) {
        console.error('Batch translation error:', e);
      } finally {
        setTranslatingRefs((prev) => {
          const s = new Set(prev);
          indicesToTranslate.forEach((i) => s.delete(i));
          return s;
        });
      }
    })();
  }, [externalTranslatedSummary, selectedLanguage, expandedRefs]);

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
          <div className="space-y-3" ref={summaryRef}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Overview
            </h2>
            <p 
              className="text-lg leading-relaxed text-foreground/90"
              dangerouslySetInnerHTML={{ __html: highlightText(displaySummary.summary, activeQuery) }}
            />
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
                  ref={(el) => bulletRefs.current[index] = el}
                  className="group relative pl-6 pb-4 last:pb-0 border-l-2 border-primary/30 hover:border-primary transition-all rounded-lg"
                >
                  <div className="absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full bg-primary/20 group-hover:bg-primary/40 transition-colors flex items-center justify-center">
                    <ChevronRight className="w-3 h-3 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <p 
                      className="text-base font-medium leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: highlightText(bp.point, activeQuery) }}
                    />
                    <div className="space-y-2">
                      <blockquote className="text-sm text-muted-foreground italic pl-4 border-l-2 border-muted-foreground/20">
                        {expandedRefs.has(index) ? (
                          <div className="space-y-2">
                            <div className="font-semibold text-foreground">Relevant Context:</div>
                            {translatingRefs.has(index) ? (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                                Translating...
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap">
                                {(() => {
                                  // If we have a translated version and we're in translated mode, show it
                                  if (externalTranslatedSummary && translatedExpandedTexts.has(index)) {
                                    return translatedExpandedTexts.get(index);
                                  }
                                  
                                  // Otherwise show original with highlighting
                                  const originalBp = originalSummaryBeforeTranslation.bulletPoints[index];
                                  const { text, propositions } = getExpandedContext(
                                    originalBp?.point || bp.point, 
                                    originalBp?.reference || bp.reference
                                  );
                                  return highlightPropositions(text, propositions);
                                })()}
                              </div>
                            )}
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