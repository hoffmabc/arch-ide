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

    try {
      const base64Content = content.split(';base64,')[1];
      if (!base64Content) {
        console.error('Invalid base64 content format');
        return content;
      }
      return atob(base64Content);
    } catch (e) {
      console.error('Failed to decode base64 content:', e);
      return content;
    }
    return content;
  }

  async saveProject(project: Project): Promise<void> {
    console.log('StorageService.saveProject - Starting save:', {
      projectId: project.id,
      projectName: project.name,
      fileCount: project.files.length
    });

    if (!this.db) await this.init();

    // Don't encode already encoded content
    const shouldEncodeContent = (content: string) => {
      return !content.startsWith('data:');
    };

    // Encode file contents when saving project
    const encodeFileNodes = (nodes: FileNode[]): FileNode[] => {
      console.log('Encoding file nodes:', {
        nodeCount: nodes.length,
        fileNodes: nodes.map(n => ({
          name: n.name,
          type: n.type,
          hasContent: !!n.content,
          contentLength: n.content?.length
        }))
      });

      return nodes.map(node => {
        if (node.type === 'file' && node.content && shouldEncodeContent(node.content)) {
          console.log(`Encoding content for file: ${node.name}`);
          const base64Content = btoa(node.content);
          return {
            ...node,
            content: `data:text/plain;base64,${base64Content}`
          };
        }
        return {
          ...node,
          children: node.children ? encodeFileNodes(node.children) : undefined
        };
      });
    };

    // Add before the final save
    console.log('StorageService.saveProject - About to save to IndexedDB:', {
      projectId: project.id,
      encodedFileCount: project.files.length
    });

    await this.db!.put('projects', {
      ...project,
      files: encodeFileNodes(project.files),
      lastModified: new Date(),
      lastAccessed: project.lastAccessed || new Date()
    });
  }

  async getProject(id: string): Promise<Project | undefined> {
    console.log('StorageService.getProject - Fetching project:', { id });

    if (!this.db) await this.init();
    const project = await this.db!.get('projects', id);

    console.log('StorageService.getProject - Raw project from DB:', {
      found: !!project,
      fileCount: project?.files?.length
    });

    // Decode file contents when retrieving project
    const decodeFileNodes = (nodes: FileNode[]): FileNode[] => {
      console.log('Decoding file nodes:', {
        nodeCount: nodes.length,
        fileTypes: nodes.map(n => ({ name: n.name, type: n.type }))
      });

      return nodes.map(node => {
        const decoded = {
          ...node,
          content: node.type === 'file' ? this.decodeFileContent(node.content || '', node.name) : undefined,
          children: node.children ? decodeFileNodes(node.children) : undefined
        };

        if (node.type === 'file') {
          console.log(`Decoded file ${node.name}:`, {
            hadContent: !!node.content,
            hasDecodedContent: !!decoded.content,
            contentLength: decoded.content?.length
          });
        }

        return decoded;
      });
    };

    if (project) {
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

    // Only strip content in production
    if (import.meta.env.PROD) {
      return projects.map(project => ({
        ...project,
        files: this.stripFileContent(project.files)
      }));
    }

    return projects;
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