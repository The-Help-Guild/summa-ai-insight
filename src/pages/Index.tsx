import { useState } from "react";
import { ContentInput } from "@/components/ContentInput";
import { SummaryDisplay } from "@/components/SummaryDisplay";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Footer } from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";

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
  const [originalUrl, setOriginalUrl] = useState("");
  const { toast } = useToast();

  const isYouTubeUrl = (url: string): boolean => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const extractVideoUrls = (html: string): string[] => {
    const videoUrls: string[] = [];
    
    // Extract YouTube embeds
    const youtubeMatches = html.matchAll(/(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g);
    for (const match of youtubeMatches) {
      videoUrls.push(`https://www.youtube.com/watch?v=${match[1]}`);
    }
    
    // Extract YouTube iframes
    const iframeMatches = html.matchAll(/<iframe[^>]+src="([^"]*(?:youtube\.com|youtu\.be)[^"]*)"/gi);
    for (const match of iframeMatches) {
      const iframeSrc = match[1];
      const videoIdMatch = iframeSrc.match(/(?:embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (videoIdMatch) {
        videoUrls.push(`https://www.youtube.com/watch?v=${videoIdMatch[1]}`);
      }
    }
    
    return [...new Set(videoUrls)]; // Remove duplicates
  };

  const fetchYouTubeTranscript = async (url: string): Promise<string> => {
    // Try new captions function first, then fall back to the robust extractor
    try {
      const { data, error } = await supabase.functions.invoke('get-youtube-captions', {
        body: { url, lang: 'en' }
      });
      if (error) throw error;
      if (!data?.text) throw new Error('No captions available');

      let result = data.text as string;
      if (Array.isArray(data.timeline) && data.timeline.length > 0) {
        result += '\n\n=== TIMELINE ===\n\n' + data.timeline.map((item: any) => `[${item.time}] ${item.text}`).join('\n');
      }
      return result;
    } catch (firstErr) {
      console.log('Primary captions fetch failed, trying fallback extractor:', firstErr);
      try {
        const { data, error } = await supabase.functions.invoke('extract-youtube-transcript', {
          body: { url }
        });
        if (error) throw error;
        if (!data?.transcript) throw new Error('No transcript available');
        let result = data.transcript as string;
        if (Array.isArray(data.timeline) && data.timeline.length > 0) {
          result += '\n\n=== TIMELINE ===\n\n' + data.timeline.map((item: any) => `[${item.time}] ${item.text}`).join('\n');
        }
        return result;
      } catch (fallbackErr) {
        console.error('Both caption methods failed:', fallbackErr);
        throw new Error('Failed to extract video transcript. The video may not have captions available.');
      }
    }
  };

  const fetchUrlContent = async (url: string): Promise<string> => {
    try {
      // Use edge function to fetch URL content (bypasses CORS)
      const { data, error } = await supabase.functions.invoke('fetch-url-content', {
        body: { url }
      });

      if (error) throw error;
      if (!data.html) throw new Error('No content returned');

      const html = data.html;
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check for embedded videos
      const videoUrls = extractVideoUrls(html);
      let videoTranscripts = '';
      
      if (videoUrls.length > 0) {
        toast({
          title: "Found embedded videos",
          description: `Extracting transcripts from ${videoUrls.length} video(s)...`,
        });
        
        for (const videoUrl of videoUrls.slice(0, 3)) { // Limit to first 3 videos
          try {
            const transcript = await fetchYouTubeTranscript(videoUrl);
            videoTranscripts += `\n\nVideo Transcript:\n${transcript}\n`;
          } catch (error) {
            console.log('Failed to extract transcript from embedded video:', videoUrl);
          }
        }
      }
      
      const scripts = doc.querySelectorAll('script, style, nav, header, footer');
      scripts.forEach(el => el.remove());
      
      const textContent = doc.body.textContent || '';
      const pageText = textContent.replace(/\s+/g, ' ').trim();
      
      // Combine page text with video transcripts
      const combinedContent = pageText + videoTranscripts;
      return combinedContent.slice(0, 25000); // Increased limit to accommodate videos
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
        setOriginalUrl(input); // Store the original URL
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
    setOriginalUrl("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex flex-col">
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <GlobalSearch summary={summary} originalContent={originalContent} originalUrl={originalUrl} />
        <ThemeToggle />
      </div>
      <div className="container py-12 px-4 space-y-12 flex-1">
        {!summary ? (
          <ContentInput onSubmit={handleSubmit} isLoading={isLoading} />
        ) : (
          <SummaryDisplay summary={summary} originalContent={originalContent} originalUrl={originalUrl} onBack={handleBack} />
        )}
        
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default Index;