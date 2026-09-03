import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
const appPassword = process.env.POSTGRES_APP_PASSWORD;

if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to configure the application role');
}

if (!appPassword) {
    throw new Error('POSTGRES_APP_PASSWORD is required to configure the application role');
}

const sql = postgres(databaseUrl, { max: 1 });

try {
    // The role is created by migration 0013 with a safe placeholder. Set the
    // deploy-time secret here so the API and database always agree without
    // storing credentials in migration SQL.
    const [{ quotedPassword }] = await sql<{ quotedPassword: string }[]>`
        SELECT quote_literal(${appPassword}) AS "quotedPassword"
    `;
    await sql.unsafe(`ALTER ROLE kpos_app WITH LOGIN PASSWORD ${quotedPassword}`);
    console.log('✓ Configured kpos_app password from POSTGRES_APP_PASSWORD');
} finally {
    await sql.end({ timeout: 5 });
}
