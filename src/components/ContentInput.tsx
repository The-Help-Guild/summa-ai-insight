import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link as LinkIcon, Sparkles, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

// Configure PDF.js worker with unpkg CDN (more reliable for ES modules)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

interface ContentInputProps {
  onSubmit: (content: string, type: 'url' | 'text' | 'file') => void;
  isLoading: boolean;
}

export const ContentInput = ({ onSubmit, isLoading }: ContentInputProps) => {
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [activeTab, setActiveTab] = useState<'url' | 'text' | 'file'>('url');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileContent("");
    setFileError(null);
    setIsProcessingFile(true);
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    try {
      console.log('Processing file:', file.name, 'type:', fileExtension);
      
      if (fileExtension === 'txt' || fileExtension === 'csv') {
        const text = await file.text();
        console.log('Text file content length:', text.length);
        setFileContent(text);
      } else if (fileExtension === 'pdf') {
        console.log('Starting PDF processing...');
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        console.log('PDF loaded, pages:', pdf.numPages);
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n';
        }
        
        console.log('PDF text extracted, length:', fullText.length);
        setFileContent(fullText);
      } else if (fileExtension === 'docx') {
        console.log('Starting DOCX processing...');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        console.log('DOCX text extracted, length:', result.value.length);
        setFileContent(result.value);
      } else if (fileExtension === 'xlsm' || fileExtension === 'ods' || fileExtension === 'xlsx') {
        console.log('Starting spreadsheet processing...');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        let fullText = '';
        
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          fullText += `Sheet: ${sheetName}\n${csv}\n\n`;
        });
        
        console.log('Spreadsheet text extracted, length:', fullText.length);
        setFileContent(fullText);
      } else {
        throw new Error('Unsupported file format');
      }
      
      toast({
        title: "File processed",
        description: `${file.name} is ready to summarize`,
      });
    } catch (error) {
      console.error('Error reading file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process file';
      setFileError(errorMessage);
      setFileContent('');
      setFileName('');
      toast({
        title: "Error processing file",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleSubmit = () => {
    let content = '';
    if (activeTab === 'url') content = urlInput;
    else if (activeTab === 'text') content = textInput;
    else if (activeTab === 'file') content = fileContent;
    
    if (content.trim()) {
      onSubmit(content, activeTab);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-8 space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/10 to-accent/10 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            AI-Powered Content Analysis
          </span>
        </div>
        <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
          Smart Summarizer
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Extract key insights from any content instantly with AI. Get clear bullet points with references and translate to any language.
        </p>
      </div>

      <div className="bg-card rounded-2xl shadow-lg border border-border overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'url' | 'text' | 'file')} className="w-full">
          <TabsList className="w-full grid grid-cols-3 rounded-none border-b bg-muted/30">
            <TabsTrigger value="url" className="gap-2 data-[state=active]:bg-background">
              <LinkIcon className="w-4 h-4" />
              URL
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-2 data-[state=active]:bg-background">
              <FileText className="w-4 h-4" />
              Text
            </TabsTrigger>
            <TabsTrigger value="file" className="gap-2 data-[state=active]:bg-background">
              <Upload className="w-4 h-4" />
              File
            </TabsTrigger>
          </TabsList>
          
          <div className="p-6">
            <TabsContent value="url" className="mt-0 space-y-4">
              <Input
                type="url"
                placeholder="https://example.com/article"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="h-12 text-base"
                disabled={isLoading}
              />
            </TabsContent>
            
            <TabsContent value="text" className="mt-0 space-y-4">
              <Textarea
                placeholder="Paste your content here..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="min-h-[200px] text-base resize-none"
                disabled={isLoading}
              />
            </TabsContent>

            <TabsContent value="file" className="mt-0 space-y-4">
              <div className="space-y-3">
                <Input
                  type="file"
                  accept=".txt,.pdf,.csv,.docx,.xlsm,.ods,.xlsx"
                  onChange={handleFileUpload}
                  disabled={isLoading || isProcessingFile}
                  className="cursor-pointer"
                />
                {isProcessingFile && (
                  <div className="text-sm text-primary animate-pulse">
                    Processing file...
                  </div>
                )}
                {fileError && (
                  <div className="text-sm text-destructive">
                    Error: {fileError}
                  </div>
                )}
                {fileName && !isProcessingFile && !fileError && (
                  <div className="text-sm text-muted-foreground">
                    Selected: <span className="font-medium">{fileName}</span>
                  </div>
                )}
                {fileContent && !isProcessingFile && (
                  <div className="p-4 bg-muted/50 rounded-lg max-h-[150px] overflow-y-auto">
                    <p className="text-sm text-muted-foreground line-clamp-6">
                      {fileContent.substring(0, 300)}...
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            <Button 
              onClick={handleSubmit}
              disabled={isLoading || isProcessingFile || (activeTab === 'url' ? !urlInput.trim() : activeTab === 'text' ? !textInput.trim() : !fileContent.trim())}
              size="lg"
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-elegant transition-all"
            >
              {isLoading ? (
                <>
                  <Sparkles className="w-5 h-5 mr-2 animate-pulse" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Summarize Content
                </>
              )}
            </Button>
          </div>
        </Tabs>
      </div>
    </div>
  );
};