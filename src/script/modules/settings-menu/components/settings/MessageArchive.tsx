import React from 'react';
import { Button, Group, NativeSelect, Stack, Switch, Text } from '@mantine/core';
import useSettingState from '../../../../hooks/useSettingState';
import { SettingIds } from '../../../../lib/constants';
import messageArchive from '../../../../lib/messageArchive';
import { type SettingModule } from '../../../../../types/client';

const LIMIT_OPTIONS = [
  { value: '500', label: '500 messages' },
  { value: '1000', label: '1,000 messages' },
  { value: '2500', label: '2,500 messages' },
  { value: '5000', label: '5,000 messages' },
  { value: '10000', label: '10,000 messages' },
];

function MessageArchive() {
  const [archiveEnabled, setArchiveEnabled] = useSettingState(SettingIds.MESSAGE_ARCHIVE);
  const [deleteLoggingEnabled, setDeleteLoggingEnabled] = useSettingState(SettingIds.MESSAGE_DELETE_LOGGING);
  const [archiveLimit, setArchiveLimit] = useSettingState(SettingIds.MESSAGE_ARCHIVE_LIMIT);
  const [summary, setSummary] = React.useState(() => messageArchive.getSummary());
  const [activeConversationExportable, setActiveConversationExportable] = React.useState(true);

  React.useEffect(() => {
    return messageArchive.subscribe(() => setSummary(messageArchive.getSummary()));
  }, []);

  return (
    <Stack gap="xs">
      <Switch
        label="Message Archive"
        description="Keep a local message history so chats can be exported later."
        checked={archiveEnabled}
        onChange={() => setArchiveEnabled(!archiveEnabled)}
      />
      <Switch
        label="Deleted Message Logging"
        description="Log removed messages to the dev console when they disappear from the chat state."
        checked={deleteLoggingEnabled}
        onChange={() => setDeleteLoggingEnabled(!deleteLoggingEnabled)}
      />
      <NativeSelect
        label="Archive Size"
        description="Cap local history to keep storage usage predictable."
        data={LIMIT_OPTIONS}
        value={String(archiveLimit)}
        onChange={(event) => setArchiveLimit(Number.parseInt(event.currentTarget.value, 10))}
      />
      <Text size="sm" c="dimmed">
        Archived {summary.messages} messages across {summary.conversations} chats. Deleted markers: {summary.deleted}.
      </Text>
      <Group>
        <Button size="xs" variant="light" onClick={() => messageArchive.exportArchiveJson()}>
          Export JSON
        </Button>
        <Button
          size="xs"
          variant="light"
          onClick={() => setActiveConversationExportable(messageArchive.exportActiveConversationMarkdown())}
        >
          Export Active Chat
        </Button>
        <Button
          size="xs"
          color="red"
          variant="subtle"
          onClick={() => {
            messageArchive.clear();
            setSummary(messageArchive.getSummary());
          }}
        >
          Clear Archive
        </Button>
      </Group>
      {!activeConversationExportable ? (
        <Text size="sm" c="yellow">
          Open a chat first so the archive knows which conversation to export.
        </Text>
      ) : null}
    </Stack>
  );
}

export default {
  name: 'Message Archive & Export',
  description: 'Keep a local message archive, export chats, and log deleted messages.',
  component: MessageArchive,
} satisfies SettingModule;
