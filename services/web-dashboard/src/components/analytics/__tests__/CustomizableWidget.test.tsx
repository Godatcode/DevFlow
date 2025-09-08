import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import CustomizableWidget from '../CustomizableWidget';

describe('CustomizableWidget', () => {
  it('renders title and children', () => {
    render(
      <CustomizableWidget title="Test Widget">
        <div>Widget Content</div>
      </CustomizableWidget>
    );

    expect(screen.getByText('Test Widget')).toBeInTheDocument();
    expect(screen.getByText('Widget Content')).toBeInTheDocument();
  });

  it('can be collapsed and expanded', () => {
    render(
      <CustomizableWidget title="Test Widget">
        <div>Widget Content</div>
      </CustomizableWidget>
    );

    const collapseButton = screen.getByRole('button');
    fireEvent.click(collapseButton);

    // Content should be hidden when collapsed
    expect(screen.queryByText('Widget Content')).not.toBeInTheDocument();

    // Click again to expand
    fireEvent.click(collapseButton);
    expect(screen.getByText('Widget Content')).toBeInTheDocument();
  });

  it('shows loading indicator when loading', () => {
    render(
      <CustomizableWidget title="Test Widget" isLoading={true}>
        <div>Widget Content</div>
      </CustomizableWidget>
    );

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('calls onRefresh when refresh action is clicked', () => {
    const mockRefresh = vi.fn();
    render(
      <CustomizableWidget title="Test Widget" onRefresh={mockRefresh}>
        <div>Widget Content</div>
      </CustomizableWidget>
    );

    // Click the menu button (the one with three dots)
    const menuButtons = screen.getAllByRole('button');
    const menuButton = menuButtons.find(button => 
      button.querySelector('svg path[d*="M10 6a2 2 0 110-4"]')
    );
    
    if (menuButton) {
      fireEvent.click(menuButton);

      // Click refresh
      const refreshButton = screen.getByText('Refresh');
      fireEvent.click(refreshButton);

      expect(mockRefresh).toHaveBeenCalled();
    } else {
      // If menu button not found, test should fail
      expect(menuButton).toBeDefined();
    }
  });
});