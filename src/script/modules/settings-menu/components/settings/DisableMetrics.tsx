import React from 'react';
import useSettingState from '../../../../hooks/useSettingState';
import { Switch } from '@mantine/core';

const NAME = 'Disable Metrics';
const DESCRIPTION = 'Disables sending metrics data to Snapchat.';

function DisableMetrics() {
  const [enabled, setEnabled] = useSettingState('DISABLE_METRICS');
  return <Switch label={NAME} description={DESCRIPTION} checked={enabled} onChange={() => setEnabled(!enabled)} />;
}

export default {
  name: NAME,
  description: DESCRIPTION,
  component: DisableMetrics,
};