import "dotenv/config";

// Integration tests run against a disposable database, never the dev DB.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.PAYMENT_PROVIDER = "sandbox";
process.env.APP_URL = "http://127.0.0.1:9"; // sandbox webhooks are exercised explicitly in tests
