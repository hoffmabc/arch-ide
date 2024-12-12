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

  async saveProject(project: Project): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.put('projects', {
      ...project,
      lastModified: new Date()
    });
  }

  async getProject(id: string): Promise<Project | undefined> {
    if (!this.db) await this.init();
    return this.db!.get('projects', id);
  }

  async getAllProjects(): Promise<Project[]> {
    if (!this.db) await this.init();
    return this.db!.getAll('projects');
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.delete('projects', id);
  }
}

export const storage = new StorageService();