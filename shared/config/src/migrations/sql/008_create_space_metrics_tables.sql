-- Create SPACE metrics tables for team performance insights

-- Developer satisfaction surveys table
CREATE TABLE IF NOT EXISTS developer_satisfaction_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    satisfaction_score INTEGER NOT NULL CHECK (satisfaction_score >= 1 AND satisfaction_score <= 10),
    work_life_balance INTEGER NOT NULL CHECK (work_life_balance >= 1 AND work_life_balance <= 10),
    tools_and_resources INTEGER NOT NULL CHECK (tools_and_resources >= 1 AND tools_and_resources <= 10),
    team_collaboration INTEGER NOT NULL CHECK (team_collaboration >= 1 AND team_collaboration <= 10),
    career_growth INTEGER NOT NULL CHECK (career_growth >= 1 AND career_growth <= 10),
    workload INTEGER NOT NULL CHECK (workload >= 1 AND workload <= 10),
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(developer_id, team_id, DATE(submitted_at))
);

-- Productivity metrics table
CREATE TABLE IF NOT EXISTS productivity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    story_points_completed INTEGER NOT NULL DEFAULT 0,
    code_reviews_completed INTEGER NOT NULL DEFAULT 0,
    bugs_fixed INTEGER NOT NULL DEFAULT 0,
    features_delivered INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(developer_id, period_start, period_end),
    CHECK (period_end > period_start)
);

-- Activity metrics table
CREATE TABLE IF NOT EXISTS activity_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    commits_count INTEGER NOT NULL DEFAULT 0,
    pull_requests_created INTEGER NOT NULL DEFAULT 0,
    pull_requests_reviewed INTEGER NOT NULL DEFAULT 0,
    issues_created INTEGER NOT NULL DEFAULT 0,
    issues_resolved INTEGER NOT NULL DEFAULT 0,
    code_review_comments INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(developer_id, period_start, period_end),
    CHECK (period_end > period_start)
);

-- Communication metrics table (team-level)
CREATE TABLE IF NOT EXISTS communication_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    meeting_participation DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (meeting_participation >= 0 AND meeting_participation <= 100),
    slack_messages INTEGER NOT NULL DEFAULT 0,
    documentation_contributions INTEGER NOT NULL DEFAULT 0,
    knowledge_sharing INTEGER NOT NULL DEFAULT 0,
    mentoring INTEGER NOT NULL DEFAULT 0,
    cross_team_collaboration INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(team_id, period_start, period_end),
    CHECK (period_end > period_start)
);

-- Efficiency metrics table
CREATE TABLE IF NOT EXISTS efficiency_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    average_task_completion_time DECIMAL(8,2) NOT NULL DEFAULT 0, -- in hours
    code_review_turnaround_time DECIMAL(8,2) NOT NULL DEFAULT 0, -- in hours
    bug_fix_time DECIMAL(8,2) NOT NULL DEFAULT 0, -- in hours
    deployment_frequency INTEGER NOT NULL DEFAULT 0,
    rework_percentage DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (rework_percentage >= 0 AND rework_percentage <= 100),
    focus_time DECIMAL(5,2) NOT NULL DEFAULT 0, -- hours per day
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(developer_id, period_start, period_end),
    CHECK (period_end > period_start)
);

-- Team performance insights table
CREATE TABLE IF NOT EXISTS team_performance_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    satisfaction_score DECIMAL(3,1) NOT NULL DEFAULT 0,
    performance_score DECIMAL(5,2) NOT NULL DEFAULT 0,
    activity_score DECIMAL(5,2) NOT NULL DEFAULT 0,
    communication_score DECIMAL(5,2) NOT NULL DEFAULT 0,
    efficiency_score DECIMAL(5,2) NOT NULL DEFAULT 0,
    risk_factors JSONB NOT NULL DEFAULT '[]',
    recommendations JSONB NOT NULL DEFAULT '[]',
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(team_id, period_start, period_end),
    CHECK (period_end > period_start)
);

-- Benchmark data table
CREATE TABLE IF NOT EXISTS performance_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benchmark_type VARCHAR(50) NOT NULL, -- 'industry', 'organization', 'top_performers'
    satisfaction_avg DECIMAL(3,1) NOT NULL DEFAULT 0,
    performance_avg DECIMAL(5,2) NOT NULL DEFAULT 0,
    activity_avg DECIMAL(5,2) NOT NULL DEFAULT 0,
    communication_avg DECIMAL(5,2) NOT NULL DEFAULT 0,
    efficiency_avg DECIMAL(5,2) NOT NULL DEFAULT 0,
    sample_size INTEGER NOT NULL DEFAULT 0,
    data_source VARCHAR(100),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    UNIQUE(benchmark_type, valid_from)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_team_date ON developer_satisfaction_surveys(team_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_developer_date ON developer_satisfaction_surveys(developer_id, submitted_at);

CREATE INDEX IF NOT EXISTS idx_productivity_metrics_team_period ON productivity_metrics(team_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_productivity_metrics_developer_period ON productivity_metrics(developer_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_activity_metrics_team_period ON activity_metrics(team_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_activity_metrics_developer_period ON activity_metrics(developer_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_communication_metrics_team_period ON communication_metrics(team_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_efficiency_metrics_team_period ON efficiency_metrics(team_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_efficiency_metrics_developer_period ON efficiency_metrics(developer_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_team_insights_team_period ON team_performance_insights(team_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_benchmarks_type_valid ON performance_benchmarks(benchmark_type, valid_from, valid_to);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_satisfaction_surveys_updated_at BEFORE UPDATE ON developer_satisfaction_surveys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_productivity_metrics_updated_at BEFORE UPDATE ON productivity_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_activity_metrics_updated_at BEFORE UPDATE ON activity_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_communication_metrics_updated_at BEFORE UPDATE ON communication_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_efficiency_metrics_updated_at BEFORE UPDATE ON efficiency_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_team_insights_updated_at BEFORE UPDATE ON team_performance_insights FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_benchmarks_updated_at BEFORE UPDATE ON performance_benchmarks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default benchmark data
INSERT INTO performance_benchmarks (benchmark_type, satisfaction_avg, performance_avg, activity_avg, communication_avg, efficiency_avg, sample_size, data_source)
VALUES 
    ('industry', 7.0, 80.0, 70.0, 75.0, 75.0, 1000, 'Industry Survey 2024'),
    ('organization', 7.2, 82.0, 72.0, 77.0, 76.0, 50, 'Internal Metrics'),
    ('top_performers', 8.5, 95.0, 90.0, 90.0, 88.0, 10, 'Top 10% Teams')
ON CONFLICT (benchmark_type, valid_from) DO NOTHING;