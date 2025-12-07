import { logError } from '../lib/debug';
import settings from '../lib/settings';

export interface MessageLogEntry {
  timestamp: number;
  type: MessageEventType;
  conversationId: string;
  conversationTitle?: string;
  messageId?: string;
  userId?: string;
  username?: string;
  displayName?: string;
  content?: string;
  messageType?: string;
  metadata?: any;
}

export enum MessageEventType {
  MESSAGE_SENT = 'MESSAGE_SENT',
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  MESSAGE_READ = 'MESSAGE_READ',
  MESSAGE_SAVED = 'MESSAGE_SAVED',
  MESSAGE_UNSAVED = 'MESSAGE_UNSAVED',
  MESSAGE_DELETED = 'MESSAGE_DELETED',
  SNAP_OPENED = 'SNAP_OPENED',
  MEDIA_SHARED = 'MEDIA_SHARED',
  REACTION_ADDED = 'REACTION_ADDED',
  REACTION_REMOVED = 'REACTION_REMOVED',
  CONVERSATION_CLEARED = 'CONVERSATION_CLEARED',
}

export interface MessageLogFilter {
  conversationId?: string;
  userId?: string;
  type?: MessageEventType;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface MessageLogStats {
  totalMessages: number;
  messagesSent: number;
  messagesReceived: number;
  conversationsActive: number;
  mostActiveConversation?: {
    id: string;
    title?: string;
    messageCount: number;
  };
  dateRange?: {
    start: number;
    end: number;
  };
}

/**
 * Get the message logging module instance
 * This is a helper to access the singleton instance
 */
function getMessageLoggingModule(): any {
  try {
    // Try to get the module from the global module registry if it exists
    if ((window as any).chatTweakModules?.messageLogging) {
      return (window as any).chatTweakModules.messageLogging;
    }

    // Fallback: try to import the module directly
    return require('../modules/message-logging').default;
  } catch (error) {
    logError('Failed to get message logging module:', error);
    return null;
  }
}

/**
 * Get message logs with optional filtering
 */
export function getMessageLogs(filter?: MessageLogFilter): MessageLogEntry[] {
  try {
    const messageLogging = getMessageLoggingModule();
    if (!messageLogging) {
      return [];
    }

    let logs = messageLogging.getMessageLogs(filter?.conversationId, filter?.limit);

    if (filter) {
      logs = logs.filter((entry: MessageLogEntry) => {
        if (filter.userId && entry.userId !== filter.userId) {
          return false;
        }

        if (filter.type && entry.type !== filter.type) {
          return false;
        }

        if (filter.startTime && entry.timestamp < filter.startTime) {
          return false;
        }

        if (filter.endTime && entry.timestamp > filter.endTime) {
          return false;
        }

        return true;
      });

      if (filter.limit && filter.limit > 0) {
        logs = logs.slice(0, filter.limit);
      }
    }

    return logs;
  } catch (error) {
    logError('Error getting message logs:', error);
    return [];
  }
}

/**
 * Get message logs for a specific conversation
 */
export function getConversationLogs(conversationId: string, limit?: number): MessageLogEntry[] {
  return getMessageLogs({ conversationId, limit });
}

/**
 * Get message logs for a specific user across all conversations
 */
export function getUserLogs(userId: string, limit?: number): MessageLogEntry[] {
  return getMessageLogs({ userId, limit });
}

/**
 * Get message logs by type
 */
export function getLogsByType(type: MessageEventType, limit?: number): MessageLogEntry[] {
  return getMessageLogs({ type, limit });
}

/**
 * Get message logs within a time range
 */
export function getLogsByTimeRange(startTime: number, endTime: number, limit?: number): MessageLogEntry[] {
  return getMessageLogs({ startTime, endTime, limit });
}

/**
 * Export all message logs as JSON string
 */
export function exportMessageLogs(): string {
  try {
    const messageLogging = getMessageLoggingModule();
    if (!messageLogging) {
      return '[]';
    }

    return messageLogging.exportLogs();
  } catch (error) {
    logError('Error exporting message logs:', error);
    return '[]';
  }
}

/**
 * Export filtered message logs as JSON string
 */
export function exportFilteredLogs(filter: MessageLogFilter): string {
  try {
    const logs = getMessageLogs(filter);
    return JSON.stringify(logs, null, 2);
  } catch (error) {
    logError('Error exporting filtered logs:', error);
    return '[]';
  }
}

/**
 * Clear all message logs
 */
export function clearMessageLogs(): void {
  try {
    const messageLogging = getMessageLoggingModule();
    if (messageLogging) {
      messageLogging.clearLogs();
    }
  } catch (error) {
    logError('Error clearing message logs:', error);
  }
}

/**
 * Get statistics about message logs
 */
export function getMessageLogStats(filter?: Omit<MessageLogFilter, 'limit'>): MessageLogStats {
  try {
    const logs = getMessageLogs(filter);

    const stats: MessageLogStats = {
      totalMessages: logs.length,
      messagesSent: 0,
      messagesReceived: 0,
      conversationsActive: 0,
    };

    if (logs.length === 0) {
      return stats;
    }

    const conversationCounts = new Map<string, number>();
    let earliestTimestamp = logs[0]?.timestamp ?? Date.now();
    let latestTimestamp = logs[0]?.timestamp ?? Date.now();

    for (const log of logs) {
      // Count message types
      if (log.type === MessageEventType.MESSAGE_SENT) {
        stats.messagesSent++;
      } else if (log.type === MessageEventType.MESSAGE_RECEIVED) {
        stats.messagesReceived++;
      }

      // Track conversations
      const count = conversationCounts.get(log.conversationId) || 0;
      conversationCounts.set(log.conversationId, count + 1);

      // Track time range
      if (log.timestamp < earliestTimestamp) {
        earliestTimestamp = log.timestamp;
      }
      if (log.timestamp > latestTimestamp) {
        latestTimestamp = log.timestamp;
      }
    }

    stats.conversationsActive = conversationCounts.size;

    // Find most active conversation
    let maxCount = 0;
    let mostActiveId = '';
    let mostActiveTitle = '';

    for (const [conversationId, count] of conversationCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostActiveId = conversationId;
        // Find the title from the logs
        const logWithTitle = logs.find((log) => log.conversationId === conversationId && log.conversationTitle);
        mostActiveTitle = logWithTitle?.conversationTitle || '';
      }
    }

    if (mostActiveId) {
      stats.mostActiveConversation = {
        id: mostActiveId,
        title: mostActiveTitle || undefined,
        messageCount: maxCount,
      };
    }

    stats.dateRange = {
      start: earliestTimestamp,
      end: latestTimestamp,
    };

    return stats;
  } catch (error) {
    logError('Error getting message log stats:', error);
    return {
      totalMessages: 0,
      messagesSent: 0,
      messagesReceived: 0,
      conversationsActive: 0,
    };
  }
}

