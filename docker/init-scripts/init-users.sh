#!/bin/bash

# 默认 AI 用户列表
USERS=("alpha" "beta" "gamma")

# 从环境变量读取代理地址
PROXY_URL="${AI_PROXY_URL:-http://host.docker.internal:3456/v1}"

for user in "${USERS[@]}"; do
    # 创建用户
    useradd -m -s /bin/bash "$user"
    
    # 创建 opencode 配置目录
    mkdir -p "/home/$user/.opencode"
    
    # 生成 dummy key
    DUMMY_KEY="tw-$user-$(date +%s)"
    
    # 写入配置文件
    cat > "/home/$user/.opencode/config.json" <<EOF
{
  "apiBaseUrl": "$PROXY_URL",
  "apiKey": "$DUMMY_KEY",
  "model": "gpt-4"
}
EOF
    
    # 设置权限
    chown -R "$user:$user" "/home/$user/.opencode"
    chmod 600 "/home/$user/.opencode/config.json"
done

echo "AI users created: ${USERS[*]}"
