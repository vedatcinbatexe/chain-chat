import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  /** Shares of the whole (0–1), drawn clockwise from the top in the order given. */
  slices: { key: string; color: string; weight: number }[];
  /** The ring behind the slices; all that shows when there is nothing to draw. */
  trackColor: string;
  size?: number;
  thickness?: number;
  /** Shown in the hole, e.g. the total. */
  children?: ReactNode;
}

/** A ring split into colored arcs. Each arc is a circle whose stroke is dashed to one visible segment. */
export function DonutChart({ slices, trackColor, size = 168, thickness = 20, children }: Props) {
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const visible = slices.filter((slice) => slice.weight > 0);
  const gap = visible.length > 1 ? 3 : 0;

  const arcs = visible.map((slice, index) => {
    const start = visible.slice(0, index).reduce((sum, earlier) => sum + earlier.weight, 0) * circumference;
    // A share too small for the gap still gets a sliver, so it can be seen at all.
    const length = Math.max(slice.weight * circumference - gap, 1.5);
    return { ...slice, start, length };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={thickness} fill="none" />
        {arcs.map((arc) => (
          <Circle
            key={arc.key}
            cx={center}
            cy={center}
            r={radius}
            stroke={arc.color}
            strokeWidth={thickness}
            fill="none"
            strokeDasharray={[arc.length, circumference - arc.length]}
            strokeDashoffset={-arc.start}
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        ))}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.hole, { padding: thickness + 6 }]} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hole: { alignItems: 'center', justifyContent: 'center' },
});
