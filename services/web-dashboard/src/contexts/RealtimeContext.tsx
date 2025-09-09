import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { RealtimeEvent } from '../types';
import { useAuth } from './AuthContext';

interface RealtimeContextType {
  socket: Socket | null;
  isConnected: boolean;
  subscribe: (event: string, callback: (data: any) => void) => void;
  unsubscribe: (event: string) => void;
  emit: (event: string, data: any) => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

interface RealtimeProviderProps {
  children: ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && user) {
      const newSocket = io(import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:8080', {
        auth: {
          token: localStorage.getItem('auth_token'),
        },
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
        console.log('Connected to realtime server');
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
        console.log('Disconnected from realtime server');
      });

      newSocket.on('error', (error) => {
        console.error('Realtime connection error:', error);
      });

      newSocket.on('connection_established', (data) => {
        console.log('Connection established:', data);
      });

      newSocket.on('status_update', (data) => {
        console.log('Workflow status update:', data);
      });

      newSocket.on('progress_update', (data) => {
        console.log('Workflow progress update:', data);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
        setSocket(null);
        setIsConnected(false);
      };
    }
  }, [isAuthenticated, user]);

  const subscribe = (event: string, callback: (data: any) => void) => {
    if (socket) {
      socket.on(event, callback);
    }
  };

  const unsubscribe = (event: string) => {
    if (socket) {
      socket.off(event);
    }
  };

  const emit = (event: string, data: any) => {
    if (socket) {
      socket.emit(event, data);
    }
  };

  const value = {
    socket,
    isConnected,
    subscribe,
    unsubscribe,
    emit,
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}