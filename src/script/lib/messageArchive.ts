import EventEmitter from 'eventemitter3';
import { SettingIds } from './constants';
import { logInfo, logWarn } from './debug';
import settings from './settings';
import storage from './storage';
import { getSnapchatStore } from '../utils/snapchat';

const STORAGE_KEY = 'message_archive_v1';
const UPDATED_EVENT = 'updated';
const MAX_TEXT_LENGTH = 800;

export interface ArchivedMessage {
  id: string;
  conversationId: string;
  conversationTitle: string;
  authorId: string | null;
  authorName: string | null;
  direction: string | null;
  text: string | null;
  contentType: string | number | null;
  savePolicy: number | null;
  createdAt: string | null;
  deletedAt: string | null;
  lastSeenAt: string;
}

interface ArchivedConversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: Record<string, ArchivedMessage>;
}

interface MessageArchiveStore {
  version: number;
  updatedAt: string;
  conversations: Record<string, ArchivedConversation>;
}

interface ArchiveSummary {
  conversations: number;
  messages: number;
  deleted: number;
}

function createEmptyArchive(): MessageArchiveStore {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    conversations: {},
  };
}

function getCollectionEntries(collection: any): [string, any][] {
  if (collection == null) {
    return [];
  }

  if (typeof collection.entries === 'function') {
    return Array.from(collection.entries());
  }

  if (Array.isArray(collection)) {
    return collection.map((value, index) => [String(index), value]);
  }

  return Object.entries(collection);
}

function normalizeArchive(value: any): MessageArchiveStore {
  if (value == null || typeof value !== 'object') {
    return createEmptyArchive();
  }

  return {
    version: 1,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    conversations: typeof value.conversations === 'object' && value.conversations != null ? value.conversations : {},
  };
}

