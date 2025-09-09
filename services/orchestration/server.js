const express = require('express');
const cors = require('cors');
const { WorkflowOrchestrator } = require('./dist/workflow-orchestrator');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

// Initialize orchestrator
const orchestrator = new WorkflowOrchestrator();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'orchestration',
    timestamp: new Date().toISOString() 
  });
});

// Workflow endpoints
app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = await orchestrator.getActiveWorkflows();
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workflows/execute', async (req, res) => {
  try {
    const { workflowId, context } = req.body;
    const result = await orchestrator.executeWorkflow(workflowId, context);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🎼 Orchestration Service running on http://localhost:${PORT}`);
});
