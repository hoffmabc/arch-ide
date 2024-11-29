import { ArchIdl } from '../types/idl';

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

  return (
    <div className="flex flex-col h-full bg-gray-800 p-4">
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-white mb-2">Program IDL</h3>
        <div className="text-xs text-blue-300">Version: {idl.version}</div>
      </div>
      
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Instructions</h4>
        {idl.instructions.map((ix, i) => (
          <div 
            key={i} 
            className="border border-gray-600 bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="font-mono text-sm text-blue-300 font-medium break-all">
                {ix.name}
              </div>
              <div className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full shrink-0">
                Instruction
              </div>
            </div>
            <div className="space-y-2">
              {ix.args.map((arg, j) => (
                <div key={j} className="grid grid-cols-[120px,1fr] gap-2 text-sm items-start">
                  <span className="text-gray-300 truncate" title={arg.name}>
                    {arg.name}
                  </span>
                  <span className="text-blue-200 break-all">
                    {arg.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};