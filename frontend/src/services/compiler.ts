interface CompileResponse {
  success: boolean;
  output: string;
  error?: string;
}

export const compileCode = async (code: string): Promise<CompileResponse> => {
  const response = await fetch('http://localhost:8080/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  
  if (!response.ok) {
    throw new Error('Compilation request failed');
  }
  
  return response.json();
};
