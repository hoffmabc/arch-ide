import * as monaco from 'monaco-editor';
import { initRustAnalyzer } from './rust-analyzer/rust-analyzer';

export function initRustLanguage(monacoInstance: typeof monaco, editorInstance: monaco.editor.IStandaloneCodeEditor) {
  // Register Rust language basics
  monacoInstance.languages.register({ id: 'rust' });

  // Initialize the Rust analyzer
  initRustAnalyzer(monacoInstance, editorInstance);
}