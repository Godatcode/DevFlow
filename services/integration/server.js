const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'integration',
    timestamp: new Date().toISOString() 
  });
});

// Mock integration endpoints
app.get('/api/github/repos', (req, res) => {
  res.json({
    repositories: [
      { name: 'devflow-core', stars: 1250, last_commit: '2 hours ago' },
      { name: 'devflow-ui', stars: 890, last_commit: '4 hours ago' },
      { name: 'devflow-agents', stars: 2100, last_commit: '1 hour ago' }
    ]
  });
});

app.get('/api/jira/issues', (req, res) => {
  res.json({
    issues: [
      { key: 'DEV-123', summary: 'Implement new analytics dashboard', status: 'In Progress' },
      { key: 'DEV-124', summary: 'Fix agent discovery bug', status: 'Done' },
      { key: 'DEV-125', summary: 'Add security compliance checks', status: 'To Do' }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🔗 Integration Service running on http://localhost:${PORT}`);
});
