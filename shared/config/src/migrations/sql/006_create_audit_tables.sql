-- UP
-- DevFlow.ai Audit and Compliance Tables Migration

SET search_path TO audit, devflow, public;

-- Audit logs table (in audit schema)
CREATE TABLE audit.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    request_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT audit_logs_action_not_empty CHECK (length(trim(action)) > 0),
    CONSTRAINT audit_logs_resource_type_not_empty CHECK (length(trim(resource_type)) > 0)
);

-- Security events table
CREATE TABLE audit.security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}',
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_by UUID,
    resolved_at TIMESTAMP WITH TIME ZONE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT security_events_event_type_not_empty CHECK (length(trim(event_type)) > 0),
    CONSTRAINT security_events_severity_valid CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

-- Compliance checks table
CREATE TABLE audit.compliance_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    check_type VARCHAR(100) NOT NULL,
    standard VARCHAR(50) NOT NULL, -- SOC2, GDPR, HIPAA, etc.
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    status VARCHAR(20) NOT NULL,
    findings JSONB NOT NULL DEFAULT '{}',
    remediation_steps JSONB NOT NULL DEFAULT '[]',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    next_check_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT compliance_checks_check_type_not_empty CHECK (length(trim(check_type)) > 0),
    CONSTRAINT compliance_checks_standard_valid CHECK (standard IN ('SOC2', 'GDPR', 'HIPAA', 'PCI_DSS', 'ISO_27001')),
    CONSTRAINT compliance_checks_status_valid CHECK (status IN ('passed', 'failed', 'warning', 'pending'))
);

-- Data access logs table
CREATE TABLE audit.data_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    data_type VARCHAR(100) NOT NULL,
    data_id UUID,
    access_type VARCHAR(50) NOT NULL, -- read, write, delete, export
    purpose VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT data_access_logs_data_type_not_empty CHECK (length(trim(data_type)) > 0),
    CONSTRAINT data_access_logs_access_type_valid CHECK (access_type IN ('read', 'write', 'delete', 'export', 'import'))
);

-- Retention policies table
CREATE TABLE audit.retention_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    retention_days INTEGER NOT NULL,
    archive_before_delete BOOLEAN NOT NULL DEFAULT true,
    archive_location VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT retention_policies_table_name_not_empty CHECK (length(trim(table_name)) > 0),
    CONSTRAINT retention_policies_retention_days_positive CHECK (retention_days > 0)
);

-- Create partitioned tables for high-volume audit data
-- Partition audit_logs by month
CREATE TABLE audit.audit_logs_y2024m01 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE audit.audit_logs_y2024m02 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE audit.audit_logs_y2024m03 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE audit.audit_logs_y2024m04 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE audit.audit_logs_y2024m05 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE audit.audit_logs_y2024m06 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE audit.audit_logs_y2024m07 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE audit.audit_logs_y2024m08 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE audit.audit_logs_y2024m09 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE audit.audit_logs_y2024m10 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE audit.audit_logs_y2024m11 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE audit.audit_logs_y2024m12 PARTITION OF audit.audit_logs
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

-- Create indexes for better performance
CREATE INDEX idx_audit_logs_user_id ON audit.audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit.audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit.audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit.audit_logs(resource_type);
CREATE INDEX idx_audit_logs_resource_id ON audit.audit_logs(resource_id);
CREATE INDEX idx_security_events_event_type ON audit.security_events(event_type);
CREATE INDEX idx_security_events_severity ON audit.security_events(severity);
CREATE INDEX idx_security_events_timestamp ON audit.security_events(timestamp);
CREATE INDEX idx_security_events_resolved ON audit.security_events(resolved);
CREATE INDEX idx_compliance_checks_standard ON audit.compliance_checks(standard);
CREATE INDEX idx_compliance_checks_status ON audit.compliance_checks(status);
CREATE INDEX idx_compliance_checks_checked_at ON audit.compliance_checks(checked_at);
CREATE INDEX idx_data_access_logs_user_id ON audit.data_access_logs(user_id);
CREATE INDEX idx_data_access_logs_data_type ON audit.data_access_logs(data_type);
CREATE INDEX idx_data_access_logs_timestamp ON audit.data_access_logs(timestamp);
CREATE INDEX idx_retention_policies_table_name ON audit.retention_policies(table_name);
CREATE INDEX idx_retention_policies_active ON audit.retention_policies(is_active);

