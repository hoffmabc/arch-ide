export interface ArchInstruction {
  name: string;
  args: {
    name: string;
    type: string;
  }[];
}

export interface ArchAccountType {
  name: string;
  type: {
    kind: "struct";
    fields: {
      name: string;
      type: string;
    }[];
  };
}

export interface ArchTypeDefinition {
  name: string;
  type: {
    kind: "enum" | "struct";
    variants?: {
      name: string;
      fields?: {
        name: string;
        type: string;
      }[];
    }[];
    fields?: {
      name: string;
      type: string;
    }[];
  };
}

export interface ArchError {
  code: number;
  name: string;
  msg: string;
}

export interface ArchIdl {
  version: string;
  name: string;
  instructions: ArchInstruction[];
  accounts: ArchAccountType[];
  types: ArchTypeDefinition[];
  errors: ArchError[];
}