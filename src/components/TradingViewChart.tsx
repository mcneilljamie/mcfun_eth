import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, LineStyle, AreaSeries } from 'lightweight-charts';

export interface ChartDataPoint {
  time: number;
  value: number;
}

interface TradingViewChartProps {
  data: ChartDataPoint[];
  height?: number;
  positiveColor?: string;
  negativeColor?: string;
  isPositive?: boolean;
}

export function TradingViewChart({
  data,
  height = 300,
  positiveColor = '#10B981',
  negativeColor = '#EF4444',
  isPositive = true,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const lineColor = isPositive ? positiveColor : negativeColor;
    const topColor = isPositive ? `${positiveColor}40` : `${negativeColor}40`;
    const bottomColor = isPositive ? `${positiveColor}00` : `${negativeColor}00`;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: '#6B7280',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: {
          color: '#F3F4F6',
          style: LineStyle.Solid,
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      rightPriceScale: {
        borderColor: '#E5E7EB',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: '#E5E7EB',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: lineColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: lineColor,
        },
        horzLine: {
          color: lineColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: lineColor,
        },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: false,
        pinch: false,
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: lineColor,
      topColor: topColor,
      bottomColor: bottomColor,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBorderColor: 'white',
      crosshairMarkerBackgroundColor: lineColor,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => {
          if (price >= 1) {
            return `$${price.toFixed(2)}`;
          } else if (price >= 0.01) {
            return `$${price.toFixed(4)}`;
          } else if (price >= 0.0001) {
            return `$${price.toFixed(6)}`;
          } else {
            return `$${price.toFixed(8)}`;
          }
        },
      },
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height, positiveColor, negativeColor, isPositive]);

  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    const validData = data.filter(d => d.value > 0 && !isNaN(d.value) && isFinite(d.value));

    if (validData.length === 0) return;

    seriesRef.current.setData(validData);

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();

      const prices = validData.map(d => d.value);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const range = maxPrice - minPrice;

      if (range === 0 || range < maxPrice * 0.001) {
        const padding = maxPrice * 0.02;
        seriesRef.current.applyOptions({
          priceFormat: {
            type: 'custom',
            formatter: (price: number) => {
              if (price >= 1) {
                return `$${price.toFixed(6)}`;
              } else if (price >= 0.01) {
                return `$${price.toFixed(8)}`;
              } else {
                return `$${price.toFixed(10)}`;
              }
            },
          },
        });

        chartRef.current.priceScale('right').applyOptions({
          autoScale: true,
          scaleMargins: {
            top: 0.2,
            bottom: 0.2,
          },
        });
      }
    }
  }, [data]);

  return <div ref={chartContainerRef} className="w-full" />;
}
