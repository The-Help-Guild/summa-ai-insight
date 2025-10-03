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
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    };
    const videoPageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers });

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

    // If captionTracks exist, try to fetch from them (with translation fallback)
    if (captionTracks.length > 0) {
      console.log('Available caption tracks:', captionTracks.map((t: any) => ({
        lang: t.languageCode || t.vssId,
        kind: t.kind,
        name: t.name?.simpleText
      })));

      // Priority: English auto-generated > English manual > Any auto-generated > Any language
      const englishASR = captionTracks.find((track: any) => {
        const langCode = track.languageCode || track.vssId;
        const isEnglish = langCode === 'en' || langCode?.startsWith('en') || langCode?.includes('.en');
        const isASR = track.kind === 'asr';
        return isEnglish && isASR;
      });
      
      const englishManual = captionTracks.find((track: any) => {
        const langCode = track.languageCode || track.vssId;
        const isEnglish = langCode === 'en' || langCode?.startsWith('en') || langCode?.includes('.en');
        return isEnglish && track.kind !== 'asr';
      });
      
      const anyASR = captionTracks.find((track: any) => track.kind === 'asr');
      
      const selectedTrack = englishASR || englishManual || anyASR || captionTracks[0];
      
      console.log('Selected track:', {
        lang: selectedTrack.languageCode || selectedTrack.vssId,
        kind: selectedTrack.kind,
        isASR: selectedTrack.kind === 'asr'
      });

      let captionUrl: string = selectedTrack.baseUrl;
      if (!captionUrl) throw new Error('Caption URL not found');

      // If not English, ask YouTube to translate to English when possible
      const isEnglish = (selectedTrack.languageCode || selectedTrack.vssId || '').includes('en');
      if (!isEnglish && !/([?&])tlang=/.test(captionUrl)) {
        captionUrl += (captionUrl.includes('?') ? '&' : '?') + 'tlang=en';
        console.log('Adding translation to English');
      }

      // Prefer rich format when supported
      if (!/([?&])fmt=/.test(captionUrl)) {
        captionUrl += '&fmt=srv3';
      }

      console.log('Fetching captions from URL...');
      const transcriptXml = await tryFetchText(captionUrl, headers);
      const parsed = parseTranscriptXml(transcriptXml);
      if (parsed) {
        console.log('Transcript extracted from captionTracks. Type:', selectedTrack.kind === 'asr' ? 'Auto-generated' : 'Manual');
        return parsed;
      }
      console.log('CaptionTracks path empty. Falling back to timedtext API.');
    } else {
      console.log('No captionTracks found in page. Falling back to timedtext API.');
    }

    // Fallback 1: TimedText direct English ASR first, then manual, then other ASR
    const base = 'https://www.youtube.com/api/timedtext';
    const directCandidates = [
      `lang=en&kind=asr&v=${videoId}&fmt=srv3`,  // English auto-generated (priority)
      `lang=en&v=${videoId}&fmt=srv3`,           // English manual
      `lang=en&kind=asr&v=${videoId}`,           // English auto-generated (fallback format)
      `lang=en&v=${videoId}`,                    // English manual (fallback format)
    ];
    for (const q of directCandidates) {
      const xml = await tryFetchText(`${base}?${q}`, headers);
      const parsed = parseTranscriptXml(xml);
      if (parsed) {
        console.log('Transcript extracted via direct timedtext candidate:', q);
        return parsed;
      }
    }

    // Fallback 2: Get available languages and try each (with and without ASR + translated to EN)
    const listXml = await tryFetchText(`${base}?type=list&v=${videoId}`, headers);
    const languages = Array.from(listXml.matchAll(/<track[^>]*lang_code=\"([^\"]+)\"[^>]*>/g)).map(m => m[1]);
    console.log('Timedtext languages available:', languages);

    for (const lang of languages.slice(0, 8)) { // limit to first 8 to avoid long loops
      const variants = [
        `lang=${lang}&v=${videoId}&fmt=srv3`,
        `lang=${lang}&kind=asr&v=${videoId}&fmt=srv3`,
        `lang=${lang}&v=${videoId}&tlang=en&fmt=srv3`,
        `lang=${lang}&kind=asr&v=${videoId}&tlang=en&fmt=srv3`,
      ];
      for (const q of variants) {
        const xml = await tryFetchText(`${base}?${q}`, headers);
        const parsed = parseTranscriptXml(xml);
        if (parsed) {
          console.log('Transcript extracted via timedtext languages variant:', q);
          return parsed;
        }
      }
    }

    throw new Error('No captions available for this video');
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw new Error('Could not fetch video transcript. The video may not have captions available or they may be disabled.');
  }
}

function parseTranscriptXml(xml: string): string {
  if (!xml || !xml.includes('<transcript')) return '';
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
    if (text) parts.push(text);
  }
  const joined = parts.join(' ');
  return joined.length > 0 ? joined : '';
}

async function tryFetchText(url: string, headers: Record<string, string>): Promise<string> {
  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return '';
    return await r.text();
  } catch (e) {
    console.log('Fetch failed for', url, e);
    return '';
  }
}
