const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Load demo data
const loadDemoData = (filename) => {
  try {
    const data = fs.readFileSync(path.join('demo-data', filename), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    return {};
  }
};

const workflows = loadDemoData('sample-workflows.json');
const metrics = loadDemoData('sample-metrics.json');
const agents = loadDemoData('sample-agents.json');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/health/detailed', (req, res) => {
  res.json({
    status: 'healthy',
    services: {
      'api-gateway': 'healthy',
      'analytics': 'healthy',
      'automation': 'healthy',
      'integration': 'healthy',
      'orchestration': 'healthy',
      'web-dashboard': 'healthy'
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Analytics endpoints
app.get('/api/analytics/dora-metrics', (req, res) => {
  res.json(metrics.dora_metrics);
});

app.get('/api/analytics/team-performance', (req, res) => {
  res.json(metrics.team_performance);
});

app.get('/api/analytics/predictions', (req, res) => {
  res.json({
    next_deployment: '2024-01-15T14:30:00Z',
    estimated_completion: '2024-01-20T16:00:00Z',
    risk_level: 'low',
    confidence: 0.87
  });
});

// Agent endpoints
app.get('/api/agents/discover', (req, res) => {
  res.json(agents);
});

app.get('/api/agents/status', (req, res) => {
  res.json({
    total_agents: agents.agents.length,
    active_agents: agents.agents.filter(a => a.status === 'active').length,
    average_performance: 94.5
  });
});

app.post('/api/agents/execute', (req, res) => {
  const { agentId, task } = req.body;
  res.json({
    execution_id: `exec_${Date.now()}`,
    agent_id: agentId,
    task: task,
    status: 'started',
    estimated_duration: 120,
    timestamp: new Date().toISOString()
  });
});

// Integration endpoints
app.get('/api/integrations/github/repos', (req, res) => {
  res.json({
    repositories: [
      { name: 'devflow-core', stars: 1250, last_commit: '2 hours ago' },
      { name: 'devflow-ui', stars: 890, last_commit: '4 hours ago' },
      { name: 'devflow-agents', stars: 2100, last_commit: '1 hour ago' }
    ]
  });
});

app.get('/api/integrations/jira/issues', (req, res) => {
  res.json({
    issues: [
      { key: 'DEV-123', summary: 'Implement new analytics dashboard', status: 'In Progress' },
      { key: 'DEV-124', summary: 'Fix agent discovery bug', status: 'Done' },
      { key: 'DEV-125', summary: 'Add security compliance checks', status: 'To Do' }
    ]
  });
});

// Compliance endpoints
app.get('/api/compliance/validate/soc2', (req, res) => {
  res.json({
    compliance_status: 'compliant',
    last_audit: '2024-01-01T00:00:00Z',
    score: 98.5,
    issues: []
  });
});

app.get('/api/audit/logs', (req, res) => {
  const limit = req.query.limit || 10;
  res.json({
    logs: Array.from({ length: limit }, (_, i) => ({
      id: `log_${Date.now()}_${i}`,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      user: 'system',
      action: 'workflow_executed',
      resource: 'ci-cd-pipeline',
      status: 'success'
    }))
  });
});

// Monitoring endpoints
app.get('/api/monitoring/metrics', (req, res) => {
  res.json({
    cpu_usage: Math.random() * 30 + 20,
    memory_usage: Math.random() * 40 + 30,
    response_time: Math.random() * 100 + 50,
    throughput: Math.random() * 1000 + 500,
    error_rate: Math.random() * 2
  });
});

// Workflow endpoints
app.get('/api/workflows', (req, res) => {
  res.json(workflows);
});

// API documentation
app.get('/docs', (req, res) => {
  res.send(`
    <html>
      <head><title>DevFlow.ai API Documentation</title></head>
      <body>
        <h1>DevFlow.ai API Documentation</h1>
        <h2>Available Endpoints:</h2>
        <ul>
          <li>GET /health - Health check</li>
          <li>GET /api/analytics/dora-metrics - DORA metrics</li>
          <li>GET /api/analytics/team-performance - Team performance</li>
          <li>GET /api/agents/discover - Discover agents</li>
          <li>POST /api/agents/execute - Execute agent task</li>
          <li>GET /api/integrations/github/repos - GitHub repositories</li>
          <li>GET /api/compliance/validate/soc2 - SOC2 compliance</li>
          <li>GET /api/monitoring/metrics - System metrics</li>
        </ul>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 DevFlow.ai Mock API Server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/docs`);
});
