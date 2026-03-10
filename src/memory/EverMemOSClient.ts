import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

export interface RequestStatusResponse {
  success: boolean;
  found: boolean;
  data: {
    request_id: string;
    status: 'start' | 'success' | 'failed' | string;
    url?: string;
    method?: string;
    http_code?: number;
    time_ms?: number;
    start_time?: number;
    end_time?: number;
    ttl_seconds?: number;
  } | null;
  message?: string;
}

export class EverMemOSClient {
  private client: AxiosInstance;

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch (error) {
      logger.error({ error }, 'EverMemOS health check failed');
      return false;
    }
  }

  async storeMemory(params: any): Promise<any> {
    try {
      const response = await this.client.post('/api/v1/memories', params);
      return response.data;
    } catch (error) {
      logger.error({ error, params }, 'Failed to store memory');
      throw error;
    }
  }

  async searchMemories(params: any): Promise<any> {
    try {
      const response = await this.client.get('/api/v1/memories/search', {
        params,
      });
      return response.data;
    } catch (error) {
      logger.error({ error, params }, 'Failed to search memories');
      throw error;
    }
  }

  async getRequestStatus(requestId: string): Promise<RequestStatusResponse> {
    try {
      const response = await this.client.get('/api/v1/stats/request', {
        params: {
          request_id: requestId,
        },
      });
      return response.data as RequestStatusResponse;
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to get request status');
      throw error;
    }
  }
}
