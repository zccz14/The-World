#!/bin/bash

# 默认 AI 用户列表
USERS=("alpha" "beta" "gamma")

# 从环境变量读取代理地址
PROXY_URL="${AI_PROXY_URL:-http://host.docker.internal:3456/v1}"

for user in "${USERS[@]}"; do
    # 创建用户
    useradd -m -s /bin/bash "$user"
    
    # 设置 PATH 环境变量（包含 node 和 opencode 路径）
    echo 'export PATH="/usr/local/bin:$PATH"' >> "/home/$user/.bashrc"
    echo 'export PATH="/usr/local/bin:$PATH"' >> "/home/$user/.profile"
    
    # 创建 opencode 配置目录
    mkdir -p "/home/$user/.opencode"
    
    # 生成 dummy key
    DUMMY_KEY="tw-$user-$(date +%s)"
    
    # 写入配置文件
    cat > "/home/$user/.opencode/config.json" <<EOF
{
  "apiBaseUrl": "$PROXY_URL",
  "apiKey": "$DUMMY_KEY",
  "model": "claude-sonnet-4-6"
}
EOF
    
    # 设置权限
    chown -R "$user:$user" "/home/$user/.opencode"
    chmod 600 "/home/$user/.opencode/config.json"
done

echo "AI users created: ${USERS[*]}"
