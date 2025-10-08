import { v4 as uuidv4 } from 'uuid';
import type { FileNode, Project } from '../types';
import { projectService } from './projectService';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Arch-Network/arch-examples/main/examples';

interface GithubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url?: string;
}

/**
 * Fetches the file tree for an example project from GitHub
 */
async function fetchGithubDirectoryContents(exampleName: string, path: string = ''): Promise<GithubFile[]> {
  const apiUrl = path
    ? `https://api.github.com/repos/Arch-Network/arch-examples/contents/examples/${exampleName}/${path}`
    : `https://api.github.com/repos/Arch-Network/arch-examples/contents/examples/${exampleName}`;

  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch directory contents: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches file content from GitHub
 */
async function fetchFileContent(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file content: ${response.statusText}`);
  }
  return response.text();
}

/**
 * Recursively builds the file tree from GitHub (for program/src/ subdirectories)
 */
async function buildFileTree(exampleName: string, path: string = '', parentPath: string = ''): Promise<FileNode[]> {
  const contents = await fetchGithubDirectoryContents(exampleName, path);
  const fileNodes: FileNode[] = [];

  for (const item of contents) {
    const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;

    if (item.type === 'dir') {
      // Skip certain directories
      if (item.name === 'target' || item.name === 'node_modules' || item.name === '.git') {
        continue;
      }

      const children = await buildFileTree(
        exampleName,
        path ? `${path}/${item.name}` : item.name,
        itemPath
      );

      // Only add directory if it has children
      if (children.length > 0) {
        fileNodes.push({
          name: item.name,
          type: 'directory',
          children,
          path: itemPath
        });
      }
    } else if (item.type === 'file' && item.download_url) {
      // Skip Cargo.toml, .gitignore, and other config files - we only want Rust source files
      if (item.name === 'Cargo.toml' ||
          item.name === 'Cargo.lock' ||
          item.name === '.gitignore' ||
          item.name === '.DS_Store' ||
          item.name === 'README.md') {
        continue;
      }

      // Only include .rs files
      if (!item.name.endsWith('.rs')) {
        continue;
      }

      const content = await fetchFileContent(item.download_url);
      fileNodes.push({
        name: item.name,
        type: 'file',
        content,
        path: itemPath
      });
    }
  }

  return fileNodes;
}

/**
 * Gets the description for an example project
 */
function getExampleDescription(exampleName: string): string {
  const descriptions: Record<string, string> = {
    'counter': 'A simple counter program demonstrating state management on Arch Network.',
    'clock': 'Demonstrates time-based operations and block height tracking.',
    'create-new-account': 'Learn how to create and initialize new accounts on Arch Network.',
    'helloworld': 'The classic first program - perfect for getting started with Arch.',
    'transfer': 'Learn token and value transfers between accounts.',
    'multisig': 'Implement multi-signature authorization patterns.'
  };

  return descriptions[exampleName] || `Example project: ${exampleName}`;
}

/**
 * Fetches TypeScript/JavaScript client files if they exist
 */
async function fetchClientFiles(exampleName: string): Promise<FileNode[]> {
  try {
    const contents = await fetchGithubDirectoryContents(exampleName, 'app');
    const clientFiles: FileNode[] = [];

    for (const item of contents) {
      if (item.type === 'file' && item.download_url) {
        // Only include .ts and .js files
        if (item.name.endsWith('.ts') || item.name.endsWith('.js')) {
          const content = await fetchFileContent(item.download_url);
          clientFiles.push({
            name: item.name,
            type: 'file',
            content,
            path: item.name
          });
        }
      }
    }

    return clientFiles;
  } catch (error) {
    // If there's no app directory or an error, just return empty array
    console.log(`No client files found for ${exampleName}`);
    return [];
  }
}

/**
 * Loads an example project from GitHub and creates it in the local storage
 * Only fetches Rust source files from program/src/ directory and client files from app/
 */
export async function loadExampleProject(exampleName: string): Promise<Project> {
  console.log(`Loading example project: ${exampleName}`);

  try {
    // Fetch the file tree from GitHub, starting at program/src/
    // This will get only the Rust source files
    const srcFiles = await buildFileTree(exampleName, 'program/src');

    // Try to fetch client files from app/ directory
    const clientFiles = await fetchClientFiles(exampleName);

    // Build the project structure - always include both src/ and client/ directories
    const files: FileNode[] = [
      {
        name: 'src',
        type: 'directory',
        children: srcFiles,
        path: 'src'
      },
      {
        name: 'client',
        type: 'directory',
        children: clientFiles, // Will be empty array if no client files found
        path: 'client'
      }
    ];

    // Create a new project with the fetched files
    const project: Project = {
      id: uuidv4(),
      name: exampleName,
      description: getExampleDescription(exampleName),
      files,
      createdAt: new Date(),
      lastModified: new Date()
    };

    // Save the project
    await projectService.saveProject(project);

    console.log(`Successfully loaded example project: ${exampleName}`);
    return project;
  } catch (error) {
    console.error(`Failed to load example project ${exampleName}:`, error);
    throw new Error(`Failed to load example project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Lists all available example projects
 */
export async function listExampleProjects(): Promise<string[]> {
  try {
    const response = await fetch(
      'https://api.github.com/repos/Arch-Network/arch-examples/contents/examples',
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch examples list: ${response.statusText}`);
    }

    const contents: GithubFile[] = await response.json();
    return contents
      .filter(item => item.type === 'dir')
      .map(item => item.name);
  } catch (error) {
    console.error('Failed to list example projects:', error);
    // Return a fallback list of known examples
    return ['counter', 'clock', 'create-new-account', 'helloworld', 'transfer', 'multisig'];
  }
}

export const exampleProjectsService = {
  loadExampleProject,
  listExampleProjects
};
