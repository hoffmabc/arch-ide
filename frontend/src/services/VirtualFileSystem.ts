import * as monaco from 'monaco-editor';

interface VirtualFile {
  path: string;
  content: string;
  version: number;
}

class VirtualFileSystem {
  private files: Map<string, VirtualFile> = new Map();

  constructor() {
    // Initialize with Monaco
    this.setupMonacoDefaults();
  }

  private setupMonacoDefaults() {
    // Enable module resolution in the compiler
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowNonTsExtensions: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      baseUrl: '/',  // Make imports from the root
    });
  }

  // Register a file with Monaco
  registerFile(filePath: string, content: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const fileUri = this.getFileUri(normalizedPath);
    const version = (this.files.get(normalizedPath)?.version || 0) + 1;

    // Store file in our registry
    this.files.set(normalizedPath, {
      path: normalizedPath,
      content,
      version
    });

    // Check if a model already exists for this file
    const existingModel = monaco.editor.getModel(fileUri);
    if (existingModel) {
      // Update existing model
      existingModel.setValue(content);
    } else {
      // Create a new model
      const language = this.getLanguageFromPath(normalizedPath);
      monaco.editor.createModel(content, language, fileUri);
    }

    // If it's a TypeScript file, add it to the compiler
    if (normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.tsx')) {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        content,
        fileUri.toString()
      );
      console.log(`Registered TypeScript file: ${normalizedPath}`);
    }
  }

  // Get a file from our registry
  getFile(filePath: string): VirtualFile | undefined {
    const normalizedPath = this.normalizePath(filePath);
    return this.files.get(normalizedPath);
  }

  // Get Monaco-compatible URI for a file path
  getFileUri(filePath: string): monaco.Uri {
    const normalizedPath = this.normalizePath(filePath);
    return monaco.Uri.parse(`file:///${normalizedPath}`);
  }

  // Normalize a file path for consistency
  private normalizePath(filePath: string): string {
    // Remove leading ./ or / if present
    let path = filePath.replace(/^\.\/|^\//, '');
    // Ensure file has proper extension
    if (!path.includes('.')) {
      path = `${path}.ts`;
    }
    return path;
  }

  // Detect language from file extension
  private getLanguageFromPath(filePath: string): string {
    if (filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.tsx')) return 'typescript';
    if (filePath.endsWith('.js')) return 'javascript';
    if (filePath.endsWith('.jsx')) return 'javascript';
    if (filePath.endsWith('.rs')) return 'rust';
    return 'plaintext';
  }

  // Register all files in a project
  registerProject(files: {path: string, content: string}[]): void {
    files.forEach(file => this.registerFile(file.path, file.content));
  }
}

// Export a singleton instance
export const virtualFileSystem = new VirtualFileSystem();