import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    console.log('Extracting transcript from YouTube URL:', url);
    
    // Extract video ID from various YouTube URL formats
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    console.log('Video ID:', videoId);

    // Fetch transcript using YouTube's timedtext API
    const transcript = await fetchYouTubeTranscript(videoId);
    
    if (!transcript) {
      throw new Error('No transcript available for this video');
    }

    console.log('Transcript extracted successfully, length:', transcript.length);
    
    return new Response(JSON.stringify({ transcript }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error extracting YouTube transcript:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to extract transcript'
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  try {
    // First, get the video page to find transcript data
    const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const videoPageHtml = await videoPageResponse.text();
    
    // Extract caption tracks from the page
    const captionsMatch = videoPageHtml.match(/"captionTracks":(\[.*?\])/);
    if (!captionsMatch) {
      throw new Error('No captions available');
    }
    
    const captionTracks = JSON.parse(captionsMatch[1]);
    if (captionTracks.length === 0) {
      throw new Error('No caption tracks found');
    }
    
    // Get the first available caption track (prefer English)
    const englishTrack = captionTracks.find((track: any) => 
      track.languageCode === 'en' || track.languageCode.startsWith('en')
    );
    const captionTrack = englishTrack || captionTracks[0];
    
    // Fetch the transcript XML
    const transcriptResponse = await fetch(captionTrack.baseUrl);
    const transcriptXml = await transcriptResponse.text();
    
    // Parse XML and extract text
    const textMatches = transcriptXml.matchAll(/<text[^>]*>(.*?)<\/text>/g);
    const transcriptParts: string[] = [];
    
    for (const match of textMatches) {
      const text = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<[^>]*>/g, ''); // Remove any HTML tags
      
      if (text.trim()) {
        transcriptParts.push(text.trim());
      }
    }
    
    return transcriptParts.join(' ');
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw new Error('Could not fetch video transcript. The video may not have captions available.');
  }
}
