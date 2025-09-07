-- UP
-- DevFlow.ai Workflow Tables Migration

SET search_path TO devflow, public;

-- Workflow definitions table
CREATE TABLE workflow_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    triggers JSONB NOT NULL DEFAULT '[]',
    steps JSONB NOT NULL DEFAULT '[]',
    variables JSONB NOT NULL DEFAULT '{}',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT workflow_definitions_name_not_empty CHECK (length(trim(name)) > 0),
    CONSTRAINT workflow_definitions_version_format CHECK (version ~* '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$')
);

-- Workflows table
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    definition_id UUID REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    context JSONB NOT NULL DEFAULT '{}',
    execution_id UUID NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT workflows_status_valid CHECK (status IN ('draft', 'active', 'paused', 'completed', 'failed', 'cancelled')),
    CONSTRAINT workflows_completion_order CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

-- Workflow executions table for detailed step tracking
CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    step_id UUID NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    input JSONB NOT NULL DEFAULT '{}',
    output JSONB,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER, -- in milliseconds
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT workflow_executions_status_valid CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
    CONSTRAINT workflow_executions_completion_order CHECK (completed_at IS NULL OR completed_at >= started_at),
    CONSTRAINT workflow_executions_retry_count_positive CHECK (retry_count >= 0)
);

-- Project workflows junction table
CREATE TABLE project_workflows (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    workflow_definition_id UUID REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (project_id, workflow_definition_id)
);

-- Create indexes for better performance
CREATE INDEX idx_workflow_definitions_name ON workflow_definitions(name);
CREATE INDEX idx_workflow_definitions_version ON workflow_definitions(version);
CREATE INDEX idx_workflows_definition_id ON workflows(definition_id);
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_execution_id ON workflows(execution_id);
CREATE INDEX idx_workflows_started_at ON workflows(started_at);
CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_step_id ON workflow_executions(step_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_started_at ON workflow_executions(started_at);
CREATE INDEX idx_project_workflows_project_id ON project_workflows(project_id);
CREATE INDEX idx_project_workflows_active ON project_workflows(is_active);

-- Apply updated_at triggers
CREATE TRIGGER update_workflow_definitions_updated_at BEFORE UPDATE ON workflow_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workflow_executions_updated_at BEFORE UPDATE ON workflow_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- DOWN
-- Drop triggers
DROP TRIGGER IF EXISTS update_workflow_executions_updated_at ON workflow_executions;
DROP TRIGGER IF EXISTS update_workflows_updated_at ON workflows;
DROP TRIGGER IF EXISTS update_workflow_definitions_updated_at ON workflow_definitions;

-- Drop indexes
DROP INDEX IF EXISTS idx_project_workflows_active;
DROP INDEX IF EXISTS idx_project_workflows_project_id;
DROP INDEX IF EXISTS idx_workflow_executions_started_at;
DROP INDEX IF EXISTS idx_workflow_executions_status;
DROP INDEX IF EXISTS idx_workflow_executions_step_id;
DROP INDEX IF EXISTS idx_workflow_executions_workflow_id;
DROP INDEX IF EXISTS idx_workflows_started_at;
DROP INDEX IF EXISTS idx_workflows_execution_id;
DROP INDEX IF EXISTS idx_workflows_status;
DROP INDEX IF EXISTS idx_workflows_definition_id;
DROP INDEX IF EXISTS idx_workflow_definitions_version;
DROP INDEX IF EXISTS idx_workflow_definitions_name;

-- Drop tables
DROP TABLE IF EXISTS project_workflows;
DROP TABLE IF EXISTS workflow_executions;
DROP TABLE IF EXISTS workflows;
DROP TABLE IF EXISTS workflow_definitions;