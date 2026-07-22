import { createApp } from './app';
import { config } from './config';
import { initSchema } from './db';
import { evaluateAlerts } from './services/alerts.service';
import { q } from './db';

function bootstrap() {
  initSchema();
  const app = createApp();

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`\n  ⚡ FB Intel API listening on http://localhost:${config.port}`);
    console.log(`     Environment: ${config.env}`);
    console.log(`     Database:    ${config.db.client} (${config.db.sqlitePath})\n`);
  });

  // Periodically evaluate alerts for all users (every 5 minutes).
  setInterval(() => {
    try {
      const users = q.all<{ id: number }>(`SELECT id FROM users WHERE status = 'active'`);
      for (const u of users) evaluateAlerts(u.id);
    } catch {
      /* ignore background errors */
    }
  }, 5 * 60_000).unref();
}

bootstrap();
