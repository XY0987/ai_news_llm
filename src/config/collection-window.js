import { configLoader } from './config-loader.js';
import { validateCollectionWindow } from './validators.js';
import { createLogger } from '../utils/logger.js';

// 常量定义
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RECENT_DAYS = 7;
const DEFAULT_CONFIG = Object.freeze({ recentDays: DEFAULT_RECENT_DAYS });

const logger = createLogger('CollectionWindow');

let cachedConfig = null;
let hasLoggedInitialMessage = false;

function normalizeConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return { ...DEFAULT_CONFIG };
  }

  const recentDays = Number(rawConfig.recentDays);
  if (!Number.isFinite(recentDays) || recentDays <= 0) {
    return { ...DEFAULT_CONFIG };
  }

  return { recentDays: Math.floor(recentDays) };
}

/**
 * 加载全局采集时间窗口配置
 * @returns {{ recentDays: number }}
 */
export function loadCollectionWindowConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  let usedFallback = false;

  try {
    const config = configLoader.loadAndValidate(
      'config/collection-window.json',
      validateCollectionWindow,
      { required: false, defaultValue: null }
    );

    if (config) {
      cachedConfig = normalizeConfig(config);
    } else {
      cachedConfig = { ...DEFAULT_CONFIG };
      usedFallback = true;
    }
  } catch (error) {
    usedFallback = true;
    cachedConfig = { ...DEFAULT_CONFIG };
    logger.warn(`加载采集时间窗口配置失败: ${error.message}`);
  }

  if (!hasLoggedInitialMessage) {
    if (usedFallback) {
      logger.info(`未找到采集时间窗口配置,使用默认 ${cachedConfig.recentDays} 天`);
    } else {
      logger.info(`采集时间窗口配置: 最近 ${cachedConfig.recentDays} 天`);
    }
    hasLoggedInitialMessage = true;
  }

  return cachedConfig;
}

/**
 * 获取最近天数配置
 * @returns {number}
 */
export function getRecentDays() {
  const { recentDays } = loadCollectionWindowConfig();
  return recentDays ?? DEFAULT_RECENT_DAYS;
}

/**
 * 计算全局时间窗口的起始时间
 * @param {number} [now=Date.now()] 当前时间
 * @returns {Date}
 */
export function getRecentCutoff(now = Date.now()) {
  const days = getRecentDays();
  const delta = days * MILLISECONDS_PER_DAY;
  return new Date(now - delta);
}

/**
 * 重置缓存(主要用于测试场景)
 */
export function resetCollectionWindowCache() {
  cachedConfig = null;
  hasLoggedInitialMessage = false;
}

export const __TESTING__ = {
  MILLISECONDS_PER_DAY,
  DEFAULT_RECENT_DAYS,
  resetCollectionWindowCache
};
