declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ANALYTICS_HASH_SECRET?: string;
    ANALYTICS_LOCAL_TEST?: string;
  }
}
