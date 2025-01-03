declare module 'tree-sitter' {
  namespace Parser {
    function create(): Parser;
  }

  class Parser {
    static create(): Parser;
    setLanguage(language: any): void;
    parse(input: string): Tree;
  }

  export default Parser;

  export interface Tree {
    rootNode: SyntaxNode;
  }

  export class Query {
    constructor(language: any, source: string);
    matches(node: SyntaxNode): QueryMatch[];
  }

  export interface SyntaxNode {
    type: string;
    text: string;
    children: SyntaxNode[];
    childCount: number;
    child(index: number): SyntaxNode | null;
    firstChild: SyntaxNode | null;
    lastChild: SyntaxNode | null;
    parent: SyntaxNode | null;
    nextSibling: SyntaxNode | null;
    previousSibling: SyntaxNode | null;
    descendantsOfType(type: string): SyntaxNode[];
  }

  export interface QueryMatch {
    pattern: number;
    captures: Array<{
      name: string;
      node: SyntaxNode;
    }>;
  }
}
