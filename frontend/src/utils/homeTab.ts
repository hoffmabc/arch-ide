import { FileNode } from '../types';

// Special identifier for the Home tab
export const HOME_TAB_PATH = '__HOME__';
export const HOME_TAB_NAME = 'Home';

/**
 * Creates a special FileNode representing the Home tab
 */
export function createHomeTab(): FileNode {
  return {
    name: HOME_TAB_NAME,
    type: 'file',
    path: HOME_TAB_PATH,
    content: '' // Empty content, we'll render HomeScreen component instead
  };
}

/**
 * Checks if a file is the Home tab
 */
export function isHomeTab(file: FileNode | null): boolean {
  return file?.path === HOME_TAB_PATH || file?.name === HOME_TAB_NAME;
}

/**
 * Finds the Home tab in an array of files
 */
export function findHomeTab(files: FileNode[]): FileNode | undefined {
  return files.find(isHomeTab);
}

/**
 * Removes the Home tab from an array of files
 */
export function removeHomeTab(files: FileNode[]): FileNode[] {
  return files.filter(file => !isHomeTab(file));
}

/**
 * Adds the Home tab to an array of files if it doesn't already exist
 */
export function addHomeTabIfNotExists(files: FileNode[]): FileNode[] {
  const hasHome = findHomeTab(files);
  if (hasHome) {
    return files;
  }
  return [createHomeTab(), ...files];
}
