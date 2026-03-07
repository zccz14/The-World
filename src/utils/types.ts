export interface Region {
  name: string;
  containerId: string;
  status: 'running' | 'stopped' | 'creating';
}

export interface OracleMessage {
  id: string;
  to: string;
  from: string;
  content: string;
  timestamp: number;
  regionId: string;
}

export interface AIProxyConfig {
  port: number;
  realApiKey: string;
  targetBaseUrl: string;
}

export interface EverMemOSConfig {
  baseUrl: string;
}

export interface SystemConfig {
  evermemos: EverMemOSConfig;
  proxy: AIProxyConfig;
}

export interface AIIdentity {
  aiName: string;
  dummyKey: string;
  regionId?: string;
}

export interface AuditLog {
  aiName: string;
  action: string;
  timestamp: number;
  details?: any;
}
