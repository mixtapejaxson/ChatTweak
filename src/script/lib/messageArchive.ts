import EventEmitter from 'eventemitter3';
import { SettingIds } from './constants';
import { logInfo, logWarn } from './debug';
import settings from './settings';
import storage from './storage';
import { getSnapchatStore } from '../utils/snapchat';

const STORAGE_KEY = 'message_archive_v1';
const UPDATED_EVENT = 'updated';
const MAX_TEXT_LENGTH = 800;
const MAX_PROTOBUF_DEPTH = 4;
const MAX_BINARY_SCAN_BYTES = 64 * 1024;
const textDecoder = new TextDecoder();

export interface ArchivedMessage {
  id: string;
  conversationId: string;
  conversationTitle: string;
  authorId: string;
  authorName: string;
  direction: string;
  text: string;
  contentType: string | number;
  savePolicy: number;
  createdAt: string;
  deletedAt?: string;
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

  const conversations = typeof value.conversations === 'object' && value.conversations != null ? value.conversations : {};
  for (const conversation of Object.values(conversations) as ArchivedConversation[]) {
    if (conversation == null || typeof conversation !== 'object' || conversation.messages == null) {
      continue;
    }

    for (const message of Object.values(conversation.messages) as ArchivedMessage[]) {
      if (message == null || typeof message !== 'object') {
        continue;
      }

      const lastSeenAt = toIsoDate(message.lastSeenAt) ?? new Date().toISOString();
      const createdAt = toIsoDate(message.createdAt) ?? lastSeenAt;
      const direction =
        firstString(message.direction) ??
        (message.authorName === 'You' ? 'OUTGOING' : null) ??
        'UNKNOWN';
      const authorId = firstString(message.authorId) ?? 'Unknown sender';
      const authorName =
        firstString(message.authorName) ??
        fallbackAuthorName(direction, firstString(message.conversationTitle) ?? 'Direct Chat') ??
        authorId;

      message.authorId = authorId;
      message.authorName = authorName;
      message.direction = direction;
      message.text = sanitizeArchivedText(message.text) ?? '';
      message.contentType = message.contentType ?? 'unknown';
      message.savePolicy = firstNumber(message.savePolicy) ?? -1;
      message.createdAt = createdAt;
      message.deletedAt = toIsoDate(message.deletedAt) ?? undefined;
      message.lastSeenAt = lastSeenAt;
    }
  }

  return {
    version: 1,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    conversations,
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

function looksLikeOpaqueId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function looksLikeStructuredToken(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 16) {
    return false;
  }

  if (/^\d+:[0-9a-f-]{24,}:\d+:\d+:\d+$/i.test(trimmed)) {
    return true;
  }

  if (/^[0-9a-f:-]{24,}$/i.test(trimmed) && !/\s/.test(trimmed)) {
    return true;
  }

  return false;
}

function looksLikeEncodedBlob(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 16) {
    return false;
  }

  if (trimmed.includes('\uFFFD')) {
    return true;
  }

  const compact = trimmed.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=,]+$/.test(compact)) {
    const base64LikeChunks = trimmed
      .split(/[\s,]+/)
      .filter(Boolean)
      .filter((chunk) => /^[A-Za-z0-9+/=]+$/.test(chunk) && chunk.length >= 12);

    if (base64LikeChunks.length > 0) {
      const coveredLength = base64LikeChunks.reduce((total, chunk) => total + chunk.length, 0);
      if (coveredLength / compact.length > 0.7) {
        return true;
      }
    }
  }

  const symbolCount = (trimmed.match(/[^A-Za-z0-9\s]/g) ?? []).length;
  const upperCount = (trimmed.match(/[A-Z]/g) ?? []).length;
  const lowerCount = (trimmed.match(/[a-z]/g) ?? []).length;
  const digitCount = (trimmed.match(/\d/g) ?? []).length;
  const whitespaceCount = (trimmed.match(/\s/g) ?? []).length;

  if (whitespaceCount <= 1 && digitCount > 0 && symbolCount > 0 && upperCount + lowerCount + digitCount > 20) {
    return true;
  }

  if (lowerCount <= 2 && whitespaceCount <= 1 && trimmed.length >= 20) {
    return true;
  }

  return false;
}

