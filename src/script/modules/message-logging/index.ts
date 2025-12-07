import settings from '../../lib/settings';
import Module from '../../lib/module';
import { getConversation, getSnapchatPublicUser, getSnapchatStore } from '../../utils/snapchat';
import { logInfo, logWarn, logError } from '../../lib/debug';
import { messageDebug } from '../../lib/message-debug';
import { SettingIds } from '../../lib/constants';

const store = getSnapchatStore();

interface MessageLogEntry {
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

enum MessageEventType {
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

class MessageLogging extends Module {
  private messageStore: MessageLogEntry[] = [];
  private maxLogEntries = 1000;
  private conversationUnsubscribers: Map<string, () => void> = new Map();
  private messagingUnsubscriber: (() => void) | null = null;

  // Proxied based functions
  private originalSendMessage: any = null;
  private originalUpdateMessage: any = null;
  private originalDeleteMessage: any = null;
  private newSendMessage: any = null;
  private newUpdateMessage: any = null;
  private newDeleteMessage: any = null;

  constructor() {
    super('Message Logging');
    messageDebug.info('Message Logging module initialized');
    settings.on('MESSAGE_LOGGING.setting:update', this.load.bind(this));
    settings.on('MESSAGE_LOGGING_DETAILED.setting:update', this.load.bind(this));
    settings.on('MESSAGE_LOGGING_MAX_ENTRIES.setting:update', this.updateMaxEntries.bind(this));

    // Initialize the module
    this.load();

    messageDebug.info('Message Logging module setup complete', {
      enabled: settings.getSetting('MESSAGE_LOGGING'),
      detailed: settings.getSetting('MESSAGE_LOGGING_DETAILED'),
      maxEntries: settings.getSetting('MESSAGE_LOGGING_MAX_ENTRIES'),
    });
  }

  private updateMaxEntries() {
    const maxEntries = settings.getSetting('MESSAGE_LOGGING_MAX_ENTRIES') || 1000;
    this.maxLogEntries = Math.max(100, Math.min(10000, maxEntries));
    this.pruneLogEntries();
  }

  private pruneLogEntries() {
    if (this.messageStore.length > this.maxLogEntries) {
      this.messageStore = this.messageStore.slice(-this.maxLogEntries);
    }
  }

  private addLogEntry(entry: MessageLogEntry) {
    entry.timestamp = Date.now();
    this.messageStore.push(entry);
    this.pruneLogEntries();

    const detailedLogging = settings.getSetting('MESSAGE_LOGGING_DETAILED');
    if (detailedLogging) {
      this.logEntryToConsole(entry);
    }
  }

