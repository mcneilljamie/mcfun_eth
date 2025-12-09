import React from 'react';
import { TimeRange } from '../hooks/useChartData';

interface TimeRangeSelectorProps {
  selected: TimeRange;
  onChange: (range: TimeRange) => void;
  theme?: 'light' | 'dark';
}

const TIME_RANGES: TimeRange[] = ['1H', '24H', '7D', '30D', 'ALL'];

export function TimeRangeSelector({ selected, onChange, theme = 'dark' }: TimeRangeSelectorProps) {
  const isDark = theme === 'dark';

  return (
    <div className={`flex gap-1 ${isDark ? 'bg-gray-800' : 'bg-gray-100'} rounded-lg p-1`}>
      {TIME_RANGES.map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selected === range
              ? 'bg-blue-600 text-white'
              : isDark
              ? 'text-gray-400 hover:text-white hover:bg-gray-700'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
          }`}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
