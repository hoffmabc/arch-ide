import { Query } from 'tree-sitter';
import Parser from 'tree-sitter';
import Rust from 'tree-sitter-rust';
import { ArchInstruction, ArchIdl, ArchAccountType, ArchTypeDefinition, ArchError } from '../types/idl';

export class IdlGenerator {
    private parser: Parser;
  
    constructor() {
      this.parser = new Parser();
      this.parser.setLanguage(Rust);
    }
  
    generateIdl(sourceCode: string): ArchIdl {
      const tree = this.parser.parse(sourceCode);
      
      // Extract program name from the source code or use default
      const programName = this.extractProgramName(tree) || "arch_program";
  
      return {
        version: "0.1.0",
        name: programName,
        instructions: this.parseInstructions(tree),
        accounts: this.parseAccounts(tree),
        types: this.parseTypes(tree),
        errors: this.parseErrors(tree)
      };
    }
  
    private extractProgramName(tree: Parser.Tree): string | null {
      // Look for module name or file name
      const moduleQuery = new Query(Rust, `
        (mod_item
          name: (identifier) @mod_name
        )
      `);
      
      const matches = moduleQuery.matches(tree.rootNode);
      const modName = matches[0]?.captures.find(c => c.name === 'mod_name')?.node?.text;
      return modName ? `${modName}_program` : null;
    }
  
    private parseInstructions(tree: Parser.Tree): ArchInstruction[] {
      const instructions: ArchInstruction[] = [];
      
      // Query for instruction enum
      const enumQuery = new Query(Rust, `
        (enum_item
          name: (type_identifier) @enum_name
          body: (enum_variant_list) @variants
        )
      `);
  
      const matches = enumQuery.matches(tree.rootNode);
      
      for (const match of matches) {
        const enumName = match.captures.find(c => c.name === 'enum_name')?.node;
        const variants = match.captures.find(c => c.name === 'variants')?.node;
        
        if (enumName?.text === 'CounterInstruction' && variants) {
          const variantsList = this.parseEnumVariants(variants);
          variantsList.forEach(variant => {
            instructions.push({
              name: this.camelCase(variant.name),
              args: variant.fields || []
            });
          });
        }
      }
  
      return instructions;
    }
  
    private camelCase(str: string): string {
      return str.charAt(0).toLowerCase() + str.slice(1);
    }
  
    private parseTypes(tree: Parser.Tree): ArchTypeDefinition[] {
      const types: ArchTypeDefinition[] = [];
      
      // Parse structs
      const structQuery = new Query(Rust, `
        (struct_item
          name: (type_identifier) @name
          body: (field_declaration_list) @fields
        )
      `);
  
      // Parse enums
      const enumQuery = new Query(Rust, `
        (enum_item
          name: (type_identifier) @name
          body: (enum_variant_list) @variants
        )
      `);
  
      // Handle structs
      const structMatches = structQuery.matches(tree.rootNode);
      for (const match of structMatches) {
        const nameNode = match.captures.find(c => c.name === 'name')?.node;
        const fieldsNode = match.captures.find(c => c.name === 'fields')?.node;
        
        if (nameNode && fieldsNode) {
          types.push({
            name: nameNode.text,
            type: {
              kind: "struct",
              fields: this.parseComplexFields(fieldsNode)
            }
          });
        }
      }
  
      // Handle enums
      const enumMatches = enumQuery.matches(tree.rootNode);
      for (const match of enumMatches) {
        const nameNode = match.captures.find(c => c.name === 'name')?.node;
        const variantsNode = match.captures.find(c => c.name === 'variants')?.node;
        
        if (nameNode && variantsNode) {
          types.push({
            name: nameNode.text,
            type: {
              kind: "enum",
              variants: this.parseComplexEnumVariants(variantsNode)
            }
          });
        }
      }
  
      return types;
    }

    private parseComplexEnumVariants(variantsNode: Parser.SyntaxNode): { name: string, fields?: { name: string, type: string }[] }[] {
        const variants: { name: string, fields?: { name: string, type: string }[] }[] = [];
        
        for (const variant of variantsNode.children) {
          if (variant.type === 'enum_variant') {
            const name = variant.child(0)?.text;
            const fieldsNode = variant.child(1);
            
            if (name) {
              variants.push({
                name,
                fields: fieldsNode ? this.parseComplexFields(fieldsNode) : undefined
              });
            }
          }
        }
        
        return variants;
      }
  
    private parseComplexFields(fieldsNode: Parser.SyntaxNode): { name: string, type: string }[] {
      const fields: { name: string, type: string }[] = [];
      
      for (const field of fieldsNode.children) {
        if (field.type === 'field_declaration') {
          const name = field.child(0)?.text;
          const typeNode = field.child(2);
          
          if (name && typeNode) {
            const type = this.parseComplexType(typeNode);
            fields.push({ name, type });
          }
        }
      }
      
      return fields;
    }
  
