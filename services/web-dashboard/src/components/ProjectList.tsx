import React from 'react';
import { Project } from '../types';
import clsx from 'clsx';

interface ProjectListProps {
  projects: Project[];
}

const statusColors = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-gray-100 text-gray-800',
};

export default function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No active projects
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <div
          key={project.id}
          className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-900">{project.name}</h3>
            <span
              className={clsx(
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                statusColors[project.status]
              )}
            >
              {project.status}
            </span>
          </div>
          
          {project.description && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">{project.description}</p>
          )}
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{project.team.name}</span>
            <span>{project.workflowCount} workflows</span>
          </div>
        </div>
      ))}
    </div>
  );
}