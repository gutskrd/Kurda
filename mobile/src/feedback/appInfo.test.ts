import { describe, expect, it, vi } from 'vitest';
import { requestStoreReview } from './storeReview';
import { APP_VERSION, appPlatform, rateUrl } from './appInfo';

describe('appInfo', () => {
  it('reads the version the build was made from', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('names the platform as the API does', () => {
    expect(appPlatform('ios')).toBe('ios');
    expect(appPlatform('android')).toBe('android');
    expect(appPlatform('web')).toBe('web');
  });

  it('opens the store at the place to write a review, once the owner has put the address in', () => {
    const urls = { ios: 'https://apps.apple.com/app/id123', android: 'https://play.google.com/store/apps/details?id=app.hevalo.mobile' };
    expect(rateUrl('ios', urls)).toBe('https://apps.apple.com/app/id123?action=write-review');
    expect(rateUrl('android', urls)).toBe('https://play.google.com/store/apps/details?id=app.hevalo.mobile&showAllReviews=true');
    expect(rateUrl('web', urls)).toBeNull();
  });

  it('has no "Rate Hevalo" until the addresses exist', () => {
    expect(rateUrl('ios', { ios: '', android: '' })).toBeNull();
    expect(rateUrl('ios')).toBeNull(); // app.json ships them empty
  });
});

describe('requestStoreReview', () => {
  it('asks the system only when its own prompt is there', async () => {
    const module = { isAvailableAsync: vi.fn(async () => true), requestReview: vi.fn(async () => undefined) };
    expect(await requestStoreReview(module)).toBe(true);
    expect(module.requestReview).toHaveBeenCalledOnce();
  });

  it('never falls back to the store page (TestFlight, an old Android)', async () => {
    const module = { isAvailableAsync: vi.fn(async () => false), requestReview: vi.fn(async () => undefined) };
    expect(await requestStoreReview(module)).toBe(false);
    expect(module.requestReview).not.toHaveBeenCalled();
  });

  it('does nothing in a build without the module', async () => {
    expect(await requestStoreReview(null)).toBe(false);
  });

  it('swallows a failure in the native call', async () => {
    const module = { isAvailableAsync: vi.fn(async () => true), requestReview: vi.fn(async () => Promise.reject(new Error('x'))) };
    expect(await requestStoreReview(module)).toBe(false);
  });
});
