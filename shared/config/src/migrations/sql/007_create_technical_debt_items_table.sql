-- UP
-- DevFlow.ai Technical Debt Items Table Migration

SET search_path TO devflow, public;

-- Technical debt items table for detailed debt tracking
CREATE TABLE technical_debt_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    analysis_id UUID REFERENCES technical_debt_analysis(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL DEFAULT 1,
    description TEXT NOT NULL,
    estimated_effort NUMERIC NOT NULL DEFAULT 0, -- in hours
    tags JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT technical_debt_items_type_valid CHECK (type IN (
        'code_smell',
        'bug',
        'vulnerability',
        'duplication',
        'complexity',
        'maintainability',
        'performance',
        'security'
    )),
    CONSTRAINT technical_debt_items_severity_valid CHECK (severity IN (
        'low',
        'medium',
        'high',
        'critical'
    )),
    CONSTRAINT technical_debt_items_status_valid CHECK (status IN (
        'open',
        'in_progress',
        'resolved',
        'ignored',
        'false_positive'
    )),
    CONSTRAINT technical_debt_items_file_path_not_empty CHECK (length(trim(file_path)) > 0),
    CONSTRAINT technical_debt_items_description_not_empty CHECK (length(trim(description)) > 0),
    CONSTRAINT technical_debt_items_line_number_positive CHECK (line_number > 0),
    CONSTRAINT technical_debt_items_effort_positive CHECK (estimated_effort >= 0),
    CONSTRAINT technical_debt_items_resolution_consistency CHECK (
        (status = 'resolved' AND resolved_at IS NOT NULL) OR 
        (status != 'resolved' AND resolved_at IS NULL)
    )
);

-- Update the existing technical_debt_analysis table name to match repository expectations
ALTER TABLE technical_debt_analysis RENAME TO technical_debt_analyses;

-- Create indexes for better performance
CREATE INDEX idx_technical_debt_items_project_id ON technical_debt_items(project_id);
CREATE INDEX idx_technical_debt_items_analysis_id ON technical_debt_items(analysis_id);
CREATE INDEX idx_technical_debt_items_type ON technical_debt_items(type);
CREATE INDEX idx_technical_debt_items_severity ON technical_debt_items(severity);
CREATE INDEX idx_technical_debt_items_status ON technical_debt_items(status);
CREATE INDEX idx_technical_debt_items_file_path ON technical_debt_items(file_path);
CREATE INDEX idx_technical_debt_items_created_at ON technical_debt_items(created_at);

-- Apply updated_at trigger
CREATE TRIGGER update_technical_debt_items_updated_at 
    BEFORE UPDATE ON technical_debt_items 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- DOWN
-- Drop trigger
DROP TRIGGER IF EXISTS update_technical_debt_items_updated_at ON technical_debt_items;

-- Drop indexes
DROP INDEX IF EXISTS idx_technical_debt_items_created_at;
DROP INDEX IF EXISTS idx_technical_debt_items_file_path;
DROP INDEX IF EXISTS idx_technical_debt_items_status;
DROP INDEX IF EXISTS idx_technical_debt_items_severity;
DROP INDEX IF EXISTS idx_technical_debt_items_type;
DROP INDEX IF EXISTS idx_technical_debt_items_analysis_id;
DROP INDEX IF EXISTS idx_technical_debt_items_project_id;

-- Rename table back
ALTER TABLE technical_debt_analyses RENAME TO technical_debt_analysis;

-- Drop table
DROP TABLE IF EXISTS technical_debt_items;