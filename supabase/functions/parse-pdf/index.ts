import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import pdfParse from "https://esm.sh/pdf-parse@1.1.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfData, fileName } = await req.json();
    console.log('Parsing PDF:', fileName);

    if (!pdfData) {
      throw new Error('No PDF data provided');
    }

    // Decode base64 to binary
    const binaryString = atob(pdfData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log('Extracting text from PDF, size:', bytes.length);
    const data = await pdfParse(bytes);
    
    console.log('Extracted text length:', data.text.length, 'pages:', data.numpages);

    if (!data.text || data.text.trim().length < 50) {
      console.log('PDF appears to be scanned or has minimal text');
      
      return new Response(
        JSON.stringify({ 
          text: data.text || 'This PDF appears to contain scanned images with no selectable text. Please ensure your PDF has selectable text or use an OCR tool to convert scanned pages.',
          warning: 'Limited text extracted - PDF may contain scanned images',
          pages: data.numpages
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        text: data.text,
        pages: data.numpages,
        info: data.info
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error parsing PDF:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to parse PDF',
        details: 'The PDF format may be corrupted, encrypted, or use unsupported features. Try opening and re-saving it with a PDF reader first.'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
