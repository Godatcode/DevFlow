const express = require('express');
const cors = require('cors');
const { AgentManager } = require('./dist/agent-manager');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Initialize agent manager
const agentManager = new AgentManager();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'automation',
    timestamp: new Date().toISOString() 
  });
});

// Agent endpoints
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await agentManager.discoverAgents();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents/execute', async (req, res) => {
  try {
    const { agentId, task, context } = req.body;
    const result = await agentManager.executeAgent(agentId, task, context);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🤖 Automation Service running on http://localhost:${PORT}`);
});
