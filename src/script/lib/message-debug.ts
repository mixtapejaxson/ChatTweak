import { logInfo, logWarn, logError, getIframeContentWindow } from './debug';
import settings from './settings';
import { SettingIds } from './constants';

const MESSAGE_DEBUG_PREFIX = '[MessageLog]';

export enum MessageDebugLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

interface DebugMetrics {
  messagesLogged: number;
  errorsEncountered: number;
  lastLogTime: number;
  performanceMetrics: {
    averageLogTime: number;
    maxLogTime: number;
    minLogTime: number;
  };
}

class MessageDebugger {
  private metrics: DebugMetrics = {
    messagesLogged: 0,
    errorsEncountered: 0,
    lastLogTime: 0,
    performanceMetrics: {
      averageLogTime: 0,
      maxLogTime: 0,
      minLogTime: Infinity,
    },
  };

  private logTimes: number[] = [];
  private maxLogTimeEntries = 100;

  private get currentLevel(): MessageDebugLevel {
    const detailedLogging = settings.getSetting('MESSAGE_LOGGING_DETAILED');
    return detailedLogging ? MessageDebugLevel.VERBOSE : MessageDebugLevel.INFO;
  }

  private get isLoggingEnabled(): boolean {
    return settings.getSetting('MESSAGE_LOGGING') === true;
  }

  private shouldLog(level: MessageDebugLevel): boolean {
    return this.isLoggingEnabled && level <= this.currentLevel;
  }

