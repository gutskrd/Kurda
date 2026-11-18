import { describe, expect, it } from 'vitest';
import { shopItemDescription } from './shop-descriptions.js';

const night = { name: 'Şeva Zozanan', description: 'Night on the high pastures' };

describe('a shop item’s description', () => {
  it('is in the reader’s language for an item the shop ships with', () => {
    expect(shopItemDescription(night, 'en')).toBe('Night on the high pastures');
    expect(shopItemDescription(night, 'ckb')).toBe('شەو لە کوێستان');
    expect(shopItemDescription(night, 'de')).toBe('Nacht auf den Hochweiden');
    expect(shopItemDescription(night, 'ku')).toBe('Şev li zozanan');
  });

  it('is as written for an item an admin described, in any language', () => {
    expect(shopItemDescription({ name: 'Dara Min', description: 'A tree of my own' }, 'ckb')).toBe('A tree of my own');
  });

  it('is left out where it would only repeat the name, or there is none', () => {
    expect(shopItemDescription({ name: 'Hinar', description: 'Pomegranate' }, 'ku')).toBeNull();
    expect(shopItemDescription({ name: 'Hinar', description: 'Pomegranate' }, 'tr')).toBe('Nar');
    expect(shopItemDescription({ name: 'Saz', description: 'Saz' }, 'en')).toBeNull();
    expect(shopItemDescription({ name: 'Kilîma Sor', description: 'Red kilim' }, 'ku')).toBeNull();
    expect(shopItemDescription({ name: 'Mij', description: null }, 'en')).toBeNull();
  });
});
