import init, { WorldState } from "../../../../../../../wasm/rust-analyzer/pkg";

interface AnalysisResult {
  syntax_valid: boolean;
  error_message?: string;
  functions: string[];
  structs: string[];
  traits: string[];
}

interface StdLibFiles {
  core: string;
  alloc: string;
  std: string;
}

let state: WorldState;

async function initialize() {
  await init();
  state = new WorldState();
}

initialize().then(() => {
  onmessage = async (ev) => {
    console.log('Received message:', ev.data);
    const { method, args, id } = ev.data;
    try {
      let result;

      switch (method) {
        case 'initializeStdLib':
          const stdLibFiles = args[0] as StdLibFiles;
          result = await state.initializeStdLib(stdLibFiles.core, stdLibFiles.alloc, stdLibFiles.std);
          break;

        case 'analyze':
          result = await state.analyze(args[0]);
          break;

        default:
          throw new Error(`Unknown method: ${method}`);
      }

      postMessage({ id, result });
    } catch (error) {
      postMessage({ id, error: (error as Error).message });
    }
  };

  postMessage({ id: "ra-worker-ready" });
});