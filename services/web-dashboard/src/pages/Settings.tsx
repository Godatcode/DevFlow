import React from 'react';

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure your DevFlow.ai preferences and integrations.
        </p>
      </div>
      
      <div className="card">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Settings Page</h3>
          <p className="text-gray-500">Configuration and preferences</p>
        </div>
      </div>
    </div>
  );
}