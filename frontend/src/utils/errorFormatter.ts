export const formatBuildError = (stderr: string): string => {
  // Remove ANSI color codes and timestamps
  const cleanError = stderr
    .replace(/\x1B\[\d+m/g, '')
    .replace(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z\s+\w+\s+[^\]]+\]\s*/g, '');

  // Split into lines
  const lines = cleanError.split('\n');

  // Filter and format relevant lines
  const relevantLines = lines
    .filter(line => {
      const trimmedLine = line.trim();

      // Keep all important compiler output
      return (
        // Rust compiler errors and warnings
        trimmedLine.includes('error[') ||
        trimmedLine.includes('warning[') ||
        trimmedLine.includes('error:') ||
        trimmedLine.includes('warning:') ||
        // File and location references
        trimmedLine.includes('-->') ||
        trimmedLine.includes('|') ||
        // Solana specific errors
        trimmedLine.includes('Stack offset') ||
        trimmedLine.includes('Error deploying') ||
        trimmedLine.includes('Failed to parse IDL') ||
        // Helpful compiler messages
        trimmedLine.startsWith('help:') ||
        trimmedLine.startsWith('note:') ||
        // Build process messages
        trimmedLine.includes('Compiling') ||
        trimmedLine.includes('Finished') ||
        // Remove common noise but keep important messages
        (!trimmedLine.includes('Blocking waiting for file lock') &&
         !trimmedLine.includes('spawn:') &&
         !trimmedLine.includes('Solana SDK:') &&
         !trimmedLine.includes('Running:') &&
         !trimmedLine.includes('Updating crates.io index') &&
         trimmedLine !== '')
      );
    })
    .map(line => {
      const trimmedLine = line.trim();

      // Add spacing for better readability
      if (
        trimmedLine.startsWith('error[') ||
        trimmedLine.startsWith('warning[') ||
        trimmedLine.startsWith('Compiling') ||
        trimmedLine.startsWith('Stack offset') ||
        trimmedLine.startsWith('Error deploying')
      ) {
        return '\n' + line;
      }

      // Indent help and note messages
      if (
        trimmedLine.startsWith('help:') ||
        trimmedLine.startsWith('note:')
      ) {
        return '    ' + line;
      }

      return line;
    });

  // Join lines and ensure consistent spacing
  return relevantLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // Replace multiple blank lines with double line break
    .trim();
};