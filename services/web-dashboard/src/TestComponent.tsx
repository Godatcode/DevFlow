import React from 'react';

export default function TestComponent() {
  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">DevFlow.ai Dashboard</h1>
        <p className="text-gray-600">React app is working!</p>
        <div className="mt-4 p-4 bg-green-100 rounded">
          <p className="text-green-800">✅ React is rendering</p>
          <p className="text-green-800">✅ Tailwind CSS is working</p>
          <p className="text-green-800">✅ TypeScript is compiling</p>
        </div>
      </div>
    </div>
  );
}