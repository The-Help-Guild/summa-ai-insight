import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link as LinkIcon, Sparkles } from "lucide-react";

interface ContentInputProps {
  onSubmit: (content: string, type: 'url' | 'text') => void;
  isLoading: boolean;
}

export const ContentInput = ({ onSubmit, isLoading }: ContentInputProps) => {
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [activeTab, setActiveTab] = useState<'url' | 'text'>('url');

  const handleSubmit = () => {
    const content = activeTab === 'url' ? urlInput : textInput;
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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'url' | 'text')} className="w-full">
          <TabsList className="w-full grid grid-cols-2 rounded-none border-b bg-muted/30">
            <TabsTrigger value="url" className="gap-2 data-[state=active]:bg-background">
              <LinkIcon className="w-4 h-4" />
              URL
            </TabsTrigger>
            <TabsTrigger value="text" className="gap-2 data-[state=active]:bg-background">
              <FileText className="w-4 h-4" />
              Text
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

            <Button 
              onClick={handleSubmit}
              disabled={isLoading || (activeTab === 'url' ? !urlInput.trim() : !textInput.trim())}
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