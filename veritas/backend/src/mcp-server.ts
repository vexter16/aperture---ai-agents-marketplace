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
  { name: 'aperture-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// 1. Tell the AI what tools it has
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_facts',
      description: 'Search the Aperture intelligence database for facts using semantic similarity. Use this first.',
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
          fact_id: { type: 'string', description: 'The ID of the fact to unlock' },
          agent_id: { type: 'string', description: 'Your unique agent identifier (e.g., "scout_01")' }
        },
        required: ['fact_id', 'agent_id']
      }
    },
    {
      name: 'submit_feedback',
      description: 'CRITICAL: Use this tool after consuming a fact to report its real-world accuracy back to the Aperture network. This triggers terminal settlement. Honest reporting decreases your future data costs via Dynamic Pricing.',
      inputSchema: {
        type: 'object',
        properties: {
          fact_id: { type: 'string', description: 'The ID of the fact you evaluated' },
          agent_id: { type: 'string', description: 'Your unique agent identifier' },
          signal: { 
            type: 'string', 
            enum: ['confirmed', 'contradicted'], 
            description: 'Whether the fact was true (confirmed) or false (contradicted)' 
          }
        },
        required: ['fact_id', 'agent_id', 'signal']
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
    const agentId = String(args?.agent_id || 'anonymous_scout');
    
    // Attempt 1: Try to get the data (Will hit the 402 Paywall & calculate Dynamic Pricing)
    let res = await fetch(`${API_URL}/facts/${factId}`, {
      headers: { 'x-agent-id': agentId }
    });
    
    if (res.status === 402) {
      const errorData = await res.json();
      const dynamicPrice = errorData.x402.accepts[0].amount;
      
      console.error(`🛑 [MCP] 402 Payment Required for fact ${factId.substring(0,8)}. Agent ${agentId} quoted $${dynamicPrice} USDC. Initiating transaction...`);
      
      // Attempt 2: Retry with the mock Payment Receipt
      res = await fetch(`${API_URL}/facts/${factId}`, {
        headers: { 
          'x-agent-id': agentId,
          'x-payment-receipt': 'demo-receipt-' + Date.now() 
        }
      });
      console.error(`💸 [MCP] Payment successful. Fact unlocked.`);
    }

    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  if (name === 'submit_feedback') {
    const factId = String(args?.fact_id || '');
    const agentId = String(args?.agent_id || '');
    const signal = String(args?.signal || '');

    console.error(`🤖 [MCP] Agent ${agentId} is submitting feedback for ${factId.substring(0,8)}: ${signal.toUpperCase()}`);

    const res = await fetch(`${API_URL}/facts/${factId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, signal })
    });

    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('🤖 Aperture MCP Server running on stdio');
});