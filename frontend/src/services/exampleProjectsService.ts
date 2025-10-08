import { v4 as uuidv4 } from 'uuid';
import type { FileNode, Project } from '../types';
import { projectService } from './projectService';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Arch-Network/arch-examples/main/examples';

// Known file structure for each example (no API needed!)
// This maps to the actual structure in the arch-examples repo
// Note: srcPath can be 'program/src' or 'src' depending on the example
const EXAMPLE_STRUCTURES: Record<string, { src: string[], client?: string[], srcPath?: string }> = {
  'clock': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'counter': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'create-new-account': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'escrow': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'helloworld': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'oracle': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'secp256k1_signature': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'stake': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'test-sol-log-data': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'vote': {
    src: ['lib.rs', 'shared_validator_state.rs', 'update_pubkey_package.rs', 'utils.rs', 'whitelist.rs'],
    srcPath: 'src'
  }
};

/**
 * Fetches file content directly from raw GitHub URL (no API needed!)
 * Tries multiple possible paths if the first one fails
 */
async function fetchRawFileContent(exampleName: string, filePath: string): Promise<string> {
  const possiblePaths = [
    filePath,
    // If path starts with 'program/src', try without 'program/' prefix
    filePath.replace('program/', ''),
    // If path starts with 'src', try with 'program/' prefix
    filePath.includes('program/') ? filePath : `program/${filePath}`
  ];

  // Remove duplicates
  const uniquePaths = [...new Set(possiblePaths)];

  let lastError: Error | null = null;

  for (const path of uniquePaths) {
    const rawUrl = `${GITHUB_RAW_BASE}/${exampleName}/${path}`;
    console.log(`Trying: ${rawUrl}`);

    try {
      const response = await fetch(rawUrl);
      if (response.ok) {
        console.log(`✅ Success: ${rawUrl}`);
        return response.text();
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(`Failed to fetch ${filePath}: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Builds the source file tree from hardcoded structure (no API needed!)
 */
async function buildSourceFiles(exampleName: string): Promise<FileNode[]> {
  const structure = EXAMPLE_STRUCTURES[exampleName];
  if (!structure) {
    throw new Error(`Unknown example: ${exampleName}`);
  }

  const fileNodes: FileNode[] = [];
  const srcPath = structure.srcPath || 'program/src'; // Default to program/src

  // Fetch all source files
  for (const fileName of structure.src) {
    try {
      const content = await fetchRawFileContent(exampleName, `${srcPath}/${fileName}`);
      fileNodes.push({
        name: fileName,
        type: 'file',
        content,
        path: fileName
      });
    } catch (error) {
      console.error(`Failed to fetch ${fileName}:`, error);
      throw error;
    }
  }

  return fileNodes;
}

/**
 * Gets the description for an example project
 */
function getExampleDescription(exampleName: string): string {
  const descriptions: Record<string, string> = {
    'clock': 'Demonstrates time-based operations and block height tracking.',
    'counter': 'A simple counter program demonstrating state management on Arch Network.',
    'create-new-account': 'Learn how to create and initialize new accounts on Arch Network.',
    'escrow': 'Implement secure escrow patterns for conditional transfers.',
    'helloworld': 'The classic first program - perfect for getting started with Arch.',
    'oracle': 'Build decentralized oracle solutions for external data feeds.',
    'secp256k1_signature': 'Learn secp256k1 signature verification on Arch Network.',
    'stake': 'Implement staking mechanisms and reward distribution.',
    'test-sol-log-data': 'Test and debug logging functionality in Arch programs.',
    'vote': 'Build voting and governance mechanisms with multi-file structure.'
  };

  return descriptions[exampleName] || `Example project: ${exampleName}`;
}

/**
 * Fetches client files from hardcoded structure (no API needed!)
 */
async function buildClientFiles(exampleName: string): Promise<FileNode[]> {
  const structure = EXAMPLE_STRUCTURES[exampleName];
  if (!structure || !structure.client) {
    console.log(`✓ No client files defined for ${exampleName}`);
    return [];
  }

  const clientFiles: FileNode[] = [];

  // Fetch all client files
  for (const fileName of structure.client) {
    try {
      const content = await fetchRawFileContent(exampleName, `app/${fileName}`);
      clientFiles.push({
        name: fileName,
        type: 'file',
        content,
        path: fileName
      });
    } catch (error) {
      console.warn(`Failed to fetch client file ${fileName}:`, error);
      // Continue with other files even if one fails
    }
  }

  console.log(`✓ Loaded ${clientFiles.length} client files for ${exampleName}`);
  return clientFiles;
}

/**
 * Generates a unique project name by checking existing projects
 * Appends a number if the name already exists (e.g., "counter", "counter (1)", "counter (2)")
 * Uses the same format as projectService.getUniqueProjectName for consistency
 */
async function generateUniqueProjectName(baseName: string): Promise<string> {
  const existingProjects = await projectService.getAllProjects();
  const existingNames = new Set(existingProjects.map(p => p.name));

  // If the base name is unique, use it
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  // Otherwise, append a number in parentheses
  let counter = 1;
  let newName = `${baseName} (${counter})`;
  while (existingNames.has(newName)) {
    counter++;
    newName = `${baseName} (${counter})`;
  }

  return newName;
}

/**
 * Loads an example project from GitHub using direct raw URLs (no API!)
 * Fetches Rust source files from program/src/ directory and client files from app/
 * Ensures unique project names by appending numbers if needed
 */
export async function loadExampleProject(exampleName: string): Promise<Project> {
  console.log(`📦 Loading example project: ${exampleName}`);

  try {
    // Generate a unique project name
    const uniqueName = await generateUniqueProjectName(exampleName);
    if (uniqueName !== exampleName) {
      console.log(`📝 Project name already exists, using: ${uniqueName}`);
    }

    // Fetch source files using hardcoded structure (no API calls!)
    const srcFiles = await buildSourceFiles(exampleName);
    console.log(`✓ Loaded ${srcFiles.length} source files`);

    // Fetch client files using hardcoded structure (no API calls!)
    const clientFiles = await buildClientFiles(exampleName);

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
        children: clientFiles,
        path: 'client'
      }
    ];

    // Create a new project with the unique name
    const project: Project = {
      id: uuidv4(),
      name: uniqueName,
      description: getExampleDescription(exampleName),
      files,
      created: new Date(),
      lastModified: new Date()
    };

    // Save the project
    await projectService.saveProject(project);

    console.log(`✅ Successfully loaded ${uniqueName}!`);
    return project;
  } catch (error) {
    console.error(`❌ Failed to load example project ${exampleName}:`, error);
    throw new Error(`Failed to load example project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Lists all available example projects (from hardcoded list - no API needed!)
 */
export async function listExampleProjects(): Promise<string[]> {
  return Object.keys(EXAMPLE_STRUCTURES);
}

export const exampleProjectsService = {
  loadExampleProject,
  listExampleProjects
};
