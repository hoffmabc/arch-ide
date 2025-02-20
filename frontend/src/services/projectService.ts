import { v4 as uuidv4 } from 'uuid';
import type { FileNode, Project } from '../types';
import JSZip from 'jszip';
import { StorageService } from './storage';
import { ProjectAccount } from '../types/types';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const CARGO_TOML_TEMPLATE = `[package]
name = "arch-ide"
version = "0.1.0"
edition = "2021"

[dependencies]
arch_program = "0.3.2"
borsh = { version = "1.5.1", features = ["derive"] }

[lib]
crate-type = ["cdylib", "lib"]`;

const DEFAULT_PROGRAM = `use arch_program::{
    account::AccountInfo,
    entrypoint, msg,
    helper::add_state_transition,
    input_to_sign::InputToSign,
    program::{
        get_bitcoin_block_height, next_account_info, set_transaction_to_sign,
    },
    program_error::ProgramError, pubkey::Pubkey,
    transaction_to_sign::TransactionToSign,
    bitcoin::{self, Transaction, transaction::Version, absolute::LockTime}
};
use borsh::{BorshDeserialize, BorshSerialize};

entrypoint!(process_instruction);
pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    if accounts.len() != 1 {
        return Err(ProgramError::Custom(501));
    }

    let bitcoin_block_height = get_bitcoin_block_height();
    msg!("bitcoin_block_height {:?}", bitcoin_block_height);

    let account_iter = &mut accounts.iter();
    let account = next_account_info(account_iter)?;

    assert!(account.is_writable);
    assert!(account.is_signer);

    let params: HelloWorldParams = borsh::from_slice(instruction_data).unwrap();
    let fees_tx: Transaction = bitcoin::consensus::deserialize(&params.tx_hex).unwrap();

    let new_data = format!("Hello {}", params.name);

    // Extend the account data to fit the new data
    let data_len = account.data.try_borrow().unwrap().len();
    if new_data.as_bytes().len() > data_len {
        account.realloc(new_data.len(), true)?;
    }

    account
        .data
        .try_borrow_mut()
        .unwrap()
        .copy_from_slice(new_data.as_bytes());

    let mut tx = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![],
        output: vec![],
    };
    add_state_transition(&mut tx, account);
    tx.input.push(fees_tx.input[0].clone());

    let tx_to_sign = TransactionToSign {
        tx_bytes: &bitcoin::consensus::serialize(&tx),
        inputs_to_sign: &[InputToSign {
            index: 0,
            signer: account.key.clone(),
        }],
    };

    msg!("tx_to_sign{:?}", tx_to_sign);
    set_transaction_to_sign(accounts, tx_to_sign)
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct HelloWorldParams {
    pub name: String,
    pub tx_hex: Vec<u8>,
}
`;

const PROGRAM_TEMPLATE: FileNode[] = [
  {
    name: 'src',
    type: 'directory',
    children: [
      {
        name: 'lib.rs',
        type: 'file',
        content: DEFAULT_PROGRAM
      }
    ]
  },
  {
    name: 'client',
    type: 'directory',
    children: [
      {
        name: 'client.ts',
        type: 'file',
        content: ''
      }
    ]
  }
];

const addPathsToNodes = (nodes: FileNode[], parentPath: string = ''): FileNode[] => {
    return nodes.map(node => {
      const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      if (node.type === 'directory' && node.children) {
        return {
          ...node,
          path: currentPath,
          children: addPathsToNodes(node.children, currentPath)
        };
      }
      return { ...node, path: currentPath };
    });
  };

export class ProjectService {
  private storage = new StorageService();

  constructor() {
    // Initialize the storage service when ProjectService is created
    this.storage.init().catch(console.error);
  }

  async createProject(name: string, description?: string): Promise<Project> {
    const uniqueName = await this.getUniqueProjectName(name);
    const project: Project = {
      id: uuidv4(),
      name: uniqueName,
      description,
      files: addPathsToNodes([...PROGRAM_TEMPLATE]),
      created: new Date(),
      lastModified: new Date(),
      account: undefined
    };

    await this.storage.saveProject(project);
    return project;
  }

  async updateProjectAccount(projectId: string, account: ProjectAccount): Promise<void> {
    const project = await this.storage.getProject(projectId);
    if (project) {
      project.account = account;
      project.lastModified = new Date();
      await this.storage.saveProject(project);
    }
  }

  async saveProject(project: Project): Promise<void> {
    // Prevent auto-saving during development hot reload
    if (import.meta.env.DEV && document.visibilityState === 'hidden') {
      return;
    }

    await this.storage.saveProject(project);
  }

  async getProject(id: string): Promise<Project | null> {
    return (await this.storage.getProject(id)) || null;
  }

  async getAllProjects(): Promise<Project[]> {
    return await this.storage.getAllProjects();
  }

  async deleteProject(id: string): Promise<void> {
    await this.storage.deleteProject(id);
  }

