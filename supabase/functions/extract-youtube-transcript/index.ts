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
    console.log('Fetching video page...');
    const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!videoPageResponse.ok) {
      throw new Error(`Failed to fetch video page: ${videoPageResponse.status}`);
    }
    
    const videoPageHtml = await videoPageResponse.text();
    console.log('Video page fetched, length:', videoPageHtml.length);
    
    // Try to extract caption tracks from ytInitialPlayerResponse
    let captionTracks: any[] = [];
    
    // Method 1: Extract from ytInitialPlayerResponse
    const playerResponseMatch = videoPageHtml.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (playerResponseMatch) {
      try {
        const playerResponse = JSON.parse(playerResponseMatch[1]);
        console.log('Found ytInitialPlayerResponse');
        captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        console.log('Caption tracks from playerResponse:', captionTracks.length);
      } catch (e) {
        console.log('Failed to parse playerResponse:', e);
      }
    }
    
    // Method 2: Try direct captionTracks pattern
    if (captionTracks.length === 0) {
      const captionsMatch = videoPageHtml.match(/"captionTracks":(\[.*?\])/);
      if (captionsMatch) {
        try {
          captionTracks = JSON.parse(captionsMatch[1]);
          console.log('Caption tracks from direct match:', captionTracks.length);
        } catch (e) {
          console.log('Failed to parse caption tracks:', e);
        }
      }
    }
    
    if (captionTracks.length === 0) {
      throw new Error('No captions available for this video');
    }
    
    console.log('Available caption tracks:', captionTracks.map((t: any) => t.languageCode || t.vssId));
    
    // Prefer English captions
    const englishTrack = captionTracks.find((track: any) => {
      const langCode = track.languageCode || track.vssId;
      return langCode === 'en' || langCode?.startsWith('en') || langCode?.includes('.en');
    });
    
    const selectedTrack = englishTrack || captionTracks[0];
    console.log('Selected track:', selectedTrack.languageCode || selectedTrack.vssId);
    
    const captionUrl = selectedTrack.baseUrl;
    if (!captionUrl) {
      throw new Error('Caption URL not found');
    }
    
    console.log('Fetching captions from URL...');
    const transcriptResponse = await fetch(captionUrl);
    if (!transcriptResponse.ok) {
      throw new Error(`Failed to fetch captions: ${transcriptResponse.status}`);
    }
    
    const transcriptXml = await transcriptResponse.text();
    console.log('Captions XML length:', transcriptXml.length);
    
    // Parse XML and extract text
    const textMatches = transcriptXml.matchAll(/<text[^>]*>(.*?)<\/text>/gs);
    const transcriptParts: string[] = [];
    
    for (const match of textMatches) {
      let text = match[1];
      
      // Decode HTML entities
      text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/<[^>]*>/g, '') // Remove any HTML tags
        .trim();
      
      if (text) {
        transcriptParts.push(text);
      }
    }
    
    const fullTranscript = transcriptParts.join(' ');
    console.log('Transcript extracted, total length:', fullTranscript.length);
    
    if (fullTranscript.length === 0) {
      throw new Error('Transcript is empty');
    }
    
    return fullTranscript;
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw new Error('Could not fetch video transcript. The video may not have captions available or they may be disabled.');
  }
}
