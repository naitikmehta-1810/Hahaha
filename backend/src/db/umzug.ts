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
  dialectOptions: env.DATABASE_URL.includes("supabase.co")
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : undefined,
});

export const migrator = new Umzug({
  migrations: {
    glob: ["migrations/*.ts", { cwd: __dirname }],
  },
  context: migrationSequelize.getQueryInterface(),
  storage: new SequelizeStorage({
    sequelize: migrationSequelize,
    tableName: "sequelize_meta",
  }),
  logger: console,
});

export type Migration = typeof migrator._types.migration;

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
