import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Sequelize } from "sequelize";
import { SequelizeStorage, Umzug } from "umzug";
import { env } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Dedicated Sequelize instance for migrations only.
 * Kept separate from the runtime `pg` pool in config/db.ts.
 */
const migrationSequelize = new Sequelize(env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions:
    env.DATABASE_URL.includes("supabase.co") || env.DATABASE_URL.includes("neon.tech")
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : undefined,
});

/** Compiled `dist/` loads `.js`; `tsx` / `ts-node` on `src/` loads `.ts`. */
const migrationGlob = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? "migrations/*.js"
  : "migrations/*.ts";

/**
 * sequelize_meta has always stored `*.ts` names (CLI runs from src).
 * Dist boot must use the same names or Umzug re-runs every migration as `*.js`.
 */
function stableMigrationName(fileName: string) {
  return fileName.replace(/\.js$/i, ".ts");
}

export const migrator = new Umzug({
  migrations: {
    glob: [migrationGlob, { cwd: __dirname }],
    resolve: ({ name, path: migrationPath, context }) => ({
      name: stableMigrationName(name),
      up: async () => {
        if (!migrationPath) {
          throw new Error(`Migration path missing for ${name}`);
        }
        const migration = await import(pathToFileURL(migrationPath).href);
        return migration.up({ context });
      },
      down: async () => {
        if (!migrationPath) {
          throw new Error(`Migration path missing for ${name}`);
        }
        const migration = await import(pathToFileURL(migrationPath).href);
        return migration.down({ context });
      },
    }),
  },
  context: migrationSequelize.getQueryInterface(),
  storage: new SequelizeStorage({
    sequelize: migrationSequelize,
    tableName: "sequelize_meta",
  }),
  logger: console,
});

export type Migration = typeof migrator._types.migration;

/**
 * Drop accidental `*.js` meta rows from a failed dist boot that used file
 * basenames before name normalization. Idempotent.
 */
async function scrubJsMetaRows() {
  await migrationSequelize.query(`
    DELETE FROM sequelize_meta
    WHERE name LIKE '%.js'
  `);
}

/** Apply pending migrations, then close the migration connection. */
export async function applyPendingMigrations() {
  await scrubJsMetaRows();
  const pending = await migrator.pending();
  if (pending.length === 0) {
    await migrationSequelize.close();
    return { applied: 0 };
  }
  await migrator.up();
  await migrationSequelize.close();
  return { applied: pending.length };
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1]!)).href;

if (isDirectRun) {
  migrator.runAsCLI().then(async (result) => {
    await migrationSequelize.close();
    if (result === false) {
      process.exitCode = 1;
    }
  });
}
