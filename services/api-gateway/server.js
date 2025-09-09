const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Mock API endpoints for demo
app.get('/api/analytics/dora-metrics', (req, res) => {
  res.json({
    deployment_frequency: { value: 12.5, unit: 'per_week', trend: 'increasing' },
    lead_time: { value: 2.3, unit: 'days', trend: 'decreasing' },
    change_failure_rate: { value: 8.2, unit: 'percentage', trend: 'decreasing' },
    recovery_time: { value: 1.8, unit: 'hours', trend: 'decreasing' }
  });
});

app.get('/api/analytics/team-performance', (req, res) => {
  res.json({
    velocity: 42,
    quality_score: 87,
    collaboration_index: 92,
    innovation_rate: 15
  });
});

app.get('/api/agents', (req, res) => {
  res.json({
    agents: [
      { id: 'code-reviewer', name: 'AI Code Reviewer', status: 'active', performance: { success_rate: 94 } },
      { id: 'test-runner', name: 'Test Runner', status: 'active', performance: { success_rate: 98 } },
      { id: 'deployer', name: 'Deployment Agent', status: 'active', performance: { success_rate: 96 } }
    ]
  });
});

app.post('/api/agents/execute', (req, res) => {
  const { agentId, task } = req.body;
  res.json({
    execution_id: `exec_${Date.now()}`,
    agent_id: agentId,
    task: task,
    status: 'completed',
    duration: Math.floor(Math.random() * 120) + 30,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/workflows', (req, res) => {
  res.json({
    workflows: [
      { id: 'ci-cd-pipeline', name: 'CI/CD Pipeline', status: 'active', executions: 156 },
      { id: 'feature-development', name: 'Feature Development', status: 'active', executions: 89 }
    ]
  });
});

app.get('/api/integrations/github/repos', (req, res) => {
  res.json({
    repositories: [
      { name: 'devflow-core', stars: 1250, last_commit: '2 hours ago' },
      { name: 'devflow-ui', stars: 890, last_commit: '4 hours ago' }
    ]
  });
});

app.get('/api/compliance/validate/soc2', (req, res) => {
  res.json({
    compliance_status: 'compliant',
    score: 98.5,
    last_audit: '2024-01-01T00:00:00Z',
    issues: []
  });
});

app.get('/api/monitoring/metrics', (req, res) => {
  res.json({
    cpu_usage: Math.random() * 30 + 20,
    memory_usage: Math.random() * 40 + 30,
    response_time: Math.random() * 100 + 50,
    throughput: Math.random() * 1000 + 500
  });
});

// API documentation
app.get('/docs', (req, res) => {
  res.send(`
    <html>
      <head><title>DevFlow.ai API Documentation</title></head>
      <body style="font-family: Arial, sans-serif; margin: 40px;">
        <h1>🚀 DevFlow.ai API Documentation</h1>
        <h2>Available Endpoints:</h2>
        <ul>
          <li><strong>GET /health</strong> - Health check</li>
          <li><strong>GET /api/analytics/dora-metrics</strong> - DORA metrics</li>
          <li><strong>GET /api/analytics/team-performance</strong> - Team performance</li>
          <li><strong>GET /api/agents</strong> - List AI agents</li>
          <li><strong>POST /api/agents/execute</strong> - Execute agent task</li>
          <li><strong>GET /api/workflows</strong> - List workflows</li>
          <li><strong>GET /api/integrations/github/repos</strong> - GitHub repositories</li>
          <li><strong>GET /api/compliance/validate/soc2</strong> - SOC2 compliance</li>
          <li><strong>GET /api/monitoring/metrics</strong> - System metrics</li>
        </ul>
        <h2>Example Usage:</h2>
        <pre>curl http://localhost:3000/api/analytics/dora-metrics</pre>
        <pre>curl -X POST http://localhost:3000/api/agents/execute -H "Content-Type: application/json" -d '{"agentId": "code-reviewer", "task": "review-pr"}'</pre>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚪 API Gateway running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/docs`);
});

process.on('SIGTERM', () => {
  console.log('API Gateway shutting down...');
  process.exit(0);
});
