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
    console.log('Fetching captions for URL:', url);

    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    console.log('Video ID:', videoId);

    // Try to fetch captions using timedtext API
    const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`;
    console.log('Fetching from:', captionUrl);

    const response = await fetch(captionUrl);
    
    if (!response.ok) {
      // Try with asr (auto-generated) parameter
      const asrUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`;
      console.log('Trying ASR:', asrUrl);
      
      const asrResponse = await fetch(asrUrl);
      if (!asrResponse.ok) {
        throw new Error('No captions available for this video');
      }
      
      const xml = await asrResponse.text();
      const parsed = parseXmlTranscript(xml);
      
      return new Response(
        JSON.stringify(parsed),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const xml = await response.text();
    const parsed = parseXmlTranscript(xml);

    console.log('Successfully extracted transcript');
    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to fetch captions' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
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

function parseXmlTranscript(xml: string): { text: string; timeline: Array<{ time: string; text: string }> } {
  const textMatches = [...xml.matchAll(/<text[^>]*start="([^"]*)"[^>]*>([^<]*)<\/text>/g)];
  
  const timeline = textMatches.map(match => {
    const startSeconds = parseFloat(match[1]);
    const minutes = Math.floor(startSeconds / 60);
    const seconds = Math.floor(startSeconds % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const text = match[2]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
    
    return { time: timeStr, text };
  });

  const fullText = timeline.map(item => item.text).join(' ');
  
  return { text: fullText, timeline };
}
