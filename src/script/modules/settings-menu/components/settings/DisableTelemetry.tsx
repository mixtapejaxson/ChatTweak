import React from 'react';
import useSettingState from '../../../../hooks/useSettingState';
import { Switch } from '@mantine/core';

const NAME = 'Disable Telemetry';
const DESCRIPTION = 'Disables sending telemetry data to Snapchat.';

function DisableTelemetry() {
  const [enabled, setEnabled] = useSettingState('DISABLE_TELEMETRY');
  return <Switch label={NAME} description={DESCRIPTION} checked={enabled} onChange={() => setEnabled(!enabled)} />;
}

export default {
  name: NAME,
  description: DESCRIPTION,
  component: DisableTelemetry,
};