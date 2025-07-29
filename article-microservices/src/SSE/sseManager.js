// SSE/sseManager.js
const emitters = new Map(); // Use Map to store arrays of connections
let heartbeatInterval = null;

/**
 * Add a new SSE connection for a seller
 */
function addEmitter(seller, res) {
  console.log(`📡 Adding SSE connection for seller: ${seller}`);
  
  if (!emitters.has(seller)) {
    emitters.set(seller, []);
  }
  
  // Add the new connection with metadata
  const connection = {
    response: res,
    connectedAt: new Date(),
    lastPing: new Date()
  };
  
  emitters.get(seller).push(connection);
  
  console.log(`✅ Total connections for ${seller}: ${emitters.get(seller).length}`);
  
  // Start heartbeat if this is the first connection
  if (getTotalConnections() === 1 && !heartbeatInterval) {
    startHeartbeat();
  }
}

/**
 * Send data to all connections of a specific seller
 */
function sendToSeller(seller, data) {
  const connections = emitters.get(seller);
  
  if (!connections || connections.length === 0) {
    console.log(`📭 No active connections for seller: ${seller}`);
    return false;
  }

  console.log(`📢 Broadcasting to ${connections.length} connections for seller: ${seller}`);
  
  const message = JSON.stringify({
    ...data,
    timestamp: new Date().toISOString(),
    seller: seller
  });

  // Send to all connections and remove dead ones
  const activeConnections = [];
  
  connections.forEach((connection, index) => {
    const { response } = connection;
    try {
      if (!response.destroyed && !response.writableEnded) {
        response.write(`data: ${message}\n\n`);
        connection.lastPing = new Date();
        activeConnections.push(connection);
      } else {
        console.log(`🗑️ Removing dead connection ${index} for seller: ${seller}`);
      }
    } catch (error) {
      console.error(`❌ Error sending to connection ${index} for seller ${seller}:`, error);
      // Don't add to active connections (effectively removes it)
    }
  });
  
  // Update with only active connections
  if (activeConnections.length === 0) {
    emitters.delete(seller);
    console.log(`🧹 Removed all connections for seller: ${seller}`);
    
    // Stop heartbeat if no connections remain
    if (getTotalConnections() === 0) {
      stopHeartbeat();
    }
  } else {
    emitters.set(seller, activeConnections);
  }
  
  return activeConnections.length > 0;
}

/**
 * Remove a specific SSE connection
 */
function removeEmitter(seller, res) {
  const connections = emitters.get(seller);
  
  if (connections) {
    const index = connections.findIndex(conn => conn.response === res);
    if (index !== -1) {
      connections.splice(index, 1);
      console.log(`🔌 Removed connection for seller: ${seller}`);
      
      if (connections.length === 0) {
        emitters.delete(seller);
        console.log(`🧹 No more connections for seller: ${seller}`);
        
        // Stop heartbeat if no connections remain
        if (getTotalConnections() === 0) {
          stopHeartbeat();
        }
      }
    }
  }
}

/**
 * Get active connections stats
 */
function getActiveConnections() {
  const stats = {};
  emitters.forEach((connections, seller) => {
    stats[seller] = {
      count: connections.length,
      connections: connections.map(conn => ({
        connectedAt: conn.connectedAt,
        lastPing: conn.lastPing,
        alive: !conn.response.destroyed && !conn.response.writableEnded
      }))
    };
  });
  return stats;
}

/**
 * Get total number of active connections
 */
function getTotalConnections() {
  let total = 0;
  emitters.forEach((connections) => {
    total += connections.length;
  });
  return total;
}

/**
 * Send heartbeat to all active connections
 */
