import { v4 as uuidv4 } from 'uuid';
import type { Project, FileNode } from '../types';

const CARGO_TOML_TEMPLATE = `[package]
name = "arch-program"
version = "0.1.0"
edition = "2021"

# These dependencies are provided by the server during compilation
# and should reference the server-side crate paths
[dependencies]
sdk = { path = "../../sdk" }
arch_program = { path = "../../program" }
bip322 = { path = "../../bip322" }

# Standard dependencies that will be downloaded during compilation
bitcoincore-rpc = "0.18.0"
hex = "0.4.3"
borsh = { version = "1.4.0", features = ["derive"] }
bitcoin = { version = "0.32.3", features = ["serde", "rand"] }
log = "0.4"
env_logger = "0.10"

[lib]
path = "src/lib.rs"`;

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
    name: 'program',
    type: 'directory',
    children: [
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
        name: 'Cargo.toml',
        type: 'file',
        content: CARGO_TOML_TEMPLATE
        }
    ]
  },
  {
    name: 'src',
    type: 'directory',
    children: [
      {
        name: 'lib.rs',
        type: 'file',
        content: `/// Running Tests
#[cfg(test)]
mod tests {
    use arch_program::{
        account::AccountMeta, instruction::Instruction, pubkey::Pubkey,
        system_instruction::SystemInstruction,
    };

    use borsh::{BorshDeserialize, BorshSerialize};
    use sdk::constants::*;
    use sdk::helper::*;

    use std::fs;

    /// Represents the parameters for running the Hello World process
    #[derive(Clone, BorshSerialize, BorshDeserialize)]
    pub struct HelloWorldParams {
        pub name: String,
        pub tx_hex: Vec<u8>,
    }

    #[ignore]
    #[test]
    fn test_deploy_call() {
        println!("{:?}", 10044_u64.to_le_bytes());
        println!("{:?}", 10881_u64.to_le_bytes());

        let (program_keypair, program_pubkey) =
            with_secret_key_file(PROGRAM_FILE_PATH).expect("getting caller info should not fail");

        let (first_account_keypair, first_account_pubkey) =
            with_secret_key_file(".first_account.json")
                .expect("getting first account info should not fail");

        let (txid, vout) = send_utxo(program_pubkey);
        println!(
            "{}:{} {:?}",
            txid,
            vout,
            hex::encode(program_pubkey.serialize())
        );

        let (txid, _) = sign_and_send_instruction(
            SystemInstruction::new_create_account_instruction(
                hex::decode(txid).unwrap().try_into().unwrap(),
                vout,
                program_pubkey,
            ),
            vec![program_keypair],
        )
        .expect("signing and sending a transaction should not fail");

        let processed_tx = get_processed_transaction(NODE1_ADDRESS, txid.clone())
            .expect("get processed transaction should not fail");
        println!("processed_tx {:?}", processed_tx);

        deploy_program_txs(
            program_keypair,
            "program/target/sbf-solana-solana/release/helloworldprogram.so",
        );

        println!("{:?}", ());

        let elf = fs::read("program/target/sbf-solana-solana/release/helloworldprogram.so")
            .expect("elf path should be available");
        assert!(
            read_account_info(NODE1_ADDRESS, program_pubkey)
                .unwrap()
                .data
                == elf
        );

        let (txid, _) = sign_and_send_instruction(
            Instruction {
                program_id: Pubkey::system_program(),
                accounts: vec![AccountMeta {
                    pubkey: program_pubkey,
                    is_signer: true,
                    is_writable: true,
                }],
                data: vec![2],
            },
            vec![program_keypair],
        )
        .expect("signing and sending a transaction should not fail");

        let processed_tx = get_processed_transaction(NODE1_ADDRESS, txid.clone())
            .expect("get processed transaction should not fail");
        println!("processed_tx {:?}", processed_tx);

        assert!(
            read_account_info(NODE1_ADDRESS, program_pubkey)
                .unwrap()
                .is_executable
        );

        // ####################################################################################################################

        let (txid, vout) = send_utxo(first_account_pubkey);
        println!(
            "{}:{} {:?}",
            txid,
            vout,
            hex::encode(first_account_pubkey.serialize())
        );

        let (txid, _) = sign_and_send_instruction(
            SystemInstruction::new_create_account_instruction(
                hex::decode(txid).unwrap().try_into().unwrap(),
                vout,
                first_account_pubkey,
            ),
            vec![first_account_keypair],
        )
        .expect("signing and sending a transaction should not fail");

        let processed_tx = get_processed_transaction(NODE1_ADDRESS, txid.clone())
            .expect("get processed transaction should not fail");
        println!("processed_tx {:?}", processed_tx);

        let mut instruction_data = vec![3];
        instruction_data.extend(program_pubkey.serialize());

        let (txid, _) = sign_and_send_instruction(
            Instruction {
                program_id: Pubkey::system_program(),
                accounts: vec![AccountMeta {
                    pubkey: first_account_pubkey,
                    is_signer: true,
                    is_writable: true,
                }],
                data: instruction_data,
            },
            vec![first_account_keypair],
        )
        .expect("signing and sending a transaction should not fail");

        let processed_tx = get_processed_transaction(NODE1_ADDRESS, txid.clone())
            .expect("get processed transaction should not fail");
        println!("processed_tx {:?}", processed_tx);

        assert_eq!(
            read_account_info(NODE1_ADDRESS, first_account_pubkey)
                .unwrap()
                .owner,
            program_pubkey
        );

        // ####################################################################################################################

        println!("sending THE transaction");

        let (txid, _) = sign_and_send_instruction(
            Instruction {
                program_id: program_pubkey,
                accounts: vec![AccountMeta {
                    pubkey: first_account_pubkey,
                    is_signer: true,
                    is_writable: true,
                }],
                data: borsh::to_vec(&HelloWorldParams {
                    name: "arch".to_string(),
                    tx_hex: hex::decode(prepare_fees()).unwrap(),
                })
                .unwrap(),
            },
            vec![first_account_keypair],
        )
        .expect("signing and sending a transaction should not fail");

        let processed_tx = get_processed_transaction(NODE1_ADDRESS, txid.clone())
            .expect("get processed transaction should not fail");
        println!("processed_tx {:?}", processed_tx);

        let first_account_last_state =
            read_account_info(NODE1_ADDRESS, first_account_pubkey).unwrap();
        println!("{:?}", first_account_last_state);
        assert_eq!(
            first_account_last_state.utxo,
            format!("{}:{}", processed_tx.bitcoin_txid.unwrap(), 0)
        );

        // ####################################################################################################################

        println!("sending THE transaction");

        let (txid, _) = sign_and_send_instruction(
            Instruction {
                program_id: program_pubkey,
                accounts: vec![AccountMeta {
                    pubkey: first_account_pubkey,
                    is_signer: true,
                    is_writable: true,
                }],
                data: borsh::to_vec(&HelloWorldParams {
                    name: "arch".to_string(),
                    tx_hex: hex::decode(prepare_fees()).unwrap(),
                })
                .unwrap(),
            },
            vec![first_account_keypair],
        )
        .expect("signing and sending a transaction should not fail");

        let processed_tx = get_processed_transaction(NODE1_ADDRESS, txid.clone())
            .expect("get processed transaction should not fail");
        println!("processed_tx {:?}", processed_tx);

        println!(
            "{:?}",
            read_account_info(NODE1_ADDRESS, first_account_pubkey)
        );
        assert_eq!(
            read_account_info(NODE1_ADDRESS, first_account_pubkey)
                .unwrap()
                .owner,
            first_account_last_state.owner
        );
        assert_eq!(
            read_account_info(NODE1_ADDRESS, first_account_pubkey)
                .unwrap()
                .data,
            first_account_last_state.data
        );
        assert_eq!(
            read_account_info(NODE1_ADDRESS, first_account_pubkey)
                .unwrap()
                .utxo,
            format!("{}:{}", processed_tx.bitcoin_txid.unwrap(), 0)
        );
        assert_eq!(
            read_account_info(NODE1_ADDRESS, first_account_pubkey)
                .unwrap()
                .is_executable,
            first_account_last_state.is_executable
        );
    }
}`
      }
    ]
  }
];

