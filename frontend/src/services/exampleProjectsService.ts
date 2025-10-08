import { v4 as uuidv4 } from 'uuid';
import type { FileNode, Project } from '../types';
import { projectService } from './projectService';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Arch-Network/arch-examples/main/examples';

// Simple in-memory cache to reduce API calls
// Note: We only need to cache directory listings (API calls)
// File content uses raw.githubusercontent.com which has no rate limits!
const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes for directory listings

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
  const cacheKey = `dir:${exampleName}:${path}`;

  // Check cache first
  const cached = apiCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Using cached directory contents for:', cacheKey);
    return cached.data;
  }

  const apiUrl = path
    ? `https://api.github.com/repos/Arch-Network/arch-examples/contents/examples/${exampleName}/${path}`
    : `https://api.github.com/repos/Arch-Network/arch-examples/contents/examples/${exampleName}`;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
  };

  // Add GitHub token if available (increases rate limit from 60 to 5000 req/hour)
  const githubToken = import.meta.env.VITE_GITHUB_TOKEN;
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const response = await fetch(apiUrl, { headers });

  if (!response.ok) {
    // Check for rate limiting
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      if (rateLimitRemaining === '0') {
        const resetTime = response.headers.get('X-RateLimit-Reset');
        const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000) : null;
        throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate?.toLocaleTimeString() || 'unknown time'}. Please try again later.`);
      }
    }
    throw new Error(`Failed to fetch directory contents: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Cache the result
  apiCache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
}

/**
 * Converts GitHub API download_url to raw.githubusercontent.com URL
 * This bypasses API rate limits completely!
 */
function convertToRawUrl(apiDownloadUrl: string): string {
  // API URLs look like: https://raw.githubusercontent.com/...
  // They're already raw URLs, so we can use them directly
  return apiDownloadUrl;
}

/**
 * Fetches file content from GitHub using raw URLs (no rate limits!)
 */
async function fetchFileContent(url: string): Promise<string> {
  // Use raw GitHub URL - no authentication needed, no rate limits!
  // We don't need aggressive caching since raw.githubusercontent.com has no rate limits
  const rawUrl = convertToRawUrl(url);

  const response = await fetch(rawUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch file content: ${response.status} ${response.statusText}`);
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
      created: new Date(),
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
