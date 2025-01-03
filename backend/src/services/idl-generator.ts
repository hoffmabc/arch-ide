import Parser, { Query, SyntaxNode, Tree } from 'tree-sitter';
import Rust from 'tree-sitter-rust';
import { ArchInstruction, ArchIdl, ArchAccountType, ArchTypeDefinition, ArchError, ComplexType } from '../types/idl';

export class IdlGenerator {
    private parser: Parser;

    constructor() {
        console.log('Initializing parser...');
        this.parser = new Parser();
        console.log('Setting Rust language...');
        this.parser.setLanguage(Rust);
        console.log('Parser initialization complete');
    }

    generateIdl(sourceCode: string): ArchIdl {
        try {
            const tree = this.parser.parse(sourceCode);

            // Get the name from the process_instruction function or default
            const name = this.extractProgramName(tree);

            return {
                version: "0.1.0",
                name,
                instructions: this.parseInstructions(tree),
                accounts: this.parseAccounts(tree),
                types: this.parseTypes(tree),
                errors: this.parseErrors(tree)
            };
        } catch (error) {
            console.error('Failed to generate IDL:', error);
            throw new Error('Failed to generate IDL from source code');
        }
    }

    private extractProgramName(tree: Tree): string {
      // Look for the process_instruction function
      const fnQuery = new Query(Rust, `
        (function_item
          name: (identifier) @name
        ) @function
      `);

      const matches = fnQuery.matches(tree.rootNode);
      const processInstruction = matches.find(match =>
        match.captures.find(c => c.name === 'name')?.node.text === 'process_instruction'
      );

      if (processInstruction) {
        // Try to find module name or file name
        const modQuery = new Query(Rust, `(mod_item name: (identifier) @mod_name)`);
        const modMatches = modQuery.matches(tree.rootNode);
        const modName = modMatches[0]?.captures.find(c => c.name === 'mod_name')?.node.text;

        return modName ? `${modName}_program` : "solana_program";
      }

      return "solana_program";
    }

    private parseInstructions(tree: Tree): ArchInstruction[] {
      const instructions: ArchInstruction[] = [];

      // Find the entrypoint function
      const fnQuery = new Query(Rust, `
        (function_item
          name: (identifier) @name
          parameters: (parameters) @params
          body: (block) @body
        ) @function
      `);

      const matches = fnQuery.matches(tree.rootNode);
      // Assuming the entrypoint function name is provided as a parameter
      const entrypointFunctionName = 'entrypoint'; // This should be replaced with the actual entrypoint function name
      const entrypointFunction = matches.find(match =>
        match.captures.find(c => c.name === 'name')?.node.text === entrypointFunctionName
      );

      if (!entrypointFunction) return [];

      // Find all struct definitions that are used as instruction parameters
      const paramStructs = this.findInstructionParamStructs(tree);

      for (const paramStruct of paramStructs) {
        const name = paramStruct.nameNode.text.replace('Params', '');
        const accounts = this.extractAccountsFromFunction(entrypointFunction);
        const args = this.parseStructFields(paramStruct.fieldsNode);

        instructions.push({
          name: this.camelCase(name),
          accounts,
          args
        });
      }

      return instructions;
    }

    private findInstructionParamStructs(tree: Tree): { nameNode: SyntaxNode, fieldsNode: SyntaxNode }[] {
      const results: { nameNode: SyntaxNode, fieldsNode: SyntaxNode }[] = [];

      const structQuery = new Query(Rust, `
        (
          (attribute_item
            (attribute
              (identifier) @derive
              (token_tree) @derive_args))
          (struct_item
            name: (type_identifier) @name
            body: (field_declaration_list) @fields)
        ) @struct
      `);

      const matches = structQuery.matches(tree.rootNode);

      for (const match of matches) {
        const deriveArgs = match.captures.find(c => c.name === 'derive_args')?.node?.text;
        if (!deriveArgs?.includes('BorshSerialize') || !deriveArgs?.includes('BorshDeserialize')) {
          continue;
        }

        const nameNode = match.captures.find(c => c.name === 'name')?.node;
        const fieldsNode = match.captures.find(c => c.name === 'fields')?.node;

        if (nameNode && fieldsNode) {
          results.push({ nameNode, fieldsNode });
        }
      }

      return results;
    }