export class ProjectService {
  private storage = localStorage;

  createProject(name: string, description?: string): Project {
    const project: Project = {
      id: uuidv4(),
      name,
      description,
      files: [...PROGRAM_TEMPLATE],
      created: new Date(),
      lastModified: new Date()
    };

    this.saveProject(project);
    return project;
  }

  saveProject(project: Project) {
    const projects = this.getAllProjects();
    projects[project.id] = project;
    this.storage.setItem('projects', JSON.stringify(projects));
  }

  getProject(id: string): Project | null {
    const projects = this.getAllProjects();
    return projects[id] || null;
  }

  getAllProjects(): Record<string, Project> {
    const projectsStr = this.storage.getItem('projects');
    return projectsStr ? JSON.parse(projectsStr) : {};
  }

  deleteProject(id: string) {
    const projects = this.getAllProjects();
    delete projects[id];
    this.storage.setItem('projects', JSON.stringify(projects));
  }

  async compileProject(project: Project) {
    const files: { path: string, content: string }[] = [];
    
    // Recursive function to collect all files from a directory
    const collectFiles = (nodes: FileNode[], currentPath: string = '') => {
      for (const node of nodes) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;
        
        if (node.type === 'file') {
          files.push({
            path: nodePath.replace('program/', ''), // Remove program/ prefix for backend
            content: node.content
          });
        } else if (node.type === 'directory' && node.children) {
          collectFiles(node.children, nodePath);
        }
      }
    };
  
    // Find the program directory
    const programDir = project.files.find(node => 
      node.type === 'directory' && node.name === 'program'
    );
  
    if (programDir?.type === 'directory' && programDir.children) {
      collectFiles(programDir.children);
    }
  
    // Make API call to compile
    const response = await fetch('http://localhost:8080/compile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files })
    });
  
    return response.json();
  }
}

export const projectService = new ProjectService();