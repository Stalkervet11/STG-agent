export type CoreState = 'startup' | 'file_io' | 'working' | 'idle' | 'listening' | 'recording' | 'processing';

export interface CoreStatePayload {
  state: CoreState;
  source?: string;
  message?: string;
  timestamp?: number;
}

export type ViewMode = 'minimal' | 'full' | 'settings' | 'aider';

export type SettingsCategory =
  | 'providers'
  | 'local_ai'
  | 'openrouter'
  | 'voice_input'
  | 'voice_output'
  | 'general'
  | 'system'
  | 'integrations'
  | 'skills'
  | 'memory'
  | 'privacy'
  | 'api'
  | 'developer'
  | 'interface'
  | 'profiles';

export interface AIProviderConfig {
  provider: 'Auto' | 'OpenRouter' | 'Ollama' | 'LM Studio' | 'Local API' | 'Custom';
  apiKey: string;
  baseUrl: string;
  model: string;
  contextLength: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  streamResponse: boolean;
  activeProfile: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  badge?: string;
  model: string;
  isDefault?: boolean;
  iconName: string;
}

export interface SystemMetrics {
  cpu: number;
  ram: number;
  gpu: number;
  network: {
    upload: string;
    download: string;
  };
  latency: string;
  temperature: string;
  fanSpeed: string;
  uptime: string;
  processes: Array<{
    id: number;
    name: string;
    cpu: string;
    mem: string;
  }>;
}

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  type?: 'meeting' | 'workout' | 'code' | 'personal';
}

export interface NotificationItem {
  id: string;
  title: string;
  timeAgo: string;
  type: 'info' | 'mail' | 'success' | 'warning';
  icon: string;
}

export interface VoiceCommandItem {
  id: string;
  command: string;
  category: 'code' | 'system' | 'music' | 'reminder' | 'search';
  icon: string;
}

export interface WeatherData {
  temperature: number;
  condition: string;
  feelsLike: number;
  humidity: number;
  windSpeed: string;
  aqi: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'jarvis';
  text: string;
  timestamp: string;
  state?: CoreState;
}
