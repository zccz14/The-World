# EverMemOS Configuration Guide

## Prerequisites

TheWorld requires EverMemOS to be deployed and running. Here are the deployment and configuration steps:

## 1. EverMemOS Deployment

### Method A: Using Local Docker (Recommended)

```bash
# Clone the EverMemOS repository
git clone https://github.com/EverMind-AI/EverMemOS.git
cd EverMemOS

# Start the EverMemOS container stack
docker compose up -d

# Wait for services to start (approx. 30-60 seconds)
# Check health status
curl http://localhost:1995/health
# Should return: {"status": "healthy", ...}
```

### Method B: Using a Pre-deployed EverMemOS

If EverMemOS is already deployed at another address, simply configure the URL:

```bash
# Set in the .env file
EVERMEMOS_URL=http://your-evermemos-server:1995
```

## 2. Configuring TheWorld

Copy the configuration template file:

```bash
cd The-World
cp .env.example .env
```

Edit the `.env` file and fill in the necessary configurations:

### Required Configurations

```bash
# EverMemOS address
EVERMEMOS_URL=http://localhost:1995

# AI API Key (OpenAI or Anthropic)
REAL_AI_API_KEY=sk-your-api-key
AI_TARGET_BASE_URL=https://api.openai.com/v1

# API Keys used by EverMemOS
LLM_API_KEY=sk-your-api-key
VECTORIZE_API_KEY=your-vectorize-key
```

## 3. API Key Configuration Details

### OpenAI API

```bash
REAL_AI_API_KEY=sk-proj-xxxxxxxxxxxxx
AI_TARGET_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-proj-xxxxxxxxxxxxx
VECTORIZE_API_KEY=vz-xxxxxxxxxxxxx  # Obtain from Vectorize.io
```

### Anthropic API

```bash
REAL_AI_API_KEY=sk-ant-xxxxxxxxxxxxx
AI_TARGET_BASE_URL=https://api.anthropic.com/v1
LLM_API_KEY=sk-ant-xxxxxxxxxxxxx
VECTORIZE_API_KEY=vz-xxxxxxxxxxxxx
```

### Azure OpenAI

```bash
REAL_AI_API_KEY=your-azure-key
AI_TARGET_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment
LLM_API_KEY=your-azure-key
VECTORIZE_API_KEY=vz-xxxxxxxxxxxxx
```

## 4. Vectorize API Key

EverMemOS requires a Vectorize API Key for vectorization:

1. Visit https://vectorize.io
2. Register an account
3. Obtain the API Key from the Dashboard
4. Configure it in the `.env` file:

```bash
VECTORIZE_API_KEY=vz-xxxxxxxxxxxxx
```

## 5. Verifying Configuration

Start TheWorld and verify:

```bash
# Start TheWorld
dio start

# Check status
dio status

# You should see:
# ✅ TheWorld server is running
#    Server: http://localhost:3344
#    AI Proxy: http://localhost:3344/v1
#    EverMemOS Status: ✅ Healthy
```

## 6. Common Issues

### EverMemOS Connection Failure

```bash
# Check if EverMemOS is running
curl http://localhost:1995/health

# Check Docker containers
docker ps | grep evermemos

# View EverMemOS logs
docker logs evermemos-api
```

### Invalid API Key

```bash
# Test OpenAI API Key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-your-key"

# Test Anthropic API Key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: sk-ant-your-key"
```

### Vectorize API Key Issues

```bash
# Check Vectorize API Key
curl -X POST https://api.vectorize.io/v1/embeddings \
  -H "Authorization: Bearer vz-your-key" \
  -H "Content-Type: application/json" \
  -d '{"input": "test"}'
```

## 7. Configuration Priority

TheWorld configuration loading order:

1. Environment variables (highest priority)
2. `.env` file
3. Default values (lowest priority)

For example:

```bash
# Method 1: Use .env file
EVERMEMOS_URL=http://localhost:1995

# Method 2: Use environment variables (overrides .env)
export EVERMEMOS_URL=http://production-server:1995
dio start
```

## 8. Production Environment Configuration

```bash
# .env.production
EVERMEMOS_URL=http://production-evermemos:1995

# Use production-grade API Keys
REAL_AI_API_KEY=sk-proj-production-key
AI_TARGET_BASE_URL=https://api.openai.com/v1

# EverMemOS production configuration
LLM_API_KEY=sk-proj-production-key
VECTORIZE_API_KEY=vz-production-key

# Log level
LOG_LEVEL=info

# Data storage path
WORLD_DATA_DIR=/var/lib/the-world
```

## 9. Security Recommendations

- ✅ Add `.env` file to `.gitignore`
- ✅ Do not hardcode API Keys in code
- ✅ Use environment variables to manage sensitive information
- ✅ Regularly rotate API Keys
- ✅ Limit API Key permissions and quotas

## 10. Next Steps

After configuration is complete:

```bash
# Start TheWorld
dio start

# Create a Region
dio region create -n region-a

# Create an AI
dio ai create -n alpha

# Start using!
dio ai speak -t alpha -r region-a -m "hello world"
```

## 11. Layered Memory Explanation

- EverMemOS stores compressed, recallable memories (working/knowledge/episodic layers)
- Full audit logs are written to the host machine: `~/.the-world/audit/world-memory-audit.jsonl`
- The audit layer accumulates long-term by default for traceability and is not directly concatenated to the AI context

## Reference Links

- EverMemOS Documentation: https://github.com/EverMind-AI/EverMemOS
- OpenAI API: https://platform.openai.com
- Anthropic API: https://console.anthropic.com
- Vectorize: https://vectorize.io