/**
 * 网页选择器配置
 * 集中管理各种 HTML 选择器策略
 */

/**
 * AIBase 选择器配置
 */
export const AIBASE_SELECTORS = {
  // 新闻列表容器
  containers: [
    '.news-item',
    '.article-item',
    '.list-item',
    '.item',
    'article',
    '.post',
    '.entry'
  ],

  // 标题选择器
  title: [
    'h1',
    'h2',
    'h3',
    '.title',
    '.headline',
    'a'
  ],

  // 摘要选择器
  summary: [
    '.summary',
    '.description',
    '.excerpt',
    '.content',
    'p'
  ],

  // 链接选择器
  link: 'a',

  // 时间选择器
  time: [
    '.time',
    '.date',
    '.publish-time',
    'time'
  ],

  // Puppeteer 专用选择器
  puppeteer: {
    newsLinks: 'a[href*="/news/"]',
    fallbackLinks: 'a[aria-label]',
    headings: 'h1, h2, h3, h4',
    paragraphs: 'p',
    containers: '.group, .item, article',
    timeElements: 'time, .time, .date'
  }
};

/**
 * 选择器工具函数
 */
export class SelectorUtils {
  /**
   * 尝试多个选择器,返回第一个匹配的结果
   * @param {cheerio.Cheerio} $elem - Cheerio 元素
   * @param {string[]} selectors - 选择器数组
   * @param {Function} extractFn - 提取函数 (elem, selector) => value
   * @returns {*} 提取的值或 null
   */
  static trySelectors($elem, selectors, extractFn) {
    for (const selector of selectors) {
      const value = extractFn($elem, selector);
      if (value) {
        return value;
      }
    }
    return null;
  }

  /**
   * 提取文本内容
   * @param {cheerio.Cheerio} $elem
   * @param {string} selector
   * @param {number} minLength - 最小长度要求
   * @returns {string|null}
   */
  static extractText($elem, selector, minLength = 0) {
    const text = $elem.find(selector).first().text()?.trim();
    return text && text.length >= minLength ? text : null;
  }

  /**
   * 提取属性值
   * @param {cheerio.Cheerio} $elem
   * @param {string} selector
   * @param {string} attr
   * @returns {string|null}
   */
  static extractAttr($elem, selector, attr) {
    return $elem.find(selector).first().attr(attr) || null;
  }

  /**
   * 规范化 URL
   * @param {string} url
   * @param {string} baseUrl
   * @returns {string}
   */
  static normalizeUrl(url, baseUrl) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return `${baseUrl}${url}`;
    return `${baseUrl}/${url}`;
  }

  /**
   * 解析日期时间
   * @param {string} datetime
   * @returns {Date}
   */
  static parseDateTime(datetime) {
    if (!datetime) return new Date();
    const date = new Date(datetime);
    return isNaN(date.getTime()) ? new Date() : date;
  }
}
