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

    console.log('Transcript extracted successfully, text length:', transcript.text.length, 'timeline items:', transcript.timeline.length);
    
    return new Response(JSON.stringify({ 
      transcript: transcript.text,
      timeline: transcript.timeline 
    }), {
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

async function fetchYouTubeTranscript(videoId: string): Promise<{ text: string; timeline: Array<{ time: string; text: string }> }> {
  try {
    // 1) Try YouTubei player API first (more reliable for ASR tracks)
    console.log('Attempting YouTubei player API for captions...');
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    const watchResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: commonHeaders });
    if (watchResp.ok) {
      const html = await watchResp.text();
      const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      const clientVersionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || html.match(/"clientVersion":"([^"]+)"/);

      if (apiKeyMatch) {
        const apiKey = apiKeyMatch[1];
        const clientVersion = clientVersionMatch ? clientVersionMatch[1] : '2.20240702.00.00';
        console.log('Found INNERTUBE_API_KEY and clientVersion');

        const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
        const body = {
          context: {
            client: {
              hl: 'en',
              gl: 'US',
              clientName: 'WEB',
              clientVersion,
            },
          },
          videoId,
          playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
          racyCheckOk: true,
          contentCheckOk: true,
        };

        const pResp = await fetch(playerUrl, {
          method: 'POST',
          headers: {
            ...commonHeaders,
            'Content-Type': 'application/json',
            'X-Youtube-Client-Name': '1',
            'X-Youtube-Client-Version': clientVersion,
          },
          body: JSON.stringify(body),
        });

        if (pResp.ok) {
          const pdata = await pResp.json();
          const tracks: any[] =
            pdata?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          console.log('YouTubei caption tracks:', Array.isArray(tracks) ? tracks.length : 0);

          const selectTrack = (tracks: any[]) => {
            const isEn = (code?: string) => !!code && (code === 'en' || code.startsWith('en') || code.includes('.en'));
            const englishASR = tracks.find((t: any) => isEn(t.languageCode || t.vssId) && t.kind === 'asr');
            const englishManual = tracks.find((t: any) => isEn(t.languageCode || t.vssId) && t.kind !== 'asr');
            const anyASR = tracks.find((t: any) => t.kind === 'asr');
            return englishASR || englishManual || anyASR || tracks[0];
          };

          if (Array.isArray(tracks) && tracks.length > 0) {
            const chosen = selectTrack(tracks);
            let captionUrl: string = chosen?.baseUrl;
            if (captionUrl) {
              const langCode = chosen.languageCode || chosen.vssId || '';
              const isEnglish = langCode.includes('en');
              if (!isEnglish && !/([?&])tlang=/.test(captionUrl)) {
                captionUrl += (captionUrl.includes('?') ? '&' : '?') + 'tlang=en';
                console.log('Adding translation to EN on caption URL');
              }
              if (!/([?&])fmt=/.test(captionUrl)) captionUrl += '&fmt=srv3';

              const capRes = await fetch(captionUrl, { headers: commonHeaders });
              if (capRes.ok) {
                const xml = await capRes.text();
                const result = parseXmlTranscript(xml);
                if (result.text.length > 50) {
                  console.log('Transcript extracted via YouTubei.');
                  return result;
                }
              }
            }
          }
        } else {
          console.log('YouTubei player API call failed:', pResp.status);
        }
      } else {
        console.log('Could not find INNERTUBE_API_KEY in page');
      }
    } else {
      console.log('Failed to fetch watch page:', watchResp.status);
    }

    // 2) Fallback to timedtext API with multiple strategies (prioritize English ASR)
    console.log('Falling back to timedtext API...');
    const attempts = [
      { lang: 'en', kind: 'asr', fmt: 'srv3', desc: 'English auto-generated (srv3)' },
      { lang: 'en', kind: 'asr', fmt: 'json3', desc: 'English auto-generated (json3)' },
      { lang: 'en', kind: 'asr', desc: 'English auto-generated' },
      { lang: 'en', fmt: 'srv3', desc: 'English manual (srv3)' },
      { lang: 'en', fmt: 'json3', desc: 'English manual (json3)' },
      { lang: 'en', desc: 'English manual' },
      { kind: 'asr', tlang: 'en', fmt: 'srv3', desc: 'Any ASR translated to English' },
    ];

    for (const attempt of attempts) {
      const params: Record<string, string> = { v: videoId };
      if ((attempt as any).lang) params.lang = (attempt as any).lang;
      if ((attempt as any).kind) params.kind = (attempt as any).kind;
      if ((attempt as any).fmt) params.fmt = (attempt as any).fmt;
      if ((attempt as any).tlang) params.tlang = (attempt as any).tlang;
      const searchParams = new URLSearchParams(params);
      const url = `https://www.youtube.com/api/timedtext?${searchParams.toString()}`;
      console.log(`Trying: ${(attempt as any).desc}`);

      try {
        const response = await fetch(url, { headers: commonHeaders });
        if (response.ok) {
          const text = await response.text();
          if (text && text.length > 100 && (text.includes('<transcript') || text.includes('"events"'))) {
            console.log(`Success with: ${(attempt as any).desc}`);
            let result;
            if (text.includes('"events"')) result = parseJson3Transcript(text);
            else result = parseXmlTranscript(text);
            if (result.text.length > 50) return result;
          }
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        console.log(`Failed: ${(attempt as any).desc} - ${errorMsg}`);
      }
    }

    // 3) As last resort, list available languages and try each (with/without ASR + translate to EN)
    console.log('Trying to get track list...');
    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`;
    const listResponse = await fetch(listUrl, { headers: commonHeaders });
    if (listResponse.ok) {
      const listXml = await listResponse.text();
      console.log('Track list response length:', listXml.length);
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
          const params = new URLSearchParams({ v: videoId, lang, fmt: 'srv3' });
          if (kind) params.set('kind', kind);
          if (!lang.startsWith('en')) params.set('tlang', 'en');
          const trackUrl = `https://www.youtube.com/api/timedtext?${params.toString()}`;
          try {
            const trackResponse = await fetch(trackUrl, { headers: commonHeaders });
            if (trackResponse.ok) {
              const text = await trackResponse.text();
              const result = parseXmlTranscript(text);
              if (result.text.length > 50) {
                console.log(`Success with track: lang=${lang}, kind=${kind}`);
                return result;
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

function parseXmlTranscript(xml: string): { text: string; timeline: Array<{ time: string; text: string }> } {
  if (!xml || !xml.includes('<text')) return { text: '', timeline: [] };
  
  const textMatches = xml.matchAll(/<text[^>]*start="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g);
  const parts: string[] = [];
  const timeline: Array<{ time: string; text: string }> = [];
  
  for (const match of textMatches) {
    const startTime = match[1];
    let text = match[2]
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
      
      // Format timestamp as MM:SS or HH:MM:SS
      const seconds = parseFloat(startTime);
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const timeStr = hours > 0 
        ? `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : `${mins}:${secs.toString().padStart(2, '0')}`;
      
      timeline.push({ time: timeStr, text });
    }
  }
  
  return { text: parts.join(' '), timeline };
}

function parseJson3Transcript(json: string): { text: string; timeline: Array<{ time: string; text: string }> } {
  try {
    const data = JSON.parse(json);
    const parts: string[] = [];
    const timeline: Array<{ time: string; text: string }> = [];
    
    if (data.events) {
      for (const event of data.events) {
        if (event.segs && event.tStartMs !== undefined) {
          const eventText: string[] = [];
          for (const seg of event.segs) {
            if (seg.utf8) {
              eventText.push(seg.utf8.trim());
            }
          }
          
          if (eventText.length > 0) {
            const text = eventText.join('');
            parts.push(text);
            
            // Format timestamp
            const seconds = event.tStartMs / 1000;
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            const timeStr = hours > 0 
              ? `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
              : `${mins}:${secs.toString().padStart(2, '0')}`;
            
            timeline.push({ time: timeStr, text });
          }
        }
      }
    }
    
    return { text: parts.join(' '), timeline };
  } catch (e) {
    console.error('Failed to parse JSON3 transcript:', e);
    return { text: '', timeline: [] };
  }
}
