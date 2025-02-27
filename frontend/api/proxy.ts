// Use CommonJS module syntax for Vercel functions
module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get the target URL from the request query or use environment variable
  let targetUrl = req.query.url as string;

  // If no URL provided, use the environment variable
  if (!targetUrl) {
    targetUrl = process.env.RPC_DEFAULT_URL || 'http://localhost:9002';
    console.log(`No URL provided, using default: ${targetUrl}`);
  }

  console.log(`Proxying request to: ${targetUrl}`);

  try {
    // For JSON-RPC, we need to make sure we're passing the body correctly
    let body = undefined;
    if (req.method !== 'GET' && req.body) {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      console.log(`Request body: ${body ? body.substring(0, 200) + (body.length > 200 ? '...' : '') : 'empty'}`);
    }

    // Forward the request to the target URL
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
    });

    console.log(`Target server response status: ${response.status}`);

    // Read response headers for debugging
    const responseHeaders = Object.fromEntries(response.headers.entries());
    console.log('Response headers:', responseHeaders);

    // Return the response as raw text first to avoid parsing errors
    const responseText = await response.text();
    console.log(`Response body: ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);

    // Try to parse as JSON if possible
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      return res.status(response.status).json(responseData);
    } catch (e) {
      // If not JSON, return as text
      return res.status(response.status)
        .setHeader('Content-Type', 'text/plain')
        .send(responseText);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({
      error: 'Failed to proxy request',
      details: error instanceof Error ? error.message : String(error),
      targetUrl
    });
  }
};