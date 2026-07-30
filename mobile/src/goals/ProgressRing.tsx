import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, typography } from '../theme/tokens';
import { goalPercentLabel, ringStroke } from './format';

interface Props {
  progress: number;
  completed: boolean;
  /** e.g. "20 / 30 XP" */
  caption: string;
  size?: number;
}

/** Circular XP-goal progress ring for the home screen (KUR-032). */
export function ProgressRing({ progress, completed, caption, size = 140 }: Props) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const { circumference, dashoffset } = ringStroke(progress, radius);
  const tint = completed ? colors.success : colors.accent;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* track */}
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {/* progress arc, starting at 12 o'clock */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tint}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.pct, { color: tint }]}>{completed ? '✓' : goalPercentLabel(progress)}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pct: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  caption: { fontSize: typography.sizes.sm, color: colors.textSecondary },
});
