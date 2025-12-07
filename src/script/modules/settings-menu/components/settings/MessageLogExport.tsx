import React, { useState, useCallback } from 'react';
import { Button, Group, Text, Stack, Select, NumberInput, Alert, Badge, TextInput, Tooltip } from '@mantine/core';
import { IconDownload, IconDatabase, IconTrash, IconInfoCircle, IconHelp } from '@tabler/icons-react';
import useSettingState from '../../../../hooks/useSettingState';
import {
  exportMessageLogs,
  exportFilteredLogs,
  clearMessageLogs,
  getMessageLogStats,
  MessageEventType,
  MessageLogFilter,
} from '../../../../utils/message-logging';

const NAME = 'Message Log Export';
const DESCRIPTION = 'Export, view statistics, and manage your message logs.';

const MESSAGE_TYPES = [
  { value: '', label: 'All Types' },
  { value: MessageEventType.MESSAGE_SENT, label: 'Messages Sent' },
  { value: MessageEventType.MESSAGE_RECEIVED, label: 'Messages Received' },
  { value: MessageEventType.MESSAGE_READ, label: 'Messages Read' },
  { value: MessageEventType.MESSAGE_SAVED, label: 'Messages Saved' },
  { value: MessageEventType.MESSAGE_UNSAVED, label: 'Messages Unsaved' },
  { value: MessageEventType.MESSAGE_DELETED, label: 'Messages Deleted' },
  { value: MessageEventType.SNAP_OPENED, label: 'Snaps Opened' },
  { value: MessageEventType.MEDIA_SHARED, label: 'Media Shared' },
  { value: MessageEventType.REACTION_ADDED, label: 'Reactions Added' },
  { value: MessageEventType.REACTION_REMOVED, label: 'Reactions Removed' },
  { value: MessageEventType.CONVERSATION_CLEARED, label: 'Conversations Cleared' },
];

interface ExportState {
  isLoading: boolean;
  error: string | null;
  success: string | null;
}