    private extractAccountsFromFunction(match: any): { name: string, isMut: boolean, isSigner: boolean }[] {
      const accounts: { name: string, isMut: boolean, isSigner: boolean }[] = [];
      const body = match.captures.find((c: { name: string }) => c.name === 'body')?.node;

      if (!body) return [];

      // Look for account assertions and checks
      const assertions = body.descendantsOfType('macro_invocation')
        .filter((node: SyntaxNode) => node.text.includes('assert!'));

      const accountChecks = assertions
        .filter((assert: SyntaxNode) => assert.text.includes('is_writable') || assert.text.includes('is_signer'));

      // Default account from next_account_info
      accounts.push({
        name: 'account',
        isMut: accountChecks.some((check: SyntaxNode) => check.text.includes('is_writable')),
        isSigner: accountChecks.some((check: SyntaxNode) => check.text.includes('is_signer'))
      });

      return accounts;
    }

    private parseStructFields(fieldsNode: SyntaxNode): { name: string, type: string | ComplexType }[] {
      const fields: { name: string, type: string | ComplexType }[] = [];

      for (const field of fieldsNode.children) {
        if (field.type === 'field_declaration') {
          const nameNode = field.descendantsOfType('field_identifier')[0];
          const typeNode = field.descendantsOfType('primitive_type')[0] ||
                          field.descendantsOfType('type_identifier')[0] ||
                          field.descendantsOfType('generic_type')[0];

          if (nameNode && typeNode) {
            fields.push({
              name: this.camelCase(nameNode.text),
              type: this.parseComplexType(typeNode)
            });
          }
        }
      }

      return fields;
    }

    private parseComplexType(typeNode: SyntaxNode): string | ComplexType {
      if (typeNode.type === 'primitive_type') {
        return typeNode.text;
      }

      if (typeNode.text.includes('Vec<')) {
        const innerType = typeNode.descendantsOfType('type_identifier')[0] ||
                         typeNode.descendantsOfType('primitive_type')[0];
        return {
          vec: innerType ? this.parseComplexType(innerType) : 'u8'
        };
      }

      // Handle other generic types (String, etc)
      return typeNode.text;
    }