  private updatePerformanceMetrics(duration: number) {
    this.logTimes.push(duration);
    if (this.logTimes.length > this.maxLogTimeEntries) {
      this.logTimes.shift();
    }

    const sum = this.logTimes.reduce((acc, time) => acc + time, 0);
    this.metrics.performanceMetrics.averageLogTime = sum / this.logTimes.length;
    this.metrics.performanceMetrics.maxLogTime = Math.max(this.metrics.performanceMetrics.maxLogTime, duration);
    this.metrics.performanceMetrics.minLogTime = Math.min(this.metrics.performanceMetrics.minLogTime, duration);
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${MESSAGE_DEBUG_PREFIX}[${level}] ${message}`;
  }

  public error(message: string, ...args: any[]) {
    if (!this.shouldLog(MessageDebugLevel.ERROR)) return;

    const startTime = performance.now();
    const formattedMessage = this.formatMessage('ERROR', message);

    try {
      logError(formattedMessage, ...args);
      this.metrics.errorsEncountered++;
    } catch (error) {
      // Fallback to console.error if our logging fails
      console.error(formattedMessage, ...args, error);
    } finally {
      const duration = performance.now() - startTime;
      this.updatePerformanceMetrics(duration);
      this.metrics.messagesLogged++;
      this.metrics.lastLogTime = Date.now();
    }
  }

  public warn(message: string, ...args: any[]) {
    if (!this.shouldLog(MessageDebugLevel.WARN)) return;

    const startTime = performance.now();
    const formattedMessage = this.formatMessage('WARN', message);

    try {
      logWarn(formattedMessage, ...args);
    } catch (error) {
      console.warn(formattedMessage, ...args, error);
    } finally {
      const duration = performance.now() - startTime;
      this.updatePerformanceMetrics(duration);
      this.metrics.messagesLogged++;
      this.metrics.lastLogTime = Date.now();
    }
  }

  public info(message: string, ...args: any[]) {
    if (!this.shouldLog(MessageDebugLevel.INFO)) return;

    const startTime = performance.now();
    const formattedMessage = this.formatMessage('INFO', message);

    try {
      logInfo(formattedMessage, ...args);
    } catch (error) {
      console.info(formattedMessage, ...args, error);
    } finally {
      const duration = performance.now() - startTime;
      this.updatePerformanceMetrics(duration);
      this.metrics.messagesLogged++;
      this.metrics.lastLogTime = Date.now();
    }
  }

  public debug(message: string, ...args: any[]) {
    if (!this.shouldLog(MessageDebugLevel.DEBUG)) return;

    const startTime = performance.now();
    const formattedMessage = this.formatMessage('DEBUG', message);

    try {
      const { console } = getIframeContentWindow();
      console.debug(`%c${formattedMessage}`, 'color: #6c757d', ...args);
    } catch (error) {
      console.debug(formattedMessage, ...args, error);
    } finally {
      const duration = performance.now() - startTime;
      this.updatePerformanceMetrics(duration);
      this.metrics.messagesLogged++;
      this.metrics.lastLogTime = Date.now();
    }
  }

  public verbose(message: string, ...args: any[]) {
    if (!this.shouldLog(MessageDebugLevel.VERBOSE)) return;

    const startTime = performance.now();
    const formattedMessage = this.formatMessage('VERBOSE', message);

    try {
      const { console } = getIframeContentWindow();
      console.log(`%c${formattedMessage}`, 'color: #adb5bd; font-style: italic', ...args);
    } catch (error) {
      console.log(formattedMessage, ...args, error);
    } finally {
      const duration = performance.now() - startTime;
      this.updatePerformanceMetrics(duration);
      this.metrics.messagesLogged++;
      this.metrics.lastLogTime = Date.now();
    }
  }

  public logMessageEvent(eventType: string, data: any) {
    if (!this.shouldLog(MessageDebugLevel.DEBUG)) return;

    const eventData = {
      type: eventType,
      timestamp: Date.now(),
      data: this.sanitizeForLogging(data),
    };

    this.debug(`Message Event: ${eventType}`, eventData);
  }

  public logPerformance(operation: string, duration: number, metadata?: any) {
    if (!this.shouldLog(MessageDebugLevel.VERBOSE)) return;

    const perfData = {
      operation,
      duration: `${duration.toFixed(2)}ms`,
      metadata: metadata ? this.sanitizeForLogging(metadata) : undefined,
    };

    if (duration > 100) {
      // Log slow operations as warnings
      this.warn(`Slow operation detected: ${operation}`, perfData);
    } else {
      this.verbose(`Performance: ${operation}`, perfData);
    }
  }

  public logStateChange(oldState: any, newState: any, context?: string) {
    if (!this.shouldLog(MessageDebugLevel.DEBUG)) return;

    const stateChangeData = {
      context: context || 'Unknown',
      oldState: this.sanitizeForLogging(oldState),
      newState: this.sanitizeForLogging(newState),
      timestamp: Date.now(),
    };

    this.debug('State Change', stateChangeData);
  }

  public logAPICall(method: string, args: any[], result?: any, error?: any) {
    if (!this.shouldLog(MessageDebugLevel.VERBOSE)) return;

    const apiData = {
      method,
      args: this.sanitizeForLogging(args),
      result: result ? this.sanitizeForLogging(result) : undefined,
      error: error ? this.sanitizeForLogging(error) : undefined,
      timestamp: Date.now(),
    };

    if (error) {
      this.error(`API Call Failed: ${method}`, apiData);
    } else {
      this.verbose(`API Call: ${method}`, apiData);
    }
  }

  private sanitizeForLogging(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      // Truncate very long strings
      return data.length > 500 ? data.substring(0, 500) + '...[truncated]' : data;
    }

    if (typeof data === 'object') {
      try {
        // Create a shallow copy and remove potential circular references
        const sanitized: any = {};
        const seen = new WeakSet();

        const sanitizeRecursive = (obj: any, depth = 0): any => {
          if (depth > 3) return '[Max Depth Reached]';
          if (obj === null || typeof obj !== 'object') return obj;
          if (seen.has(obj)) return '[Circular Reference]';

          seen.add(obj);

          if (Array.isArray(obj)) {
            return obj.slice(0, 10).map((item) => sanitizeRecursive(item, depth + 1));
          }

          const result: any = {};
          let keyCount = 0;

          for (const [key, value] of Object.entries(obj)) {
            if (keyCount >= 20) {
              result['...'] = `[${Object.keys(obj).length - 20} more keys]`;
              break;
            }

            // Skip functions and DOM elements
            if (typeof value === 'function' || (value && typeof value === 'object' && 'nodeType' in value)) {
              result[key] = '[Filtered]';
            } else {
              result[key] = sanitizeRecursive(value, depth + 1);
            }
            keyCount++;
          }

          return result;
        };

        return sanitizeRecursive(data);
      } catch (error) {
        return '[Serialization Error]';
      }
    }

    return data;
  }

  public getMetrics(): DebugMetrics {
    return { ...this.metrics };
  }

  public resetMetrics() {
    this.metrics = {
      messagesLogged: 0,
      errorsEncountered: 0,
      lastLogTime: 0,
      performanceMetrics: {
        averageLogTime: 0,
        maxLogTime: 0,
        minLogTime: Infinity,
      },
    };
    this.logTimes = [];
    this.info('Debug metrics reset');
  }

  public dumpDebugInfo() {
    if (!this.isLoggingEnabled) {
      console.log('Message logging is disabled');
      return;
    }

    const debugInfo = {
      currentLevel: this.currentLevel,
      isLoggingEnabled: this.isLoggingEnabled,
      metrics: this.getMetrics(),
      settings: {
        messageLogging: settings.getSetting('MESSAGE_LOGGING'),
        detailedLogging: settings.getSetting('MESSAGE_LOGGING_DETAILED'),
        maxEntries: settings.getSetting('MESSAGE_LOGGING_MAX_ENTRIES'),
      },
      browserInfo: {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
    };

    this.info('=== MESSAGE LOGGING DEBUG INFO ===');
    this.info('Debug Info:', debugInfo);
    this.info('=== END DEBUG INFO ===');

    return debugInfo;
  }

  public createTimer(label: string) {
    const startTime = performance.now();

    return {
      end: (metadata?: any) => {
        const duration = performance.now() - startTime;
        this.logPerformance(label, duration, metadata);
        return duration;
      },
    };
  }

  public group(label: string, collapsed = false) {
    if (!this.shouldLog(MessageDebugLevel.DEBUG)) return { end: () => {} };

    try {
      const { console } = getIframeContentWindow();
      if (collapsed) {
        console.groupCollapsed(`${MESSAGE_DEBUG_PREFIX} ${label}`);
      } else {
        console.group(`${MESSAGE_DEBUG_PREFIX} ${label}`);
      }

      return {
        end: () => {
          try {
            console.groupEnd();
          } catch (error) {
            // Ignore errors when ending groups
          }
        },
      };
    } catch (error) {
      return { end: () => {} };
    }
  }

  public table(data: any[], columns?: string[]) {
    if (!this.shouldLog(MessageDebugLevel.DEBUG)) return;

    try {
      const { console } = getIframeContentWindow();
      const sanitizedData = this.sanitizeForLogging(data);

      if (columns) {
        console.table(sanitizedData, columns);
      } else {
        console.table(sanitizedData);
      }
    } catch (error) {
      this.debug('Table data:', data);
    }
  }
}

// Create singleton instance
const messageDebugger = new MessageDebugger();

// Export convenient functions
export const messageDebug = {
  error: messageDebugger.error.bind(messageDebugger),
  warn: messageDebugger.warn.bind(messageDebugger),
  info: messageDebugger.info.bind(messageDebugger),
  debug: messageDebugger.debug.bind(messageDebugger),
  verbose: messageDebugger.verbose.bind(messageDebugger),
  logMessageEvent: messageDebugger.logMessageEvent.bind(messageDebugger),
  logPerformance: messageDebugger.logPerformance.bind(messageDebugger),
  logStateChange: messageDebugger.logStateChange.bind(messageDebugger),
  logAPICall: messageDebugger.logAPICall.bind(messageDebugger),
  getMetrics: messageDebugger.getMetrics.bind(messageDebugger),
  resetMetrics: messageDebugger.resetMetrics.bind(messageDebugger),
  dumpDebugInfo: messageDebugger.dumpDebugInfo.bind(messageDebugger),
  createTimer: messageDebugger.createTimer.bind(messageDebugger),
  group: messageDebugger.group.bind(messageDebugger),
  table: messageDebugger.table.bind(messageDebugger),
};

// Export the class for advanced usage
export { MessageDebugger };

// Export for global access in development
if (typeof window !== 'undefined') {
  (window as any).messageDebug = messageDebug;
}
