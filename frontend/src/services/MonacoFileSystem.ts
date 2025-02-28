import * as monaco from 'monaco-editor';

export class MonacoFileSystem {
  private fileMap: Map<string, string> = new Map();

  constructor() {
    // Set up Monaco's module resolution
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      baseUrl: "file:///",
      paths: {
        "*": ["*", "/*.ts"]
      }
    });
  }

  private decodeBase64Content(content: string): string {
    // Check if the content starts with 'data:text/plain;base64,'
    const base64Prefix = 'data:text/plain;base64,';
    if (content.startsWith(base64Prefix)) {
      try {
        // Remove the prefix and decode
        const base64Content = content.slice(base64Prefix.length);
        return atob(base64Content);
      } catch (e) {
        console.error('Failed to decode base64 content:', e);
        return content;
      }
    }
    return content;
  }

  registerFile(filePath: string, content: string) {
    // Decode the content if it's base64 encoded
    const decodedContent = this.decodeBase64Content(content);

    // Normalize the path to use forward slashes and start with file:///
    const normalizedPath = `file:///${filePath.replace(/\\/g, '/')}`;
    this.fileMap.set(normalizedPath, decodedContent);

    // Register the file with Monaco
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      decodedContent,
      normalizedPath
    );

    console.log(`Registered file: ${normalizedPath}`, {
      originalLength: content.length,
      decodedLength: decodedContent.length,
      isTypeScript: filePath.endsWith('.ts')
    });
  }

  registerProjectFiles(files: { path: string; content: string }[]) {
    files.forEach(file => this.registerFile(file.path, file.content));
  }

  getFileContent(path: string): string | undefined {
    const content = this.fileMap.get(`file:///${path}`);
    return content ? this.decodeBase64Content(content) : undefined;
  }
}