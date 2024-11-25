// src/services/compiler.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface CompileResult {
  success: boolean;
  output: string;
  error?: string;
}

export class CompilerService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
  }

  async init() {
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  async compileCode(code: string): Promise<CompileResult> {
    const timestamp = Date.now();
    const fileName = `program_${timestamp}`;
    const filePath = path.join(this.tempDir, `${fileName}.rs`);
    
    try {
      // Write code to temp file
      await fs.writeFile(filePath, code);
      
      // Execute compilation
      const { stdout, stderr } = await execAsync(`rustc ${filePath} -o ${this.tempDir}/${fileName}`);
      
      if (stderr) {
        return {
          success: false,
          output: '',
          error: stderr
        };
      }
      
      // Run the compiled program
      const { stdout: runOutput, stderr: runError } = await execAsync(`${this.tempDir}/${fileName}`);
      
      return {
        success: true,
        output: runOutput,
        error: runError || undefined
      };
      
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      };
    } finally {
      // Cleanup
      await this.cleanup(fileName);
    }
  }

  private async cleanup(fileName: string) {
    try {
      await fs.unlink(path.join(this.tempDir, `${fileName}.rs`));
      await fs.unlink(path.join(this.tempDir, fileName));
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}

// Export singleton instance
export const compilerService = new CompilerService();

// Initialize on import
compilerService.init().catch(console.error);