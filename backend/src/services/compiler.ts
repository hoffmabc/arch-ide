// backend/src/services/compiler.ts
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path/posix';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CompilerService {
  private readonly tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
  }

  async init() {
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  async compile(code: string) {
    try {
      const projectDir = path.join(this.tempDir, `project_${Date.now()}`);
      
      // Create project structure
      await fs.mkdir(path.join(projectDir, 'program/src'), { recursive: true });

      // Write the program files
      await fs.writeFile(
        path.join(projectDir, 'program/src/lib.rs'),
        code
      );

      await fs.writeFile(
        path.join(projectDir, 'program/Cargo.toml'),
        `[package]
name = "arch-program"
version = "0.1.0"
edition = "2021"

[dependencies]
arch-program = "0.1.0"
borsh = "0.10.3"`
      );

      // Compile using cargo build-sbf
      const { stdout, stderr } = await execAsync('cargo build-sbf', {
        cwd: path.join(projectDir, 'program')
      });

      // Check if the .so file was created
      const soFile = path.join(projectDir, 'program/target/sbf-solana-solana/release/arch_program.so');
      let programBytes = null;
      
      try {
        programBytes = await fs.readFile(soFile);
      } catch (err) {
        console.error('Failed to read .so file:', err);
      }

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });

      if (stderr && !stderr.includes('Completed successfully')) {
        return {
          success: false,
          error: stderr
        };
      }

      return {
        success: true,
        output: stdout,
        program: programBytes ? programBytes.toString('base64') : null
      };

    } catch (error) {
      return {
        success: false,
        error: `Compilation error: ${error.message}`
      };
    }
  }
}

export const compiler = new CompilerService();