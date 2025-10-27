import React from 'react';
import useSettingState from '../../../../hooks/useSettingState';
import { Switch } from '@mantine/core';

const NAME = 'Detailed Message Logging';
const DESCRIPTION = 'Enable verbose console output for message events (may impact performance).';

function MessageLoggingDetailed() {
  const [enabled, setEnabled] = useSettingState('MESSAGE_LOGGING_DETAILED');
  const [messageLoggingEnabled] = useSettingState('MESSAGE_LOGGING');

  return (
    <Switch
      label={NAME}
      description={DESCRIPTION}
      checked={enabled}
      disabled={!messageLoggingEnabled}
      onChange={() => setEnabled(!enabled)}
    />
  );
}

export default {
  name: NAME,
  description: DESCRIPTION,
  component: MessageLoggingDetailed,
};
