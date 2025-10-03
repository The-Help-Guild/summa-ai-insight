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
    const { url, lang = 'en' } = await req.json();
    console.log('Fetching captions for URL:', url, 'Language:', lang);

    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    console.log('Video ID:', videoId);

    // Try the requested language first (manual captions)
    let captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`;
    console.log('Trying manual captions:', captionUrl);
    
    let response = await fetch(captionUrl);
    let xml = await response.text();
    console.log('Manual captions response length:', xml.length, 'Has text tags:', xml.includes('<text'));
    
    // If no valid captions, try auto-generated
    if (!xml.includes('<text')) {
      captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&kind=asr`;
      console.log('Trying auto-generated captions:', captionUrl);
      response = await fetch(captionUrl);
      xml = await response.text();
      console.log('Auto-generated response length:', xml.length, 'Has text tags:', xml.includes('<text'));
    }
    
    // If requested language not available, try English as fallback
    if (!xml.includes('<text') && lang !== 'en') {
      console.log('Trying English fallback');
      captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`;
      response = await fetch(captionUrl);
      xml = await response.text();
      console.log('English response length:', xml.length, 'Has text tags:', xml.includes('<text'));
      
      // Try English auto-generated
      if (!xml.includes('<text')) {
        captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`;
        response = await fetch(captionUrl);
        xml = await response.text();
        console.log('English ASR response length:', xml.length, 'Has text tags:', xml.includes('<text'));
      }
    }
    
    if (!xml.includes('<text')) {
      console.log('No valid captions found. Last XML response:', xml.substring(0, 200));
      throw new Error('No captions available for this video');
    }

    const parsed = parseXmlTranscript(xml);
    console.log('Successfully extracted transcript, length:', parsed.text.length);

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