  private logEntryToConsole(entry: MessageLogEntry) {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const conversationInfo = entry.conversationTitle ? `"${entry.conversationTitle}"` : entry.conversationId;
    const userInfo = entry.displayName || entry.username || 'Unknown User';

    switch (entry.type) {
      case MessageEventType.MESSAGE_SENT:
        messageDebug.info(`📤 Message sent in ${conversationInfo}`, {
          content: entry.content?.substring(0, 100) || 'No content',
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.MESSAGE_RECEIVED:
        messageDebug.info(`📥 Message received from ${userInfo} in ${conversationInfo}`, {
          content: entry.content?.substring(0, 100) || 'No content',
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.MESSAGE_READ:
        messageDebug.info(`👁️ Message read by ${userInfo} in ${conversationInfo}`, {
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.MESSAGE_SAVED:
        messageDebug.info(`💾 Message saved by ${userInfo} in ${conversationInfo}`, {
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.MESSAGE_UNSAVED:
        messageDebug.info(`🗑️ Message unsaved by ${userInfo} in ${conversationInfo}`, {
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.MESSAGE_DELETED:
        messageDebug.info(`❌ Message deleted in ${conversationInfo}`, {
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.SNAP_OPENED:
        messageDebug.info(`📸 Snap opened by ${userInfo} in ${conversationInfo}`, {
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.MEDIA_SHARED:
        messageDebug.info(`🎭 Media shared in ${conversationInfo}`, {
          messageType: entry.messageType,
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.REACTION_ADDED:
        messageDebug.info(`😊 Reaction added by ${userInfo} in ${conversationInfo}`, {
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.REACTION_REMOVED:
        messageDebug.info(`😐 Reaction removed by ${userInfo} in ${conversationInfo}`, {
          messageId: entry.messageId,
          timestamp: entry.timestamp,
        });
        break;
      case MessageEventType.CONVERSATION_CLEARED:
        messageDebug.info(`🧹 Conversation cleared: ${conversationInfo}`, {
          timestamp: entry.timestamp,
        });
        break;
      default:
        messageDebug.warn(`❓ Unknown message event in ${conversationInfo}`, entry);
    }
  }

  private async getUserInfo(userId: string): Promise<{ username?: string; displayName?: string }> {
    const timer = messageDebug.createTimer('getUserInfo');
    try {
      const user = await getSnapchatPublicUser(userId);
      const result = {
        username: user?.username,
        displayName: user?.display_name,
      };
      timer.end({ userId, result });
      return result;
    } catch (error) {
      messageDebug.error('Failed to get user info', { userId, error });
      timer.end({ userId, error: true });
      return {};
    }
  }

  private getConversationInfo(conversationId: string): { title?: string } {
    try {
      const conversation = getConversation(conversationId);
      return {
        title: conversation?.conversation?.title,
      };
    } catch (error) {
      return {};
    }
  }

  private createSendMessageProxy(originalSendMessage: any): any {
    return new Proxy(originalSendMessage, {
      apply: async (targetFunc, thisArg, args) => {
        const timer = messageDebug.createTimer('sendMessage');
        messageDebug.logAPICall('sendMessage', args);

        const result = Reflect.apply(targetFunc, thisArg, args);

        try {
          const [conversationId, message] = args;
          const conversationInfo = this.getConversationInfo(conversationId);

          this.addLogEntry({
            timestamp: Date.now(),
            type: MessageEventType.MESSAGE_SENT,
            conversationId,
            conversationTitle: conversationInfo.title,
            messageId: message?.messageId,
            content: this.extractMessageContent(message),
            messageType: this.getMessageType(message),
            metadata: { message },
          });

          timer.end({ conversationId, messageType: this.getMessageType(message) });
        } catch (error) {
          messageDebug.error('Error logging sent message', { args, error });
          timer.end({ error: true });
        }

        return result;
      },
    });
  }

  private createUpdateMessageProxy(originalUpdateMessage: any): any {
    return new Proxy(originalUpdateMessage, {
      apply: async (targetFunc, thisArg, args) => {
        const timer = messageDebug.createTimer('updateMessage');
        messageDebug.logAPICall('updateMessage', args);

        const result = Reflect.apply(targetFunc, thisArg, args);

        try {
          const [conversationId, messageId, updateType] = args;
          const conversationInfo = this.getConversationInfo(conversationId);

          let eventType: MessageEventType;
          switch (updateType) {
            case 3: // SAVE_CHAT
              eventType = MessageEventType.MESSAGE_SAVED;
              break;
            default:
              eventType = MessageEventType.MESSAGE_READ;
          }

          this.addLogEntry({
            timestamp: Date.now(),
            type: eventType,
            conversationId,
            conversationTitle: conversationInfo.title,
            messageId,
            metadata: { updateType },
          });

          timer.end({ conversationId, messageId, updateType, eventType });
        } catch (error) {
          messageDebug.error('Error logging message update', { args, error });
          timer.end({ error: true });
        }

        return result;
      },
    });
  }

  private createDeleteMessageProxy(originalDeleteMessage: any): any {
    return new Proxy(originalDeleteMessage, {
      apply: async (targetFunc, thisArg, args) => {
        const timer = messageDebug.createTimer('deleteMessage');
        messageDebug.logAPICall('deleteMessage', args);

        const result = Reflect.apply(targetFunc, thisArg, args);

        try {
          const [conversationId, messageId] = args;
          const conversationInfo = this.getConversationInfo(conversationId);

          this.addLogEntry({
            timestamp: Date.now(),
            type: MessageEventType.MESSAGE_DELETED,
            conversationId,
            conversationTitle: conversationInfo.title,
            messageId,
          });

          timer.end({ conversationId, messageId });
        } catch (error) {
          messageDebug.error('Error logging message deletion', { args, error });
          timer.end({ error: true });
        }

        return result;
      },
    });
  }

  private extractMessageContent(message: any): string | undefined {
    if (!message) return undefined;

    // Handle text messages
    if (message.text) {
      return message.text;
    }

    // Handle media messages
    if (message.content) {
      return '[Media Content]';
    }

    // Handle other message types
    if (message.type) {
      return `[${message.type}]`;
    }

    return '[Unknown Content]';
  }

  private getMessageType(message: any): string | undefined {
    if (!message) return undefined;

    if (message.contentType) {
      switch (message.contentType) {
        case 0:
          return 'TEXT';
        case 1:
          return 'SNAP';
        case 2:
          return 'IMAGE';
        case 3:
          return 'VIDEO';
        case 4:
          return 'AUDIO';
        default:
          return `UNKNOWN_TYPE_${message.contentType}`;
      }
    }

    return message.type || 'UNKNOWN';
  }

  private monitorConversationChanges() {
    if (this.messagingUnsubscriber) {
      this.messagingUnsubscriber();
    }

    this.messagingUnsubscriber = store.subscribe(
      (storeState: any) => storeState.messaging?.conversations,
      this.handleConversationChanges.bind(this),
    );
  }

  private async handleConversationChanges(conversations: any) {
    if (!conversations) return;

    for (const [conversationId, conversation] of Object.entries(conversations) as [string, any][]) {
      if (!conversation.messages) continue;

      const messages = Array.from(conversation.messages) as [string, any][];

      for (const [messageId, message] of messages) {
        if (this.isNewMessage(messageId, message)) {
          await this.logReceivedMessage(conversationId, messageId, message);
        }

        if (this.hasNewReadReceipt(messageId, message)) {
          await this.logMessageRead(conversationId, messageId, message);
        }
      }
    }
  }

  private messageTracker = new Map<string, any>();

  private isNewMessage(messageId: string, message: any): boolean {
    const tracked = this.messageTracker.get(messageId);
    if (!tracked) {
      this.messageTracker.set(messageId, { ...message });
      return !this.isOwnMessage(message);
    }
    return false;
  }

  private hasNewReadReceipt(messageId: string, message: any): boolean {
    const tracked = this.messageTracker.get(messageId);
    if (!tracked) return false;

    const hadReadReceipt = tracked.readBy && tracked.readBy.length > 0;
    const hasReadReceipt = message.readBy && message.readBy.length > 0;

    if (!hadReadReceipt && hasReadReceipt) {
      this.messageTracker.set(messageId, { ...message });
      return true;
    }

    return false;
  }

  private isOwnMessage(message: any): boolean {
    // This would need to be implemented based on how Snapchat identifies own messages
    // For now, we'll use a simple heuristic
    const currentUserId = store.getState()?.user?.userId;
    return message.senderId === currentUserId;
  }

  private async logReceivedMessage(conversationId: string, messageId: string, message: any) {
    const timer = messageDebug.createTimer('logReceivedMessage');
    try {
      const userInfo = await this.getUserInfo(message.senderId);
      const conversationInfo = this.getConversationInfo(conversationId);

      this.addLogEntry({
        timestamp: Date.now(),
        type: MessageEventType.MESSAGE_RECEIVED,
        conversationId,
        conversationTitle: conversationInfo.title,
        messageId,
        userId: message.senderId,
        username: userInfo.username,
        displayName: userInfo.displayName,
        content: this.extractMessageContent(message),
        messageType: this.getMessageType(message),
        metadata: { message },
      });

      timer.end({ conversationId, messageId, senderId: message.senderId });
    } catch (error) {
      messageDebug.error('Error logging received message', { conversationId, messageId, error });
      timer.end({ error: true });
    }
  }

  private async logMessageRead(conversationId: string, messageId: string, message: any) {
    const timer = messageDebug.createTimer('logMessageRead');
    try {
      if (!message.readBy || message.readBy.length === 0) return;

      const lastReadBy = message.readBy[message.readBy.length - 1];
      const userInfo = await this.getUserInfo(lastReadBy);
      const conversationInfo = this.getConversationInfo(conversationId);

      this.addLogEntry({
        timestamp: Date.now(),
        type: MessageEventType.MESSAGE_READ,
        conversationId,
        conversationTitle: conversationInfo.title,
        messageId,
        userId: lastReadBy,
        username: userInfo.username,
        displayName: userInfo.displayName,
      });

      timer.end({ conversationId, messageId, readBy: lastReadBy });
    } catch (error) {
      messageDebug.error('Error logging message read', { conversationId, messageId, error });
      timer.end({ error: true });
    }
  }

  public getMessageLogs(conversationId?: string, limit?: number): MessageLogEntry[] {
    let logs = this.messageStore;

    if (conversationId) {
      logs = logs.filter((entry) => entry.conversationId === conversationId);
    }

    if (limit && limit > 0) {
      logs = logs.slice(-limit);
    }

    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }

  public exportLogs(): string {
    return JSON.stringify(this.messageStore, null, 2);
  }

  public clearLogs() {
    const previousCount = this.messageStore.length;
    this.messageStore = [];
    messageDebug.info('Message logs cleared', { previousCount });
  }

  load() {
    const messagingClient = store.getState().messaging;
    if (!messagingClient?.client) {
      messageDebug.warn('Message logging load called but messaging client not available');
      return;
    }

    const enabled = settings.getSetting('MESSAGE_LOGGING');
    const changedValues: any = {};

    messageDebug.debug('Loading message logging module', { enabled });

    if (enabled) {
      // Set up message monitoring
      this.monitorConversationChanges();

      // Proxy messaging functions if not already done
      if (!this.originalSendMessage && messagingClient.client.sendMessage) {
        this.originalSendMessage = messagingClient.client.sendMessage;
        this.newSendMessage = this.createSendMessageProxy(this.originalSendMessage);
        changedValues.sendMessage = this.newSendMessage;
        messageDebug.debug('Proxied sendMessage function');
      }

      if (!this.originalUpdateMessage && messagingClient.updateMessage) {
        this.originalUpdateMessage = messagingClient.updateMessage;
        this.newUpdateMessage = this.createUpdateMessageProxy(this.originalUpdateMessage);
        changedValues.updateMessage = this.newUpdateMessage;
        messageDebug.debug('Proxied updateMessage function');
      }

      if (!this.originalDeleteMessage && messagingClient.client.deleteMessage) {
        this.originalDeleteMessage = messagingClient.client.deleteMessage;
        this.newDeleteMessage = this.createDeleteMessageProxy(this.originalDeleteMessage);
        changedValues.deleteMessage = this.newDeleteMessage;
        messageDebug.debug('Proxied deleteMessage function');
      }

      messageDebug.info('Message logging enabled');
    } else {
      // Cleanup
      if (this.messagingUnsubscriber) {
        this.messagingUnsubscriber();
        this.messagingUnsubscriber = null;
      }

      // Restore original functions
      if (this.originalSendMessage) {
        changedValues.sendMessage = this.originalSendMessage;
        this.originalSendMessage = null;
        this.newSendMessage = null;
      }

      if (this.originalUpdateMessage) {
        changedValues.updateMessage = this.originalUpdateMessage;
        this.originalUpdateMessage = null;
        this.newUpdateMessage = null;
      }

      if (this.originalDeleteMessage) {
        changedValues.deleteMessage = this.originalDeleteMessage;
        this.originalDeleteMessage = null;
        this.newDeleteMessage = null;
      }

      this.messageTracker.clear();
      messageDebug.info('Message logging disabled');
    }

    // Apply changes to the store if any
    if (Object.keys(changedValues).length > 0) {
      const clientChanges = Object.keys(changedValues).reduce((acc: any, key) => {
        if (['sendMessage', 'deleteMessage'].includes(key)) {
          acc[key] = changedValues[key];
        }
        return acc;
      }, {});

      const messagingChanges = Object.keys(changedValues).reduce((acc: any, key) => {
        if (key === 'updateMessage') {
          acc[key] = changedValues[key];
        }
        return acc;
      }, {});

      const stateUpdate: any = {
        messaging: {
          ...messagingClient,
          ...messagingChanges,
        },
      };

      if (Object.keys(clientChanges).length > 0) {
        stateUpdate.messaging.client = {
          ...messagingClient.client,
          ...clientChanges,
        };
      }

      store.setState(stateUpdate);
    }
  }
}

const messageLoggingInstance = new MessageLogging();

// Make instance globally accessible for debugging
if (typeof window !== 'undefined') {
  (window as any).chatTweakModules = (window as any).chatTweakModules || {};
  (window as any).chatTweakModules.messageLogging = messageLoggingInstance;
}

export default messageLoggingInstance;
