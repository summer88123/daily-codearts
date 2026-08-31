import * as os from 'os';
import * as path from 'path';

/**
 * 获取工具专属的系统缓存根目录
 */
export function getCacheRootDir(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'hecom-codearts');
  }
  if (platform === 'linux') {
    return path.join(os.homedir(), '.cache', 'hecom-codearts');
  }
  if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'hecom-codearts');
  }
  return path.join(os.tmpdir(), 'hecom-codearts');
}
