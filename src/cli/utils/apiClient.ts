import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';

export class APIClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = 'http://localhost:3344') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 120000, // 2 minutes for AI responses
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

  async createAI(name: string) {
    const response = await this.client.post('/api/ai', { name });
    return response.data;
  }

  async listAI() {
    const response = await this.client.get('/api/ai');
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

  async requestMaintenanceTicket(input: {
    region: string;
    action: 'apt_update' | 'install_packages';
    params?: Record<string, unknown>;
    reason: string;
    expiresInSeconds?: number;
  }) {
    const response = await this.client.post('/api/maintenance/tickets', input);
    return response.data.ticket;
  }

  async listMaintenanceTickets(status?: string) {
    const response = await this.client.get('/api/maintenance/tickets', {
      params: status ? { status } : {},
    });
    return response.data.tickets;
  }

  async getMaintenanceTicket(id: string) {
    const response = await this.client.get(`/api/maintenance/tickets/${id}`);
    return response.data.ticket;
  }

  async approveMaintenanceTicket(id: string) {
    const response = await this.client.post(`/api/maintenance/tickets/${id}/approve`);
    return response.data.ticket;
  }

  async rejectMaintenanceTicket(id: string, reason?: string) {
    const response = await this.client.post(`/api/maintenance/tickets/${id}/reject`, { reason });
    return response.data.ticket;
  }

  async runMaintenanceTicket(id: string) {
    const response = await this.client.post(`/api/maintenance/tickets/${id}/run`);
    return response.data.ticket;
  }
}
