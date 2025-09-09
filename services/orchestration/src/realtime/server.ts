#!/usr/bin/env node

import { WebSocketRealtimeServer } from './realtime-server.js';
import { Logger } from '@devflow/shared-utils';

const logger = new Logger('realtime-server-startup');

async function startRealtimeServer() {
  const port = parseInt(process.env.REALTIME_PORT || '8080');
  const server = new WebSocketRealtimeServer();

  try {
    await server.start(port);
    logger.info(`Realtime server started successfully on port ${port}`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start realtime server', { error: (error as Error).message });
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startRealtimeServer();
}

export { startRealtimeServer };