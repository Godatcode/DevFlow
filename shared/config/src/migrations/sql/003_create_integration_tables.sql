-- UP
-- DevFlow.ai Integration Tables Migration

SET search_path TO devflow, public;

-- Integrations table
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    sync_schedule JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT integrations_name_not_empty CHECK (length(trim(name)) > 0),
    CONSTRAINT integrations_provider_valid CHECK (provider IN ('github', 'gitlab', 'bitbucket', 'jira', 'linear', 'azure_devops', 'slack', 'teams', 'discord', 'aws', 'gcp', 'azure')),
    CONSTRAINT integrations_type_valid CHECK (type IN ('version_control', 'project_management', 'communication', 'cloud_service', 'ci_cd', 'monitoring'))
);

-- Project integrations junction table
CREATE TABLE project_integrations (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
    configuration JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (project_id, integration_id)
);

-- Team integrations junction table
CREATE TABLE team_integrations (
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
    configuration JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (team_id, integration_id)
);

-- Integration sync logs table
CREATE TABLE integration_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    records_processed INTEGER NOT NULL DEFAULT 0,
    records_created INTEGER NOT NULL DEFAULT 0,
    records_updated INTEGER NOT NULL DEFAULT 0,
    records_deleted INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 0, -- in milliseconds
    error TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT integration_sync_logs_sync_type_valid CHECK (sync_type IN ('full', 'incremental', 'real_time')),
    CONSTRAINT integration_sync_logs_status_valid CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT integration_sync_logs_records_positive CHECK (
        records_processed >= 0 AND 
        records_created >= 0 AND 
        records_updated >= 0 AND 
        records_deleted >= 0
    ),
    CONSTRAINT integration_sync_logs_completion_order CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- Webhook events table
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    signature VARCHAR(500),
    processed BOOLEAN NOT NULL DEFAULT false,
    processing_error TEXT,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT webhook_events_event_type_not_empty CHECK (length(trim(event_type)) > 0)
);

-- Create indexes for better performance
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_integrations_type ON integrations(type);
CREATE INDEX idx_integrations_active ON integrations(is_active);
CREATE INDEX idx_project_integrations_project_id ON project_integrations(project_id);
CREATE INDEX idx_project_integrations_integration_id ON project_integrations(integration_id);
CREATE INDEX idx_project_integrations_active ON project_integrations(is_active);
CREATE INDEX idx_team_integrations_team_id ON team_integrations(team_id);
CREATE INDEX idx_team_integrations_integration_id ON team_integrations(integration_id);
CREATE INDEX idx_team_integrations_active ON team_integrations(is_active);
CREATE INDEX idx_integration_sync_logs_integration_id ON integration_sync_logs(integration_id);
CREATE INDEX idx_integration_sync_logs_status ON integration_sync_logs(status);
CREATE INDEX idx_integration_sync_logs_started_at ON integration_sync_logs(started_at);
CREATE INDEX idx_webhook_events_integration_id ON webhook_events(integration_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX idx_webhook_events_received_at ON webhook_events(received_at);

-- Apply updated_at triggers
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- DOWN
-- Drop triggers
DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;

-- Drop indexes
DROP INDEX IF EXISTS idx_webhook_events_received_at;
DROP INDEX IF EXISTS idx_webhook_events_processed;
DROP INDEX IF EXISTS idx_webhook_events_integration_id;
DROP INDEX IF EXISTS idx_integration_sync_logs_started_at;
DROP INDEX IF EXISTS idx_integration_sync_logs_status;
DROP INDEX IF EXISTS idx_integration_sync_logs_integration_id;
DROP INDEX IF EXISTS idx_team_integrations_active;
DROP INDEX IF EXISTS idx_team_integrations_integration_id;
DROP INDEX IF EXISTS idx_team_integrations_team_id;
DROP INDEX IF EXISTS idx_project_integrations_active;
DROP INDEX IF EXISTS idx_project_integrations_integration_id;
DROP INDEX IF EXISTS idx_project_integrations_project_id;
DROP INDEX IF EXISTS idx_integrations_active;
DROP INDEX IF EXISTS idx_integrations_type;
DROP INDEX IF EXISTS idx_integrations_provider;

-- Drop tables
DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS integration_sync_logs;
DROP TABLE IF EXISTS team_integrations;
DROP TABLE IF EXISTS project_integrations;
DROP TABLE IF EXISTS integrations;