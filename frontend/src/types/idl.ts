export interface ArchInstruction {
    name: string;
    args: {
      name: string;
      type: string;
    }[];
  }
  
  export interface ArchIdl {
    version: string;
    name: string;
    instructions: ArchInstruction[];
  }