  async compileProject(project: Project) {
    const files: { path: string, content: string }[] = [];
    // Find the program directory
    const programDir = project.files.find((node: FileNode) =>
      node.type === 'directory' && node.name === 'program'
    );

    if (!programDir || programDir.type !== 'directory' || !programDir.children) {
      throw new Error('Program directory not found or invalid');
    }

    // Only collect required files from the program directory
    const requiredFiles = [
      'src/lib.rs',
      'Cargo.toml'
    ];

    const collectRequiredFiles = (nodes: FileNode[], currentPath = '') => {
      for (const node of nodes) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

        if (node.type === 'file' && requiredFiles.includes(nodePath)) {
          if (typeof node.content === 'string') {
            files.push({
              path: nodePath,
              content: node.content
            });
          } else {
            throw new Error(`Invalid content type for file: ${nodePath}`);
          }
        } else if (node.type === 'directory' && node.children) {
          collectRequiredFiles(node.children, nodePath);
        }
      }
    };

    collectRequiredFiles(programDir.children);
    // Verify we have all required files
    for (const requiredFile of requiredFiles) {
      if (!files.some(f => f.path === requiredFile)) {
        throw new Error(`Missing required file: ${requiredFile}`);
      }
    }

    // Make API call to compile
    const response = await fetch(`${API_URL}/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files })
      });

    return response.json();
  }

  exportProject(project: Project): Blob {
    // Convert project to a JSON string with proper formatting
    const projectData = JSON.stringify(project, null, 2);
    return new Blob([projectData], { type: 'application/json' });
  }

  async importProject(files: FileList): Promise<Project> {
    const fileNodes: FileNode[] = [];
    const fileMap = new Map<string, FileNode>();

    console.log('Starting import with files:', Array.from(files).map(f => f.webkitRelativePath));

    // Convert FileList to array and sort by path
    const fileArray = Array.from(files).sort((a, b) =>
      a.webkitRelativePath.localeCompare(b.webkitRelativePath)
    );

    console.log('Sorted file array:', fileArray.map(f => f.webkitRelativePath));

    // Get base project name from first file
    const baseProjectName = files[0].webkitRelativePath.split('/')[0];
    const projectName = await this.getUniqueProjectName(baseProjectName);

    console.log('Project name:', projectName);

    // Process each file
    for (const file of fileArray) {
      console.log('\nProcessing file:', file.webkitRelativePath);
      const pathParts = file.webkitRelativePath.split('/');
      console.log('Path parts:', pathParts);
      let currentPath = '';

      // Skip the first part as it's the root folder name
      for (let i = 1; i < pathParts.length; i++) {
        const part = pathParts[i];
        const isFile = i === pathParts.length - 1;
        const fullPath = currentPath + part;

        console.log(`Processing part: ${part} (${isFile ? 'file' : 'directory'})`);
        console.log('Current path:', currentPath);
        console.log('Full path:', fullPath);

        if (!fileMap.has(fullPath)) {
          const node: FileNode = {
            name: part,
            type: isFile ? 'file' : 'directory',
            path: fullPath,
            ...(isFile ? { content: await this.readFileContent(file) } : { children: [] })
          };

          console.log('Created node:', {
            name: node.name,
            type: node.type,
            path: node.path,
            hasContent: isFile ? 'yes' : 'no',
            hasChildren: !isFile ? 'yes' : 'no'
          });

          fileMap.set(fullPath, node);

          if (currentPath === '') {
            console.log('Adding to root fileNodes:', node.name);
            fileNodes.push(node);
          } else {
            const parent = fileMap.get(currentPath.slice(0, -1));
            if (parent && parent.children) {
              console.log(`Adding to parent "${parent.name}":`, node.name);
              parent.children.push(node);
            } else {
              console.warn('Could not find parent for path:', currentPath.slice(0, -1));
            }
          }
        }

        if (!isFile) {
          currentPath += part + '/';
        }
      }
    }

    console.log('\nFinal file structure:', {
      fileNodes: fileNodes.map(node => ({
        name: node.name,
        type: node.type,
        children: node.children?.map(child => child.name)
      }))
    });

    // Transform the structure to ensure src/lib.rs layout
    const transformedFiles = this.transformToSrcStructure(fileNodes);

    const project = {
      id: uuidv4(),
      name: projectName,
      files: transformedFiles,
      created: new Date(),
      lastModified: new Date()
    };

    await this.saveProject(project);
    return project;
  }

  private async getUniqueProjectName(baseName: string): Promise<string> {
    const projects = await this.storage.getAllProjects();
    let name = baseName;
    let counter = 1;

    while (projects.some(p => p.name === name)) {
      name = `${baseName} (${counter})`;
      counter++;
    }

    return name;
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      // Use the storage service's isTextFile check instead of relying on MIME type
      const isText = this.storage.isTextFile(file.name) ||
                    file.type.startsWith('text/') ||
                    ['application/json', 'application/javascript', 'application/typescript']
                      .includes(file.type);

      reader.onload = (e) => {
        if (isText) {
          resolve(e.target?.result as string);
        } else {
          // Only use data URL for actual binary files
          resolve(e.target?.result as string);
        }
      };

      if (isText) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }

  async importProjectAsZip(file: File): Promise<Project> {
    const zip = await JSZip.loadAsync(file);
    const fileNodes: FileNode[] = [];
    const fileMap = new Map<string, FileNode>()

    // Get the root directory name from the zip
    const rootDirName = Object.keys(zip.files)[0].split('/')[0];
    const projectName = rootDirName || file.name.replace('.zip', '');
    const uniqueName = await this.getUniqueProjectName(projectName);

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (!zipEntry.dir) {
        const content = await zipEntry.async('text');
        const parts = path.split('/');
        let currentPath = '';

        for (const [index, part] of parts.entries()) {
          const isFile = index === parts.length - 1;
          const fullPath = currentPath + part;

          if (!fileMap.has(fullPath)) {
            const node: FileNode = {
              name: part,
              type: isFile ? 'file' : 'directory',
              path: fullPath,
              ...(isFile ? { content } : { children: [] })
            };

            fileMap.set(fullPath, node);

            if (currentPath === '') {
              fileNodes.push(node);
            } else {
              const parent = fileMap.get(currentPath.slice(0, -1));
              parent?.children?.push(node);
            }
          }

          if (!isFile) {
            currentPath += part + '/';
          }
        }
      }
    }

    const project = {
      id: uuidv4(),
      name: uniqueName,
      files: fileNodes,
      created: new Date(),
      lastModified: new Date()
    };

    // Save to IndexedDB
    await this.saveProject(project);
    return project;
  }

  private transformToSrcStructure(fileNodes: FileNode[]): FileNode[] {
    console.group('File Structure Transformation');

    // Log initial state
    console.log('Initial structure:', fileNodes.map(n => ({
      name: n.name,
      type: n.type,
      hasContent: !!n.content
    })));

    // Find or create src directory if it doesn't exist
    let srcNode = fileNodes.find(node => node.name === 'src' && node.type === 'directory');
    if (!srcNode) {
      srcNode = {
        name: 'src',
        type: 'directory',
        children: []
      };
      // Only add src directory if we have Rust files that should go in it
      const hasRustFiles = fileNodes.some(node =>
        node.type === 'file' && node.name.endsWith('.rs')
      );
      if (hasRustFiles) {
        fileNodes.push(srcNode);
      }
    }

    // Only move lib.rs to src directory if it exists at root and src exists
    const libRs = fileNodes.find(node => node.name === 'lib.rs' && node.type === 'file');
    if (libRs && srcNode) {
      srcNode.children = srcNode.children || [];
      // Only move if not already in src
      if (!srcNode.children.find(n => n.name === 'lib.rs')) {
        srcNode.children.push(libRs);
        fileNodes = fileNodes.filter(node => node !== libRs);
      }
    }

    // Log final state
    console.log('Transformed structure:', fileNodes.map(n => ({
      name: n.name,
      type: n.type,
      children: n.children?.map(c => c.name)
    })));

    console.groupEnd();
    return fileNodes;
  }

  async importFromFolder(files: FileList): Promise<Project> {
    const fileNodes: FileNode[] = [];
    const fileMap = new Map<string, FileNode>();

    // Get base project name from first file
    const baseProjectName = files[0].webkitRelativePath.split('/')[0];
    const projectName = await this.getUniqueProjectName(baseProjectName);

    // Process each file
    for (const file of Array.from(files)) {
      const pathParts = file.webkitRelativePath.split('/');
      let currentPath = '';

      // Skip the first part as it's the root folder name
      for (let i = 1; i < pathParts.length; i++) {
        const part = pathParts[i];
        const isFile = i === pathParts.length - 1;
        const fullPath = currentPath + part;

        if (!fileMap.has(fullPath)) {
          const node: FileNode = {
            name: part,
            type: isFile ? 'file' : 'directory',
            path: fullPath,
            ...(isFile ? { content: await this.readFileContent(file) } : { children: [] })
          };

          fileMap.set(fullPath, node);

          if (currentPath === '') {
            fileNodes.push(node);
          } else {
            const parent = fileMap.get(currentPath.slice(0, -1));
            if (parent && parent.children) {
              parent.children.push(node);
            }
          }
        }

        if (!isFile) {
          currentPath += part + '/';
        }
      }
    }

    const project = {
      id: uuidv4(),
      name: projectName,
      files: fileNodes,
      created: new Date(),
      lastModified: new Date()
    };

    await this.saveProject(project);
    return project;
  }

  async exportProjectAsZip(project: Project): Promise<Blob> {
    const zip = new JSZip();

    const addToZip = (nodes: FileNode[], currentPath: string = '') => {
      for (const node of nodes) {
        const path = currentPath ? `${currentPath}/${node.name}` : node.name;
        if (node.type === 'file' && node.content) {
          zip.file(path, node.content);
        } else if (node.type === 'directory' && node.children) {
          addToZip(node.children, path);
        }
      }
    };

    addToZip(project.files);
    return await zip.generateAsync({ type: 'blob' });
  }
}

export const projectService = new ProjectService();