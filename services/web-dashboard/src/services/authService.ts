import { apiClient } from './api';
import { mockApiService } from './mockApi';
import { User } from '../types';

interface LoginResponse {
  user: User;
  token: string;
}

const isDevelopment = import.meta.env.DEV;

class AuthService {
  async login(email: string, password: string): Promise<LoginResponse> {
    if (isDevelopment) {
      return mockApiService.login(email, password);
    }
    return apiClient.post<LoginResponse>('/auth/login', { email, password });
  }

  async validateToken(token: string): Promise<User> {
    if (isDevelopment) {
      return mockApiService.validateToken(token);
    }
    return apiClient.get<User>('/auth/validate');
  }

  async refreshToken(): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/auth/refresh');
  }

  async logout(): Promise<void> {
    return apiClient.post('/auth/logout');
  }
}

export const authService = new AuthService();