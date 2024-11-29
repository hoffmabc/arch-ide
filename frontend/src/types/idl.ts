export interface ArchInstruction {
  name: string;
  accounts: {
    name: string;
    isMut: boolean;
    isSigner: boolean;
  }[];
  args: {
    name: string;
    type: string | ComplexType;
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
        type: string | ComplexType;
      }[];
    }[];
    fields?: {
      name: string;
      type: string | ComplexType;
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

export interface ComplexType {
  option?: ComplexType;
  tuple?: (string | ComplexType)[];  // Changed from ComplexType[] to allow string literals
  vec?: ComplexType | string;        // Changed to allow string type for simple vectors
  defined?: string;
}