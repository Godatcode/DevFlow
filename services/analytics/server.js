const express = require('express');
const cors = require('cors');
const { DoraMetricsService } = require('./dist/dora-metrics-service');
const { TeamPerformanceService } = require('./dist/team-performance-service');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize services
const doraService = new DoraMetricsService();
const teamService = new TeamPerformanceService();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'analytics',
    timestamp: new Date().toISOString() 
  });
});

// DORA metrics endpoints
app.get('/api/dora-metrics', async (req, res) => {
  try {
    const metrics = await doraService.calculateMetrics('demo-project');
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Team performance endpoints
app.get('/api/team-performance', async (req, res) => {
  try {
    const performance = await teamService.analyzeTeamPerformance('demo-team');
    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`📊 Analytics Service running on http://localhost:${PORT}`);
});
