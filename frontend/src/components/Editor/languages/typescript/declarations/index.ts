import { declareGlobalTypes } from "./global";
import type { Disposable } from "../../../../../types/types";

export const initDeclarations = async (): Promise<Disposable> => {
  const global = await declareGlobalTypes();
  console.log('Global declarations initialized');
  return {
    dispose: () => {
      global.dispose();
    },
  };
};