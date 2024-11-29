import { Query } from 'tree-sitter';
import Parser from 'tree-sitter';
import Rust from 'tree-sitter-rust';
import { ArchInstruction, ArchIdl } from '../types/idl';

export class IdlGenerator {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(Rust);
  }

  generateIdl(sourceCode: string): ArchIdl {
    const tree = this.parser.parse(sourceCode);
    const instructions: ArchInstruction[] = [];

    // Find all pub fn declarations
    const pubFnQuery = new Query(Rust, `
        (function_item
          (visibility_modifier)
          (function_modifiers)?
          name: (identifier) @name
          parameters: (parameters) @params
        ) @function
      `);

    const matches = pubFnQuery.matches(tree.rootNode);
    
    for (const match of matches) {
      const fnNode = match.captures.find(c => c.name === 'function')?.node;
      const nameNode = match.captures.find(c => c.name === 'name')?.node;
      const paramsNode = match.captures.find(c => c.name === 'params')?.node;
      
      if (fnNode && nameNode && paramsNode) {
        const instruction: ArchInstruction = {
          name: nameNode.text,
          args: this.parseParameters(paramsNode)
        };
        instructions.push(instruction);
      }
    }

    return {
      version: "0.1.0",
      name: "arch_program",
      instructions
    };
  }

  private parseParameters(paramsNode: Parser.SyntaxNode): { name: string, type: string }[] {
    const args: { name: string, type: string }[] = [];
    
    for (const param of paramsNode.children) {
      if (param.type === 'parameter') {
        const name = param.child(0)?.text;  // First child is typically the pattern
        const type = param.child(1)?.text;  // Second child is typically the type
        
        if (name && type) {
          args.push({ name, type });
        }
      }
    }
  
    return args;
  }
}