export interface OutputMessage {
  type: 'command' | 'success' | 'error' | 'info';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  commandId?: string; // Add commandId to track related messages
}