    private parseAccounts(tree: Tree): ArchAccountType[] {
      // Look for account state structs
      const structQuery = new Query(Rust, `
        (struct_item
          name: (type_identifier) @name
          body: (field_declaration_list) @fields)
      `);

      const matches = structQuery.matches(tree.rootNode);
      const accounts: ArchAccountType[] = [];
      const seen = new Set<string>();

      for (const match of matches) {
        const nameNode = match.captures.find(c => c.name === 'name')?.node;
        const fieldsNode = match.captures.find(c => c.name === 'fields')?.node;

        if (nameNode && fieldsNode && !seen.has(nameNode.text)) {
          seen.add(nameNode.text);
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

    private parseFields(fieldsNode: SyntaxNode): { name: string, type: string }[] {
      const fields: { name: string, type: string }[] = [];

      for (const field of fieldsNode.children) {
        if (field.type === 'field_declaration') {
          const nameNode = field.descendantsOfType('field_identifier')[0];
          const typeNode = field.descendantsOfType('primitive_type')[0] ||
                          field.descendantsOfType('type_identifier')[0];

          if (nameNode && typeNode) {
            fields.push({
              name: this.camelCase(nameNode.text),
              type: typeNode.text
            });
          }
        }
      }

      return fields;
    }

    private parseTypes(tree: Tree): ArchTypeDefinition[] {
      const types: ArchTypeDefinition[] = [];
      const seen = new Set<string>();

      // Find all structs and enums with BorshSerialize/Deserialize
      const query = new Query(Rust, `
        [
          (struct_item
            name: (type_identifier) @struct_name
            body: (field_declaration_list) @struct_fields)
          (enum_item
            name: (type_identifier) @enum_name
            body: (enum_variant_list) @enum_variants)
        ] @type_def
      `);

      const matches = query.matches(tree.rootNode);

      for (const match of matches) {
        const structName = match.captures.find(c => c.name === 'struct_name')?.node?.text;
        const enumName = match.captures.find(c => c.name === 'enum_name')?.node?.text;

        if (structName && !seen.has(structName)) {
          seen.add(structName);
          const fieldsNode = match.captures.find(c => c.name === 'struct_fields')?.node;
          if (fieldsNode) {
            types.push(this.parseStructType(structName, fieldsNode));
          }
        } else if (enumName && !seen.has(enumName)) {
          seen.add(enumName);
          const variantsNode = match.captures.find(c => c.name === 'enum_variants')?.node;
          if (variantsNode) {
            types.push(this.parseEnumType(enumName, variantsNode));
          }
        }
      }

      return types;
    }

    private parseErrors(tree: Tree): ArchError[] {
      const errors: ArchError[] = [];

      // Look for custom error codes in the process_instruction function
      const errorQuery = new Query(Rust, `
        (integer_literal) @error_code
      `);

      const matches = errorQuery.matches(tree.rootNode);

      for (const match of matches) {
        const errorCode = parseInt(match.captures[0].node.text);
        if (errorCode > 500) { // Custom error codes are typically > 500
          errors.push({
            code: errorCode,
            name: `CustomError${errorCode}`,
            msg: `Custom program error ${errorCode}`
          });
        }
      }

      return errors;
    }

    private parseStructType(name: string, fieldsNode: SyntaxNode): ArchTypeDefinition {
      return {
        name,
        type: {
          kind: "struct",
          fields: this.parseComplexFields(fieldsNode)
        }
      };
    }

    private parseEnumType(name: string, variantsNode: SyntaxNode): ArchTypeDefinition {
      return {
        name,
        type: {
          kind: "enum",
          variants: this.parseComplexEnumVariants(variantsNode)
        }
      };
    }

    private camelCase(str: string): string {
      return str.charAt(0).toLowerCase() + str.slice(1);
    }

    private parseComplexEnumVariants(variantsNode: SyntaxNode): { name: string, fields?: { name: string, type: string | ComplexType }[] }[] {
        const variants: { name: string, fields?: { name: string, type: string | ComplexType }[] }[] = [];

        for (const variant of variantsNode.children) {
          if (variant.type === 'enum_variant') {
            const name = variant.child(0)?.text;
            const tupleFields = variant.descendantsOfType('tuple_field')[0];
            const structFields = variant.descendantsOfType('field_declaration_list')[0];

            if (name) {
              variants.push({
                name,
                fields: structFields ? this.parseComplexFields(structFields) :
                        tupleFields ? this.parseTupleFields(tupleFields) :
                        undefined
              });
            }
          }
        }

        return variants;
      }

      private parseComplexFields(fieldsNode: SyntaxNode): { name: string, type: string | ComplexType }[] {
        const fields: { name: string, type: string | ComplexType }[] = [];

        for (const field of fieldsNode.children) {
          if (field.type === 'field_declaration') {
            // Get the field identifier (name) after any visibility modifier
            const nameNode = field.descendantsOfType('field_identifier')[0];

            // Get the complete type node
            const typeNode = field.descendantsOfType('type_identifier')[0] ||
                            field.descendantsOfType('primitive_type')[0] ||
                            field.descendantsOfType('generic_type')[0];

            if (nameNode && typeNode) {
              // Convert snake_case to camelCase for field names
              fields.push({
                name: this.camelCase(nameNode.text),
                type: this.parseComplexType(typeNode)
              });
            }
          }
        }

        return fields;
      }



      private parseTupleFields(tupleFields: SyntaxNode): { name: string, type: string | ComplexType }[] {
        const fields: { name: string, type: string | ComplexType }[] = [];
        let index = 0;

        // Handle each field in the tuple
        for (const field of tupleFields.children) {
          // Skip parentheses and commas
          if (field.type !== '(' && field.type !== ')' && field.type !== ',') {
            // Try to get the type node - could be primitive, identifier, or generic
            const typeNode = field.type === 'type_identifier' || field.type === 'primitive_type' || field.type === 'generic_type'
              ? field
              : field.descendantsOfType('type_identifier')[0] ||
                field.descendantsOfType('primitive_type')[0] ||
                field.descendantsOfType('generic_type')[0];

            if (typeNode) {
              fields.push({
                name: `field${index}`,
                type: this.parseComplexType(typeNode)
              });
              index++;
            }
          }
        }

        return fields;
      }
    }
