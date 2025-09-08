import React, { useState, useEffect } from 'react';
import { CalendarIcon, FunnelIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import CustomizableWidget from '../components/analytics/CustomizableWidget';
import DORAMetricsChart from '../components/analytics/DORAMetricsChart';
import TeamPerformanceChart from '../components/analytics/TeamPerformanceChart';
import TechnicalDebtChart from '../components/analytics/TechnicalDebtChart';
import DrillDownModal from '../components/analytics/DrillDownModal';
import { DORAMetrics } from '../types';

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('30d');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Mock data for demonstration
  const doraData: Array<DORAMetrics & { date: string }> = [
    {
      date: '2024-01-01',
      deploymentFrequency: 12,
      leadTimeForChanges: 2.5,
      changeFailureRate: 8,
      timeToRestoreService: 1.2,
    },
    {
      date: '2024-01-02',
      deploymentFrequency: 15,
      leadTimeForChanges: 3.2,
      changeFailureRate: 6,
      timeToRestoreService: 0.8,
    },
    {
      date: '2024-01-03',
      deploymentFrequency: 18,
      leadTimeForChanges: 2.8,
      changeFailureRate: 4,
      timeToRestoreService: 1.5,
    },
  ];

  const teamPerformanceData = [
    {
      teamName: 'Frontend',
      satisfaction: 85,
      performance: 92,
      activity: 88,
      communication: 90,
      efficiency: 87,
    },
    {
      teamName: 'Backend',
      satisfaction: 78,
      performance: 95,
      activity: 85,
      communication: 82,
      efficiency: 91,
    },
    {
      teamName: 'DevOps',
      satisfaction: 92,
      performance: 89,
      activity: 94,
      communication: 88,
      efficiency: 93,
    },
  ];

  const technicalDebtData = [
    { category: 'Code Smells', value: 45, color: '#ef4444' },
    { category: 'Security Issues', value: 12, color: '#f59e0b' },
    { category: 'Performance', value: 23, color: '#10b981' },
    { category: 'Maintainability', value: 18, color: '#3b82f6' },
    { category: 'Documentation', value: 8, color: '#8b5cf6' },
  ];

  const handleRefreshData = () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  const handleExportData = () => {
    // Simulate data export
    console.log('Exporting analytics data...');
  };

  const openDrillDown = (metric: string) => {
    setSelectedMetric(metric);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics & Reporting</h1>
          <p className="mt-1 text-sm text-gray-500">
            Comprehensive insights into your development workflow performance
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Time Range Selector */}
          <div className="flex items-center space-x-2">
            <CalendarIcon className="h-5 w-5 text-gray-400" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last year</option>
            </select>
          </div>
          
          {/* Export Button */}
          <button
            onClick={handleExportData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* DORA Metrics */}
      <CustomizableWidget
        title="DORA Metrics"
        onRefresh={handleRefreshData}
        isLoading={isLoading}
        actions={[
          { label: 'View Details', onClick: () => openDrillDown('dora') },
          { label: 'Configure Alerts', onClick: () => console.log('Configure alerts') },
        ]}
      >
        <DORAMetricsChart data={doraData} timeRange={timeRange} />
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">12.5</div>
            <div className="text-sm text-gray-500">Avg Deployments/Day</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">2.8h</div>
            <div className="text-sm text-gray-500">Avg Lead Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">6%</div>
            <div className="text-sm text-gray-500">Failure Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">1.2h</div>
            <div className="text-sm text-gray-500">Recovery Time</div>
          </div>
        </div>
      </CustomizableWidget>

      {/* Team Performance and Technical Debt */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomizableWidget
          title="Team Performance (SPACE Framework)"
          onRefresh={handleRefreshData}
          actions={[
            { label: 'View Team Details', onClick: () => openDrillDown('teams') },
          ]}
        >
          <TeamPerformanceChart data={teamPerformanceData} />
        </CustomizableWidget>

        <CustomizableWidget
          title="Technical Debt Analysis"
          onRefresh={handleRefreshData}
          actions={[
            { label: 'View Issues', onClick: () => openDrillDown('debt') },
            { label: 'Generate Report', onClick: () => console.log('Generate report') },
          ]}
        >
          <TechnicalDebtChart data={technicalDebtData} />
          <div className="mt-4">
            <div className="text-sm text-gray-600 mb-2">Total Issues: 106</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-red-500 h-2 rounded-full" style={{ width: '42%' }}></div>
            </div>
            <div className="text-xs text-gray-500 mt-1">42% Critical Issues</div>
          </div>
        </CustomizableWidget>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <CustomizableWidget title="Workflow Efficiency" className="col-span-1">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Average Completion Time</span>
              <span className="font-semibold">4.2 hours</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Success Rate</span>
              <span className="font-semibold text-green-600">94%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Automation Coverage</span>
              <span className="font-semibold text-blue-600">78%</span>
            </div>
          </div>
        </CustomizableWidget>

        <CustomizableWidget title="Code Quality Trends" className="col-span-1">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Test Coverage</span>
              <span className="font-semibold text-green-600">87%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Code Duplication</span>
              <span className="font-semibold text-yellow-600">3.2%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Complexity Score</span>
              <span className="font-semibold">2.8</span>
            </div>
          </div>
        </CustomizableWidget>

        <CustomizableWidget title="Security Metrics" className="col-span-1">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Vulnerabilities Fixed</span>
              <span className="font-semibold text-green-600">23</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Open Issues</span>
              <span className="font-semibold text-red-600">5</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Security Score</span>
              <span className="font-semibold text-green-600">A+</span>
            </div>
          </div>
        </CustomizableWidget>
      </div>

      {/* Drill-down Modal */}
      <DrillDownModal
        isOpen={!!selectedMetric}
        onClose={() => setSelectedMetric(null)}
        title={`Detailed ${selectedMetric?.toUpperCase()} Analysis`}
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Detailed analysis and drill-down capabilities for {selectedMetric} metrics.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Key Insights:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>Performance has improved by 15% over the last month</li>
              <li>Team satisfaction scores are above industry average</li>
              <li>Technical debt is trending downward</li>
              <li>Deployment frequency has increased significantly</li>
            </ul>
          </div>
        </div>
      </DrillDownModal>
    </div>
  );
}