import { beforeEach, describe, expect, it } from 'vitest';
import { partitionByGlobalRecency } from '../src/utils/recency.js';
import { resetCollectionWindowCache } from '../src/config/collection-window.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe('partitionByGlobalRecency', () => {
  beforeEach(() => {
    resetCollectionWindowCache();
  });

  it('按全局配置划分近期与过期数据', () => {
    const now = Date.now();
    const recentNews = { createdAt: new Date(now) };
    const outdatedNews = { createdAt: new Date(now - (8 * DAY_IN_MS)) };

    const { recent, outdated } = partitionByGlobalRecency([recentNews, outdatedNews]);

    expect(recent).toContain(recentNews);
    expect(outdated).toContain(outdatedNews);
  });

  it('缺失发布时间的数据默认视为近期', () => {
    const { recent, outdated } = partitionByGlobalRecency([{ title: 'no date' }], () => null);
    expect(recent).toHaveLength(1);
    expect(outdated).toHaveLength(0);
  });
});
