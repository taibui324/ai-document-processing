import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Config } from '../config';
import { Initial1788710000000 } from '../../migrations/initial';
export function dataSource(config: Config) {
  return new DataSource({ type: 'mysql', ...config.db, timezone: 'Z', supportBigNumbers: true, bigNumberStrings: true,
    synchronize: false, migrations: [Initial1788710000000], migrationsTransactionMode: 'none',
    logging: false, poolSize: 8, connectTimeout: 2000, extra: { enableKeepAlive: true } });
}