-- Apply updated_at triggers
CREATE TRIGGER update_retention_policies_updated_at BEFORE UPDATE ON audit.retention_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function for automatic audit logging
CREATE OR REPLACE FUNCTION audit.log_data_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit.audit_logs (
            user_id,
            action,
            resource_type,
            resource_id,
            old_values,
            ip_address,
            user_agent
        ) VALUES (
            COALESCE(current_setting('app.current_user_id', true)::UUID, NULL),
            'DELETE',
            TG_TABLE_NAME,
            OLD.id,
            to_jsonb(OLD),
            COALESCE(current_setting('app.client_ip', true)::INET, NULL),
            current_setting('app.user_agent', true)
        );
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit.audit_logs (
            user_id,
            action,
            resource_type,
            resource_id,
            old_values,
            new_values,
            ip_address,
            user_agent
        ) VALUES (
            COALESCE(current_setting('app.current_user_id', true)::UUID, NULL),
            'UPDATE',
            TG_TABLE_NAME,
            NEW.id,
            to_jsonb(OLD),
            to_jsonb(NEW),
            COALESCE(current_setting('app.client_ip', true)::INET, NULL),
            current_setting('app.user_agent', true)
        );
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit.audit_logs (
            user_id,
            action,
            resource_type,
            resource_id,
            new_values,
            ip_address,
            user_agent
        ) VALUES (
            COALESCE(current_setting('app.current_user_id', true)::UUID, NULL),
            'INSERT',
            TG_TABLE_NAME,
            NEW.id,
            to_jsonb(NEW),
            COALESCE(current_setting('app.client_ip', true)::INET, NULL),
            current_setting('app.user_agent', true)
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_teams_changes AFTER INSERT OR UPDATE OR DELETE ON devflow.teams FOR EACH ROW EXECUTE FUNCTION audit.log_data_changes();
CREATE TRIGGER audit_users_changes AFTER INSERT OR UPDATE OR DELETE ON devflow.users FOR EACH ROW EXECUTE FUNCTION audit.log_data_changes();
CREATE TRIGGER audit_projects_changes AFTER INSERT OR UPDATE OR DELETE ON devflow.projects FOR EACH ROW EXECUTE FUNCTION audit.log_data_changes();
CREATE TRIGGER audit_integrations_changes AFTER INSERT OR UPDATE OR DELETE ON devflow.integrations FOR EACH ROW EXECUTE FUNCTION audit.log_data_changes();

-- DOWN
-- Drop audit triggers
DROP TRIGGER IF EXISTS audit_integrations_changes ON devflow.integrations;
DROP TRIGGER IF EXISTS audit_projects_changes ON devflow.projects;
DROP TRIGGER IF EXISTS audit_users_changes ON devflow.users;
DROP TRIGGER IF EXISTS audit_teams_changes ON devflow.teams;

-- Drop audit function
DROP FUNCTION IF EXISTS audit.log_data_changes();

-- Drop triggers
DROP TRIGGER IF EXISTS update_retention_policies_updated_at ON audit.retention_policies;

-- Drop indexes
DROP INDEX IF EXISTS audit.idx_retention_policies_active;
DROP INDEX IF EXISTS audit.idx_retention_policies_table_name;
DROP INDEX IF EXISTS audit.idx_data_access_logs_timestamp;
DROP INDEX IF EXISTS audit.idx_data_access_logs_data_type;
DROP INDEX IF EXISTS audit.idx_data_access_logs_user_id;
DROP INDEX IF EXISTS audit.idx_compliance_checks_checked_at;
DROP INDEX IF EXISTS audit.idx_compliance_checks_status;
DROP INDEX IF EXISTS audit.idx_compliance_checks_standard;
DROP INDEX IF EXISTS audit.idx_security_events_resolved;
DROP INDEX IF EXISTS audit.idx_security_events_timestamp;
DROP INDEX IF EXISTS audit.idx_security_events_severity;
DROP INDEX IF EXISTS audit.idx_security_events_event_type;
DROP INDEX IF EXISTS audit.idx_audit_logs_resource_id;
DROP INDEX IF EXISTS audit.idx_audit_logs_resource_type;
DROP INDEX IF EXISTS audit.idx_audit_logs_action;
DROP INDEX IF EXISTS audit.idx_audit_logs_timestamp;
DROP INDEX IF EXISTS audit.idx_audit_logs_user_id;

-- Drop partitioned tables
DROP TABLE IF EXISTS audit.audit_logs_y2024m12;
DROP TABLE IF EXISTS audit.audit_logs_y2024m11;
DROP TABLE IF EXISTS audit.audit_logs_y2024m10;
DROP TABLE IF EXISTS audit.audit_logs_y2024m09;
DROP TABLE IF EXISTS audit.audit_logs_y2024m08;
DROP TABLE IF EXISTS audit.audit_logs_y2024m07;
DROP TABLE IF EXISTS audit.audit_logs_y2024m06;
DROP TABLE IF EXISTS audit.audit_logs_y2024m05;
DROP TABLE IF EXISTS audit.audit_logs_y2024m04;
DROP TABLE IF EXISTS audit.audit_logs_y2024m03;
DROP TABLE IF EXISTS audit.audit_logs_y2024m02;
DROP TABLE IF EXISTS audit.audit_logs_y2024m01;

-- Drop tables
DROP TABLE IF EXISTS audit.retention_policies;
DROP TABLE IF EXISTS audit.data_access_logs;
DROP TABLE IF EXISTS audit.compliance_checks;
DROP TABLE IF EXISTS audit.security_events;
DROP TABLE IF EXISTS audit.audit_logs;