import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load APIS/.env for local dev. In Docker, env vars come from process.env (docker-compose) so the file is not needed.
dotenv.config({ path: path.resolve(__dirname, '../.env') });
