import { Dimensions, Platform } from 'react-native';

/** The longest name the server keeps for a session (api/src/auth/routes.ts). */
export const DEVICE_NAME_MAX = 80;

/** Below this many points on its shorter side, an Android screen is a phone's. */
const TABLET_MIN_SIDE = 600;

export interface DeviceFacts {
  os: string;
  /** iOS: an iPad, or an iPhone app running on one */
  isPad?: boolean;
  /** Android's own Build fields, as Platform.constants carries them */
  manufacturer?: string;
  model?: string;
  /** the screen's shorter side, in points */
  shortSide?: number;
}

const tidy = (s: string | undefined): string => (s ?? '').replace(/\p{Cc}/gu, '').replace(/\s+/g, ' ').trim();

/**
 * What the list of signed-in devices calls this one.
 *
 * Only what the platform says without asking: iPhone or iPad, and on Android
 * whether it is a phone or a tablet, with the maker and model Android reports
 * ("Android phone (Google Pixel 8)"). Never the name the owner gave the phone,
 * which is often their own name. Nothing at all off iOS and Android, where
 * the server keeps the session nameless.
 */
export function deviceNameFor(facts: DeviceFacts): string | undefined {
  if (facts.os === 'ios') return facts.isPad ? 'iPad' : 'iPhone';
  if (facts.os !== 'android') return undefined;
  const kind = `Android ${(facts.shortSide ?? 0) >= TABLET_MIN_SIDE ? 'tablet' : 'phone'}`;
  const maker = tidy(facts.manufacturer);
  const model = tidy(facts.model);
  // "Samsung SM-S911B", but not "Google Google Pixel 8"
  const named = maker && model && !model.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker[0]!.toUpperCase()}${maker.slice(1)} ${model}` : model;
  const full = named ? `${kind} (${named})` : kind;
  return full.length <= DEVICE_NAME_MAX ? full : `${full.slice(0, DEVICE_NAME_MAX - 2).trimEnd()}…)`;
}

/** This phone's name, as `deviceNameFor` puts it. */
export function deviceName(): string | undefined {
  const constants = (Platform.constants ?? {}) as { Manufacturer?: string; Model?: string };
  const screen = Dimensions.get('screen');
  return deviceNameFor({
    os: Platform.OS,
    isPad: Platform.OS === 'ios' && (Platform as { isPad?: boolean }).isPad === true,
    manufacturer: constants.Manufacturer,
    model: constants.Model,
    shortSide: Math.min(screen.width, screen.height),
  });
}
