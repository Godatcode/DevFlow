import React, { useState } from 'react';
import { ChevronDownIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import clsx from 'clsx';

interface WidgetProps {
  title: string;
  children: React.ReactNode;
  onRefresh?: () => void;
  onConfigure?: () => void;
  isLoading?: boolean;
  className?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
  }>;
}

export default function CustomizableWidget({ 
  title, 
  children, 
  onRefresh, 
  onConfigure, 
  isLoading = false,
  className = '',
  actions = []
}: WidgetProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={clsx('card', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ChevronDownIcon 
              className={clsx(
                'h-4 w-4 text-gray-500 transition-transform',
                isCollapsed && 'transform -rotate-90'
              )} 
            />
          </button>
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          {isLoading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {onConfigure && (
            <button
              onClick={onConfigure}
              className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
            >
              <Cog6ToothIcon className="h-4 w-4" />
            </button>
          )}
          
          {(actions.length > 0 || onRefresh) && (
            <Menu as="div" className="relative">
              <Menu.Button className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </Menu.Button>
              
              <Transition
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                  <div className="py-1">
                    {onRefresh && (
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={onRefresh}
                            className={clsx(
                              active ? 'bg-gray-100' : '',
                              'block w-full text-left px-4 py-2 text-sm text-gray-700'
                            )}
                          >
                            Refresh
                          </button>
                        )}
                      </Menu.Item>
                    )}
                    {actions.map((action, index) => (
                      <Menu.Item key={index}>
                        {({ active }) => (
                          <button
                            onClick={action.onClick}
                            className={clsx(
                              active ? 'bg-gray-100' : '',
                              'block w-full text-left px-4 py-2 text-sm text-gray-700'
                            )}
                          >
                            {action.label}
                          </button>
                        )}
                      </Menu.Item>
                    ))}
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          )}
        </div>
      </div>
      
      {!isCollapsed && (
        <div className="transition-all duration-200">
          {children}
        </div>
      )}
    </div>
  );
}