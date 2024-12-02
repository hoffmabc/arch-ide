export interface FileNode {
    name: string;
    type: 'file' | 'directory';
    content?: string;
    children?: FileNode[];
    path?: string;
  }
  
  export interface Project {
    id: string;
    name: string;
    description?: string;
    files: FileNode[];
    created: Date;
    lastModified: Date;
  }