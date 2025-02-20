import * as monaco from "monaco-editor";
import { Disposable } from "../../../../../types/types";

export const declareGlobalTypes = async (): Promise<Disposable> => {
  const disposables = [
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare module "@saturnbtcio/arch-sdk" {
        export type Pubkey = Uint8Array;
        export const PubkeySchema: Schema;

        export type UtxoMeta = Uint8Array;
        export interface UtxoMetaData {
          txid: string;
          vout: number;
        }
        export const UtxoMetaSchema: Schema;

        export interface AccountInfo {
          key: Pubkey;
          utxo: UtxoMeta;
          data: Uint8Array;
          owner: Pubkey;
          is_signer: boolean;
          is_writable: boolean;
          tag: string;
        }

        export interface AccountMeta {
          pubkey: Pubkey;
          is_signer: boolean;
          is_writable: boolean;
        }

        export interface AccountInfoResult {
          owner: Pubkey;
          data: Uint8Array;
          utxo: string;
          is_executable: boolean;
        }

        export interface Block {
          transactions: Array<string>;
          previous_block_hash: string;
          bitcoin_block_hash: string;
          hash: string;
          merkle_root: string;
          timestamp: number;
          transactions_count: number;
        }

        export interface Instruction {
          program_id: Pubkey;
          accounts: Array<AccountMeta>;
          data: Uint8Array;
        }

        export interface Message {
          signers: Array<Pubkey>;
          instructions: Array<Instruction>;
        }

        export type Signature = Uint8Array;
        export interface RuntimeTransaction {
          version: number;
          signatures: Array<Signature>;
          message: Message;
        }

        export type ProcessedTransactionStatus = 'Processing' | 'Processed' | { Failed: string };
        export interface ProcessedTransaction {
          runtime_transaction: RuntimeTransaction;
          status: ProcessedTransactionStatus;
          bitcoin_txid: string | null;
        }

        export interface AccountFilter {
          memcmp?: {
            offset: number;
            bytes: string;
          };
          dataSize?: number;
        }

        export interface ProgramAccount {
          pubkey: Pubkey;
          account: AccountInfoResult;
        }

        export interface Provider {
          sendTransaction(transaction: RuntimeTransaction): Promise<string>;
          sendTransactions(transactions: RuntimeTransaction[]): Promise<string[]>;
          readAccountInfo(pubkey: Pubkey): Promise<AccountInfoResult>;
          getAccountAddress(pubkey: Pubkey): Promise<string>;
          getBestBlockHash(): Promise<string>;
          getBlock(blockHash: string): Promise<Block | undefined>;
          getBlockCount(): Promise<number>;
          getBlockHash(blockHeight: number): Promise<string>;
          getProgramAccounts(programId: Pubkey, filters?: AccountFilter[]): Promise<ProgramAccount[]>;
          getProcessedTransaction(txid: string): Promise<ProcessedTransaction | undefined>;
        }

        export class RpcConnection implements Provider {
          constructor(endpoint: string);
          sendTransaction(transaction: RuntimeTransaction): Promise<string>;
          sendTransactions(transactions: RuntimeTransaction[]): Promise<string[]>;
          readAccountInfo(pubkey: Pubkey): Promise<AccountInfoResult>;
          getAccountAddress(pubkey: Pubkey): Promise<string>;
          getBestBlockHash(): Promise<string>;
          getBlock(blockHash: string): Promise<Block | undefined>;
          getBlockCount(): Promise<number>;
          getBlockHash(blockHeight: number): Promise<string>;
          getProcessedTransaction(txid: string): Promise<ProcessedTransaction | undefined>;
          getProgramAccounts(programId: Pubkey, filters?: AccountFilter[]): Promise<ProgramAccount[]>;
        }

        export class PubkeyUtil {
          static fromHex(hex: string): Uint8Array;
          static toHex(pubkey: Uint8Array): string;
          static systemProgram(): Pubkey;
          static isSystemProgram(pubkey: Pubkey): boolean;
        }

        export class MessageUtil {
          static hash(message: Message): Uint8Array;
          static serialize(message: Message): Uint8Array;
          static toHex(message: Message): {
            signers: string[];
            instructions: {
              program_id: string;
              accounts: {
                pubkey: string;
                is_signer: boolean;
                is_writable: boolean;
              }[];
              data: string;
            }[];
          };
          static toNumberArray(message: Message): {
            signers: number[][];
            instructions: {
              program_id: number[];
              accounts: {
                pubkey: number[];
                is_signer: boolean;
                is_writable: boolean;
              }[];
              data: number[];
            }[];
          };
        }

        export class UtxoMetaUtil {
          static fromBytes(txid: Uint8Array, vout: number): UtxoMeta;
          static fromHex(txid: string, vout: number): UtxoMeta;
          static toString(utxo: UtxoMeta): UtxoMetaData;
        }

        export class SignatureUtil {
          static adjustSignature(signature: Uint8Array): Uint8Array;
        }
      }`,
      "file:///node_modules/@types/arch-sdk/index.d.ts"
    ),
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare global {
        const RpcConnection: typeof import("@saturnbtcio/arch-sdk").RpcConnection;
        const PubkeyUtil: typeof import("@saturnbtcio/arch-sdk").PubkeyUtil;
        const MessageUtil: typeof import("@saturnbtcio/arch-sdk").MessageUtil;
        const UtxoMetaUtil: typeof import("@saturnbtcio/arch-sdk").UtxoMetaUtil;
        const SignatureUtil: typeof import("@saturnbtcio/arch-sdk").SignatureUtil;
      }`,
      "file:///globals.d.ts"
    )
  ];

  return {
    dispose: () => disposables.forEach(({ dispose }) => dispose())
  };
};