import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { IdlGenerator } from './idl-generator';

const MAX_FILE_AMOUNT = 64;
const MAX_PATH_LENGTH = 128;
const ALLOWED_PATH_REGEX = /^(src\/[\w/-]+\.rs|Cargo\.toml)$/;

const execAsync = promisify(exec);

export class CompilerService {
  private readonly tempDir: string;
  private readonly cratesPath: string;
  private readonly idlGenerator: IdlGenerator;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    this.cratesPath = path.join(process.cwd(), 'crates');
    this.idlGenerator = new IdlGenerator();
  }

  async init() {
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  async compile(files: { path: string, content: string }[]) {
    try {
      this.validateFiles(files);
      const projectDir = path.join(this.tempDir, `project_${Date.now()}`);

      // Create project structure
      await fs.mkdir(path.join(projectDir, 'program/src'), { recursive: true });
      await fs.mkdir(path.join(projectDir, 'crates'), { recursive: true });

      // Write all program files first
      for (const file of files) {
        if (!file.path) {
          console.error('File missing path:', file);
          continue;
        }
        console.log(`Writing file to: program/${file.path}`);
        const filePath = path.join(projectDir, 'program', file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content);
      }

      // Debug: List files in program directory
      console.log('Files in program directory:');
      const programFiles = await fs.readdir(path.join(projectDir, 'program'), { recursive: true });
      console.log(programFiles);

      // Copy SDK and other crates, but not program
      await this.copyCrate('sdk', projectDir);
      await this.copyCrate('bip322', projectDir);
      await this.copyCrate('program', projectDir);

      // Write minimal workspace Cargo.toml
      await fs.writeFile(
        path.join(projectDir, 'Cargo.toml'),
        `[workspace]
      members = [
          "program",
          "crates/sdk",
          "crates/bip322",
          "crates/program"
      ]

      resolver = "2"
      `
      );

      console.log('Program directory:', path.join(projectDir, 'program'));

      // Compile using cargo build-sbf
      const { stdout, stderr } = await execAsync('cargo build-sbf', {
        cwd: path.join(projectDir, 'program')
      });

      // Read the compiled .so file
      const soFile = path.join(projectDir, 'target/sbf-solana-solana/release/arch_program.so');
      let programBytes = null;

      try {
        programBytes = await fs.readFile(soFile);
      } catch (err) {
        console.error('Failed to read .so file:', err);
      }

      // Cleanup
      await fs.rm(projectDir, { recursive: true, force: true });

      if (stderr && !stderr.includes('Finished release')) {
        return {
          success: false,
          error: stderr
        };
      }

      // Generate IDL from lib.rs
      const libRsFile = files.find(f => f.path === 'src/lib.rs');
      const idl = libRsFile ? this.idlGenerator.generateIdl(libRsFile.content) : null;

      return {
        success: true,
        output: stdout,
        program: programBytes ? programBytes.toString('base64') : null,
        idl: idl
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      };
    }
  }

  private isCompileError(stderr: string): boolean {
    return stderr.includes('error: could not compile') ||
           stderr.includes('error[E') ||
           stderr.includes('compilation failed');
  }

  private validateFiles(files: { path: string, content: string }[]): void {
    // Check file count
    if (files.length > MAX_FILE_AMOUNT) {
      throw new Error(`Exceeded maximum file amount (${MAX_FILE_AMOUNT})`);
    }

    // Validate each file
    for (const file of files) {
      if (!file.path) {
        throw new Error('File missing path');
      }

      if (file.path.length > MAX_PATH_LENGTH) {
        throw new Error(`File path exceeds maximum length (${MAX_PATH_LENGTH})`);
      }

      if (!ALLOWED_PATH_REGEX.test(file.path)) {
        throw new Error(`Invalid file path: ${file.path}`);
      }

      if (file.path.includes('..') || file.path.includes('//')) {
        throw new Error(`Unsafe file path: ${file.path}`);
      }
    }
  }

  private async copyCrate(crateName: string, projectDir: string) {
    const sourcePath = path.join(this.cratesPath, crateName);
    const destPath = path.join(projectDir, 'crates', crateName);

    try {
      await this.copyDir(sourcePath, destPath);
    } catch (error: any) {
      console.error(`Failed to copy crate ${crateName}:`, error);
      throw new Error(`Failed to copy crate ${crateName}: ${error.message}`);
    }
  }

  private async copyDir(src: string, dest: string) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // Skip target directories and .git
      if (entry.name === 'target' || entry.name === '.git') {
        continue;
      }

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

export const compiler = new CompilerService();