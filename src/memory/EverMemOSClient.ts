import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

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
}
