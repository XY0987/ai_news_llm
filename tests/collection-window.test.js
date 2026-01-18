import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCollectionWindowConfig, getRecentCutoff, getRecentDays, resetCollectionWindowCache } from '../src/config/collection-window.js';
import { configLoader } from '../src/config/config-loader.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe('collection-window 配置', () => {
  beforeEach(() => {
    resetCollectionWindowCache();
  });

  afterEach(() => {
    resetCollectionWindowCache();
    vi.restoreAllMocks();
  });

  it('当配置加载失败时应使用默认值', () => {
    vi.spyOn(configLoader, 'loadAndValidate').mockImplementation(() => {
      throw new Error('mock load error');
    });

    const config = loadCollectionWindowConfig();
    expect(config.recentDays).toBe(7);
  });

  it('getRecentCutoff 返回的时间应与配置天数匹配', () => {
    const now = Date.now();
    const cutoff = getRecentCutoff(now);
    const recentDays = getRecentDays();
    const expectedDelta = recentDays * DAY_IN_MS;

    expect(Math.abs((now - cutoff.getTime()) - expectedDelta)).toBeLessThan(1000);
  });
});