function MessageLogExport() {
  const [messageLoggingEnabled] = useSettingState('MESSAGE_LOGGING');
  const [exportState, setExportState] = useState<ExportState>({
    isLoading: false,
    error: null,
    success: null,
  });

  // Filter state
  const [selectedType, setSelectedType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [maxEntries, setMaxEntries] = useState<number | string>(1000);

  // Stats state
  const [stats, setStats] = useState(() => getMessageLogStats());

  const refreshStats = useCallback(() => {
    try {
      const newStats = getMessageLogStats();
      setStats(newStats);
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    }
  }, []);

  const downloadFile = useCallback((content: string, filename: string) => {
    try {
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error('Failed to create download file');
    }
  }, []);

  const handleExportAll = useCallback(async () => {
    setExportState({ isLoading: true, error: null, success: null });

    try {
      const logsData = exportMessageLogs();
      const filename = `chattweak-logs-all-${new Date().toISOString().split('T')[0]}.json`;
      downloadFile(logsData, filename);

      setExportState({
        isLoading: false,
        error: null,
        success: `Successfully exported all logs to ${filename}`,
      });
    } catch (error) {
      setExportState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to export logs',
        success: null,
      });
    }
  }, [downloadFile]);

  const handleExportFiltered = useCallback(async () => {
    setExportState({ isLoading: true, error: null, success: null });

    try {
      const filter: MessageLogFilter = {};

      if (selectedType) {
        filter.type = selectedType as MessageEventType;
      }

      if (startDate) {
        const startDateTime = new Date(startDate);
        if (isNaN(startDateTime.getTime())) {
          throw new Error('Invalid start date format');
        }
        filter.startTime = startDateTime.getTime();
      }

      if (endDate) {
        const endDateTime = new Date(endDate);
        if (isNaN(endDateTime.getTime())) {
          throw new Error('Invalid end date format');
        }
        // Set end time to end of day
        endDateTime.setHours(23, 59, 59, 999);
        filter.endTime = endDateTime.getTime();
      }

      // Validate date range
      if (startDate && endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        if (start > end) {
          throw new Error('Start date must be before end date');
        }
      }

      if (typeof maxEntries === 'number' && maxEntries > 0) {
        filter.limit = maxEntries;
      }

      const logsData = exportFilteredLogs(filter);
      const filterSuffix = [
        selectedType && `type-${selectedType}`,
        startDate && `from-${startDate}`,
        endDate && `to-${endDate}`,
        typeof maxEntries === 'number' && maxEntries > 0 && `limit-${maxEntries}`,
      ]
        .filter(Boolean)
        .join('-');

      const filename = `chattweak-logs-${filterSuffix || 'filtered'}-${new Date().toISOString().split('T')[0]}.json`;
      downloadFile(logsData, filename);

      setExportState({
        isLoading: false,
        error: null,
        success: `Successfully exported filtered logs to ${filename}`,
      });
    } catch (error) {
      setExportState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to export filtered logs',
        success: null,
      });
    }
  }, [selectedType, startDate, endDate, maxEntries, downloadFile]);

  const handleClearLogs = useCallback(async () => {
    const confirmed = window.confirm('Are you sure you want to clear all message logs? This action cannot be undone.');

    if (!confirmed) return;

    setExportState({ isLoading: true, error: null, success: null });

    try {
      clearMessageLogs();
      refreshStats();
      setExportState({
        isLoading: false,
        error: null,
        success: 'Successfully cleared all message logs',
      });
    } catch (error) {
      setExportState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to clear logs',
        success: null,
      });
    }
  }, [refreshStats]);

  // Clear status messages after 5 seconds
  React.useEffect(() => {
    if (exportState.success || exportState.error) {
      const timer = setTimeout(() => {
        setExportState((prev) => ({ ...prev, success: null, error: null }));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [exportState.success, exportState.error]);

  // Refresh stats when component mounts
  React.useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  if (!messageLoggingEnabled) {
    return (
      <Stack gap="sm">
        <Text fw={500}>{NAME}</Text>
        <Alert icon={<IconInfoCircle size="1rem" />} color="yellow">
          Message logging is disabled. Enable "Message Logging" to use export features.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Group gap="xs" align="center">
        <Text fw={500}>{NAME}</Text>
        <Tooltip label="Export your message logs as JSON files for backup or analysis. All data stays local on your device.">
          <IconHelp size="1rem" style={{ opacity: 0.6, cursor: 'help' }} />
        </Tooltip>
      </Group>
      <Text size="sm" c="dimmed">
        {DESCRIPTION}
      </Text>

      {/* Statistics Section */}
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Current Statistics
        </Text>
        <Group gap="xs">
          <Badge variant="light" color="blue">
            {stats.totalMessages} Total
          </Badge>
          <Badge variant="light" color="green">
            {stats.messagesSent} Sent
          </Badge>
          <Badge variant="light" color="orange">
            {stats.messagesReceived} Received
          </Badge>
          <Badge variant="light" color="purple">
            {stats.conversationsActive} Conversations
          </Badge>
        </Group>
        {stats.dateRange && (
          <Text size="xs" c="dimmed">
            Date range: {new Date(stats.dateRange.start).toLocaleDateString()} -{' '}
            {new Date(stats.dateRange.end).toLocaleDateString()}
          </Text>
        )}
        {stats.mostActiveConversation && (
          <Text size="xs" c="dimmed">
            Most active: {stats.mostActiveConversation.title || stats.mostActiveConversation.id} (
            {stats.mostActiveConversation.messageCount} messages)
          </Text>
        )}
      </Stack>

      {/* Export All Section */}
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Export All Logs
        </Text>
        <Tooltip
          label={
            stats.totalMessages === 0
              ? 'No logs available to export'
              : `Export all ${stats.totalMessages} logged messages`
          }
        >
          <Button
            leftSection={<IconDownload size="1rem" />}
            variant="filled"
            size="sm"
            onClick={handleExportAll}
            loading={exportState.isLoading}
            disabled={stats.totalMessages === 0}
            fullWidth
          >
            Download All Logs ({stats.totalMessages})
          </Button>
        </Tooltip>
      </Stack>

      {/* Export Filtered Section */}
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Export Filtered Logs
        </Text>

        <Group grow>
          <Select
            label="Message Type"
            placeholder="All types"
            data={MESSAGE_TYPES}
            value={selectedType}
            onChange={(value) => setSelectedType(value || '')}
            clearable
            size="sm"
            description="Filter by specific message event types"
          />
          <NumberInput
            label="Max Entries"
            placeholder="1000"
            value={maxEntries}
            onChange={setMaxEntries}
            min={1}
            max={10000}
            size="sm"
            description="Limit the number of exported entries"
          />
        </Group>

        <Group grow>
          <TextInput
            label="Start Date"
            placeholder="YYYY-MM-DD"
            value={startDate}
            onChange={(event) => setStartDate(event.currentTarget.value)}
            size="sm"
            type="date"
            max={endDate || new Date().toISOString().split('T')[0]}
            error={startDate && isNaN(new Date(startDate).getTime()) ? 'Invalid date' : undefined}
            description="Filter messages from this date onwards"
          />
          <TextInput
            label="End Date"
            placeholder="YYYY-MM-DD"
            value={endDate}
            onChange={(event) => setEndDate(event.currentTarget.value)}
            size="sm"
            type="date"
            min={startDate || undefined}
            max={new Date().toISOString().split('T')[0]}
            error={endDate && isNaN(new Date(endDate).getTime()) ? 'Invalid date' : undefined}
            description="Filter messages up to this date"
          />
        </Group>

        <Tooltip
          label={
            stats.totalMessages === 0
              ? 'No logs available to export'
              : (startDate && isNaN(new Date(startDate).getTime())) || (endDate && isNaN(new Date(endDate).getTime()))
                ? 'Please fix date validation errors'
                : 'Export logs with applied filters'
          }
        >
          <Button
            leftSection={<IconDownload size="1rem" />}
            variant="outline"
            size="sm"
            onClick={handleExportFiltered}
            loading={exportState.isLoading}
            disabled={
              stats.totalMessages === 0 ||
              (startDate && isNaN(new Date(startDate).getTime())) ||
              (endDate && isNaN(new Date(endDate).getTime()))
            }
            fullWidth
          >
            Download Filtered Logs
          </Button>
        </Tooltip>
      </Stack>

      {/* Management Section */}
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Log Management
        </Text>
        <Group grow>
          <Tooltip label="Refresh the statistics display">
            <Button leftSection={<IconDatabase size="1rem" />} variant="subtle" size="sm" onClick={refreshStats}>
              Refresh Stats
            </Button>
          </Tooltip>
          <Tooltip label={stats.totalMessages === 0 ? 'No logs to clear' : 'Permanently delete all message logs'}>
            <Button
              leftSection={<IconTrash size="1rem" />}
              variant="subtle"
              color="red"
              size="sm"
              onClick={handleClearLogs}
              loading={exportState.isLoading}
              disabled={stats.totalMessages === 0}
            >
              Clear All Logs
            </Button>
          </Tooltip>
        </Group>
      </Stack>

      {/* Status Messages */}
      {exportState.success && (
        <Alert color="green" icon={<IconInfoCircle size="1rem" />}>
          {exportState.success}
        </Alert>
      )}
      {exportState.error && (
        <Alert color="red" icon={<IconInfoCircle size="1rem" />}>
          {exportState.error}
        </Alert>
      )}
    </Stack>
  );
}

export default {
  name: NAME,
  description: DESCRIPTION,
  component: MessageLogExport,
};