function sendHeartbeat() {
  const now = new Date();
  
  emitters.forEach((connections, seller) => {
    if (connections.length > 0) {
      const heartbeatData = {
        type: 'HEARTBEAT',
        message: 'Connection alive',
        timestamp: now.toISOString()
      };
      
      // Send heartbeat and clean up dead connections
      const activeConnections = [];
      
      connections.forEach((connection) => {
        const { response } = connection;
        try {
          if (!response.destroyed && !response.writableEnded) {
            response.write(`data: ${JSON.stringify(heartbeatData)}\n\n`);
            connection.lastPing = now;
            activeConnections.push(connection);
          }
        } catch (error) {
          console.error(`❌ Heartbeat error for seller ${seller}:`, error);
        }
      });
      
      if (activeConnections.length === 0) {
        emitters.delete(seller);
        console.log(`💔 Removed all dead connections for seller: ${seller}`);
      } else if (activeConnections.length !== connections.length) {
        emitters.set(seller, activeConnections);
        console.log(`🧹 Cleaned up dead connections for seller: ${seller}`);
      }
    }
  });
  
  // Stop heartbeat if no connections remain
  if (getTotalConnections() === 0) {
    stopHeartbeat();
  }
}

/**
 * Start heartbeat interval
 */
function startHeartbeat() {
  if (heartbeatInterval) {
    return; // Already running
  }
  
  console.log('💓 Starting SSE heartbeat');
  heartbeatInterval = setInterval(() => {
    sendHeartbeat();
  }, 30000); // Every 30 seconds
}

/**
 * Stop heartbeat interval
 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    console.log('💔 Stopping SSE heartbeat');
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Broadcast message to all sellers
 */
function broadcastToAll(data) {
  let sentCount = 0;
  emitters.forEach((connections, seller) => {
    if (sendToSeller(seller, data)) {
      sentCount++;
    }
  });
  return sentCount;
}

/**
 * Clean up stale connections (older than 1 hour with no activity)
 */
function cleanupStaleConnections() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  emitters.forEach((connections, seller) => {
    const activeConnections = connections.filter(connection => {
      if (connection.lastPing < oneHourAgo) {
        console.log(`🧹 Removing stale connection for seller: ${seller}`);
        try {
          connection.response.end();
        } catch (error) {
          // Connection already closed
        }
        return false;
      }
      return true;
    });
    
    if (activeConnections.length === 0) {
      emitters.delete(seller);
    } else if (activeConnections.length !== connections.length) {
      emitters.set(seller, activeConnections);
    }
  });
}

/**
 * Get connection statistics
 */
function getConnectionStats() {
  const stats = {
    totalSellers: emitters.size,
    totalConnections: getTotalConnections(),
    heartbeatActive: !!heartbeatInterval,
    sellers: {}
  };
  
  emitters.forEach((connections, seller) => {
    stats.sellers[seller] = {
      connectionCount: connections.length,
      oldestConnection: Math.min(...connections.map(c => c.connectedAt.getTime())),
      newestConnection: Math.max(...connections.map(c => c.connectedAt.getTime())),
      lastActivity: Math.max(...connections.map(c => c.lastPing.getTime()))
    };
  });
  
  return stats;
}

// Start cleanup interval for stale connections
setInterval(cleanupStaleConnections, 15 * 60 * 1000); // Every 15 minutes

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Gracefully shutting down SSE connections');
  stopHeartbeat();
  
  emitters.forEach((connections, seller) => {
    connections.forEach(connection => {
      try {
        connection.response.write(`data: ${JSON.stringify({
          type: 'SERVER_SHUTDOWN',
          message: 'Server is shutting down',
          timestamp: new Date().toISOString()
        })}\n\n`);
        connection.response.end();
      } catch (error) {
        // Connection already closed
      }
    });
  });
  
  emitters.clear();
});

module.exports = { 
  addEmitter, 
  sendToSeller, 
  removeEmitter, 
  getActiveConnections,
  getTotalConnections,
  startHeartbeat,
  stopHeartbeat,
  broadcastToAll,
  cleanupStaleConnections,
  getConnectionStats
};