/**
 * Format a log entry for display
 */
export function formatLogEntry(entry: MessageLogEntry): string {
  const timestamp = new Date(entry.timestamp).toLocaleString();
  const conversationInfo = entry.conversationTitle ? `"${entry.conversationTitle}"` : entry.conversationId;
  const userInfo = entry.displayName || entry.username || 'Unknown User';

  switch (entry.type) {
    case MessageEventType.MESSAGE_SENT:
      return `[${timestamp}] 📤 You sent a message in ${conversationInfo}`;
    case MessageEventType.MESSAGE_RECEIVED:
      return `[${timestamp}] 📥 ${userInfo} sent a message in ${conversationInfo}`;
    case MessageEventType.MESSAGE_READ:
      return `[${timestamp}] 👁️ ${userInfo} read a message in ${conversationInfo}`;
    case MessageEventType.MESSAGE_SAVED:
      return `[${timestamp}] 💾 ${userInfo} saved a message in ${conversationInfo}`;
    case MessageEventType.MESSAGE_UNSAVED:
      return `[${timestamp}] 🗑️ ${userInfo} unsaved a message in ${conversationInfo}`;
    case MessageEventType.MESSAGE_DELETED:
      return `[${timestamp}] ❌ A message was deleted in ${conversationInfo}`;
    case MessageEventType.SNAP_OPENED:
      return `[${timestamp}] 📸 ${userInfo} opened a snap in ${conversationInfo}`;
    case MessageEventType.MEDIA_SHARED:
      return `[${timestamp}] 🎭 Media was shared in ${conversationInfo}`;
    case MessageEventType.REACTION_ADDED:
      return `[${timestamp}] 😊 ${userInfo} added a reaction in ${conversationInfo}`;
    case MessageEventType.REACTION_REMOVED:
      return `[${timestamp}] 😐 ${userInfo} removed a reaction in ${conversationInfo}`;
    case MessageEventType.CONVERSATION_CLEARED:
      return `[${timestamp}] 🧹 Conversation cleared: ${conversationInfo}`;
    default:
      return `[${timestamp}] ❓ Unknown event in ${conversationInfo}`;
  }
}

/**
 * Search logs by content or metadata
 */
export function searchLogs(query: string, filter?: MessageLogFilter): MessageLogEntry[] {
  try {
    const logs = getMessageLogs(filter);
    const lowercaseQuery = query.toLowerCase();

    return logs.filter((entry: MessageLogEntry) => {
      // Search in content
      if (entry.content && entry.content.toLowerCase().includes(lowercaseQuery)) {
        return true;
      }

      // Search in user names
      if (entry.username && entry.username.toLowerCase().includes(lowercaseQuery)) {
        return true;
      }

      if (entry.displayName && entry.displayName.toLowerCase().includes(lowercaseQuery)) {
        return true;
      }

      // Search in conversation title
      if (entry.conversationTitle && entry.conversationTitle.toLowerCase().includes(lowercaseQuery)) {
        return true;
      }

      return false;
    });
  } catch (error) {
    logError('Error searching logs:', error);
    return [];
  }
}

/**
 * Get recent activity summary
 */
export function getRecentActivity(hoursBack: number = 24): MessageLogEntry[] {
  const startTime = Date.now() - hoursBack * 60 * 60 * 1000;
  return getLogsByTimeRange(startTime, Date.now());
}

