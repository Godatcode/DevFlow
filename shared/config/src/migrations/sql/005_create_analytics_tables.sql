-- UP
-- DevFlow.ai Analytics Tables Migration

SET search_path TO devflow, public;

-- Metrics data table
CREATE TABLE metrics_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(100) NOT NULL,
    value NUMERIC NOT NULL,
    unit VARCHAR(50) NOT NULL DEFAULT 'count',
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT metrics_data_type_not_empty CHECK (length(trim(type)) > 0),
    CONSTRAINT metrics_data_unit_not_empty CHECK (length(trim(unit)) > 0),
    CONSTRAINT metrics_data_type_valid CHECK (type IN (
        'dora_deployment_frequency',
        'dora_lead_time',
        'dora_change_failure_rate',
        'dora_recovery_time',
        'code_quality',
        'technical_debt',
        'team_velocity',
        'developer_satisfaction'
    ))
);

-- Reports table
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    filters JSONB NOT NULL DEFAULT '{}',
    generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT reports_type_valid CHECK (type IN (
        'dora_metrics',
        'team_performance',
        'project_health',
        'technical_debt',
        'timeline_prediction'
    )),
    CONSTRAINT reports_title_not_empty CHECK (length(trim(title)) > 0),
    CONSTRAINT reports_expiration_order CHECK (expires_at IS NULL OR expires_at > generated_at)
);

-- Timeline predictions table
CREATE TABLE timeline_predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    estimated_completion_date TIMESTAMP WITH TIME ZONE NOT NULL,
    confidence_level NUMERIC NOT NULL,
    factors JSONB NOT NULL DEFAULT '[]',
    scenarios JSONB NOT NULL DEFAULT '{}',
    model_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT timeline_predictions_confidence_range CHECK (confidence_level >= 0 AND confidence_level <= 100),
    CONSTRAINT timeline_predictions_completion_future CHECK (estimated_completion_date > NOW())
);

-- Technical debt analysis table
CREATE TABLE technical_debt_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    total_debt_hours NUMERIC NOT NULL DEFAULT 0,
    debt_ratio NUMERIC NOT NULL DEFAULT 0,
    critical_issues INTEGER NOT NULL DEFAULT 0,
    recommendations JSONB NOT NULL DEFAULT '[]',
    trends JSONB NOT NULL DEFAULT '{}',
    analysis_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT technical_debt_analysis_debt_hours_positive CHECK (total_debt_hours >= 0),
    CONSTRAINT technical_debt_analysis_debt_ratio_range CHECK (debt_ratio >= 0 AND debt_ratio <= 100),
    CONSTRAINT technical_debt_analysis_critical_issues_positive CHECK (critical_issues >= 0)
);

-- DORA metrics aggregated table
CREATE TABLE dora_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    deployment_frequency NUMERIC NOT NULL DEFAULT 0,
    lead_time_for_changes NUMERIC NOT NULL DEFAULT 0, -- in hours
    change_failure_rate NUMERIC NOT NULL DEFAULT 0, -- percentage
    time_to_restore_service NUMERIC NOT NULL DEFAULT 0, -- in hours
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT dora_metrics_frequency_positive CHECK (deployment_frequency >= 0),
    CONSTRAINT dora_metrics_lead_time_positive CHECK (lead_time_for_changes >= 0),
    CONSTRAINT dora_metrics_failure_rate_range CHECK (change_failure_rate >= 0 AND change_failure_rate <= 100),
    CONSTRAINT dora_metrics_restore_time_positive CHECK (time_to_restore_service >= 0),
    CONSTRAINT dora_metrics_period_order CHECK (period_end >= period_start)
);

-- SPACE metrics aggregated table
CREATE TABLE space_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    satisfaction NUMERIC NOT NULL DEFAULT 0, -- 1-10 scale
    performance NUMERIC NOT NULL DEFAULT 0, -- tasks completed per sprint
    activity NUMERIC NOT NULL DEFAULT 0, -- commits, PRs, reviews per week
    communication NUMERIC NOT NULL DEFAULT 0, -- collaboration score
    efficiency NUMERIC NOT NULL DEFAULT 0, -- time to complete tasks
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT space_metrics_satisfaction_range CHECK (satisfaction >= 1 AND satisfaction <= 10),
    CONSTRAINT space_metrics_performance_positive CHECK (performance >= 0),
    CONSTRAINT space_metrics_activity_positive CHECK (activity >= 0),
    CONSTRAINT space_metrics_communication_range CHECK (communication >= 0 AND communication <= 10),
    CONSTRAINT space_metrics_efficiency_range CHECK (efficiency >= 0 AND efficiency <= 10),
    CONSTRAINT space_metrics_period_order CHECK (period_end >= period_start)
);

