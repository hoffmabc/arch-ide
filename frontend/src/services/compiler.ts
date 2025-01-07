// backend/src/services/compiler.ts
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path/posix';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CompilerService {
  private readonly functionUrl: string;

  constructor() {
    this.functionUrl = process.env.COMPILER_FUNCTION_URL || 'https://your-function-url';
  }

  async compile(files: { path: string, content: string }[]) {
    try {
      // Start build
      const response = await fetch(this.functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });

      const { buildId, logUrl } = await response.json();

      // Poll build status
      while (true) {
        const status = await this.getBuildStatus(buildId);
        if (status.done) {
          if (status.success) {
            return {
              success: true,
              program: status.program,
              output: status.logs
            };
          } else {
            return {
              success: false,
              error: status.error
            };
          }
        }
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getBuildStatus(buildId: string) {
    try {
      const response = await fetch(`${this.functionUrl}/status/${buildId}`);
      const result = await response.json();

      if (!result.success) {
        return {
          done: true,
          success: false,
          error: result.error,
          program: '',
          logs: result.logs || ''
        };
      }

      return {
        done: result.status === 'COMPLETE',
        success: result.status === 'COMPLETE' && !result.error,
        error: result.error || '',
        program: result.program || '',
        logs: result.logs || ''
      };
    } catch (error) {
      return {
        done: true,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch build status',
        program: '',
        logs: ''
      };
    }
  }
}

export const compiler = new CompilerService();