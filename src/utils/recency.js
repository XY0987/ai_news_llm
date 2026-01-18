import { getRecentCutoff, getRecentDays } from '../config/collection-window.js';

/**
 * 将日期值转换为时间戳
 * @param {Date|string|number} value
 * @returns {number}
 */
function toTimestamp(value) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value).getTime();
  }

  return Number.NaN;
}

/**
 * 根据全局配置划分近期与过期的数据
 * @param {Array} items
 * @param {Function} [getDate]
 * @returns {{ recent: Array, outdated: Array, recentDays: number, cutoff: Date }}
 */
export function partitionByGlobalRecency(items, getDate = item => item?.createdAt) {
  const recentDays = getRecentDays();
  const cutoff = getRecentCutoff();
  const cutoffMs = cutoff.getTime();

  if (!Array.isArray(items) || items.length === 0) {
    return { recent: [], outdated: [], recentDays, cutoff };
  }

  const recent = [];
  const outdated = [];

  items.forEach(item => {
    const rawValue = getDate(item);
    const timestamp = toTimestamp(rawValue);

    if (!Number.isFinite(timestamp)) {
      // 缺少发布时间的内容视为最新,避免误删有效信息
      recent.push(item);
      return;
    }

    if (timestamp >= cutoffMs) {
      recent.push(item);
    } else {
      outdated.push(item);
    }
  });

  return { recent, outdated, recentDays, cutoff };
}

export function filterRecentItems(items, getDate) {
  return partitionByGlobalRecency(items, getDate).recent;
}

export const __TESTING__ = {
  toTimestamp
};
