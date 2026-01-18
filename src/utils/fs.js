import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * 确保文件所在目录存在
 * @param {string} filePath - 绝对路径或相对路径
 */
export function ensureDirectorySync(filePath) {
  const directory = dirname(filePath);
  if (existsSync(directory)) {
    return;
  }

  // 递归创建目录,确保输出时不会失败
  mkdirSync(directory, { recursive: true });
}
