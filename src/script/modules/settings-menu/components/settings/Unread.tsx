import React from 'react';
import useSettingState from '../../../../hooks/useSettingState';
import { Switch } from '@mantine/core';

const NAME = 'Unread';
const DESCRIPTION = 'Prevent others from knowing you read their message.';
 
function Unread() {
  const [enabled, setEnabled] = useSettingState('NO_READ_RECEIPTS');
  return <Switch label={NAME} description={DESCRIPTION} checked={enabled} onChange={() => setEnabled(!enabled)} />;
}

export default {
  name: NAME,
  description: DESCRIPTION,
  component: Unread,
};