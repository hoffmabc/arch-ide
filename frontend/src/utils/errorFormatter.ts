export const formatBuildError = (stderr: string): string => {
  // Remove ANSI color codes
  const cleanError = stderr.replace(/\x1B\[\d+m/g, '');

  // Extract the main error message
  const errorMatch = cleanError.match(/error:(.*?)(?=\n|$)/);
  const mainError = errorMatch ? errorMatch[1].trim() : '';

  // Extract file and line information
  const locationMatch = cleanError.match(/-->\s+(.*?):(\d+):(\d+)/);
  const location = locationMatch
    ? `\nFile: ${locationMatch[1]}\nLine: ${locationMatch[2]}, Column: ${locationMatch[3]}`
    : '';

  // Extract the specific code snippet if available
  const snippetMatch = cleanError.match(/\|\s+\d+\s+\|\s+(.*?)(?=\n|$)/);
  const snippet = snippetMatch ? `\nCode: ${snippetMatch[1].trim()}` : '';

  // Combine the formatted parts
  return `Build Error:${mainError}${location}${snippet}`;
};