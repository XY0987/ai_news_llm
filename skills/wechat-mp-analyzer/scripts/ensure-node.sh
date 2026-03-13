#!/bin/bash
# Node.js 版本自动切换脚本
# 用法: source skills/wechat-mp-analyzer/scripts/ensure-node.sh
#
# 本脚本检查当前 Node 版本是否满足要求（v22+），
# 如果不满足则通过 nvm 自动切换到正确版本。
# 必须用 source 执行，否则版本切换不会生效。

REQUIRED_MAJOR=22

# 获取当前 Node 主版本号
current_version=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)

if [ -z "$current_version" ]; then
  echo "❌ 未检测到 Node.js，尝试通过 nvm 安装..."
  if command -v nvm &>/dev/null || [ -s "$NVM_DIR/nvm.sh" ]; then
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
    nvm install $REQUIRED_MAJOR && nvm use $REQUIRED_MAJOR
  else
    echo "❌ 未找到 nvm，请手动安装 Node.js v${REQUIRED_MAJOR}+"
    return 1 2>/dev/null || exit 1
  fi
elif [ "$current_version" -lt "$REQUIRED_MAJOR" ]; then
  echo "⚠️  当前 Node 版本 v${current_version}，需要 v${REQUIRED_MAJOR}+，正在切换..."
  if command -v nvm &>/dev/null || [ -s "$NVM_DIR/nvm.sh" ]; then
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
    nvm use $REQUIRED_MAJOR 2>/dev/null || nvm install $REQUIRED_MAJOR
    # 切换后再次验证
    new_version=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
    if [ "$new_version" -ge "$REQUIRED_MAJOR" ]; then
      echo "✅ 已切换到 Node $(node -v)"
    else
      echo "❌ Node 版本切换失败，当前: v${new_version}"
      return 1 2>/dev/null || exit 1
    fi
  else
    echo "❌ 未找到 nvm，请手动切换到 Node.js v${REQUIRED_MAJOR}+"
    return 1 2>/dev/null || exit 1
  fi
else
  echo "✅ Node 版本检查通过: $(node -v)"
fi
