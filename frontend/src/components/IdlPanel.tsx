import { ArchIdl } from '../types/idl';

interface IdlPanelProps {
  idl: ArchIdl | null;
}

export const IdlPanel = ({ idl }: IdlPanelProps) => {
  if (!idl) {
    return <div className="p-4 text-sm text-gray-500">No IDL available</div>;
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2">Program IDL</h3>
        <div className="text-xs text-gray-500">Version: {idl.version}</div>
      </div>
      
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Instructions</h4>
        {idl.instructions.map((ix, i) => (
          <div key={i} className="border rounded-md p-3">
            <div className="font-mono text-sm mb-2">{ix.name}</div>
            <div className="space-y-1">
              {ix.args.map((arg, j) => (
                <div key={j} className="text-xs text-gray-600">
                  {arg.name}: {arg.type}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};