    private parseComplexType(typeNode: Parser.SyntaxNode): string {
      // Handle basic types
      if (typeNode.type === 'primitive_type') {
        return typeNode.text;
      }
  
      // Handle Option types
      if (typeNode.text.startsWith('Option<')) {
        const innerType = typeNode.child(1);
        return `option<${this.parseComplexType(innerType!)}>`;
      }
  
      // Handle tuple types
      if (typeNode.type === 'tuple_type') {
        const types = typeNode.children
          .filter(child => child.type !== '(' && child.type !== ')')
          .map(child => this.parseComplexType(child));
        return `tuple<${types.join(', ')}>`;
      }
  
      // Handle Vec types
      if (typeNode.text.startsWith('Vec<')) {
        const innerType = typeNode.child(1);
        return `vec<${this.parseComplexType(innerType!)}>`;
      }
  
      return typeNode.text;
    }

  private isInstructionFunction(node: Parser.SyntaxNode): boolean {
    // Check for #[instruction] attribute
    const attrs = node.parent?.children.filter(n => n.type === 'attribute_item') ?? [];
    return attrs.some(attr => {
      const identifier = attr.descendantsOfType('identifier')[0];
      return identifier?.text === 'instruction';
    });
  }

  private parseAccounts(tree: Parser.Tree): ArchAccountType[] {
    const accounts: ArchAccountType[] = [];
    
    // Simplified query to match struct declarations
    const structQuery = new Query(Rust, `
      (struct_item
        name: (type_identifier) @name
        body: (field_declaration_list) @fields
      )
    `);

    const matches = structQuery.matches(tree.rootNode);
    
    for (const match of matches) {
      const nameNode = match.captures.find(c => c.name === 'name')?.node;
      const fieldsNode = match.captures.find(c => c.name === 'fields')?.node;
      
      // Ensure nameNode.parent is not null before passing it to isAccountStruct
      if (nameNode && fieldsNode && nameNode.parent && this.isAccountStruct(nameNode.parent)) {
        accounts.push({
          name: nameNode.text,
          type: {
            kind: "struct",
            fields: this.parseFields(fieldsNode)
          }
        });
      }
    }

    return accounts;
}

  private isAccountStruct(node: Parser.SyntaxNode): boolean {
    // Check for #[account] or #[derive(Account)] attribute
    const attrs = node.parent?.children.filter(n => n.type === 'attribute_item') ?? [];
    return attrs.some(attr => {
      const identifier = attr.descendantsOfType('identifier')[0];
      return identifier?.text === 'account' || 
             (identifier?.text === 'derive' && attr.text.includes('Account'));
    });
  }
  

  private parseErrors(tree: Parser.Tree): ArchError[] {
    const errors: ArchError[] = [];
    
    const errorQuery = new Query(Rust, `
      (enum_item
        name: (type_identifier) @name
        body: (enum_variant_list) @variants
      )
    `);

    const matches = errorQuery.matches(tree.rootNode);
    
    for (const match of matches) {
      const enumName = match.captures.find(c => c.name === 'name')?.node;
      const variants = match.captures.find(c => c.name === 'variants')?.node;
      
      if (enumName?.text === 'ProgramError' && variants) {
        errors.push(...this.parseErrorVariants(variants));
      }
    }

    return errors;
}
  
  
  private parseParameters(paramsNode: Parser.SyntaxNode): { name: string, type: string }[] {
    const args: { name: string, type: string }[] = [];
    
    for (const param of paramsNode.children) {
      if (param.type === 'parameter') {
        const name = param.child(0)?.text;
        const type = param.child(2)?.text;
        
        if (name && type) {
          args.push({ name, type });
        }
      }
    }
    
    return args;
  }

  private parseFields(fieldsNode: Parser.SyntaxNode): { name: string, type: string }[] {
    const fields: { name: string, type: string }[] = [];
    
    for (const field of fieldsNode.children) {
      if (field.type === 'field_declaration') {
        const name = field.child(0)?.text;
        const type = field.child(2)?.text;
        
        if (name && type) {
          fields.push({ name, type });
        }
      }
    }
    
    return fields;
  }

  private parseEnumVariants(variantsNode: Parser.SyntaxNode): { name: string, fields?: { name: string, type: string }[] }[] {
    const variants: { name: string, fields?: { name: string, type: string }[] }[] = [];
    
    for (const variant of variantsNode.children) {
      if (variant.type === 'enum_variant') {
        const name = variant.child(0)?.text;
        const fields = variant.child(1);
        
        if (name) {
          variants.push({
            name,
            fields: fields ? this.parseFields(fields) : undefined
          });
        }
      }
    }
    
    return variants;
  }

  private parseErrorVariants(variantsNode: Parser.SyntaxNode): ArchError[] {
    const errors: ArchError[] = [];
    let errorCode = 0;
    
    for (const variant of variantsNode.children) {
      if (variant.type === 'enum_variant') {
        const name = variant.child(0)?.text;
        const errorAttr = variant.descendantsOfType('attribute')[0];
        let msg = name;
  
        if (errorAttr) {
          const tokenTree = errorAttr.descendantsOfType('token_tree')[0];
          if (tokenTree) {
            msg = tokenTree.text.replace(/[(")\[\]]/g, '');
          }
        }
        
        if (name) {
          errors.push({
            code: errorCode++,
            name,
            msg: msg || ''
          });
        }
      }
    }
    
    return errors;
  }

}