-- Create indexes for better performance
CREATE INDEX idx_metrics_data_type ON metrics_data(type);
CREATE INDEX idx_metrics_data_project_id ON metrics_data(project_id);
CREATE INDEX idx_metrics_data_team_id ON metrics_data(team_id);
CREATE INDEX idx_metrics_data_timestamp ON metrics_data(timestamp);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_generated_by ON reports(generated_by);
CREATE INDEX idx_reports_generated_at ON reports(generated_at);
CREATE INDEX idx_reports_public ON reports(is_public);
CREATE INDEX idx_timeline_predictions_project_id ON timeline_predictions(project_id);
CREATE INDEX idx_timeline_predictions_completion_date ON timeline_predictions(estimated_completion_date);
CREATE INDEX idx_technical_debt_analysis_project_id ON technical_debt_analysis(project_id);
CREATE INDEX idx_technical_debt_analysis_date ON technical_debt_analysis(analysis_date);
CREATE INDEX idx_dora_metrics_project_id ON dora_metrics(project_id);
CREATE INDEX idx_dora_metrics_team_id ON dora_metrics(team_id);
CREATE INDEX idx_dora_metrics_period ON dora_metrics(period_start, period_end);
CREATE INDEX idx_space_metrics_team_id ON space_metrics(team_id);
CREATE INDEX idx_space_metrics_period ON space_metrics(period_start, period_end);

-- Apply updated_at triggers
CREATE TRIGGER update_timeline_predictions_updated_at BEFORE UPDATE ON timeline_predictions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_technical_debt_analysis_updated_at BEFORE UPDATE ON technical_debt_analysis FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dora_metrics_updated_at BEFORE UPDATE ON dora_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_space_metrics_updated_at BEFORE UPDATE ON space_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- DOWN
-- Drop triggers
DROP TRIGGER IF EXISTS update_space_metrics_updated_at ON space_metrics;
DROP TRIGGER IF EXISTS update_dora_metrics_updated_at ON dora_metrics;
DROP TRIGGER IF EXISTS update_technical_debt_analysis_updated_at ON technical_debt_analysis;
DROP TRIGGER IF EXISTS update_timeline_predictions_updated_at ON timeline_predictions;

-- Drop indexes
DROP INDEX IF EXISTS idx_space_metrics_period;
DROP INDEX IF EXISTS idx_space_metrics_team_id;
DROP INDEX IF EXISTS idx_dora_metrics_period;
DROP INDEX IF EXISTS idx_dora_metrics_team_id;
DROP INDEX IF EXISTS idx_dora_metrics_project_id;
DROP INDEX IF EXISTS idx_technical_debt_analysis_date;
DROP INDEX IF EXISTS idx_technical_debt_analysis_project_id;
DROP INDEX IF EXISTS idx_timeline_predictions_completion_date;
DROP INDEX IF EXISTS idx_timeline_predictions_project_id;
DROP INDEX IF EXISTS idx_reports_public;
DROP INDEX IF EXISTS idx_reports_generated_at;
DROP INDEX IF EXISTS idx_reports_generated_by;
DROP INDEX IF EXISTS idx_reports_type;
DROP INDEX IF EXISTS idx_metrics_data_timestamp;
DROP INDEX IF EXISTS idx_metrics_data_team_id;
DROP INDEX IF EXISTS idx_metrics_data_project_id;
DROP INDEX IF EXISTS idx_metrics_data_type;

-- Drop tables
DROP TABLE IF EXISTS space_metrics;
DROP TABLE IF EXISTS dora_metrics;
DROP TABLE IF EXISTS technical_debt_analysis;
DROP TABLE IF EXISTS timeline_predictions;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS metrics_data;