import React from 'react';
import useSettingState from '../../../../hooks/useSettingState';
import { Switch } from '@mantine/core';

const NAME = 'Message Logging';
const DESCRIPTION = 'Track and log message events locally in your browser for debugging and analytics.';

function MessageLogging() {
  const [enabled, setEnabled] = useSettingState('MESSAGE_LOGGING');
  return <Switch label={NAME} description={DESCRIPTION} checked={enabled} onChange={() => setEnabled(!enabled)} />;
}

export default {
  name: NAME,
  description: DESCRIPTION,
  component: MessageLogging,
};
