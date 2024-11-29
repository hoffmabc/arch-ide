import { ArchIdl } from '../types/idl';
import { ChevronDown, Download } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface IdlPanelProps {
  idl: ArchIdl | null;
}

export const IdlPanel = ({ idl }: IdlPanelProps) => {
  if (!idl) {
    return (
      <div className="p-4 text-sm text-gray-300 bg-gray-800/50 rounded-md">
        No IDL available
      </div>
    );
  }

  const handleDownloadIdl = () => {
    const idlString = JSON.stringify(idl, null, 2);
    const blob = new Blob([idlString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${idl.name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 p-4 overflow-auto">
      {/* Program Info with Download Button */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Program Info</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDownloadIdl}
                  className="h-8 w-8"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download IDL file</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-blue-300">Name: {idl.name}</div>
          <div className="text-xs text-blue-300">Version: {idl.version}</div>
        </div>
      </div>

      <Accordion type="single" collapsible className="space-y-4">
        {/* Instructions Section */}
        <AccordionItem value="instructions">
          <AccordionTrigger className="text-sm font-semibold text-white">
            Instructions
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 mt-2">
              {idl.instructions.map((ix, i) => (
                <div key={i} className="border border-gray-600 bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="font-mono text-sm text-blue-300 font-medium">
                      {ix.name}
                    </div>
                    <div className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full">
                      Instruction
                    </div>
                  </div>
                  {ix.args.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-gray-400 mb-2">Arguments</div>
                      {ix.args.map((arg, j) => (
                        <div key={j} className="grid grid-cols-[120px,1fr] gap-2 text-sm items-start">
                          <span className="text-gray-300 truncate" title={arg.name}>
                            {arg.name}
                          </span>
                          <span className="text-blue-200 font-mono text-xs">
                            {arg.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Accounts Section */}
        <AccordionItem value="accounts">
          <AccordionTrigger className="text-sm font-semibold text-white">
            Accounts
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 mt-2">
              {idl.accounts?.map((account, i) => (
                <div key={i} className="border border-gray-600 bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="font-mono text-sm text-blue-300 font-medium">
                      {account.name}
                    </div>
                    <div className="text-xs px-2 py-0.5 bg-green-500/20 text-green-300 rounded-full">
                      Account
                    </div>
                  </div>
                  {account.type.fields.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-gray-400 mb-2">Fields</div>
                      {account.type.fields.map((field, j) => (
                        <div key={j} className="grid grid-cols-[120px,1fr] gap-2 text-sm items-start">
                          <span className="text-gray-300 truncate" title={field.name}>
                            {field.name}
                          </span>
                          <span className="text-blue-200 font-mono text-xs">
                            {field.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Types Section */}
        <AccordionItem value="types">
          <AccordionTrigger className="text-sm font-semibold text-white">
            Types
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 mt-2">
              {idl.types?.map((type, i) => (
                <div key={i} className="border border-gray-600 bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="font-mono text-sm text-blue-300 font-medium">
                      {type.name}
                    </div>
                    <div className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full">
                      {type.type.kind}
                    </div>
                  </div>
                  {type.type.fields && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-gray-400 mb-2">Fields</div>
                      {type.type.fields.map((field, j) => (
                        <div key={j} className="grid grid-cols-[120px,1fr] gap-2 text-sm items-start">
                          <span className="text-gray-300 truncate" title={field.name}>
                            {field.name}
                          </span>
                          <span className="text-blue-200 font-mono text-xs">
                            {field.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {type.type.variants && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-gray-400 mb-2">Variants</div>
                      {type.type.variants.map((variant, j) => (
                        <div key={j} className="space-y-2">
                          <div className="text-sm text-gray-300">{variant.name}</div>
                          {variant.fields && (
                            <div className="pl-4 space-y-1">
                              {variant.fields.map((field, k) => (
                                <div key={k} className="grid grid-cols-[120px,1fr] gap-2 text-sm items-start">
                                  <span className="text-gray-300 truncate" title={field.name}>
                                    {field.name}
                                  </span>
                                  <span className="text-blue-200 font-mono text-xs">
                                    {field.type}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Errors Section */}
        <AccordionItem value="errors">
          <AccordionTrigger className="text-sm font-semibold text-white">
            Errors
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 mt-2">
              {idl.errors?.map((error, i) => (
                <div key={i} className="border border-gray-600 bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-mono text-sm text-red-300 font-medium">
                      {error.name}
                    </div>
                    <div className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded-full">
                      {error.code}
                    </div>
                  </div>
                  <div className="text-xs text-gray-300">{error.msg}</div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};