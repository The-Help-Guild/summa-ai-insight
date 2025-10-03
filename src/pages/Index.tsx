import { useState } from "react";
import { ContentInput } from "@/components/ContentInput";
import { SummaryDisplay } from "@/components/SummaryDisplay";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Summary {
  summary: string;
  bulletPoints: Array<{
    point: string;
    reference: string;
  }>;
}

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [originalContent, setOriginalContent] = useState("");
  const { toast } = useToast();

  const isYouTubeUrl = (url: string): boolean => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const fetchYouTubeTranscript = async (url: string): Promise<string> => {
    try {
      const { data, error } = await supabase.functions.invoke('extract-youtube-transcript', {
        body: { url }
      });

      if (error) throw error;
      if (!data.transcript) throw new Error('No transcript available');

      return data.transcript;
    } catch (error) {
      throw new Error('Failed to extract video transcript. The video may not have captions available.');
    }
  };

  const fetchUrlContent = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const scripts = doc.querySelectorAll('script, style, nav, header, footer');
      scripts.forEach(el => el.remove());
      
      const content = doc.body.textContent || '';
      return content.replace(/\s+/g, ' ').trim().slice(0, 15000);
    } catch (error) {
      throw new Error('Failed to fetch URL content. Please check the URL and try again.');
    }
  };

  const handleSubmit = async (input: string, type: 'url' | 'text' | 'file') => {
    setIsLoading(true);
    setSummary(null);

    try {
      let content = input;
      
      if (type === 'url') {
        if (isYouTubeUrl(input)) {
          toast({
            title: "Extracting video transcript...",
            description: "Getting captions from YouTube video",
          });
          content = await fetchYouTubeTranscript(input);
        } else {
          toast({
            title: "Fetching content...",
            description: "Extracting text from the URL",
          });
          content = await fetchUrlContent(input);
        }
      }

      setOriginalContent(content);

      toast({
        title: "Analyzing content...",
        description: "AI is generating your summary",
      });

      const { data, error } = await supabase.functions.invoke('summarize-content', {
        body: { content }
      });

      if (error) throw error;

      setSummary(data.summary);
      
      toast({
        title: "Summary ready!",
        description: "Your content has been analyzed successfully",
      });

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setSummary(null);
    setOriginalContent("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="container py-12 px-4 space-y-12">
        {!summary ? (
          <ContentInput onSubmit={handleSubmit} isLoading={isLoading} />
        ) : (
          <SummaryDisplay summary={summary} originalContent={originalContent} onBack={handleBack} />
        )}
        
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;