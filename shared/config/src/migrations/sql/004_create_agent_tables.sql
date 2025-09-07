-- UP
-- DevFlow.ai AI Agent Tables Migration

SET search_path TO devflow, public;

-- AI Agents table
CREATE TABLE ai_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    capabilities JSONB NOT NULL DEFAULT '[]',
    configuration JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT ai_agents_name_not_empty CHECK (length(trim(name)) > 0),
    CONSTRAINT ai_agents_type_valid CHECK (type IN ('security_guardian', 'performance_optimizer', 'style_enforcer', 'test_generator', 'documentation_updater')),
    CONSTRAINT ai_agents_version_format CHECK (version ~* '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$')
);

-- Agent executions table
CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    input JSONB NOT NULL DEFAULT '{}',
    output JSONB,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    duration INTEGER, -- in milliseconds
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT agent_executions_status_valid CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
    CONSTRAINT agent_executions_completion_order CHECK (end_time IS NULL OR end_time >= start_time)
);

-- Agent assignments table (for workflow steps)
CREATE TABLE agent_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
    workflow_definition_id UUID REFERENCES workflow_definitions(id) ON DELETE CASCADE,
    step_id UUID NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    conditions JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT agent_assignments_priority_positive CHECK (priority > 0),
    UNIQUE (workflow_definition_id, step_id, agent_id)
);

-- Automated tasks table
CREATE TABLE automated_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
    schedule VARCHAR(100) NOT NULL, -- cron expression
    context JSONB NOT NULL DEFAULT '{}',
    input JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_execution_at TIMESTAMP WITH TIME ZONE,
    next_execution_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT automated_tasks_name_not_empty CHECK (length(trim(name)) > 0),
    CONSTRAINT automated_tasks_schedule_not_empty CHECK (length(trim(schedule)) > 0)
);

-- Agent performance metrics table
CREATE TABLE agent_performance_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
    execution_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    average_duration NUMERIC NOT NULL DEFAULT 0, -- in milliseconds
    total_duration BIGINT NOT NULL DEFAULT 0, -- in milliseconds
    last_execution_at TIMESTAMP WITH TIME ZONE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT agent_performance_metrics_counts_positive CHECK (
        execution_count >= 0 AND 
        success_count >= 0 AND 
        failure_count >= 0 AND
        success_count + failure_count <= execution_count
    ),
    CONSTRAINT agent_performance_metrics_duration_positive CHECK (
        average_duration >= 0 AND 
        total_duration >= 0
    ),
    CONSTRAINT agent_performance_metrics_period_order CHECK (period_end >= period_start)
);

-- Hook executions table
CREATE TABLE hook_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hook_id VARCHAR(255) NOT NULL,
    agent_id UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    context JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    success BOOLEAN,
    duration INTEGER, -- in milliseconds
    error TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT hook_executions_hook_id_not_empty CHECK (length(trim(hook_id)) > 0),
    CONSTRAINT hook_executions_event_not_empty CHECK (length(trim(event)) > 0)
);

-- Create indexes for better performance
CREATE INDEX idx_ai_agents_type ON ai_agents(type);
CREATE INDEX idx_ai_agents_active ON ai_agents(is_active);
CREATE INDEX idx_agent_executions_agent_id ON agent_executions(agent_id);
CREATE INDEX idx_agent_executions_workflow_id ON agent_executions(workflow_id);
CREATE INDEX idx_agent_executions_status ON agent_executions(status);
CREATE INDEX idx_agent_executions_start_time ON agent_executions(start_time);
CREATE INDEX idx_agent_assignments_agent_id ON agent_assignments(agent_id);
CREATE INDEX idx_agent_assignments_workflow_definition_id ON agent_assignments(workflow_definition_id);
CREATE INDEX idx_agent_assignments_active ON agent_assignments(is_active);
CREATE INDEX idx_automated_tasks_agent_id ON automated_tasks(agent_id);
CREATE INDEX idx_automated_tasks_active ON automated_tasks(is_active);
CREATE INDEX idx_automated_tasks_next_execution ON automated_tasks(next_execution_at);
CREATE INDEX idx_agent_performance_metrics_agent_id ON agent_performance_metrics(agent_id);
CREATE INDEX idx_agent_performance_metrics_period ON agent_performance_metrics(period_start, period_end);
CREATE INDEX idx_hook_executions_hook_id ON hook_executions(hook_id);
CREATE INDEX idx_hook_executions_agent_id ON hook_executions(agent_id);
CREATE INDEX idx_hook_executions_project_id ON hook_executions(project_id);
CREATE INDEX idx_hook_executions_executed_at ON hook_executions(executed_at);

-- Apply updated_at triggers
CREATE TRIGGER update_ai_agents_updated_at BEFORE UPDATE ON ai_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_executions_updated_at BEFORE UPDATE ON agent_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_assignments_updated_at BEFORE UPDATE ON agent_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_automated_tasks_updated_at BEFORE UPDATE ON automated_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_performance_metrics_updated_at BEFORE UPDATE ON agent_performance_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- DOWN
-- Drop triggers
DROP TRIGGER IF EXISTS update_agent_performance_metrics_updated_at ON agent_performance_metrics;
DROP TRIGGER IF EXISTS update_automated_tasks_updated_at ON automated_tasks;
DROP TRIGGER IF EXISTS update_agent_assignments_updated_at ON agent_assignments;
DROP TRIGGER IF EXISTS update_agent_executions_updated_at ON agent_executions;
DROP TRIGGER IF EXISTS update_ai_agents_updated_at ON ai_agents;

-- Drop indexes
DROP INDEX IF EXISTS idx_hook_executions_executed_at;
DROP INDEX IF EXISTS idx_hook_executions_project_id;
DROP INDEX IF EXISTS idx_hook_executions_agent_id;
DROP INDEX IF EXISTS idx_hook_executions_hook_id;
DROP INDEX IF EXISTS idx_agent_performance_metrics_period;
DROP INDEX IF EXISTS idx_agent_performance_metrics_agent_id;
DROP INDEX IF EXISTS idx_automated_tasks_next_execution;
DROP INDEX IF EXISTS idx_automated_tasks_active;
DROP INDEX IF EXISTS idx_automated_tasks_agent_id;
DROP INDEX IF EXISTS idx_agent_assignments_active;
DROP INDEX IF EXISTS idx_agent_assignments_workflow_definition_id;
DROP INDEX IF EXISTS idx_agent_assignments_agent_id;
DROP INDEX IF EXISTS idx_agent_executions_start_time;
DROP INDEX IF EXISTS idx_agent_executions_status;
DROP INDEX IF EXISTS idx_agent_executions_workflow_id;
DROP INDEX IF EXISTS idx_agent_executions_agent_id;
DROP INDEX IF EXISTS idx_ai_agents_active;
DROP INDEX IF EXISTS idx_ai_agents_type;

-- Drop tables
DROP TABLE IF EXISTS hook_executions;
DROP TABLE IF EXISTS agent_performance_metrics;
DROP TABLE IF EXISTS automated_tasks;
DROP TABLE IF EXISTS agent_assignments;
DROP TABLE IF EXISTS agent_executions;
DROP TABLE IF EXISTS ai_agents;