export interface Project {
    id: string;
    name: string;
    description?: string;
    files: FileNode[];
    created: Date;
    lastModified: Date;
  }