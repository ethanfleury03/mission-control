'use client';

import { useEffect, useState } from 'react';
import { formatTimeAgo } from './utils';

export function useTimeAgo(date: Date): string {
  const [value, setValue] = useState('--');

  useEffect(() => {
    const update = () => setValue(formatTimeAgo(date));

    update();
    const intervalId = setInterval(update, 60_000);

    return () => clearInterval(intervalId);
  }, [date.getTime()]);

  return value;
}
