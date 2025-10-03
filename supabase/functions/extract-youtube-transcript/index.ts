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
    
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    console.log('Video ID:', videoId);

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
    console.log('Attempting to fetch transcript via timedtext API...');
    
    // Try different combinations in order of preference
    const attempts = [
      // English auto-generated
      { lang: 'en', kind: 'asr', fmt: 'srv3', desc: 'English auto-generated (srv3)' },
      { lang: 'en', kind: 'asr', fmt: 'json3', desc: 'English auto-generated (json3)' },
      { lang: 'en', kind: 'asr', desc: 'English auto-generated' },
      // English manual
      { lang: 'en', fmt: 'srv3', desc: 'English manual (srv3)' },
      { lang: 'en', fmt: 'json3', desc: 'English manual (json3)' },
      { lang: 'en', desc: 'English manual' },
      // Any auto-generated with translation
      { kind: 'asr', tlang: 'en', fmt: 'srv3', desc: 'Any ASR translated to English' },
    ];

    for (const attempt of attempts) {
      const params: Record<string, string> = { v: videoId };
      
      if (attempt.lang) params.lang = attempt.lang;
      if (attempt.kind) params.kind = attempt.kind;
      if (attempt.fmt) params.fmt = attempt.fmt;
      if (attempt.tlang) params.tlang = attempt.tlang;
      
      const searchParams = new URLSearchParams(params);
      const url = `https://www.youtube.com/api/timedtext?${searchParams.toString()}`;
      console.log(`Trying: ${attempt.desc}`);
      
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });

        if (response.ok) {
          const text = await response.text();
          
          // Check if we got actual content
          if (text && text.length > 100 && (text.includes('<transcript') || text.includes('"events"'))) {
            console.log(`Success with: ${attempt.desc}`);
            
            // Parse based on format
            let parsed = '';
            if (text.includes('"events"')) {
              // JSON3 format
              parsed = parseJson3Transcript(text);
            } else {
              // XML/srv3 format
              parsed = parseXmlTranscript(text);
            }
            
            if (parsed.length > 50) {
              return parsed;
            }
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        console.log(`Failed: ${attempt.desc} - ${errorMsg}`);
      }
    }

    // Last resort: try to get list of available tracks and use first one
    console.log('Trying to get track list...');
    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`;
    const listResponse = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (listResponse.ok) {
      const listXml = await listResponse.text();
      console.log('Track list response length:', listXml.length);
      
      // Parse available tracks
      const trackMatches = Array.from(listXml.matchAll(/<track[^>]*>/g));
      console.log(`Found ${trackMatches.length} tracks`);
      
      for (const trackMatch of trackMatches) {
        const trackStr = trackMatch[0];
        const langMatch = trackStr.match(/lang_code="([^"]+)"/);
        const kindMatch = trackStr.match(/kind="([^"]+)"/);
        
        if (langMatch) {
          const lang = langMatch[1];
          const kind = kindMatch ? kindMatch[1] : '';
          
          console.log(`Trying track: lang=${lang}, kind=${kind}`);
          
          const params = new URLSearchParams({
            v: videoId,
            lang: lang,
            fmt: 'srv3'
          });
          
          if (kind) {
            params.set('kind', kind);
          }
          
          // If not English, add translation
          if (!lang.startsWith('en')) {
            params.set('tlang', 'en');
          }
          
          const trackUrl = `https://www.youtube.com/api/timedtext?${params.toString()}`;
          
          try {
            const trackResponse = await fetch(trackUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (trackResponse.ok) {
              const text = await trackResponse.text();
              const parsed = parseXmlTranscript(text);
              if (parsed.length > 50) {
                console.log(`Success with track: lang=${lang}, kind=${kind}`);
                return parsed;
              }
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown error';
            console.log(`Failed to fetch track ${lang}: ${errorMsg}`);
          }
        }
      }
    }

    throw new Error('No captions available for this video');
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw new Error('Could not fetch video transcript. The video may not have captions available or they may be disabled.');
  }
}

function parseXmlTranscript(xml: string): string {
  if (!xml || !xml.includes('<text')) return '';
  
  const textMatches = xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g);
  const parts: string[] = [];
  
  for (const match of textMatches) {
    let text = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/<[^>]*>/g, '')
      .trim();
    
    if (text) {
      parts.push(text);
    }
  }
  
  return parts.join(' ');
}

function parseJson3Transcript(json: string): string {
  try {
    const data = JSON.parse(json);
    const parts: string[] = [];
    
    if (data.events) {
      for (const event of data.events) {
        if (event.segs) {
          for (const seg of event.segs) {
            if (seg.utf8) {
              parts.push(seg.utf8.trim());
            }
          }
        }
      }
    }
    
    return parts.join(' ');
  } catch (e) {
    console.error('Failed to parse JSON3 transcript:', e);
    return '';
  }
}
