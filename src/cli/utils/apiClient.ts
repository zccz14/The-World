import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';

export class APIClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = 'http://localhost:3344') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
    });
  }

  async isServerRunning(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }

  async getStatus() {
    const response = await this.client.get('/api/status');
    return response.data;
  }

  async createRegion(name: string) {
    const response = await this.client.post('/api/regions', { name });
    return response.data;
  }

  async listRegions() {
    const response = await this.client.get('/api/regions');
    return response.data.regions;
  }

  async createAI(name: string, region: string) {
    const response = await this.client.post('/api/ai', { name, region });
    return response.data;
  }

  async listAI(region: string) {
    const response = await this.client.get('/api/ai', { params: { region } });
    return response.data.aiList;
  }

  async execCommand(ai: string, region: string, command: string) {
    const response = await this.client.post('/api/ai/exec', { ai, region, command });
    return response.data.result;
  }

  async sendOracle(to: string, region: string, message: string) {
    const response = await this.client.post('/api/oracle/send', { to, region, message });
    return response.data;
  }
}