/**
 * Global console commands for message logging diagnostics
 */
const messageLoggingCommands = {
  /**
   * Check if message logging is enabled and show current status
   */
  status(): void {
    const enabled = settings.getSetting('MESSAGE_LOGGING');
    const detailed = settings.getSetting('MESSAGE_LOGGING_DETAILED');
    const maxEntries = settings.getSetting('MESSAGE_LOGGING_MAX_ENTRIES');
    const stats = getMessageLogStats();

    console.log('=== Message Logging Status ===');
    console.log(`Enabled: ${enabled}`);
    console.log(`Detailed logging: ${detailed}`);
    console.log(`Max entries: ${maxEntries}`);
    console.log(`Total messages logged: ${stats.totalMessages}`);
    console.log(`Messages sent: ${stats.messagesSent}`);
    console.log(`Messages received: ${stats.messagesReceived}`);
    console.log(`Active conversations: ${stats.conversationsActive}`);

    if (!enabled) {
      console.log('\n💡 To enable message logging, run: ChatTweak.messageLogging.enable()');
    }
  },

  /**
   * Enable message logging
   */
  enable(): void {
    settings.setSetting('MESSAGE_LOGGING', true);
    console.log('✅ Message logging enabled');
  },

  /**
   * Disable message logging
   */
  disable(): void {
    settings.setSetting('MESSAGE_LOGGING', false);
    console.log('❌ Message logging disabled');
  },

  /**
   * Enable detailed console logging
   */
  enableDetailed(): void {
    settings.setSetting('MESSAGE_LOGGING_DETAILED', true);
    console.log('🔍 Detailed message logging enabled');
  },

  /**
   * Disable detailed console logging
   */
  disableDetailed(): void {
    settings.setSetting('MESSAGE_LOGGING_DETAILED', false);
    console.log('🔇 Detailed message logging disabled');
  },

  /**
   * Show recent message activity
   */
  recent(hours: number = 1): void {
    const logs = getRecentActivity(hours);
    console.log(`=== Recent Activity (Last ${hours} hour${hours === 1 ? '' : 's'}) ===`);
    if (logs.length === 0) {
      console.log('No recent message activity found');
      return;
    }
    console.table(
      logs.map((log) => ({
        Time: new Date(log.timestamp).toLocaleTimeString(),
        Type: log.type,
        User: log.displayName || log.username || 'You',
        Conversation: log.conversationTitle || log.conversationId,
        Content: log.content?.substring(0, 50) || '—',
      })),
    );
  },

  /**
   * Export logs to download
   */
  export(): void {
    try {
      const logsData = exportMessageLogs();
      const blob = new Blob([logsData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chattweak-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log('📁 Logs exported successfully');
    } catch (error) {
      console.error('❌ Failed to export logs:', error);
    }
  },

  /**
   * Clear all logs
   */
  clear(): void {
    if (confirm('Are you sure you want to clear all message logs? This cannot be undone.')) {
      clearMessageLogs();
      console.log('🗑️ All message logs cleared');
    }
  },

  /**
   * Search logs by content
   */
  search(query: string): void {
    const results = searchLogs(query);
    console.log(`=== Search Results for "${query}" ===`);
    if (results.length === 0) {
      console.log('No matching logs found');
      return;
    }
    console.table(
      results.slice(0, 20).map((log) => ({
        Time: new Date(log.timestamp).toLocaleString(),
        Type: log.type,
        User: log.displayName || log.username || 'You',
        Content: log.content?.substring(0, 100) || '—',
      })),
    );
    if (results.length > 20) {
      console.log(`... and ${results.length - 20} more results`);
    }
  },

  /**
   * Show help for available commands
   */
  help(): void {
    console.log(`
=== ChatTweak Message Logging Commands ===

ChatTweak.messageLogging.status()           - Show current status
ChatTweak.messageLogging.enable()           - Enable message logging
ChatTweak.messageLogging.disable()          - Disable message logging
ChatTweak.messageLogging.enableDetailed()   - Enable detailed console logs
ChatTweak.messageLogging.disableDetailed()  - Disable detailed console logs
ChatTweak.messageLogging.recent(hours?)     - Show recent activity (default: 1 hour)
ChatTweak.messageLogging.search("query")    - Search logs by content
ChatTweak.messageLogging.export()           - Download logs as JSON file
ChatTweak.messageLogging.clear()            - Clear all logs (with confirmation)
ChatTweak.messageLogging.help()             - Show this help

Example usage:
  ChatTweak.messageLogging.status()
  ChatTweak.messageLogging.recent(24)
  ChatTweak.messageLogging.search("hello")
    `);
  },
};

// Export for global access
if (typeof window !== 'undefined') {
  (window as any).ChatTweak = (window as any).ChatTweak || {};
  (window as any).ChatTweak.messageLogging = messageLoggingCommands;

  // Also add to the messageDebug global for development
  if ((window as any).messageDebug) {
    (window as any).messageDebug.commands = messageLoggingCommands;
  }
}

export { messageLoggingCommands };