function normalizeToken(value: string): string {
  return value
    .replace(/\uFFFD+/g, ' ')
    .replace(/^[^A-Za-z0-9'"]+|[^A-Za-z0-9'".!?]+$/g, '')
    .trim();
}

function isLikelyJunkToken(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }

  const normalized = normalizeToken(trimmed);
  if (normalized.length === 0) {
    return true;
  }

  if (looksLikeOpaqueId(normalized) || looksLikeStructuredToken(normalized) || looksLikeEncodedBlob(normalized)) {
    return true;
  }

  if (/^[A-F0-9]{6,}$/i.test(normalized) && !/[aeiou]/i.test(normalized)) {
    return true;
  }

  if (/^[()$*`=;+\/\\_-]+$/.test(normalized)) {
    return true;
  }

  const letterCount = (normalized.match(/[A-Za-z]/g) ?? []).length;
  const digitCount = (normalized.match(/\d/g) ?? []).length;
  const symbolCount = (normalized.match(/[^A-Za-z0-9\s]/g) ?? []).length;
  if (letterCount === 0 && digitCount <= 2) {
    return true;
  }

  if (digitCount > 0 && symbolCount > 0 && letterCount <= 2) {
    return true;
  }

  return false;
}

function extractReadableSegment(value: string): string | null {
  const cleaned = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, ' ')
    .replace(/\uFFFD+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) {
    return null;
  }

  const segments = cleaned
    .split(/\s+/)
    .reduce<string[]>((result, token) => {
      if (isLikelyJunkToken(token)) {
        result.push('\n');
        return result;
      }

      const normalized = normalizeToken(token);
      if (normalized.length === 0) {
        result.push('\n');
        return result;
      }

      result.push(normalized);
      return result;
    }, [])
    .join(' ')
    .split(/\s*\n\s*/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  segments.sort((left, right) => scoreTextCandidate(right) - scoreTextCandidate(left));
  return segments[0] ?? null;
}

function isHumanReadableText(value: string): boolean {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    looksLikeOpaqueId(trimmed) ||
    looksLikeStructuredToken(trimmed) ||
    looksLikeEncodedBlob(trimmed)
  ) {
    return false;
  }

  return /[A-Za-z]/.test(trimmed) || /\s/.test(trimmed);
}

function sanitizeArchivedText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = extractReadableSegment(value)?.slice(0, MAX_TEXT_LENGTH) ?? null;
  return trimmed != null && isHumanReadableText(trimmed) ? trimmed : null;
}

function toUint8Array(value: any): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'number' && entry >= 0 && entry <= 255)) {
    return new Uint8Array(value);
  }

  return null;
}

function scoreTextCandidate(value: string): number {
  let score = value.length;
  if (/\s/.test(value)) {
    score += 20;
  }
  if (/[.!?]/.test(value)) {
    score += 10;
  }
  if (/^[A-Z]/.test(value)) {
    score += 5;
  }
  if (/https?:\/\//i.test(value)) {
    score -= 5;
  }
  if (/^[\w-]+$/.test(value)) {
    score -= 15;
  }
  if (looksLikeEncodedBlob(value)) {
    score -= 1000;
  }
  return score;
}

function decodeBinaryText(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || bytes.length > MAX_BINARY_SCAN_BYTES) {
    return null;
  }

  const raw = textDecoder.decode(bytes);
  const replacementCount = (raw.match(/\uFFFD/g) ?? []).length;
  if (replacementCount > Math.max(2, raw.length / 8)) {
    return null;
  }

  const cleaned = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, ' ').trim();
  const printableCount = (cleaned.match(/[A-Za-z0-9\s.,!?'"@#$%^&*()_+=:;/\\-]/g) ?? []).length;
  if (cleaned.length === 0 || printableCount / cleaned.length < 0.85) {
    return null;
  }

  return sanitizeArchivedText(cleaned);
}

function readVarint(bytes: Uint8Array, start: number): { value: number; next: number } | null {
  let value = 0;
  let shift = 0;
  let offset = start;

  while (offset < bytes.length && shift < 35) {
    const byte = bytes[offset];
    value |= (byte & 0x7f) << shift;
    offset += 1;

    if ((byte & 0x80) === 0) {
      return { value, next: offset };
    }

    shift += 7;
  }

  return null;
}

function collectBinaryTextCandidates(bytes: Uint8Array, depth = 0, candidates: string[] = []): string[] {
  if (depth > MAX_PROTOBUF_DEPTH || bytes.length === 0 || bytes.length > MAX_BINARY_SCAN_BYTES) {
    return candidates;
  }

  const directText = decodeBinaryText(bytes);
  if (directText != null) {
    candidates.push(directText);
  }

  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    if (tag == null) {
      break;
    }

    offset = tag.next;
    const wireType = tag.value & 0x7;

    if (wireType === 0) {
      const value = readVarint(bytes, offset);
      if (value == null) {
        break;
      }
      offset = value.next;
      continue;
    }

    if (wireType === 1) {
      offset += 8;
      continue;
    }

    if (wireType === 2) {
      const length = readVarint(bytes, offset);
      if (length == null) {
        break;
      }

      offset = length.next;
      const end = offset + length.value;
      if (length.value < 0 || end > bytes.length) {
        break;
      }

      const nested = bytes.subarray(offset, end);
      const nestedText = decodeBinaryText(nested);
      if (nestedText != null) {
        candidates.push(nestedText);
      }
      collectBinaryTextCandidates(nested, depth + 1, candidates);
      offset = end;
      continue;
    }

    if (wireType === 5) {
      offset += 4;
      continue;
    }

    break;
  }

  return candidates;
}

function extractTextFromBinary(value: any): string | null {
  const bytes = toUint8Array(value);
  if (bytes == null) {
    return null;
  }

  const uniqueCandidates = Array.from(new Set(collectBinaryTextCandidates(bytes).map((candidate) => candidate.trim())));
  uniqueCandidates.sort((left, right) => scoreTextCandidate(right) - scoreTextCandidate(left));
  return uniqueCandidates[0] ?? null;
}

function extractText(value: any, seen = new WeakSet<object>(), preferred = false): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim().slice(0, MAX_TEXT_LENGTH);
    if (trimmed.length === 0 || looksLikeOpaqueId(trimmed) || looksLikeStructuredToken(trimmed)) {
      return null;
    }

    return preferred || isHumanReadableText(trimmed) ? trimmed : null;
  }

  const binaryText = extractTextFromBinary(value);
  if (binaryText != null) {
    return binaryText;
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
      const candidate = extractText(value[key], seen, true);
      if (candidate != null) {
        return candidate;
      }
    }
  }

  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    if (/(^|_|-)(id|ids|uuid|token|key)($|_|-)/i.test(nestedKey) || /(conversation|message|sender|author)id/i.test(nestedKey)) {
      continue;
    }

    const candidate = extractText(nestedValue, seen, false);
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
  );
}

function fallbackAuthorName(direction: string | null, conversationTitle: string): string | null {
  if (direction === 'OUTGOING') {
    return 'You';
  }

  if (conversationTitle.trim().length > 0 && conversationTitle !== 'Direct Chat') {
    return conversationTitle;
  }

  return null;
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
  const direction = extractDirection(message) ?? previous?.direction ?? null;
  const authorId = extractAuthorId(message) ?? previous?.authorId ?? 'Unknown sender';
  const authorName =
    extractAuthorName(message) ??
    fallbackAuthorName(direction, conversationTitle) ??
    previous?.authorName ??
    authorId;

  return {
    id: messageId,
    conversationId,
    conversationTitle,
    authorId,
    authorName,
    direction: direction ?? 'UNKNOWN',
    text: extractText(message) ?? previous?.text ?? '',
    contentType: message?.contentType ?? message?.messageType ?? previous?.contentType ?? 'unknown',
    savePolicy: firstNumber(message?.savePolicy, previous?.savePolicy) ?? -1,
    createdAt:
      toIsoDate(message?.createdAt) ??
      toIsoDate(message?.createdTimestamp) ??
      toIsoDate(message?.serverTimestamp) ??
      toIsoDate(message?.timestamp) ??
      previous?.createdAt ??
      now,
    deletedAt: previous?.deletedAt ?? undefined,
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
  const timestamp = message.createdAt || message.lastSeenAt;
  const author = message.authorName || message.authorId || message.direction || 'Unknown';
  const status = message.deletedAt ? ' [deleted]' : '';
  const body =
    (message.text.length > 0 ? message.text : null) ??
    (message.deletedAt
      ? '[deleted message body unavailable]'
      : `[content type: ${String(message.contentType ?? 'unknown')}]`);
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
          if (archivedMessage == null || archivedMessage.deletedAt) {
            continue;
          }

          archivedMessage.deletedAt = new Date().toISOString();
          archivedMessage.lastSeenAt = archivedMessage.deletedAt;
          changed = true;

          if (deleteLoggingEnabled) {
            logWarn(
              `Deleted message in ${archivedConversation.title}:`,
              archivedMessage.authorName || archivedMessage.authorId || 'Unknown sender',
              archivedMessage.text || `[content type: ${String(archivedMessage.contentType ?? 'unknown')}]`,
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
