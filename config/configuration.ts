import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join } from 'path';

/**
 * Application configuration interface
 * Defines all environment variables and their types
 */
export interface IConfiguration {
  database: {
    url: string;
  };
  jwt: {
    secret: string;
    expiration: string;
  };
  application: {
    port: number;
    environment: 'development' | 'production' | 'test';
    corsOrigin: string;
  };
  ollama: {
    baseUrl: string;
    model: string;
    timeout: number;
  };
  throttler: {
    ttl: number;
    limit: number;
  };
}

/**
 * Configuration service that loads and validates environment variables
 * Supports YAML configuration files for complex settings
 */
export default () => {
  const config: IConfiguration = {
    database: {
      url: process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5432/virtual_patient',
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
      expiration: process.env.JWT_EXPIRATION || '7d',
    },
    application: {
      port: parseInt(process.env.PORT || '3000', 10) ,
      environment: (process.env.NODE_ENV as any) || 'development',
      corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'mistral',
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10) ,
    },
    throttler: {
      ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10) ,
    },
  };

  // Load YAML configuration if exists
  try {
    const yamlConfig = yaml.load(
      readFileSync(join(__dirname, 'config.yaml'), 'utf8'),
    ) as Partial<IConfiguration>;
    Object.assign(config, yamlConfig);
  } catch (error) {
    // YAML config is optional
  }

  return config;
};