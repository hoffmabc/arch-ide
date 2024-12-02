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

  async createProject(files: Record<string, string>) {
    const projectDir = path.join(this.tempDir, `project_${Date.now()}`);
    await fs.mkdir(path.join(projectDir, 'program'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'program', 'src'), { recursive: true });

    // Create program/Cargo.toml
    await fs.writeFile(
      path.join(projectDir, 'program', 'Cargo.toml'),
      files['program/Cargo.toml']
    );

    // Create program/src/lib.rs
    await fs.writeFile(
      path.join(projectDir, 'program', 'src', 'lib.rs'),
      files['program/src/lib.rs']
    );

    // Create src directory and test file
    await fs.mkdir(path.join(projectDir, 'src'));
    await fs.writeFile(
      path.join(projectDir, 'src', 'lib.rs'),
      files['src/lib.rs']
    );

    return projectDir;
  }

  async compile(code: string) {
    try {
      const files = {
        'program/src/lib.rs': code,
        'program/Cargo.toml': `[package]
name = "arch-program"
version = "0.1.0"
edition = "2021"

[dependencies]
arch-program = "0.1.0"
borsh = "0.10.3"`,
        'src/lib.rs': '' // Empty for now, will be used for tests
      };

      const projectDir = await this.createProject(files);

      // Build the program
      const { stdout, stderr } = await execAsync('cargo build-sbf', {
        cwd: path.join(projectDir, 'program')
      });

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
        output: stdout
      };

    } catch (error) {
      // Since 'error' is of type 'unknown', we need to ensure it's an instance of Error to access its 'message' property.
      if (error instanceof Error) {
        return {
          success: false,
          error: error.message
        };
      } else {
        // If 'error' is not an instance of Error, we can't access its 'message' property.
        // In this case, we'll return a generic error message.
        return {
          success: false,
          error: 'An unknown error occurred.'
        };
      }
    }
  }
}

export const compiler = new CompilerService();