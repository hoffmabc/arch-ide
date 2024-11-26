// src/services/github.ts
import { Octokit } from '@octokit/rest';
import type { Project, FileNode } from '../types';

export class GitHubService {
  private octokit: Octokit | null = null;

  async authenticate(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async saveToGist(project: Project): Promise<string> {
    if (!this.octokit) throw new Error('Not authenticated');

    const files: Record<string, { content: string }> = {};
    
    const processNode = (node: FileNode, path: string = '') => {
      if (node.type === 'file') {
        files[`${path}${node.name}`] = {
          content: node.content || ''
        };
      } else if (node.type === 'directory' && node.children) {
        node.children.forEach(child => 
          processNode(child, `${path}${node.name}/`)
        );
      }
    };

    project.files.forEach(node => processNode(node));

    const response = await this.octokit.gists.create({
      description: `Arch IDE Project: ${project.name}`,
      public: false,
      files
    });

    return response.data.id;
  }

  async loadFromGist(gistId: string): Promise<Project> {
    if (!this.octokit) throw new Error('Not authenticated');

    const response = await this.octokit.gists.get({ gist_id: gistId });
    const { files, description } = response.data;

    const projectFiles: FileNode[] = [];
    const fileMap = new Map<string, FileNode>();

    Object.entries(files).forEach(([path, file]) => {
      const parts = path.split('/');
      let currentPath = '';
      
      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        const fullPath = currentPath + part;
        
        if (!fileMap.has(fullPath)) {
          const node: FileNode = {
            name: part,
            type: isFile ? 'file' : 'directory',
            ...(isFile ? { content: file?.content || '' } : { children: [] })
          };
          
          fileMap.set(fullPath, node);
          
          if (currentPath === '') {
            projectFiles.push(node);
          } else {
            const parent = fileMap.get(currentPath.slice(0, -1));
            parent?.children?.push(node);
          }
        }
        
        if (!isFile) {
          currentPath += part + '/';
        }
      });
    });

    return {
      id: gistId,
      name: description?.replace('Arch IDE Project: ', '') || 'Imported Project',
      files: projectFiles,
      created: new Date(),
      lastModified: new Date()
    };
  }
}

export const github = new GitHubService();