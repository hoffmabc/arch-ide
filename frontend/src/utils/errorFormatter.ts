// Define message types
type MessageCategory = 'error' | 'warning' | 'info' | 'success';

interface BuildMessage {
  category: MessageCategory;
  content: string;
  severity?: number; // Optional severity level
}

export const formatBuildError = (stderr: string): string => {
  // Early success check
  if (isSuccessfulBuild(stderr)) {
    return "";
  }

  // Clean ANSI and timestamps once
  const cleanError = cleanBuildOutput(stderr);

  // Parse messages into structured format
  const messages = parseMessages(cleanError);

  // Filter and format based on rules
  const relevantMessages = filterMessages(messages);

  return formatOutput(relevantMessages);
};

const isSuccessfulBuild = (output: string): boolean => {
  const successIndicators = [
    "Build successful",
    "Finished release",
    "Program binary retrieved successfully"
  ];
  return successIndicators.some(indicator => output.includes(indicator));
};

const cleanBuildOutput = (output: string): string => {
  return output
    .replace(/\x1B\[\d+m/g, '')
    .replace(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z\s+\w+\s+[^\]]+\]\s*/g, '')
    .replace(/\d{1,2}:\d{2}:\d{2}\s(?:AM|PM)\s/g, '')
    .replace(/\n\s*\n/g, '\n'); // Replace multiple newlines with single newline
};

const parseMessages = (output: string): BuildMessage[] => {
  return output.split('\n')
    .map(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return null;

      // Use regex patterns to identify message types
      if (trimmedLine.match(/^error(\[.*?\])?:/i)) {
        return { category: 'error', content: trimmedLine, severity: 1 };
      }
      if (trimmedLine.match(/^warning(\[.*?\])?:/i)) {
        return { category: 'warning', content: trimmedLine, severity: 0 };
      }
      if (trimmedLine.includes('Stack offset of')) {
        return { category: 'info', content: trimmedLine, severity: 0 };
      }
      // Add more patterns as needed

      return { category: 'info', content: trimmedLine };
    })
    .filter((msg): msg is BuildMessage => msg !== null);
};

const filterMessages = (messages: BuildMessage[]): BuildMessage[] => {
  // Define filtering rules
  const ignorePatterns = [
    /functions are undefined and not known syscalls/,
    /should have a snake case name/,
    /To deploy this program/,
    /The program address will default/
  ];

  return messages.filter(msg =>
    // Keep all errors except specific ones we want to ignore
    msg.category === 'error' ||
    // Filter out known noise
    !ignorePatterns.some(pattern => pattern.test(msg.content))
  );
};

const formatOutput = (messages: BuildMessage[]): string => {
  if (messages.length === 0) return '';

  return messages
    .sort((a, b) => (b.severity || 0) - (a.severity || 0))
    .map(msg => msg.content.trim())  // Ensure each line is trimmed
    .filter(content => content)      // Remove any empty lines
    .join('\n');
};