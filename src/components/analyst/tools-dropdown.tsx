
import { Blocks, FileSpreadsheet, Building2, FileText, ChevronDown, Presentation, FileType, PenTool, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useState } from 'react';

export function ToolsDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Tools"
          className="p-0 h-auto gap-1 hover:bg-transparent data-[state=open]:opacity-100"
        >
          <div className="h-7 w-7 rounded-full bg-muted/80 flex items-center justify-center text-foreground hover:bg-muted transition-colors border shadow-sm">
            <Blocks className="h-3.5 w-3.5" />
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground/70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="max-h-[280px] overflow-y-auto py-1.5">
          {/* Active Tools Section */}
          <div className="px-2 py-1">
            <h4 className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1 uppercase tracking-wider">
              Active Tools (4)
            </h4>

            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-default">
              <div className="h-6 w-6 rounded bg-green-100 flex items-center justify-center text-green-700">
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm">Excel</span>
            </div>

            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-default">
              <div className="h-6 w-6 rounded bg-blue-100 flex items-center justify-center text-blue-700">
                <FileType className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm">Word</span>
            </div>

            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-default">
              <div className="h-6 w-6 rounded bg-orange-100 flex items-center justify-center text-orange-700">
                <Presentation className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm">PowerPoint</span>
            </div>

            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-default">
              <div className="h-6 w-6 rounded bg-red-100 flex items-center justify-center text-red-700">
                <FileText className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm">PDF</span>
            </div>
          </div>

          <div className="h-px bg-border my-1 mx-2" />

          {/* Coming Soon Section */}
          <div className="px-2 py-1">
            <h4 className="text-[10px] font-medium text-muted-foreground mb-1.5 px-1 uppercase tracking-wider">
              Coming Soon
            </h4>

            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md opacity-50">
              <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-muted-foreground">
                <PenTool className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm">Auto-Fill PDF</span>
            </div>

            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md opacity-50">
              <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm">ERP Integration</span>
            </div>

            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md opacity-50">
              <div className="h-6 w-6 rounded bg-muted flex items-center justify-center text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm">Data Warehouse</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
