import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";

interface BulletPoint { point: string; reference: string }
interface Summary { summary: string; bulletPoints: BulletPoint[] }

interface GlobalSearchProps {
  summary: Summary | null;
  translatedSummary: Summary | null;
  originalContent: string;
  originalUrl?: string;
  onNavigate?: (section: 'summary' | 'bullets' | 'content', bulletIndex?: number, query?: string) => void;
}

export function GlobalSearch({ summary, translatedSummary, originalContent, originalUrl, onNavigate }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const list: { title: string; text: string; section: 'summary' | 'bullets' | 'content'; bulletIndex?: number }[] = [];
    
    // Add original summary
    if (summary?.summary) {
      list.push({ title: "Summary (Original)", text: summary.summary, section: 'summary' });
    }
    
    // Add translated summary if available
    if (translatedSummary?.summary) {
      list.push({ title: "Summary (Translated)", text: translatedSummary.summary, section: 'summary' });
    }
    
    // Add original bullet points
    if (summary?.bulletPoints?.length) {
      summary.bulletPoints.forEach((b, idx) => {
        list.push({ 
          title: `Bullet point ${idx + 1} (Original)`, 
          text: `${b.point} (${b.reference})`, 
          section: 'bullets',
          bulletIndex: idx
        });
      });
    }
    
    // Add translated bullet points if available
    if (translatedSummary?.bulletPoints?.length) {
      translatedSummary.bulletPoints.forEach((b, idx) => {
        list.push({ 
          title: `Bullet point ${idx + 1} (Translated)`, 
          text: `${b.point} (${b.reference})`, 
          section: 'bullets',
          bulletIndex: idx
        });
      });
    }
    
    // Add original content
    if (originalContent) {
      list.push({ title: "Original content", text: originalContent, section: 'content' });
    }
    
    return list;
  }, [summary, translatedSummary, originalContent]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as { title: string; section: 'summary' | 'bullets' | 'content'; bulletIndex?: number; matches: { snippet: string }[] }[];
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

    return sections.map((sec) => {
      const matches: { snippet: string }[] = [];
      const window = 60;
      let m;
      while ((m = regex.exec(sec.text)) && matches.length < 10) {
        const start = Math.max(0, m.index - window);
        const end = Math.min(sec.text.length, m.index + m[0].length + window);
        const prefix = sec.text.slice(start, m.index);
        const match = sec.text.slice(m.index, m.index + m[0].length);
        const suffix = sec.text.slice(m.index + m[0].length, end);
        const snippet = `${prefix}<mark class=\"bg-primary/20 text-primary rounded px-0.5\">${match}</mark>${suffix}`;
        matches.push({ snippet });
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
      
      return { 
        title: sec.title, 
        section: sec.section, 
        bulletIndex: sec.bulletIndex, 
        matches 
      };
    }).filter(r => r.matches.length > 0);
  }, [sections, query]);

  const handleResultClick = (result: typeof results[0]) => {
    if (onNavigate) {
      onNavigate(result.section, result.bulletIndex, query);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Search in content">
          <Search className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search content</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            autoFocus
            placeholder="Type a keyword..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ScrollArea className="max-h-[60vh] pr-2">
            {query && results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches found.</p>
            ) : (
              <div className="space-y-6">
                {results.map((res, idx) => (
                  <div 
                    key={idx} 
                    className="space-y-2 cursor-pointer hover:bg-muted/50 p-3 rounded-lg transition-colors"
                    onClick={() => handleResultClick(res)}
                  >
                    <div className="text-sm font-medium text-muted-foreground">{res.title} ({res.matches.length})</div>
                    <div className="space-y-2">
                      {res.matches.map((m, i) => (
                        <p
                          key={i}
                          className="text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: m.snippet }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
