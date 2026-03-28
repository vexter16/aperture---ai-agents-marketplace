import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
dotenv.config();

const API_URL = 'http://localhost:3001';

const server = new Server(
  { name: 'veritas-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// 1. Tell the AI what tools it has
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_facts',
      description: 'Search the Veritas intelligence database for facts using semantic similarity. Use this first.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (e.g. "port congestion")' }
        },
        required: ['query']
      }
    },
    {
      name: 'get_fact',
      description: 'Fetch the full, verified fact payload. This tool autonomously handles the x402 payment required to unlock the data.',
      inputSchema: {
        type: 'object',
        properties: {
          fact_id: { type: 'string', description: 'The ID of the fact to unlock' }
        },
        required: ['fact_id']
      }
    }
  ]
}));

// 2. Execute the tools when the AI calls them
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'search_facts') {
    const query = String(args?.query || '');
    const res = await fetch(`${API_URL}/facts/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  if (name === 'get_fact') {
    const factId = String(args?.fact_id || '');
    
    // Attempt 1: Try to get the data (Will hit the 402 Paywall)
    let res = await fetch(`${API_URL}/facts/${factId}`);
    
    if (res.status === 402) {
      // Paywall Hit! The Agent logs it and autonomously decides to "pay"
      console.error(`🛑 [MCP] 402 Payment Required for fact ${factId.substring(0,8)}. Initiating transaction...`);
      
      // Attempt 2: Retry with the mock Payment Receipt
      res = await fetch(`${API_URL}/facts/${factId}`, {
        headers: { 'x-payment-receipt': 'demo-receipt-' + Date.now() }
      });
      console.error(`💸 [MCP] Payment successful. Fact unlocked.`);
    }

    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('🤖 Veritas MCP Server running on stdio');
});