import React from 'react';
import { format } from 'date-fns';
import { Workflow } from '../types';
import clsx from 'clsx';

interface WorkflowListProps {
  workflows: Workflow[];
}

const statusColors = {
  running: 'bg-blue-100 text-blue-800',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export default function WorkflowList({ workflows }: WorkflowListProps) {
  if (workflows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No workflows found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workflows.map((workflow) => (
        <div
          key={workflow.id}
          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">{workflow.name}</h3>
              <span
                className={clsx(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                  statusColors[workflow.status]
                )}
              >
                {workflow.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{workflow.project.name}</p>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center space-x-4 text-xs text-gray-500">
                <span>Started {format(workflow.startedAt, 'MMM d, h:mm a')}</span>
                {workflow.estimatedCompletion && (
                  <span>ETA {format(workflow.estimatedCompletion, 'MMM d, h:mm a')}</span>
                )}
              </div>
              {workflow.status === 'running' && (
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${workflow.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{workflow.progress}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}