function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function firstNumber(...values: any[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function toIsoDate(value: any): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function extractText(value: any, seen = new WeakSet<object>()): string | null {
  if (typeof value === 'string') {
    return value.trim().slice(0, MAX_TEXT_LENGTH) || null;
  }

  if (value == null || typeof value !== 'object') {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }

  seen.add(value);

  const preferredKeys = ['text', 'displayText', 'body', 'caption', 'message', 'content'];
  for (const key of preferredKeys) {
    if (key in value) {
      const candidate = extractText(value[key], seen);
      if (candidate != null) {
        return candidate;
      }
    }
  }

  for (const nestedValue of Object.values(value)) {
    const candidate = extractText(nestedValue, seen);
    if (candidate != null) {
      return candidate;
    }
  }

  return null;
}

function extractAuthorId(message: any): string | null {
  return firstString(
    message?.senderId?.str,
    message?.senderId,
    message?.authorId?.str,
    message?.authorId,
    message?.userId?.str,
    message?.userId,
  );
}

function extractAuthorName(message: any): string | null {
  return firstString(
    message?.senderDisplayName,
    message?.senderUsername,
    message?.authorName,
    message?.displayName,
    message?.username,
  );
}

function extractDirection(message: any): string | null {
  const value = firstString(message?.direction, message?.messageDirection, message?.feedDisplayDirection);
  if (value != null) {
    return value;
  }

  if (typeof message?.isOutgoing === 'boolean') {
    return message.isOutgoing ? 'OUTGOING' : 'INCOMING';
  }

  return null;
}

function buildArchivedMessage(
  messageId: string,
  message: any,
  conversationId: string,
  conversationTitle: string,
  previous: ArchivedMessage | undefined,
): ArchivedMessage {
  const now = new Date().toISOString();

  return {
    id: messageId,
    conversationId,
    conversationTitle,
    authorId: extractAuthorId(message) ?? previous?.authorId ?? null,
    authorName: extractAuthorName(message) ?? previous?.authorName ?? null,
    direction: extractDirection(message) ?? previous?.direction ?? null,
    text: extractText(message) ?? previous?.text ?? null,
    contentType: message?.contentType ?? message?.messageType ?? previous?.contentType ?? null,
    savePolicy: firstNumber(message?.savePolicy, previous?.savePolicy) ?? null,
    createdAt:
      toIsoDate(message?.createdAt) ??
      toIsoDate(message?.createdTimestamp) ??
      toIsoDate(message?.serverTimestamp) ??
      toIsoDate(message?.timestamp) ??
      previous?.createdAt ??
      null,
    deletedAt: previous?.deletedAt ?? null,
    lastSeenAt: now,
  };
}

function downloadFile(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  (document.body ?? document.documentElement).appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function formatMessageLine(message: ArchivedMessage): string {
  const timestamp = message.createdAt ?? message.lastSeenAt;
  const author = message.authorName ?? message.authorId ?? message.direction ?? 'Unknown';
  const status = message.deletedAt != null ? ' [deleted]' : '';
  const body = message.text ?? `[content type: ${String(message.contentType ?? 'unknown')}]`;
  return `- ${timestamp} | ${author}${status}: ${body}`;
}

class MessageArchive {
  private archive = normalizeArchive(storage.get(STORAGE_KEY));
  private emitter = new EventEmitter();
  private liveMessageIds = new Map<string, Set<string>>();

  private persist() {
    this.archive.updatedAt = new Date().toISOString();
    storage.set(STORAGE_KEY, this.archive);
    this.emitter.emit(UPDATED_EVENT);
  }

  private enforceLimit() {
    const limit = settings.getSetting(SettingIds.MESSAGE_ARCHIVE_LIMIT);
    if (limit <= 0) {
      return;
    }

    const allMessages = Object.values(this.archive.conversations).flatMap((conversation) =>
      Object.values(conversation.messages),
    );
    if (allMessages.length <= limit) {
      return;
    }

    allMessages
      .sort((left, right) => Date.parse(left.lastSeenAt) - Date.parse(right.lastSeenAt))
      .slice(0, allMessages.length - limit)
      .forEach((message) => {
        const conversation = this.archive.conversations[message.conversationId];
        if (conversation != null) {
          delete conversation.messages[message.id];
        }
      });

    for (const conversation of Object.values(this.archive.conversations)) {
      if (Object.keys(conversation.messages).length === 0) {
        delete this.archive.conversations[conversation.id];
      }
    }
  }

  prune() {
    this.enforceLimit();
    this.persist();
  }

  getSummary(): ArchiveSummary {
    const conversations = Object.values(this.archive.conversations);
    const messages = conversations.flatMap((conversation) => Object.values(conversation.messages));
    return {
      conversations: conversations.length,
      messages: messages.length,
      deleted: messages.filter((message) => message.deletedAt != null).length,
    };
  }

  subscribe(listener: () => void) {
    this.emitter.on(UPDATED_EVENT, listener);
    return () => this.emitter.off(UPDATED_EVENT, listener);
  }

  resetLiveState() {
    this.liveMessageIds.clear();
  }

  syncConversations(conversations: any) {
    let changed = false;
    const deleteLoggingEnabled = settings.getSetting(SettingIds.MESSAGE_DELETE_LOGGING);

    for (const [conversationKey, conversationState] of Object.entries(conversations ?? {})) {
      const serializedId = conversationState?.conversation?.conversationId ?? conversationKey;
      const title = conversationState?.conversation?.title ?? 'Direct Chat';
      const messageEntries = getCollectionEntries(conversationState?.messages);

      if (this.archive.conversations[serializedId] == null) {
        this.archive.conversations[serializedId] = {
          id: serializedId,
          title,
          updatedAt: new Date().toISOString(),
          messages: {},
        };
      }

      const archivedConversation = this.archive.conversations[serializedId];
      archivedConversation.title = title;
      archivedConversation.updatedAt = new Date().toISOString();

      const currentIds = new Set<string>();
      for (const [messageId, message] of messageEntries) {
        currentIds.add(messageId);
        const previous = archivedConversation.messages[messageId];
        const nextMessage = buildArchivedMessage(messageId, message, serializedId, title, previous);

        if (JSON.stringify(previous) !== JSON.stringify(nextMessage)) {
          archivedConversation.messages[messageId] = nextMessage;
          changed = true;
        }
      }

      const previousIds = this.liveMessageIds.get(serializedId);
      if (previousIds != null) {
        for (const previousId of previousIds) {
          if (currentIds.has(previousId)) {
            continue;
          }

          const archivedMessage = archivedConversation.messages[previousId];
          if (archivedMessage == null || archivedMessage.deletedAt != null) {
            continue;
          }

          archivedMessage.deletedAt = new Date().toISOString();
          archivedMessage.lastSeenAt = archivedMessage.deletedAt;
          changed = true;

          if (deleteLoggingEnabled) {
            logWarn(
              `Deleted message in ${archivedConversation.title}:`,
              archivedMessage.authorName ?? archivedMessage.authorId ?? 'Unknown sender',
              archivedMessage.text ?? `[content type: ${String(archivedMessage.contentType ?? 'unknown')}]`,
            );
          }
        }
      }

      this.liveMessageIds.set(serializedId, currentIds);
    }

    if (!changed) {
      return;
    }

    this.enforceLimit();
    this.persist();
  }

  clear() {
    this.archive = createEmptyArchive();
    this.resetLiveState();
    this.persist();
  }

  exportArchiveJson() {
    downloadFile(
      `chattweak-message-archive-${new Date().toISOString().replace(/:/g, '-')}.json`,
      'application/json',
      JSON.stringify(this.archive, null, 2),
    );
    logInfo('Exported message archive JSON');
  }

  exportActiveConversationMarkdown() {
    const store = getSnapchatStore();
    const conversations = store?.getState?.().messaging?.conversations;
    const activeConversation = Object.values(conversations ?? {}).find(
      (conversation: any) => conversation?.isActive,
    ) as any | undefined;

    const serializedId = activeConversation?.conversation?.conversationId;
    if (serializedId == null) {
      return false;
    }

    const archivedConversation = this.archive.conversations[serializedId];
    if (archivedConversation == null) {
      return false;
    }

    const lines = Object.values(archivedConversation.messages)
      .sort(
        (left, right) =>
          Date.parse(left.createdAt ?? left.lastSeenAt) - Date.parse(right.createdAt ?? right.lastSeenAt),
      )
      .map(formatMessageLine);

    const markdown = [`# ${archivedConversation.title}`, '', ...lines].join('\n');
    downloadFile(
      `chattweak-${archivedConversation.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'conversation'}.md`,
      'text/markdown',
      markdown,
    );
    logInfo(`Exported conversation: ${archivedConversation.title}`);
    return true;
  }
}

export default new MessageArchive();
