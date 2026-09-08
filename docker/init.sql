-- Public, synthetic local-demo credentials only. Application users have no DDL privileges.
CREATE USER IF NOT EXISTS 'medicon'@'%' IDENTIFIED BY 'local-demo-db';
GRANT SELECT, INSERT, UPDATE, DELETE ON medicon.* TO 'medicon'@'%';
CREATE USER IF NOT EXISTS 'medicon_mock'@'%' IDENTIFIED BY 'local-demo-mock-db';
GRANT SELECT, INSERT ON medicon.* TO 'medicon_mock'@'%';
