// src/services/storage.ts
import { openDB, IDBPDatabase } from 'idb';
import type { FileNode, Project } from '../types';

const DB_NAME = 'arch-ide';
const DB_VERSION = 1;

interface ArchIDEDB {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-name': string };
  };
}

export class StorageService {
  private db: IDBPDatabase<ArchIDEDB> | null = null;

  async init() {
    this.db = await openDB<ArchIDEDB>(DB_NAME, DB_VERSION, {
      upgrade(db: IDBPDatabase<ArchIDEDB>) {
        const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
        projectStore.createIndex('by-name', 'name');
      },
    });
  }

  isTextFile(fileName: string): boolean {
    const textExtensions = [
      'txt', 'rs', 'toml', 'json', 'js', 'ts', 'tsx', 'jsx',
      'md', 'css', 'scss', 'html', 'xml', 'yaml', 'yml',
      'sh', 'bash', 'zsh', 'fish', 'py', 'rb', 'php', 'java',
      'c', 'cpp', 'h', 'hpp', 'go', 'swift', 'kt', 'lock',
      'cargo', 'gitignore', 'env'
    ];
    const extension = fileName.split('.').pop()?.toLowerCase();
    return textExtensions.includes(extension || '');
  }

  private decodeFileContent(content: string, fileName: string): string {
    if (!content.startsWith('data:')) {
      return content;
    }

    if (this.isTextFile(fileName)) {
      try {
        const base64Content = content.split(';base64,')[1];
        return atob(base64Content);
      } catch (e) {
        console.error('Failed to decode base64 content:', e);
        return content;
      }
    }
    return content;
  }

  async saveProject(project: Project): Promise<void> {
    if (!this.db) await this.init();

    // Don't encode already encoded content
    const shouldEncodeContent = (content: string) => {
      return !content.startsWith('data:');
    };

    // Encode file contents when saving project
    const encodeFileNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.type === 'file' && node.content && shouldEncodeContent(node.content)) {
          const base64Content = btoa(node.content);
          return {
            ...node,
            content: `data:application/octet-stream;base64,${base64Content}`
          };
        }
        return {
          ...node,
          children: node.children ? encodeFileNodes(node.children) : undefined
        };
      });
    };

    await this.db!.put('projects', {
      ...project,
      files: encodeFileNodes(project.files),
      lastModified: new Date(),
      lastAccessed: project.lastAccessed || new Date()
    });
  }

  async getProject(id: string): Promise<Project | undefined> {
    if (!this.db) await this.init();
    const project = await this.db!.get('projects', id);

    if (project) {
      // Decode file contents when retrieving project
      const decodeFileNodes = (nodes: FileNode[]): FileNode[] => {
        return nodes.map(node => ({
          ...node,
          content: node.type === 'file' ? this.decodeFileContent(node.content || '', node.name) : undefined,
          children: node.children ? decodeFileNodes(node.children) : undefined
        }));
      };

      return {
        ...project,
        files: decodeFileNodes(project.files)
      };
    }
    return project;
  }

  async getAllProjects(): Promise<Project[]> {
    if (!this.db) await this.init();
    const projects = await this.db!.getAll('projects');

    return projects.map(project => ({
      ...project,
      files: this.stripFileContent(project.files)
    }));
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.delete('projects', id);
  }

  private stripFileContent(files: FileNode[]): FileNode[] {
    return files.map(file => ({
      ...file,
      content: file.type === 'file' ? '' : undefined,
      children: file.children ? this.stripFileContent(file.children) : undefined,
      path: file.path
    }));
  }
}

export const storage = new StorageService();