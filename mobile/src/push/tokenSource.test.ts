import { beforeEach, describe, expect, it, vi } from 'vitest';
const phone = vi.hoisted(() => ({
  os: 'ios',
  permission: { status: 'granted', granted: true, canAskAgain: true } as Record<string, unknown>,
  token: vi.fn(async (_opts: { projectId: string }) => ({ type: 'expo', data: 'ExponentPushToken[abc123]' })),
  request: vi.fn(),
  channel: vi.fn(async () => null),
  extra: { eas: { projectId: '9879cead-a0b7-4879-938f-8e69d96ec2b5' } } as Record<string, unknown> | undefined,
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return phone.os;
    },
  },
  Linking: { openSettings: vi.fn() },
}));
vi.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => phone.permission,
  requestPermissionsAsync: phone.request,
  getExpoPushTokenAsync: phone.token,
  setNotificationChannelAsync: phone.channel,
  AndroidImportance: { DEFAULT: 3 },
}));
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { extra: phone.extra };
    },
    easConfig: null,
  },
}));
import { easProjectId, getPushToken } from './tokenSource';

beforeEach(() => {
  phone.os = 'ios';
  phone.permission = { status: 'granted', granted: true, canAskAgain: true };
  phone.extra = { eas: { projectId: '9879cead-a0b7-4879-938f-8e69d96ec2b5' } };
  phone.token.mockClear();
  phone.request.mockClear();
  phone.channel.mockClear();
});

describe('getPushToken', () => {
  it('gets the Expo push token for the app’s EAS project once notifications are allowed', async () => {
    expect(await getPushToken()).toEqual({ token: 'ExponentPushToken[abc123]', platform: 'ios' });
    expect(phone.token).toHaveBeenCalledWith({ projectId: '9879cead-a0b7-4879-938f-8e69d96ec2b5' });
  });

  it('never asks for permission itself, and has no token without it', async () => {
    phone.permission = { status: 'undetermined', granted: false, canAskAgain: true };
    expect(await getPushToken()).toBeNull();
    phone.permission = { status: 'denied', granted: false, canAskAgain: false };
    expect(await getPushToken()).toBeNull();
    expect(phone.request).not.toHaveBeenCalled();
    expect(phone.token).not.toHaveBeenCalled();
  });

  it('names the Android channel on the way, for a phone allowed in its own settings', async () => {
    phone.os = 'android';
    expect(await getPushToken('Notifications')).toEqual({ token: 'ExponentPushToken[abc123]', platform: 'android' });
    expect(phone.channel).toHaveBeenCalledWith('default', { name: 'Notifications', importance: 3 });
  });

  it('is null where there is no token to be had: the web, no project id, or a token that will not come', async () => {
    phone.os = 'web';
    expect(await getPushToken()).toBeNull();
    phone.os = 'ios';
    phone.extra = undefined;
    expect(easProjectId()).toBeNull();
    expect(await getPushToken()).toBeNull();
    phone.extra = { eas: { projectId: 'p1' } };
    // a simulator, no connection, an Android build without its Firebase file
    phone.token.mockRejectedValueOnce(new Error('no APNs here'));
    expect(await getPushToken()).toBeNull();
  });
});
